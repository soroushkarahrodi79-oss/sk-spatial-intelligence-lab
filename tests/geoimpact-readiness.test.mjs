import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { answerQuestion } from "../geoimpact-copilot/lib/answer.mjs";
import { currentEntryIds, entryId, evaluateReview, labelReviewProblems, vocabularyDigest } from "../geoimpact-copilot/lib/review.mjs";
import { SEMANTIC_CONTRACT_VERSION, narrativePredicates, normalizeClaimId } from "../geoimpact-copilot/lib/semantic.mjs";
import { buildReport, makeSpec } from "../geoimpact-copilot/evaluation/synthetic/generator.mjs";
import { DIVERSITY_TARGET, canonicalDigest, checkIntake, knownSyntheticCorpus } from "../geoimpact-copilot/evaluation/external/intake.mjs";
import { manifestProblems, sealDigest } from "../geoimpact-copilot/evaluation/independent-test-set/check-test-set.mjs";
import { assess, estimateInputTokens, measurePacks, repositoryViolations, secretPatterns, specProblems } from "../geoimpact-copilot/provider-contract/check-sonnet-prerequisites.mjs";
import { buildEvidencePack } from "../geoimpact-copilot/provider-contract/provider-contract.mjs";
import { buildReviewPacket, packetUrl, sheetUrl } from "../geoimpact-copilot/semantic/build-review-packet.mjs";
import { claimConcerns, conditionMeaning } from "../geoimpact-copilot/semantic/review-concerns.mjs";

const repo = (name) => new URL(`../${name}`, import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(repo(name), "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const registry = await readJson("geoimpact-copilot/semantic/approved-skeletons.json");
const prerequisites = await readJson("geoimpact-copilot/provider-contract/sonnet-experiment-prerequisites.json");

// ---------------------------------------------------------------------------
// Review packet
// ---------------------------------------------------------------------------

test("the review packet is current, bound to the vocabulary digest, and covers every entry exactly once", async () => {
  const { markdown, sheet, entries } = await buildReviewPacket();
  assert.equal(await readFile(packetUrl, "utf8"), markdown, "run build-review-packet.mjs");
  assert.equal(await readFile(sheetUrl, "utf8"), sheet);
  assert.ok(markdown.includes(`Content digest under review: \`${vocabularyDigest(registry)}\``));
  assert.ok(markdown.includes(`\`${SEMANTIC_CONTRACT_VERSION}\``));
  assert.equal(entries.length, 52);
  const ids = currentEntryIds(registry);
  const indexSection = markdown.slice(markdown.indexOf("## 6. Decision index"));
  for (const id of ids) assert.equal(indexSection.split(`\`${id}\``).length - 1, 1, `entry ${id} appears once in the decision index`);
  assert.deepEqual(JSON.parse(sheet).entries.map((item) => item.entry_id).sort(), [...ids].sort());
});

test("the packet groups the repeated abstention variants and puts affirmative claims first", async () => {
  const { markdown, tiers } = await buildReviewPacket();
  assert.equal(tiers.D.length, 26, "26 ambiguous-question variants");
  assert.ok(tiers.D.every((item) => item.claimId === "ambiguous-question"));
  assert.equal(tiers.A.length + tiers.B.length + tiers.C.length + tiers.D.length, 52);
  const cards = [...markdown.matchAll(/^### ([A-D]\d{2}) /gm)].map((match) => match[1]);
  assert.equal(cards.length, 26, "26 cards: 20 + 3 + 3, and the 26 variants share one section");
  assert.ok(!cards.some((id) => id.startsWith("D")), "grouped variants do not get individual cards");
  assert.ok(markdown.indexOf("## 2. Affirmative claims") < markdown.indexOf("## 3. Disclaimers") && markdown.indexOf("## 3. Disclaimers") < markdown.indexOf("## 4. Grouped abstention variants"));
  // Abstentions that smuggle in an affirmative sentence are reviewed as claims, not skipped as refusals.
  const affirmativeClaims = new Set(tiers.A.map((item) => item.claimId));
  for (const claim of ["unsupported-claim", "unsupported-temporal-geographic", "metric-limits", "provenance-limit", "provenance-absent-v*"]) assert.ok(affirmativeClaims.has(claim), `${claim} is reviewed with the affirmative claims`);
  // Every entry with a keyword flag in the scientific, geographic, temporal, causal or legal areas that is not purely a refusal is in A or B, ahead of section 4.
  for (const item of tiers.D) assert.equal(item.flags.length, 0);
});

test("each card shows source evidence, applicability, slots, concerns and blank decision fields", async () => {
  const { markdown } = await buildReviewPacket();
  const card = (id) => markdown.slice(markdown.indexOf(`### ${id} `), markdown.indexOf("\n### ", markdown.indexOf(`### ${id} `) + 1));
  const comparison = markdown.match(/### (A\d{2}) `policy-comparison`/)[1];
  const text = card(comparison);
  assert.match(text, /Applies when/);
  assert.match(text, /Exact slots/);
  assert.match(text, /`policy\.observed_value`.*relationship regressions/);
  assert.match(text, /#\/policy\/observed_value/);
  assert.match(text, /Unresolved author concerns/);
  assert.match(text, /Decision \(Approve \/ Reject \/ Change\): ________/);
  const limits = markdown.match(/### (A\d{2}) `metric-limits`/)[1];
  assert.match(card(limits), /https:\/\/github\.com\/soroushkarahrodi79-oss\/geoimpact-ci\/blob\/v1\.2\.0/, "source evidence names the pinned upstream URL");
  assert.match(markdown, /relationship_regressions\\\/|#\/relationship_regressions/);
});

test("the packet and the decision sheet are blank: no decision, reviewer, date, tick or signature", async () => {
  const { markdown, sheet } = await buildReviewPacket();
  assert.match(markdown, /\*\*Review status: UNREVIEWED\.\*\*/);
  const decisionLines = markdown.split("\n").filter((line) => /Decision/.test(line) && /Approve \/ Reject \/ Change/.test(line));
  assert.equal(decisionLines.length, 27, "26 cards plus one group decision");
  for (const line of decisionLines) assert.match(line, /: ________  Reviewer: ________  Date: ________$/);
  assert.doesNotMatch(markdown, /- \[x\]/i);
  const parsed = JSON.parse(sheet);
  assert.equal(parsed.status, "blank_template");
  assert.equal(parsed.reviewer, null);
  assert.equal(parsed.reviewed_on, null);
  assert.equal(parsed.relationship_to_author, null);
  assert.ok(parsed.entries.every((item) => item.decision === null && item.notes === null));
  assert.equal(parsed.content_digest, vocabularyDigest(registry));
});

test("generating the packet neither reads nor writes the review record, and a sheet is not a record", async () => {
  const source = await readFile(new URL("../geoimpact-copilot/semantic/build-review-packet.mjs", import.meta.url), "utf8");
  const code = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  // The packet text tells the reviewer where to record a decision; the code must never open that file.
  assert.doesNotMatch(code, /URL\([^)]*review-record|readFile\([^)]*record|writeFile\([^)]*record|evaluateReview|assertReviewValid|reviewed_by\s*=|status\s*=\s*["']reviewed/);
  const recordPath = fileURLToPath(repo("geoimpact-copilot/semantic/review-record.json"));
  const before = sha(await readFile(recordPath));
  const packetBefore = sha(await readFile(packetUrl));
  execFileSync(process.execPath, [fileURLToPath(repo("geoimpact-copilot/semantic/build-review-packet.mjs"))], { encoding: "utf8" });
  assert.equal(sha(await readFile(recordPath)), before);
  assert.equal(sha(await readFile(packetUrl)), packetBefore, "regeneration is deterministic");
  const sheet = JSON.parse(await readFile(sheetUrl, "utf8"));
  assert.equal(evaluateReview(sheet, registry).state, "invalid");
});

test("author concerns and condition descriptions cannot go stale", () => {
  const claims = new Set(Object.keys(registry.claims).map(normalizeClaimId));
  for (const key of Object.keys(claimConcerns)) assert.ok(claims.has(key), `concern key ${key} names a claim that no longer exists`);
  assert.deepEqual(Object.keys(conditionMeaning).sort(), [...narrativePredicates].sort());
  for (const [claimId, list] of Object.entries(registry.claims)) for (const entry of list) assert.ok(entryId(claimId, entry));
});

test("a changed vocabulary makes the packet stale and fails its check", async () => {
  const { markdown } = await buildReviewPacket();
  const edited = markdown.replace("Decision (Approve / Reject / Change): ________", "Decision (Approve / Reject / Change): Approve");
  assert.notEqual(edited, markdown);
  assert.notEqual(edited, await readFile(packetUrl, "utf8"), "a hand-edited or pre-filled packet does not equal the generated one, so --check fails");
});

// ---------------------------------------------------------------------------
// Evidence intake (no real report exists; these use test-only stand-ins that are labelled as such)
// ---------------------------------------------------------------------------

const person = (name = "Dana Whitfield") => ({ status: "verified", verified_by: name, verified_on: "2026-10-20", method: "Compared the licence text at the cited URL with the dataset terms." });
function standInReport(seed = 980001, version = "5") {
  const report = buildReport(makeSpec(seed, { report_version: version, regression_count: 1, threshold: 0 }));
  if (version === "5") report.provenance.engine = { geoimpact_ci: "1.2.0", shapely: "2.1.0", geos: "3.13.0", pyproj: "3.7.0", proj: "9.5.0" };
  return report;
}
function intakeRecord(report, text, overrides = {}) {
  return {
    schema: "geoimpact-report-intake/1",
    report_file: "case-a.report.json",
    report_sha256: sha(text),
    status: "admitted",
    origin: { kind: "genuine_geoimpact_ci_run", real_input_data: true, geoimpact_ci_version: "1.2.0", run_date: "2026-10-01", run_by: "Example Planning Office", run_description: "Run on the office's own parcel data.", input_hashes_match_report: true },
    rights: { rights_holder: "Example Planning Office", license: "CC-BY-4.0", evidence_url: "https://example.org/licence", evidence_retrieved_on: "2026-10-19", redistribution_allowed: true, contains_personal_data: false, contains_sensitive_locations: false, may_be_sent_to_third_party_model: true },
    verification: { rights: person(), provenance: person("Priya Raman") },
    diversity: { report_version: String(report.report_version), verdict: report.verdict, size_class: "small", region_description: "Region A", dependency_count_class: "one" },
    ...overrides
  };
}
async function intakeDirectory(report, mutate = (record) => record, { text = `${JSON.stringify(report, null, 2)}\n` } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "geoimpact-intake-"));
  await writeFile(path.join(directory, "case-a.report.json"), text);
  await writeFile(path.join(directory, "case-a.intake.json"), JSON.stringify(mutate(intakeRecord(report, text))));
  return directory;
}

test("with no genuine report supplied, intake reports that and invents nothing", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "geoimpact-intake-empty-"));
  const result = await checkIntake(directory);
  assert.equal(result.status, "no_reports_supplied");
  assert.equal(result.admitted, 0);
  assert.deepEqual(result.reports, []);
  assert.match(result.note, /stay on HOLD/);
});

test("intake admits a complete record, and the report stand-in used here is only a unit-test fixture", async () => {
  const report = standInReport();
  const result = await checkIntake(await intakeDirectory(report));
  assert.deepEqual(result.reports[0].problems, []);
  assert.equal(result.reports[0].outcome, "admitted");
  assert.equal(result.reports[0].third_party_model_permitted, true);
  assert.equal(result.diversity.target_met, false, "one report never meets the diversity target");
  assert.ok(DIVERSITY_TARGET.minimum_reports >= 8);
});

test("intake refuses a repository synthetic report presented as genuine, even if re-indented or re-ordered", async () => {
  const fixture = await readFile(repo("geoimpact-copilot/fixtures/generated-v1.2.0/report-v5-block.json"), "utf8");
  const parsed = JSON.parse(fixture);
  const reordered = Object.fromEntries(Object.keys(parsed).sort().reverse().map((key) => [key, parsed[key]]));
  for (const [name, text] of Object.entries({ "byte-identical": fixture, "re-indented": `${JSON.stringify(parsed)}\n`, "keys re-ordered": `${JSON.stringify(reordered, null, 4)}\n` })) {
    const result = await checkIntake(await intakeDirectory(parsed, (record) => record, { text }));
    assert.equal(result.reports[0].outcome, "rejected_intake", name);
    assert.ok(result.reports[0].problems.some((problem) => /identical to a synthetic report/.test(problem)), name);
    assert.equal(result.gate_passed, false, name);
  }
  // Generated seeds are recognised too.
  const generated = buildReport(makeSpec(1, {}));
  const known = await knownSyntheticCorpus();
  assert.ok(known.canonical.has(canonicalDigest(generated)));
});

test("intake rejects each missing or unsafe element of origin, rights and verification", async () => {
  const report = standInReport(980002);
  const broken = {
    "synthetic origin": (record) => ({ ...record, origin: { ...record.origin, kind: "synthetic" } }),
    "hand-written origin": (record) => ({ ...record, origin: { ...record.origin, kind: "hand_written" } }),
    "model-generated origin": (record) => ({ ...record, origin: { ...record.origin, kind: "model_generated" } }),
    "invented input data": (record) => ({ ...record, origin: { ...record.origin, real_input_data: false } }),
    "input hashes unconfirmed": (record) => ({ ...record, origin: { ...record.origin, input_hashes_match_report: false } }),
    "run date in the future": (record) => ({ ...record, origin: { ...record.origin, run_date: "2099-01-01" } }),
    "hash mismatch": (record) => ({ ...record, report_sha256: "0".repeat(64) }),
    "redistribution not allowed": (record) => ({ ...record, rights: { ...record.rights, redistribution_allowed: false } }),
    "personal data": (record) => ({ ...record, rights: { ...record.rights, contains_personal_data: true } }),
    "sensitive locations": (record) => ({ ...record, rights: { ...record.rights, contains_sensitive_locations: true } }),
    "rights evidence not https": (record) => ({ ...record, rights: { ...record.rights, evidence_url: "http://example.org/licence" } }),
    "rights unverified": (record) => ({ ...record, verification: { ...record.verification, rights: { status: "unverified" } } }),
    "provenance unverified": (record) => ({ ...record, verification: { ...record.verification, provenance: { status: "unverified" } } }),
    "rights verified by a model": (record) => ({ ...record, verification: { ...record.verification, rights: person("Claude") } }),
    "provenance verified by automation": (record) => ({ ...record, verification: { ...record.verification, provenance: person("automated checker") } }),
    "verification without a method": (record) => ({ ...record, verification: { ...record.verification, rights: { ...person(), method: "" } } }),
    "verification dated in the future": (record) => ({ ...record, verification: { ...record.verification, rights: { ...person(), verified_on: "2099-01-01" } } }),
    "wrong report version": (record) => ({ ...record, diversity: { ...record.diversity, report_version: "4" } }),
    "wrong verdict": (record) => ({ ...record, diversity: { ...record.diversity, verdict: report.verdict === "PASS" ? "BLOCK" : "PASS" } }),
    "producer version differs from the report": (record) => ({ ...record, origin: { ...record.origin, geoimpact_ci_version: "9.9.9" } }),
    "unknown field": (record) => ({ ...record, trust_me: true })
  };
  for (const [name, mutate] of Object.entries(broken)) {
    const result = await checkIntake(await intakeDirectory(report, mutate));
    assert.equal(result.reports[0].outcome, "rejected_intake", name);
    assert.equal(result.gate_passed, false, name);
  }
  const noPermission = await checkIntake(await intakeDirectory(report, (record) => ({ ...record, rights: { ...record.rights, may_be_sent_to_third_party_model: false } })));
  assert.equal(noPermission.reports[0].outcome, "admitted");
  assert.equal(noPermission.reports[0].third_party_model_permitted, false, "local use is allowed, third-party model use is not");
  const candidate = await checkIntake(await intakeDirectory(report, (record) => ({ ...record, status: "candidate", verification: { rights: { status: "unverified" }, provenance: { status: "unverified" } } })));
  assert.equal(candidate.reports[0].outcome, "candidate", "an unverified candidate is neither admitted nor an error");
  assert.equal(candidate.admitted, 0);
});

test("a V5 report with placeholder engine labels, and a report with no intake record, are rejected", async () => {
  const placeholder = buildReport(makeSpec(980003, { report_version: "5", regression_count: 1, threshold: 0 }));
  placeholder.provenance.engine = { ...placeholder.provenance.engine, shapely: "synthetic-fixture" };
  const result = await checkIntake(await intakeDirectory(placeholder));
  assert.equal(result.reports[0].outcome, "rejected_intake");
  assert.ok(result.reports[0].problems.some((problem) => /placeholder/.test(problem)));
  const directory = await mkdtemp(path.join(tmpdir(), "geoimpact-intake-orphan-"));
  await writeFile(path.join(directory, "orphan.report.json"), JSON.stringify(standInReport(980004)));
  const orphan = await checkIntake(directory);
  assert.equal(orphan.gate_passed, false);
  assert.match(orphan.reports[0].problems[0], /no NAME\.intake\.json/);
});

test("the diversity target is met only by enough varied admitted reports", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "geoimpact-intake-many-"));
  // Test-only stand-ins. Verdicts come from the generator's own policy arithmetic, not from edits.
  const plan = [["5", 0], ["5", 1], ["5", 1], ["4", 0], ["4", 1], ["4", 1], ["5", 0], ["4", 0]];
  for (const [index, [version, regressions]] of plan.entries()) {
    const report = buildReport(makeSpec(990000 + index, { report_version: version, regression_count: regressions, threshold: 0 }));
    if (version === "5") report.provenance.engine = { geoimpact_ci: "1.2.0", shapely: "2.1.0", geos: "3.13.0", pyproj: "3.7.0", proj: "9.5.0" };
    const text = `${JSON.stringify(report)}
`;
    const name = `case-${index}`;
    await writeFile(path.join(directory, `${name}.report.json`), text);
    const record = intakeRecord(report, text, { report_file: `${name}.report.json`, diversity: { report_version: version, verdict: report.verdict, size_class: ["small", "medium", "large"][index % 3], region_description: `Region ${index % 4}`, dependency_count_class: "one" } });
    await writeFile(path.join(directory, `${name}.intake.json`), JSON.stringify(record));
  }
  const full = await checkIntake(directory);
  assert.deepEqual(full.reports.flatMap((item) => item.problems), []);
  assert.equal(full.admitted, 8);
  assert.deepEqual(full.diversity.by_version, { 4: 4, 5: 4 });
  assert.deepEqual(full.diversity.by_verdict, { PASS: 4, BLOCK: 4 });
  assert.equal(full.diversity.target_met, true);
  await writeFile(path.join(directory, "case-7.intake.json"), JSON.stringify({ ...JSON.parse(await readFile(path.join(directory, "case-7.intake.json"), "utf8")), status: "candidate", verification: { rights: { status: "unverified" }, provenance: { status: "unverified" } } }));
  const short = await checkIntake(directory);
  assert.equal(short.admitted, 7);
  assert.equal(short.diversity.target_met, false, "seven admitted reports do not meet a target of eight");
});

// ---------------------------------------------------------------------------
// Independent test set
// ---------------------------------------------------------------------------

function establishedManifest(count = 8, purpose = "pilot") {
  const cases = Array.from({ length: count }, (_, index) => ({
    case_id: `case-${index}`,
    report_sha256: randomBytes(32).toString("hex"),
    report_canonical_sha256: randomBytes(32).toString("hex"),
    intake_status: "admitted",
    third_party_model_permitted: true,
    diversity: { report_version: index % 2 ? "4" : "5", verdict: index % 4 < 2 ? "PASS" : "BLOCK", size_class: ["small", "medium", "large"][index % 3], region: `Region ${index % 4}` },
    labels: Array.from({ length: 10 }, (_, q) => ({ question: `Question ${q} about this report?`, expected_decision: "ANSWER", expected_contains: ["Report verdict:"], labelled_by: "Imani Okoye", independent_of_author: true, saw_copilot_or_model_output: false, labelled_on: "2026-10-20" }))
  }));
  const manifest = {
    schema: "geoimpact-independent-test-set/1", status: "established", purpose, sealed: true, sealed_on: "2026-10-21", sealed_by: "Imani Okoye",
    seal_digest: null, first_model_run_on: null, minimum_cases_for_model_gate: 300,
    human_review: { status: "reviewed", reviewers: ["Imani Okoye", "Tomas Reyes"], second_reviewer_sample_fraction: 0.25, disagreement_rate: 0.02 }, cases
  };
  manifest.seal_digest = sealDigest(cases);
  return manifest;
}
const reseal = (manifest) => ({ ...manifest, seal_digest: sealDigest(manifest.cases) });

test("the committed test-set manifest honestly says no independent test set exists", async () => {
  const manifest = await readJson("geoimpact-copilot/evaluation/independent-test-set/manifest.json");
  assert.equal(manifest.status, "not_established");
  assert.equal(manifest.cases.length, 0);
  assert.equal(manifest.human_review.status, "not_started");
  assert.deepEqual(await manifestProblems(manifest), []);
  const claimed = { ...manifest, status: "established" };
  assert.ok((await manifestProblems(claimed)).length > 0, "flipping the status without cases, a seal and reviewers fails");
  assert.ok((await manifestProblems({ ...manifest, human_review: { status: "reviewed", reviewers: ["A B"] } })).length > 0);
});

test("a properly established set passes, and each way of weakening it fails", async () => {
  assert.deepEqual(await manifestProblems(establishedManifest(), { now: "2026-10-25" }), [], "a sealed pilot-size set of 8 reports with 10 labelled questions each is valid as a pilot");
  const ok = establishedManifest();
  const change = (mutate, { resealed = true } = {}) => {
    const copy = structuredClone(ok);
    mutate(copy);
    return resealed ? reseal(copy) : copy;
  };
  const known = await knownSyntheticCorpus();
  const leaked = [...known.canonical][0];
  const cases = {
    "too few cases for a pilot": () => establishedManifest(7),
    "too few cases for the release gate": () => establishedManifest(40, "release_gate"),
    "no purpose": () => change((m) => { delete m.purpose; }),
    "too few labels per case": () => change((m) => { m.cases[0].labels = m.cases[0].labels.slice(0, 3); }),
    "duplicate questions": () => change((m) => { m.cases[0].labels[1].question = m.cases[0].labels[0].question; }),
    "diversity target not met": () => change((m) => { for (const item of m.cases) item.diversity.report_version = "5"; }),
    "pilot used to set thresholds": () => change((m) => { m.thresholds_may_be_set = true; }),
    "changed after sealing": () => change((m) => { m.cases[0].labels[0].expected_decision = "ABSTAIN"; }, { resealed: false }),
    "unsealed": () => change((m) => { m.sealed = false; }),
    "sealed in the future": () => change((m) => { m.sealed_on = "2099-01-01"; }),
    "sealed by a model": () => change((m) => { m.sealed_by = "Claude"; }),
    "model ran before the seal": () => change((m) => { m.first_model_run_on = "2026-10-20"; }),
    "leaked development report": () => change((m) => { m.cases[0].report_canonical_sha256 = leaked; }),
    "duplicate report": () => change((m) => { m.cases[1].report_canonical_sha256 = m.cases[0].report_canonical_sha256; }),
    "report not admitted by intake": () => change((m) => { m.cases[0].intake_status = "candidate"; }),
    "no third-party model permission": () => change((m) => { m.cases[0].third_party_model_permitted = false; }),
    "labelled by the author": () => change((m) => { m.cases[0].labels[0].independent_of_author = false; }),
    "labeller saw software output": () => change((m) => { m.cases[0].labels[0].saw_copilot_or_model_output = true; }),
    "labelled by a model": () => change((m) => { m.cases[0].labels[0].labelled_by = "Claude Sonnet 5.5"; }),
    "labelled after sealing": () => change((m) => { m.cases[0].labels[0].labelled_on = "2026-10-24"; }),
    "no second reviewer": () => change((m) => { m.human_review.reviewers = ["Imani Okoye"]; }, { resealed: false }),
    "second reviewer sample too small": () => change((m) => { m.human_review.second_reviewer_sample_fraction = 0.05; }, { resealed: false }),
    "disagreement not reported": () => change((m) => { m.human_review.disagreement_rate = null; }, { resealed: false }),
    "review not completed": () => change((m) => { m.human_review.status = "in_review"; }, { resealed: false })
  };
  for (const [name, make] of Object.entries(cases)) assert.ok((await manifestProblems(make(), { now: "2026-10-25" })).length > 0, name);
});

test("the manifest cannot lower its own minimum, and only a release-gate set may reach 300", async () => {
  const manifest = establishedManifest(8);
  manifest.minimum_cases_for_model_gate = 10;
  assert.ok((await manifestProblems(reseal(manifest), { now: "2026-10-25" })).some((problem) => /must stay 300/.test(problem)));
  assert.deepEqual(await manifestProblems(establishedManifest(300, "release_gate"), { now: "2026-10-25" }), []);
  assert.ok((await manifestProblems(establishedManifest(8, "release_gate"), { now: "2026-10-25" })).some((problem) => /below the 300/.test(problem)));
});

test("the label-sheet template is blank and cannot be mistaken for a labelled sheet", async () => {
  const sheet = await readJson("geoimpact-copilot/evaluation/independent-test-set/label-sheet.template.json");
  assert.equal(sheet.status, "blank_template");
  assert.equal(sheet.report_sha256, null);
  assert.deepEqual(Object.values(sheet.labeller), [null, null, null, null, null]);
  assert.equal(sheet.labelled_on, null);
  assert.ok(sheet.labels.every((label) => label.question === null && label.expected_decision === null));
});

// ---------------------------------------------------------------------------
// First Sonnet experiment: prerequisites, limits and controls (no model is called)
// ---------------------------------------------------------------------------

test("the Sonnet experiment is on HOLD, lists what is unmet, and calls nothing", async () => {
  const result = await assess();
  assert.equal(result.verdict, "HOLD");
  assert.deepEqual(result.consistency_problems, []);
  assert.equal(result.live_calls_enabled, false);
  const unmet = result.unmet.map((item) => item.id);
  for (const id of ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P9"]) assert.ok(unmet.includes(id), `${id} is unmet`);
  assert.ok(!unmet.includes("P8"), "the repository itself is clean of keys and SDKs");
  assert.equal(prerequisites.status, "hold");
  assert.equal(prerequisites.experiment.model_candidate, "claude-sonnet-5-5");
  assert.equal(prerequisites.experiment.tier, "A");
  assert.equal(prerequisites.owner_approval.owner_approved, false);
  assert.equal(prerequisites.limits.status, "proposed");
});

test("the limits file is internally consistent, and each way of loosening it is caught", () => {
  assert.deepEqual(specProblems(prerequisites), []);
  const edit = (mutate) => { const copy = structuredClone(prerequisites); mutate(copy); return specProblems(copy); };
  assert.ok(edit((s) => { s.live_calls_enabled = true; }).length);
  assert.ok(edit((s) => { s.experiment.tier = "B"; }).length);
  assert.ok(edit((s) => { s.limits.model_id_exact = "claude-opus-5-5"; }).length);
  assert.ok(edit((s) => { s.limits.per_request.max_input_tokens = 0; }).length);
  assert.ok(edit((s) => { s.limits.per_run.max_total_input_tokens = 1e12; }).length, "a total cap larger than the requests could send does not bind");
  assert.ok(edit((s) => { s.thresholds.zero_tolerance[0].allowed = 1; }).length);
  assert.ok(edit((s) => { s.thresholds.fidelity_metrics[0].required = 0.9; }).length);
  assert.ok(edit((s) => { s.secret_controls.pop(); }).length);
  assert.ok(edit((s) => { s.owner_approval.owner_approved = true; }).length, "approval without a name, a date and prices is invalid");
  assert.ok(edit((s) => { s.limits.status = "proposed"; s.owner_approval = { ...s.owner_approval, owner_approved: true, approved_by: "Owner", approved_on: "2026-10-25", price_per_million_input_tokens_usd: 1000, price_per_million_output_tokens_usd: 1000, price_source_url: "https://example.org/pricing", price_retrieved_on: "2026-10-25" }; }).length, "proposed limits cannot be approved in place");
  const approved = structuredClone(prerequisites);
  approved.limits.status = "accepted";
  approved.owner_approval = { owner_approved: true, approved_by: "Owner Name", approved_on: "2026-10-25", price_per_million_input_tokens_usd: 1000, price_per_million_output_tokens_usd: 1000, price_source_url: "https://example.org/pricing", price_retrieved_on: "2026-10-25" };
  assert.ok(specProblems(approved).some((problem) => /worst-case cost/.test(problem)), "the worst case is computed from the owner's recorded prices and must fit the hard cap");
  approved.owner_approval.price_per_million_input_tokens_usd = 1;
  approved.owner_approval.price_per_million_output_tokens_usd = 1;
  assert.deepEqual(specProblems(approved), []);
});

test("the documented pack sizes are what the code produces, and the token limit binds on large reports", async () => {
  const measured = await measurePacks();
  const documented = prerequisites.pack_size_measurement;
  assert.equal(measured.answered_packs, documented.answered_packs);
  assert.equal(measured.mean_chars, documented.mean_chars);
  assert.equal(measured.max_chars, documented.max_chars);
  assert.equal(measured.chars_by_regression_count[3], documented.scaling.chars_by_regression_count["3"]);
  assert.equal(measured.chars_by_regression_count[50], documented.scaling.chars_by_regression_count["50"]);
  const limit = prerequisites.limits.per_request;
  assert.ok(Math.ceil(documented.max_chars / 3) <= limit.max_input_tokens, "every pack in the development corpus fits");
  const sized = (regressions) => {
    const report = buildReport(makeSpec(5, { report_version: "5", regression_count: regressions }));
    const answer = answerQuestion(report, "Which dependent assignment changed and what was before and after?");
    const pack = buildEvidencePack({ question: "q", answer, report });
    return { claims: pack.allowed_claims.length, tokens: estimateInputTokens(pack) };
  };
  const ten = sized(10);
  assert.ok(ten.claims <= limit.max_claims && ten.tokens <= limit.max_input_tokens, `10 regressions: ${ten.claims} claims, ${ten.tokens} estimated tokens`);
  const fifty = sized(50);
  assert.ok(fifty.claims > limit.max_claims && fifty.tokens > limit.max_input_tokens, "a 50-regression report exceeds the limits, so it must fall back without a call");
});

test("secret and SDK controls: no key, SDK, endpoint or provider secret in executable repository files", async () => {
  assert.deepEqual(await repositoryViolations(), []);
  const probe = (text) => secretPatterns.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
  assert.ok(probe("const k = 'sk-ant-api03-abcdefgh1234';").length);
  assert.ok(probe("ANTHROPIC_API_KEY=abc").length);
  assert.ok(probe("const key = process.env.ANTHROPIC_API_KEY;").length);
  assert.ok(probe("import Anthropic from \"@anthropic-ai/sdk\";").length);
  assert.ok(probe("fetch('https://api.anthropic.com/v1/messages')").length);
  assert.ok(probe("env: { K: ${{ secrets.ANTHROPIC_API_KEY }} }").length);
  assert.deepEqual(probe("const verdict = 'BLOCK';"), []);
  const packageJson = await readJson("package.json");
  assert.ok(!Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies }).some((name) => /anthropic|openai|claude/i.test(name)));
  const text = JSON.stringify(prerequisites);
  assert.doesNotMatch(text, /sk-ant-|ANTHROPIC_API_KEY|Bearer |https:\/\/api\./);
  for (const workflow of ["validate.yml", "deploy-space.yml"]) assert.doesNotMatch(await readFile(repo(`.github/workflows/${workflow}`), "utf8"), /ANTHROPIC|CLAUDE_API|sk-ant/i, workflow);
});

// ---------------------------------------------------------------------------
// Final gate: P3 needs independently validated intake evidence; P2 needs a complete human review
// ---------------------------------------------------------------------------

// Test-only stand-ins in a temp directory outside the repository; none of this is a real report.
async function externalDirectory({ mutateRecord = (record) => record, count = 8 } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "geoimpact-p3-"));
  const plan = [["5", 0], ["5", 1], ["5", 1], ["4", 0], ["4", 1], ["4", 1], ["5", 0], ["4", 0]].slice(0, count);
  const hashes = [];
  for (const [index, [version, regressions]] of plan.entries()) {
    const report = buildReport(makeSpec(995000 + index, { report_version: version, regression_count: regressions, threshold: 0 }));
    if (version === "5") report.provenance.engine = { geoimpact_ci: "1.2.0", shapely: "2.1.0", geos: "3.13.0", pyproj: "3.7.0", proj: "9.5.0" };
    const text = JSON.stringify(report) + "\n";
    const name = "case-" + index;
    await writeFile(path.join(directory, name + ".report.json"), text);
    const record = intakeRecord(report, text, { report_file: name + ".report.json", diversity: { report_version: version, verdict: report.verdict, size_class: ["small", "medium", "large"][index % 3], region_description: "Region " + (index % 4), dependency_count_class: "one" } });
    await writeFile(path.join(directory, name + ".intake.json"), JSON.stringify(mutateRecord(record, index)));
    hashes.push(sha(text));
  }
  return { directory, hashes };
}
const p3Met = async (options) => !(await assess(options)).unmet.some((item) => item.id === "P3");

test("P3: eight independently validated intake records satisfy it, and nothing else does", async () => {
  assert.equal(await p3Met({ intakeDir: null }), false, "no external evidence: unmet");
  const { directory } = await externalDirectory();
  assert.equal(await p3Met({ intakeDir: directory }), true, "structurally valid records pass");
  const result = await assess({ intakeDir: directory });
  assert.equal(result.verdict, "HOLD", "other prerequisites keep it on HOLD");
  assert.deepEqual(result.consistency_problems, []);
});

test("P3: a forged manifest cannot stand in for intake evidence", async () => {
  const forged = establishedManifest();
  const claimed = await assess({ testSet: forged, now: "2026-10-25" });
  assert.ok(claimed.unmet.some((item) => item.id === "P3"), "an established manifest does not admit anything");
  assert.ok(claimed.unmet.some((item) => item.id === "P4"), "its cases are linked to no admitted report");
  const { directory } = await externalDirectory();
  const withDir = await assess({ testSet: forged, intakeDir: directory, now: "2026-10-25" });
  assert.ok(withDir.unmet.some((item) => item.id === "P4"), "cases whose hashes intake never admitted stay unmet");
  assert.ok(!withDir.unmet.some((item) => item.id === "P3"));
});

test("P3: missing, mismatched, forged or unpermitted intake records do not count", async () => {
  const cases = {
    "a record removed": async () => { const e = await externalDirectory(); await rm(path.join(e.directory, "case-3.intake.json")); return e; },
    "fewer than eight": async () => externalDirectory({ count: 7 }),
    "hash mismatch": async () => externalDirectory({ mutateRecord: (r, i) => (i === 2 ? { ...r, report_sha256: "0".repeat(64) } : r) }),
    "report swapped after intake": async () => { const e = await externalDirectory(); await writeFile(path.join(e.directory, "case-1.report.json"), "{}\n"); return e; },
    "admitted flag forged over unverified checks": async () => externalDirectory({ mutateRecord: (r, i) => (i === 1 ? { ...r, status: "admitted", verification: { rights: { status: "unverified" }, provenance: { status: "unverified" } } } : r) }),
    "attestation by an automated system": async () => externalDirectory({ mutateRecord: (r, i) => (i === 0 ? { ...r, verification: { ...r.verification, rights: { ...r.verification.rights, verified_by: "Claude" } } } : r) }),
    "synthetic origin": async () => externalDirectory({ mutateRecord: (r, i) => (i === 4 ? { ...r, origin: { ...r.origin, kind: "synthetic" } } : r) }),
    "no third-party model permission on one": async () => externalDirectory({ mutateRecord: (r, i) => (i === 5 ? { ...r, rights: { ...r.rights, may_be_sent_to_third_party_model: false } } : r) }),
    "no third-party model permission on any": async () => externalDirectory({ mutateRecord: (r) => ({ ...r, rights: { ...r.rights, may_be_sent_to_third_party_model: false } }) }),
    "report identity differs from the record": async () => externalDirectory({ mutateRecord: (r, i) => (i === 6 ? { ...r, report_file: "case-0.report.json" } : r) }),
    "unreadable directory": async () => ({ directory: path.join(tmpdir(), "geoimpact-does-not-exist-" + Date.now()) })
  };
  for (const [name, make] of Object.entries(cases)) {
    const { directory } = await make();
    assert.equal(await p3Met({ intakeDir: directory }), false, name);
  }
  const empty = await mkdtemp(path.join(tmpdir(), "geoimpact-p3-empty-"));
  assert.equal(await p3Met({ intakeDir: empty }), false, "an empty directory: unmet, and not an error");
});

test("P3 and P4: an established set links to admitted reports only by matching hash", async () => {
  const { directory, hashes } = await externalDirectory();
  const manifest = establishedManifest(8);
  manifest.cases.forEach((item, index) => { item.report_sha256 = hashes[index]; });
  const linked = reseal(manifest);
  const good = await assess({ testSet: linked, intakeDir: directory, now: "2026-10-25" });
  assert.ok(!good.unmet.some((item) => item.id === "P4"), "every case matches an admitted, permitted report");
  const broken = structuredClone(manifest);
  broken.cases[0].report_sha256 = "a".repeat(64);
  assert.ok((await assess({ testSet: reseal(broken), intakeDir: directory, now: "2026-10-25" })).unmet.some((item) => item.id === "P4"));
});

const reviewedLabels = (overrides = {}, review = {}) => ({
  review_status: "Reviewed by an independent reviewer.",
  labeling: { labeled_by: "author_hand_label", human_review: { status: "reviewed", reviewed_by: "Imani Okoye", reviewed_on: "2026-10-20", independent_of_author: true, relationship_to_author: "Colleague from another institution; no part in writing the code.", ...review } },
  cases: Array.from({ length: 18 }, (_, i) => ({ id: "c" + i, human_review_status: "reviewed" })),
  ...overrides
});

test("P2: a complete, consistent human review satisfies it structurally", async () => {
  assert.deepEqual(labelReviewProblems(reviewedLabels(), { today: "2026-10-25" }), []);
  assert.equal((await assess({ labels: reviewedLabels(), now: "2026-10-25" })).unmet.some((item) => item.id === "P2"), false);
});

test("P2: a status plus an independence boolean is not enough", async () => {
  const bad = {
    "no reviewer name": reviewedLabels({}, { reviewed_by: null }),
    "blank reviewer name": reviewedLabels({}, { reviewed_by: "  " }),
    "automated reviewer": reviewedLabels({}, { reviewed_by: "Claude Sonnet 5.5" }),
    "no date": reviewedLabels({}, { reviewed_on: null }),
    "malformed date": reviewedLabels({}, { reviewed_on: "20/10/2026" }),
    "impossible date": reviewedLabels({}, { reviewed_on: "2026-02-31" }),
    "future date": reviewedLabels({}, { reviewed_on: "2099-01-01" }),
    "independence false": reviewedLabels({}, { independent_of_author: false }),
    "independence missing": reviewedLabels({}, { independent_of_author: undefined }),
    "independence as a string": reviewedLabels({}, { independent_of_author: "true" }),
    "no stated relationship": reviewedLabels({}, { relationship_to_author: undefined }),
    "trivial relationship": reviewedLabels({}, { relationship_to_author: "n/a" }),
    "status unreviewed": reviewedLabels({}, { status: "unreviewed" }),
    "one case still unreviewed": reviewedLabels({ cases: [{ id: "x", human_review_status: "reviewed" }, { id: "y", human_review_status: "unreviewed" }] }),
    "top-level text still says UNREVIEWED": reviewedLabels({ review_status: "UNREVIEWED: author-written" }),
    "reviewer is the labeller": reviewedLabels({}, { reviewed_by: "author_hand_label" }),
    "no review block": { labeling: {}, cases: [] }
  };
  for (const [name, labels] of Object.entries(bad)) {
    assert.ok(labelReviewProblems(labels, { today: "2026-10-25" }).length > 0, name);
    assert.ok((await assess({ labels, now: "2026-10-25" })).unmet.some((item) => item.id === "P2"), name);
  }
});

test("honest state: UNREVIEWED labels and zero real reports give HOLD and exit 0", async () => {
  const result = await assess({ intakeDir: null });
  assert.equal(result.verdict, "HOLD");
  assert.deepEqual(result.consistency_problems, []);
  for (const id of ["P2", "P3", "P4"]) assert.ok(result.unmet.some((item) => item.id === id), id);
  const run = execFileSync(process.execPath, [fileURLToPath(repo("geoimpact-copilot/provider-contract/check-sonnet-prerequisites.mjs"))], { encoding: "utf8", env: { ...process.env, GEOIMPACT_INTAKE_DIR: "" } });
  assert.equal(JSON.parse(run).verdict, "HOLD");
});
