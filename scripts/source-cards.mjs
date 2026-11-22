// Validates data/sources/*.json (Tourism Data Guard source cards).
//   node scripts/source-cards.mjs                      structure + semantics; pending ([X]) statements are allowed and counted
//   node scripts/source-cards.mjs --release            also FAIL while any statement of the selected cards is pending
//   node scripts/source-cards.mjs --release --cards a,b   enforce --release on those card ids only
//   node scripts/source-cards.mjs --online             also request every checked URL (network)
//   --dir <path>   read cards from another directory (used by the tests)
//   --today YYYY-MM-DD   fix "today" for the future-date rule (used by the tests)
//
// What this proves: every card has the schema's shape, every checked statement has an https URL on one
// of the producer's declared hosts and a real, non-future consultation date, and no text uses wording
// the project forbids. What it does NOT prove: that a URL says what the card claims, that the producer
// is right, or that a text is free of causal claims (the wording rules are a tripwire, not a guarantee).

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DEFAULT_DIR = path.join(ROOT, "data", "sources");
export const SCHEMA_PATH = path.join(ROOT, "data", "source-card.schema.json");
export const CATALOG_PATH = path.join(ROOT, "data", "evidence-catalog.json");

// First commit of this repository. A consultation made for this project cannot predate it.
export const EARLIEST_CONSULTATION = "2026-10-24";

// ---- wording rules -------------------------------------------------------------------------------
// Unicode-aware word boundaries: \b would treat accented letters as non-word characters.
const phrase = (alternatives) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{N}_])`, "iu");

// Same family of terms as the evidence catalog's check (scripts/evidence-catalog.mjs), which this project
// already treats as overclaiming.
const VALIDATION = phrase("validated|verified|certified|proven|proves|proof|ground[- ]truth|guarantee[sd]?|accurate|accuracy of|independently (?:validated|reviewed)|validad[oa]s?|verificad[oa]s?|certificad[oa]s?|demostrad[oa]s?|prueba que");
// Quality and resilience adjectives are claims about the source that no card has the evidence to make.
const QUALITY = phrase("resilien\\w*|robust\\w*|robustez|reliable|unreliable|fiables?");
// Unmistakable causal connectors. "causal" alone is deliberately not listed so that "does not support
// causal inference" passes. Method-break descriptions and documented effects are exempt (see below).
const CAUSAL = phrase("caus(?:e|es|ed|ing)|leads? to|led to|results? in|resulted in|due to|because of|as a result of|attributable to|drives|driven by|thanks to|causas?|causan|causó|causaron|provoca|provocan|provocó|provocaron|debido a|a causa de|como resultado de|como consecuencia de|se debe a|se deben a|gracias a|atribuible a|impulsa|impulsan|origina|originan");

// A method break may legitimately explain a change of method ("due to a change of operator") and its
// documented effect on the series: that is the producer's statement about its own method, attributed by
// the field name. Those two fields skip the causal rule only; the other rules still apply to them.
const isMethodologyPath = (p) => /^methodBreaks\.items\[\d+\]\.(description|documentedEffect)\b/.test(p);
const isNotePath = (p) => p.endsWith(".pendingReason");

export function wordingProblems(p, value) {
  const rules = [["validation wording", VALIDATION], ["quality or resilience wording", QUALITY]];
  if (!isMethodologyPath(p) && !isNotePath(p)) rules.push(["causal wording", CAUSAL]);
  return rules.flatMap(([label, re]) => (re.test(value) ? [`${label} not allowed: "${value.match(re)[0]}"`] : []));
}

// ---- helpers -------------------------------------------------------------------------------------
export function isRealDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
export const isRealMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export function hostAllowed(urlString, hosts) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function* walk(value, p = "") {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) yield* walk(value[i], `${p}[${i}]`);
  } else if (value && typeof value === "object") {
    yield { path: p, node: value };
    for (const [key, child] of Object.entries(value)) yield* walk(child, p ? `${p}.${key}` : key);
  }
}

// ---- loading -------------------------------------------------------------------------------------
export async function loadCards(dir = DEFAULT_DIR) {
  const names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(names.map(async (file) => ({ file, card: JSON.parse(await readFile(path.join(dir, file), "utf8")) })));
}

export async function loadSchema() {
  return JSON.parse(await readFile(SCHEMA_PATH, "utf8"));
}

export async function loadEvidenceIds() {
  return new Set(JSON.parse(await readFile(CATALOG_PATH, "utf8")).records.map((record) => record.id));
}

export const compileValidator = (schema) => new Ajv2020({ allErrors: true, strict: true }).compile(schema);

// Ajv reports every branch of every oneOf. For a statement that fails both its checked and its pending
// form, say so once and list a few of the concrete reasons instead of dumping the whole tree.
const DETAIL = new Set(["const", "required", "additionalProperties", "pattern", "enum", "minItems", "maxItems", "minLength", "maxLength", "type"]);
const detail = (error) => `${error.instancePath || "/"}: ${error.message}${error.params?.missingProperty ? ` (${error.params.missingProperty})` : ""}${error.params?.additionalProperty ? ` (${error.params.additionalProperty})` : ""}`;
export function describeSchemaErrors(errors) {
  const umbrellas = errors.filter((error) => error.keyword === "oneOf");
  const messages = umbrellas.map((umbrella) => {
    const inside = [...new Set(errors.filter((e) => e !== umbrella && DETAIL.has(e.keyword) && e.instancePath.startsWith(umbrella.instancePath)).map(detail))];
    return `${umbrella.instancePath || "/"}: matches neither the checked form (https url + consultedOn) nor the pending form ([X] + pendingReason). Some reasons: ${inside.slice(0, 4).join("; ")}`;
  });
  const covered = (e) => umbrellas.some((u) => e.instancePath.startsWith(u.instancePath));
  for (const error of errors) if (error.keyword !== "oneOf" && DETAIL.has(error.keyword) && !covered(error)) messages.push(detail(error));
  return [...new Set(messages)];
}

// ---- the check -----------------------------------------------------------------------------------
// entries: [{ file, card }]. Returns { problems: string[], stats }. Never throws on bad cards.
export function checkCards(entries, { validate, evidenceIds = new Set(), today, release = false, releaseOnly = null }) {
  const problems = [];
  const fail = (file, p, message) => problems.push(`${file}${p ? ` ${p}` : ""}: ${message}`);
  const stats = { cards: entries.length, checked: 0, pending: 0, perCard: {} };

  const ids = new Map();
  for (const { file, card } of entries) {
    if (typeof card?.id === "string") {
      if (ids.has(card.id)) fail(file, "id", `duplicate card id ${card.id} (also in ${ids.get(card.id)})`);
      ids.set(card.id, file);
      if (file !== `${card.id}.json`) fail(file, "id", `file name must be ${card.id}.json`);
    }
  }
  if (releaseOnly) {
    for (const id of releaseOnly) if (!ids.has(id)) fail("--cards", "", `unknown card id ${id}`);
  }

  for (const { file, card } of entries) {
    if (!validate(card)) {
      for (const message of describeSchemaErrors(validate.errors)) fail(file, "", message);
      continue; // semantic checks assume the shape
    }

    const hosts = card.producer.officialHosts;
    const counts = { checked: 0, pending: 0 };
    stats.perCard[card.id] = counts;

    for (const { path: p, node } of walk(card)) {
      if (node.status === "checked") {
        counts.checked += 1;
        stats.checked += 1;
        const urls = [node.url].filter(Boolean);
        for (const url of urls) {
          if (!hostAllowed(url, hosts)) {
            fail(file, p, `URL host is not one of this card's producer.officialHosts [${hosts.join(", ") || "none declared"}]: ${url}`);
          }
        }
        if (!isRealDate(node.consultedOn)) fail(file, `${p}.consultedOn`, `not a real calendar date: ${node.consultedOn}`);
        else if (node.consultedOn > today) fail(file, `${p}.consultedOn`, `consultation date ${node.consultedOn} is in the future (today is ${today})`);
        else if (node.consultedOn < EARLIEST_CONSULTATION) fail(file, `${p}.consultedOn`, `consultation date ${node.consultedOn} predates this repository (${EARLIEST_CONSULTATION})`);
      } else if (node.status === "pending") {
        counts.pending += 1;
        stats.pending += 1;
        if (release && (!releaseOnly || releaseOnly.has(card.id))) fail(file, p, "still pending ([X]): not allowed with --release");
      }
    }

    const { temporal } = card.coverage;
    if (temporal.status === "checked") {
      if (!isRealMonth(temporal.from)) fail(file, "coverage.temporal.from", `not a real month: ${temporal.from}`);
      if (temporal.to !== "ongoing") {
        if (!isRealMonth(temporal.to)) fail(file, "coverage.temporal.to", `not a real month: ${temporal.to}`);
        else if (isRealMonth(temporal.from) && temporal.from > temporal.to) fail(file, "coverage.temporal", `from ${temporal.from} is after to ${temporal.to}`);
      }
    }

    const breakIds = new Set();
    card.methodBreaks.items.forEach((item, index) => {
      if (breakIds.has(item.id)) fail(file, `methodBreaks.items[${index}].id`, `duplicate break id ${item.id}`);
      breakIds.add(item.id);
      if (item.status === "checked" && !isRealDate(item.date)) fail(file, `methodBreaks.items[${index}].date`, `not a real calendar date: ${item.date}`);
    });

    for (const link of card.evidenceLinks ?? []) {
      if (!evidenceIds.has(link)) fail(file, "evidenceLinks", `unknown evidence record ${link}`);
    }

    for (const { path: p, node } of walk(card)) {
      for (const key of ["es", "en", "pendingReason"]) {
        if (typeof node[key] === "string" && node[key] !== "[X]") {
          for (const message of wordingProblems(`${p ? `${p}.` : ""}${key}`, node[key])) fail(file, `${p ? `${p}.` : ""}${key}`, message);
        }
      }
    }
  }
  return { problems, stats };
}

// ---- optional network check ----------------------------------------------------------------------
// A URL that answers proves only that the link is not broken, not that the card's statement is true.
export function checkedUrls(entries) {
  const urls = new Set();
  for (const { card } of entries) for (const { node } of walk(card)) if (node.status === "checked" && node.url) urls.add(node.url);
  return [...urls].sort();
}

export async function checkOnline(entries, fetchImpl = fetch) {
  const headers = { "user-agent": "SK-Spatial-Intelligence-Lab-SourceCards-Check/0.1" };
  const failures = [];
  await Promise.all(checkedUrls(entries).map(async (url) => {
    try {
      let response = await fetchImpl(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(20000), headers });
      if ([403, 405, 501].includes(response.status)) {
        response = await fetchImpl(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(20000), headers: { ...headers, range: "bytes=0-0" } });
      }
      if (!response.ok) failures.push(`${url}: HTTP ${response.status}`);
    } catch (error) {
      failures.push(`${url}: ${error.message}`);
    }
  }));
  return failures.sort();
}

// ---- command line --------------------------------------------------------------------------------
async function main(argv) {
  const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const dir = option("--dir") ? path.resolve(option("--dir")) : DEFAULT_DIR;
  const today = option("--today") ?? new Date().toISOString().slice(0, 10);
  const release = argv.includes("--release");
  const releaseOnly = option("--cards") ? new Set(option("--cards").split(",").filter(Boolean)) : null;
  if (releaseOnly && !release) {
    console.error("FAIL --cards only makes sense together with --release");
    return 1;
  }

  const entries = await loadCards(dir);
  const { problems, stats } = checkCards(entries, { validate: compileValidator(await loadSchema()), evidenceIds: await loadEvidenceIds(), today, release, releaseOnly });
  if (problems.length) {
    for (const problem of problems) console.error(`FAIL ${problem}`);
    console.error(`${problems.length} problem(s) in ${stats.cards} card(s)`);
    return 1;
  }
  console.log(`PASS ${stats.cards} source cards: schema, unique ids, official hosts, real non-future consultation dates, wording rules`);
  console.log(`${stats.checked} checked statement(s), ${stats.pending} pending ([X])`);
  if (release) console.log(`PASS --release: no pending statement in ${releaseOnly ? [...releaseOnly].join(", ") : "any card"}`);
  else if (stats.pending > 0) console.log("NOTE cards with pending statements are not publishable: --release fails until they are read at their official source");

  if (argv.includes("--online")) {
    const failures = await checkOnline(entries);
    if (failures.length) {
      for (const failure of failures) console.error(`FAIL ${failure}`);
      return 1;
    }
    console.log(`PASS ${checkedUrls(entries).length} checked URL(s) answered (this does not show that the statement is still true)`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)));
}
