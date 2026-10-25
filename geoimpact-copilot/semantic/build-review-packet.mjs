#!/usr/bin/env node
// Generates the V0.2.1 independent-review packet from approved-skeletons.json.
//
// The packet is a worksheet for a person. It groups the 26 near-identical abstention variants,
// puts affirmative claims first, and shows for every entry: the exact sentence, when it applies,
// its slots, the contract text it relies on, and the concerns its author could not resolve.
// Every decision field is blank. This script never reads or writes review-record.json and
// never fills in a reviewer, a date or a decision.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { entryId, vocabularyDigest } from "../lib/review.mjs";
import { SEMANTIC_CONTRACT_VERSION, narrativePredicates, normalizeClaimId, numericContracts, stringContracts } from "../lib/semantic.mjs";
import { collectEvidenceIndex, flagsFor } from "./build-review-checklist.mjs";
import { fixtureNames } from "./build-skeletons.mjs";
import { claimConcerns, conditionMeaning, globalConcerns } from "./review-concerns.mjs";

const registryUrl = new URL("./approved-skeletons.json", import.meta.url);
const sourceRecordsUrl = new URL("../source-records.json", import.meta.url);
export const packetUrl = new URL("../../docs/review/geoimpact-v0.2.1-review-packet.md", import.meta.url);
export const sheetUrl = new URL("../../docs/review/geoimpact-v0.2.1-decision-sheet.template.json", import.meta.url);

export const DECISION_VALUES = ["Approve", "Reject", "Change"];
const abstentionPrefix = "ABSTAIN:";
const topicPattern = /^ABSTAIN: this question matches more than one supported report topic \((.+)\)\. Ask about one topic at a time\.$/;
const imperative = /^(Ask|Provide)\b/i;

const slotIdsOf = (skeleton) => [...skeleton.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]);
const cell = (text) => String(text).replaceAll("|", "\\|").replaceAll("\n", " ");

function slotRow(id) {
  const numeric = numericContracts.find((contract) => contract.id === id);
  if (numeric) {
    return { id, kind: "measurement", label: numeric.lead.trim(), unit: numeric.unit, path: numeric.path ?? `${numeric.operation}(${numeric.source_path})`, form: `${numeric.lead}<number>${numeric.trail(2)}` };
  }
  const string = stringContracts.find((contract) => contract.id === id);
  if (!string) return { id, kind: "unknown", label: "?", unit: "", path: "?", form: "?" };
  const sample = string.id === "report_version" ? "5" : "value1";
  return {
    id,
    kind: string.list ? "exact string list" : "exact string",
    label: string.label,
    unit: "",
    path: string.test.source.replaceAll("\\/", "/").replace(/^\^|\$$/g, ""),
    form: string.spans ? string.spans(sample)[0] : `${string.label} ${string.list ? string.render(["value1", "value2"]) : string.render(sample)}`
  };
}

function sentenceKinds(skeleton) {
  const body = skeleton.startsWith(abstentionPrefix) ? skeleton.slice(abstentionPrefix.length).trim() : skeleton;
  const sentences = body.split(/(?<=[.!?;])\s+|\s+but\s+/).map((text) => text.trim()).filter(Boolean);
  return sentences.map((text) => {
    const constant = text.replace(/\{\{[^}]+\}\}/g, " ");
    if (imperative.test(text)) return { text, kind: "instruction" };
    return { text, kind: /\b(not|no|cannot|does not|do not)\b/i.test(constant) ? "negated" : "affirmative" };
  });
}

function classify(claimId, entry) {
  const skeleton = entry.skeleton;
  const isAbstention = skeleton.startsWith(abstentionPrefix);
  const sentences = sentenceKinds(skeleton);
  const affirmativeSentences = sentences.filter((sentence) => sentence.kind === "affirmative");
  const { flags } = flagsFor(skeleton);
  const concerns = (claimConcerns[normalizeClaimId(claimId)] ?? []);
  const topic = topicPattern.exec(skeleton);
  let tier;
  if (topic) tier = "D";
  else if (isAbstention && affirmativeSentences.length === 0) tier = "C";
  else if (!isAbstention && affirmativeSentences.length === 0) tier = "B";
  else tier = "A";
  const embedded = isAbstention && affirmativeSentences.length > 0;
  const high = concerns.some((concern) => concern.severity === "high");
  const interpretive = flags.length > 0;
  return { tier, flags, concerns, topic: topic ? topic[1] : null, embeddedAffirmative: embedded, rank: (high ? 0 : 2) + (interpretive ? 0 : 1) };
}

const exampleLabel = (reportIndex) => (reportIndex < fixtureNames.length ? `fixture ${fixtureNames[reportIndex]}` : "a seeded synthetic report");

export async function buildReviewPacket() {
  const registry = JSON.parse(await readFile(registryUrl, "utf8"));
  const sourceRecords = new Map(JSON.parse(await readFile(sourceRecordsUrl, "utf8")).records.map((record) => [record.id, record]));
  const { sources, examples } = await collectEvidenceIndex();
  const digest = vocabularyDigest(registry);

  const entries = [];
  for (const [claimId, list] of Object.entries(registry.claims)) {
    for (const entry of list) {
      entries.push({ claimId, entry, id: entryId(claimId, entry), ...classify(claimId, entry) });
    }
  }
  const order = (a, b) => a.rank - b.rank || a.claimId.localeCompare(b.claimId) || a.entry.skeleton.localeCompare(b.entry.skeleton);
  const tiers = { A: [], B: [], C: [], D: [] };
  for (const item of entries) tiers[item.tier].push(item);
  for (const key of Object.keys(tiers)) tiers[key].sort(order);
  let counter = {};
  for (const [tier, list] of Object.entries(tiers)) {
    for (const item of list) {
      counter[tier] = (counter[tier] ?? 0) + 1;
      item.packetId = `${tier}${String(counter[tier]).padStart(2, "0")}`;
    }
  }

  // Mechanical verification that licenses grouping: the variants must be exactly every combination
  // of two or more known topics, each listed in one canonical order. Anything else fails the build.
  const topicOrder = ["provenance", "relationship changes", "primary metrics", "primary feature changes", "policy verdict"];
  const listed = tiers.D.map((item) => item.topic.split("; "));
  const canonical = (names) => names.every((name) => topicOrder.includes(name)) && names.every((name, index) => index === 0 || topicOrder.indexOf(names[index - 1]) < topicOrder.indexOf(name));
  const expectedCombinations = 2 ** topicOrder.length - 1 - topicOrder.length;
  if (!listed.every(canonical) || listed.length !== expectedCombinations || new Set(listed.map((names) => names.join("; "))).size !== expectedCombinations) {
    throw new Error("The ambiguous-question variants are not exactly every multi-topic combination in canonical order; they cannot be grouped.");
  }

  const lines = [];
  const push = (...text) => lines.push(...text);
  push(
    "# GeoImpact Evidence Copilot V0.2.1: independent review packet",
    "",
    "**Review status: UNREVIEWED.** Generated by `geoimpact-copilot/semantic/build-review-packet.mjs`. No person has reviewed any entry in this packet, no reviewer is named, no decision is recorded, and no script or model may fill the decision fields in. This is not an independent evaluation; it is the material an independent evaluator needs in order to perform one.",
    "",
    `Content digest under review: \`${digest}\``,
    `Semantic contract version: \`${SEMANTIC_CONTRACT_VERSION}\``,
    `Entries: ${entries.length} (${tiers.A.length} affirmative, ${tiers.B.length} disclaimers, ${tiers.C.length} single abstentions, ${tiers.D.length} grouped abstention variants).`,
    "",
    "If the vocabulary changes, the digest changes, this packet is regenerated, and any approval already recorded for the old digest stops being valid (`npm run check:review-record` fails).",
    "",
    "## How to use this packet",
    "",
    "1. Read the sections in order. Section 1 is where an unsupported scientific, geographic, temporal, causal or legal claim is most likely to hide; section 4 is repetitive by construction and is grouped so you can review the pattern once and its variants quickly.",
    "2. For each entry, open the cited contract text (the URL is given) at the pinned tag and compare it with the sentence. Do not rely on the quoted text alone.",
    "3. Answer the four review questions on the card. Write your decision in the blank field: `Approve`, `Reject` or `Change`. `Change` and `Reject` both keep the vocabulary unapproved. Say why in Notes.",
    "4. Resolve or accept each listed author concern explicitly (Notes). A concern you leave unresolved is a reason not to approve the entry.",
    "5. Independence: you must not be the author of the vocabulary, the gate, the generator or the expected-answer labels. State your relationship to the author in your Notes. This packet cannot establish independence; only the people involved can.",
    "6. To record an approval, copy the decisions into `geoimpact-copilot/semantic/review-record.json` by hand, following [the decision sheet](geoimpact-v0.2.1-decision-sheet.template.json) (one decision per entry ID, the digest and contract version above, your own name and the real date). `npm run check:review-record` then validates it. Nothing in this repository will do this for you, and an approval is never renewed automatically.",
    "",
    "Mechanical flags and sample renderings are aids. They are not evidence.",
    "",
    "## Standing concerns (apply to every entry)",
    "",
    ...globalConcerns.map((concern) => `- **${concern.id}.** ${concern.text}`),
    "",
    "## 1. Map",
    "",
    "| Packet ID | Claim | Kind | Applies when | Flags | Author concerns |",
    "| --- | --- | --- | --- | --- | --- |"
  );
  for (const tier of ["A", "B", "C"]) {
    for (const item of tiers[tier]) {
      const kind = item.embeddedAffirmative ? "abstention containing an affirmative sentence" : { A: "affirmative", B: "disclaimer", C: "abstention" }[tier];
      push(`| ${item.packetId} | \`${item.claimId}\` | ${kind} | ${item.entry.when?.length ? item.entry.when.map((name) => `\`${name}\``).join(", ") : "always"} | ${item.flags.join(", ") || "none"} | ${item.concerns.length} |`);
    }
  }
  push(`| D01 to D${String(tiers.D.length).padStart(2, "0")} | \`ambiguous-question\` | grouped abstention variants | always | none | 1 (shared) |`, "");

  const describeConditions = (when) => (when?.length
    ? when.map((name) => `\`${name}\` (${conditionMeaning[name] ?? "UNDEFINED CONDITION"})`).join("; ")
    : "none: the entry is used whenever its claim is produced");

  const card = (item, section) => {
    push(`### ${item.packetId} \`${item.claimId}\``, "", `Entry ID: \`${item.id}\``, "", `> ${item.entry.skeleton}`, "");
    push(`- **Applies when:** ${describeConditions(item.entry.when)}`);
    push(`- **Kind:** ${item.embeddedAffirmative ? "abstention message. **It contains an affirmative sentence; review that sentence as a claim.**" : section}`);
    push(`- **Flags:** ${item.flags.length ? item.flags.map((flag) => `\`${flag}\``).join(", ") : "none"}`);
    const key = `${normalizeClaimId(item.claimId)}\u0000${item.entry.skeleton}`;
    const example = examples.get(key);
    if (example) push(`- **Example rendering** (from ${exampleLabel(example.report_index)}; question: ${example.question === "" ? "(empty)" : `"${example.question}"`}): ${example.text}`);
    const slots = slotIdsOf(item.entry.skeleton);
    if (slots.length) {
      push("- **Exact slots** (the gate rejects a slot whose value is not the report's value at that path):", "", "  | Slot | Kind | Label and form | Unit | Report path |", "  | --- | --- | --- | --- | --- |");
      for (const row of [...new Set(slots)].map(slotRow)) push(`  | \`${row.id}\` | ${row.kind} | \`${cell(row.form)}\` | ${row.unit || "none"} | \`${cell(row.path)}\` |`);
      push("");
    } else {
      push("- **Exact slots:** none. The sentence is entirely fixed text.");
    }
    const cited = [...(sources.get(key)?.values() ?? [])];
    if (cited.length) {
      push("- **Source evidence the sentence relies on:**");
      for (const reference of cited) {
        const record = sourceRecords.get(reference.source_id);
        push(`  - \`${reference.source_id}#${reference.fact_key}\`: "${reference.value}" (${record ? `[${record.label}](${record.url})` : "source record missing"})`);
      }
    } else {
      push("- **Source evidence:** none cited. This is the application's own wording; judge it against the contract directly.");
    }
    if (item.concerns.length) {
      push("- **Unresolved author concerns:**");
      for (const concern of item.concerns) push(`  - [${concern.severity}] ${concern.text}`);
    }
    push(
      "- **Review questions**",
      "  - [ ] True for every report meeting the conditions?",
      "  - [ ] Nothing asserted or implied about geography, time, cause, legal status or scientific validity beyond the cited text?",
      "  - [ ] Any negation matches the cited text?",
      "  - [ ] Every slot carries the right label, unit and path?",
      "- Decision (Approve / Reject / Change): ________  Reviewer: ________  Date: ________",
      "- Concerns resolved or accepted, and notes: ________",
      ""
    );
  };

  push("## 2. Affirmative claims (review these first)", "", "Sentences that state something. Entries with flagged interpretive words or high-severity author concerns come first.", "");
  for (const item of tiers.A) card(item, "affirmative");
  push("## 3. Disclaimers and single abstentions", "", "Sentences that say what is not established, or that decline to answer. A disclaimer can still be false, or can carry a hidden affirmative.", "");
  for (const item of tiers.B) card(item, "disclaimer");
  for (const item of tiers.C) card(item, "abstention message");

  const topics = tiers.D.map((item) => item.topic.split("; "));
  const topicNames = [...new Set(topics.flat())].sort();
  push(
    "## 4. Grouped abstention variants: `ambiguous-question`",
    "",
    "These entries share one template and differ only in which topics are listed:",
    "",
    "> ABSTAIN: this question matches more than one supported report topic (**{topics}**). Ask about one topic at a time.",
    "",
    `- **Applies when:** the question matches two or more supported report topics. Conditions: none.`,
    `- **Fixed text to review once:** "ABSTAIN: this question matches more than one supported report topic (" + topic list + "). Ask about one topic at a time."`,
    `- **Topic names appearing in the variants (${topicNames.length}):** ${topicNames.map((name) => `\`${name}\``).join(", ")}. Check that each is a topic the copilot really supports.`,
    `- **Mechanical check performed by the generator (the build fails otherwise):** all ${tiers.D.length} variants match the template exactly, and together they are exactly every combination of two or more of the ${topicOrder.length} topics, each listed in the order: ${topicOrder.join(", ")}. This verifies the pattern, not that the sentence is appropriate.`,
    "- **Exact slots:** none.",
    "- **Source evidence:** none cited; application's own wording.",
    "- **Unresolved author concerns:**",
    ...(claimConcerns["ambiguous-question"] ?? []).map((concern) => `  - [${concern.severity}] ${concern.text}`),
    "- **Review questions**",
    "  - [ ] Is the fixed text true for every listed combination?",
    "  - [ ] Is every topic name supported and accurately named?",
    "  - [ ] Does any combination read as an answer rather than a refusal?",
    "- Decision for the whole group (Approve / Reject / Change): ________  Reviewer: ________  Date: ________",
    "- Exceptions (list packet IDs you do not approve) and notes: ________",
    "",
    "| Packet ID | Entry ID | Topics listed |",
    "| --- | --- | --- |"
  );
  for (const item of tiers.D) push(`| ${item.packetId} | \`${item.id}\` | ${item.topic} |`);
  push("");

  const usedSlots = [...new Set(entries.flatMap((item) => slotIdsOf(item.entry.skeleton)))].sort();
  push("## 5. Slot reference", "", "| Slot | Kind | Label and form | Unit | Report path |", "| --- | --- | --- | --- | --- |");
  for (const row of usedSlots.map(slotRow)) push(`| \`${row.id}\` | ${row.kind} | \`${cell(row.form)}\` | ${row.unit || "none"} | \`${cell(row.path)}\` |`);
  push("", "## 6. Decision index", "", "Use this table to copy decisions into `review-record.json`. The machine-readable blank is the decision sheet.", "", "| Packet ID | Entry ID | Claim |", "| --- | --- | --- |");
  for (const tier of ["A", "B", "C", "D"]) for (const item of tiers[tier]) push(`| ${item.packetId} | \`${item.id}\` | \`${item.claimId}\` |`);
  push("", `Total entries: ${entries.length}.`, "");

  const sheet = {
    schema: "geoimpact-review-decision-sheet/1",
    status: "blank_template",
    note: "A blank worksheet. It is not a review record and is never read by any check. A person copies decisions into geoimpact-copilot/semantic/review-record.json by hand.",
    content_digest: digest,
    contract_version: SEMANTIC_CONTRACT_VERSION,
    reviewer: null,
    reviewed_on: null,
    relationship_to_author: null,
    entries: ["A", "B", "C", "D"].flatMap((tier) => tiers[tier]).map((item) => ({ packet_id: item.packetId, entry_id: item.id, claim: item.claimId, decision: null, notes: null }))
  };
  return { markdown: lines.join("\n"), sheet: `${JSON.stringify(sheet, null, 2)}\n`, entries, tiers, topicNames };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1].replaceAll("\\", "/")}`))) {
  const { markdown, sheet, topicNames, tiers } = await buildReviewPacket();
  // Every variant must match the template exactly; a variant that does not is treated as a new, ungrouped entry.
  if (tiers.D.some((item) => item.topic.split("; ").length < 2)) throw new Error("A grouped abstention variant lists fewer than two topics.");
  if (topicNames.length === 0) throw new Error("No topic names found in grouped abstention variants.");
  if (process.argv.includes("--check")) {
    const current = await readFile(packetUrl, "utf8").catch(() => "");
    const currentSheet = await readFile(sheetUrl, "utf8").catch(() => "");
    if (current !== markdown || currentSheet !== sheet) {
      process.stderr.write("The review packet is out of date; run node geoimpact-copilot/semantic/build-review-packet.mjs.\n");
      process.exitCode = 1;
    } else {
      process.stdout.write("Review packet matches the vocabulary.\n");
    }
  } else {
    await writeFile(packetUrl, markdown);
    await writeFile(sheetUrl, sheet);
    process.stdout.write(`Wrote ${fileURLToPath(packetUrl)} and ${fileURLToPath(sheetUrl)}\n`);
  }
}
