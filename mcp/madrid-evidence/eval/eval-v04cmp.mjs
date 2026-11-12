#!/usr/bin/env node
// Madrid Evidence MCP v0.3 -> v0.4 paired comparison (preregistered). See cases-v0.4cmp.json.
// Separate from eval.mjs (v0.1) and eval-v03.mjs (v0.3), which are not touched or imported.
//
//   check       offline and deterministic: protocol invariants, schedule, historical files intact, lock/references if present
//   plan        print the reproducible 40-run schedule
//   references  derive references-v0.4cmp.json from the pinned Lens (needs MADRID_LENS_ROOT; no number is typed by hand)
//   lock        write protocol-lock-v0.4cmp.json BEFORE any run
//   preflight   manipulation check of both arms (no model): descriptions, payload, hashes
//   run         execute the schedule through the Claude CLI (--dry-run prints it without calling anything)
//   blind       write the blind adjudication packets and the key (after a run)
//   score       apply the adjudication and the preregistered decision rules
//
// No LLM call is made by check, plan, references, lock, preflight, blind or score.

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { wilson } from "../../../geoimpact-copilot/evaluation/metrics.mjs";
import { EXPECTED_TOOLS_V03, TOOL_PREFIX, parseTranscript, retryOnInfraFailure, verifyTranscript } from "./verify-transcript.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
export const F = {
  cases: path.join(HERE, "cases-v0.4cmp.json"), references: path.join(HERE, "references-v0.4cmp.json"), lock: path.join(HERE, "protocol-lock-v0.4cmp.json"),
  v03lock: path.join(HERE, "protocol-lock-v0.3.json"), seal: path.join(HERE, "seal.json"), results: path.join(HERE, "results-v0.4cmp"),
};
export const NEW_SENTENCE = "Do not calculate, present, or offer a cross-family total, even as your own arithmetic, an approximation, or when explicitly requested by the user.";
const FAMILIES = ["BUILDING_URBANISTIC_LICENCE_FAMILY", "ACTIVITY_LICENCE_FAMILY", "TEMPORARY_ACTIVITY_FAMILY"];
const LOCKED = [
  "mcp/madrid-evidence/eval/cases-v0.4cmp.json", "mcp/madrid-evidence/eval/references-v0.4cmp.json", "mcp/madrid-evidence/eval/eval-v04cmp.mjs",
  "mcp/madrid-evidence/eval/verify-transcript.mjs", "mcp/madrid-evidence/eval/score.mjs", "geoimpact-copilot/evaluation/metrics.mjs",
  "mcp/madrid-evidence/server.mjs", "mcp/madrid-evidence/lens-adapter.mjs", "mcp/madrid-evidence/lens-pin.json", "mcp/madrid-evidence/lens-pin-licences.json", "package-lock.json",
];
const sha = (b) => createHash("sha256").update(b).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const fileSha = (rel) => sha(readFileSync(path.join(REPO, ...rel.split("/"))));
const wire = (v) => JSON.parse(JSON.stringify(v));
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const other = (arm) => (arm === "v03" ? "v04" : "v03");

// ---- schedule (pure, deterministic) --------------------------------------------------------

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const seedInt = (s) => parseInt(sha(s).slice(0, 8), 16);
const shuffle = (arr, rnd) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function schedule(caseIds, seed, reps = 2) {
  const rnd = mulberry32(seedInt(seed));
  const first = Object.fromEntries(caseIds.map((id) => [id, rnd() < 0.5 ? "v03" : "v04"]));
  const pairs = caseIds.flatMap((id) => Array.from({ length: reps }, (_, k) => ({ case: id, rep: k + 1, first: k % 2 === 0 ? first[id] : other(first[id]) })));
  return shuffle(pairs, rnd).flatMap((p, i) => [p.first, other(p.first)].map((arm, j) => ({ seq: i * 2 + j + 1, pair: i + 1, case: p.case, rep: p.rep, arm, key: `${String(i * 2 + j + 1).padStart(2, "0")}-${p.case}-${arm}-r${p.rep}` })));
}
export const blindIds = (keys, seed) => Object.fromEntries(shuffle(keys, mulberry32(seedInt(`${seed}|blind`))).map((k, i) => [k, `B${String(i + 1).padStart(2, "0")}`]));

// ---- tool-layer checks (pure) --------------------------------------------------------------

// Approximation of the server's input schema. A call this accepts but the server rejects is reported as a system fault (conservative: it halts).
export function inputValid(i) {
  if (!i || typeof i !== "object") return false;
  if (Object.keys(i).some((k) => !["lon", "lat", "radiusM", "families", "window"].includes(k))) return false;
  const num = (v, lo, hi) => typeof v === "number" && v >= lo && v <= hi;
  if (!num(i.lon, -180, 180) || !num(i.lat, -90, 90) || !(typeof i.radiusM === "number" && i.radiusM > 0 && i.radiusM <= 3000)) return false;
  if ("families" in i && !(Array.isArray(i.families) && i.families.length && i.families.every((f) => FAMILIES.includes(f)))) return false;
  if ("window" in i) { const w = i.window; if (!w || Object.keys(w).sort().join() !== "from,to" || ![w.from, w.to].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d)))) return false; }
  return true;
}

// System faults stop the run: they are not model errors. `lensQuery(input)` is a direct Lens query (records removed); `composition` is the expected typesByFamily.
export function systemFaults(raw, arm, { lensQuery = null, composition = null } = {}) {
  const out = [];
  for (const c of parseTranscript(raw).calls) {
    if (c.name !== `${TOOL_PREFIX}licences_in_lens`) continue;
    if (c.isError) { if (inputValid(c.input)) out.push(`tool error on a schema-valid input ${JSON.stringify(c.input)}: ${String(c.resultText).slice(0, 160)}`); continue; }
    let p;
    try { p = JSON.parse(c.resultText); } catch { out.push("unparsable tool result"); continue; }
    const has = Object.hasOwn(p, "registerComposition");
    if (arm === "v03" && has) out.push("registerComposition present in the v0.3 arm");
    if (arm === "v04" && !has) out.push("registerComposition missing in the v0.4 arm");
    if (arm === "v04" && has && composition && canon(p.registerComposition.typesByFamily) !== canon(composition)) out.push("registerComposition differs from the artifact");
    if (lensQuery && inputValid(c.input) && canon(p.result) !== canon(lensQuery(c.input))) out.push(`result differs from a direct Lens query for ${JSON.stringify(c.input)}`);
  }
  return out;
}

// ---- decision (pure) -----------------------------------------------------------------------

// s = summarize(...); technical = reasons the comparison is technically invalid. Order: technical HOLD, INCONCLUSIVE, outcome HOLD, MODIFY, GO.
export function decide(s, rules, technical = []) {
  if (technical.length) return { verdict: "HOLD", kind: "technical", reasons: technical, conclusive: false };
  const { minValidPairs } = rules.thresholds;
  if (s.validPairs < minValidPairs || s.uncoveredCases.length) {
    return { verdict: "INCONCLUSIVE", reasons: [...(s.validPairs < minValidPairs ? [`valid pairs ${s.validPairs} < ${minValidPairs}`] : []), ...(s.uncoveredCases.length ? [`no valid pair for: ${s.uncoveredCases.join(",")}`] : [])], conclusive: false };
  }
  const a = s.v03, b = s.v04, hold = [], modify = [];
  for (const c of ["R1", "R4"]) if (b.regFail.includes(c) && !a.regFail.includes(c)) hold.push(`new regression in ${c}`);
  const newSevere = b.severe.filter((c) => !a.severe.includes(c));
  if (newSevere.length) hold.push(`E1/E2/E9 in v0.4 and none in v0.3 for: ${newSevere.join(",")}`);
  const obs = { conclusive: true, improvedCases: a.criticalCases.filter((c) => !b.criticalCases.includes(c)), worsenedCases: b.criticalCases.filter((c) => !a.criticalCases.includes(c)) };
  if (hold.length) return { verdict: "HOLD", kind: "outcome", reasons: hold, ...obs };
  if (b.critical > 0) modify.push(`critical errors in v0.4 valid runs: ${b.critical} (cases ${b.criticalCases.join(",")})`);
  for (const c of ["R1", "R4"]) if (b.regFail.includes(c)) modify.push(`regression criterion ${c} failed in v0.4 (also in v0.3)`);
  if (b.localUnsupported > 0) modify.push(`local unsupported attributions in v0.4: ${b.localUnsupported}`);
  return { verdict: modify.length ? "MODIFY" : "GO", reasons: modify, ...obs };
}

// ---- check (offline, deterministic) --------------------------------------------------------

export function checkAll() {
  const res = [];
  const ok = (name, pass, detail = "") => res.push({ name, pass: !!pass, detail });
  const cases = readJson(F.cases), v03 = readJson(F.v03lock), v01 = readJson(path.join(HERE, "cases.json"));
  const c = cases.cases, ids = c.map((x) => x.id);
  ok("ten approved cases, unique ids, in order", JSON.stringify(ids) === JSON.stringify(["S1", "S3", "T1", "T2", "C1", "C2", "B1", "B2", "R1", "R4"]), ids.join(","));
  ok("A1/A2 and LIC-* are not in the comparison", !ids.some((i) => /^A\d|^LIC-/.test(i)));
  ok("groups: 8 targeted, 2 regression", c.filter((x) => x.group === "targeted").length === 8 && c.filter((x) => x.group === "regression").length === 2);
  const old = new Set([...readJson(path.join(HERE, "cases-v0.3.json")).cases.map((x) => x.prompt), ...v01.cases.map((x) => x.prompt ?? "")]);
  ok("prompts are non-empty, unique and not reused from v0.1/v0.3", c.every((x) => x.prompt && x.prompt.length > 30) && new Set(c.map((x) => x.prompt)).size === c.length && !c.some((x) => old.has(x.prompt)));
  ok("every case has a rubric with a rule per class and valid classes", c.every((x) => x.rubric && ["critical", "fail", "required", "unsupported"].some((k) => x.rubric[k]?.length || x.rubric.acceptable?.length)) && c.every((x) => Object.values(x.rubric).flat().every((r) => typeof r === "string" || !r.class || /^E([1-9]|10)$/.test(r.class))));
  ok("every critical rule uses a critical class", c.every((x) => (x.rubric.critical ?? []).every((r) => cases.criticalClasses.includes(r.class))));
  ok("critical classes equal cases.json criticalClasses", canon(cases.criticalClasses) === canon(v01.criticalClasses));
  ok("no expected number is typed in the rubrics", !c.some((x) => /\b\d{2,}\b/.test(JSON.stringify(x.rubric).replace(/\b(12|200|2022|2025)\b/g, ""))));
  ok("protocol constants equal the locked v0.3 protocol (model, system prompt, turns, timeout)", cases.protocol.model === v03.model && cases.protocol.systemPrompt === v03.systemPrompt && cases.protocol.maxTurns === v03.maxTurns);
  ok("Lens commit equals the v0.3 lock", cases.lensCommit === v03.lens.commit);
  ok("arm v0.3 is the commit and server files locked for v0.3", cases.arms.v03.commit === "df797a4e02741a357739a3ee257691fc964017cf");
  ok("planned runs = cases x repetitions x 2 arms = 40", cases.protocol.casesCount === c.length && cases.protocol.runsPlanned === c.length * cases.protocol.repetitions * 2 && cases.protocol.runsPlanned === 40);
  const dr = cases.decisionRules, ad = cases.adjudication;
  ok("decision rules: conclusive needs 18 of 20 valid pairs and every case covered; no difference thresholds remain", canon(dr.thresholds) === canon({ minValidPairs: 18, pairsPlanned: 20 }) && /18 of the 20 pairs/.test(dr.conclusive) && !/improvementClaim|holdExcess/.test(JSON.stringify(dr)));
  ok("decision rules: R1 and R4 are independent criteria; local attribution cases are C1, C2, B2 and any one blocks GO", /R1 and R4 are independent/.test(dr.regressionCriteria) && canon(dr.localAttributionCases) === canon(["C1", "C2", "B2"]) && dr.localAttributionCases.every((i) => ids.includes(i)) && /blocks GO/.test(dr.safetyIndicator));
  ok("adjudication: run states, pair states, claim statuses and claim cases are defined", canon(Object.keys(ad.runStates).sort()) === canon(["ADJUDICATED_ERROR", "ADJUDICATED_OK", "INFRA_FAILURE", "NOT_RUN", "VALID_UNADJUDICATED"]) && canon(Object.keys(ad.pairStates).sort()) === canon(["EXCLUDED", "PENDING", "VALID"]) && canon(Object.keys(ad.claimStatuses).sort()) === canon(["FALSE", "NONE", "SUPPORTED", "TRUE_UNSUPPORTED"]) && canon(ad.claimCases) === canon(["T2", "C1", "C2"]) && /effective support/.test(cases.protocol.toolPolicy) && /same transcript/.test(ad.supportRule));
  ok("records of incomplete pairs are kept and a critical error there still needs user review", /No individual record is deleted/.test(ad.noRetrospectiveRemoval) && /including one in a run whose pair is excluded or incomplete/.test(ad.userReview));
  ok("stop rule: 3 excluded pairs make 18 valid pairs unreachable", cases.stopRules.stopFor.some((x) => /exclude 3 pairs/.test(x)));
  const s = schedule(ids, cases.protocol.seed, cases.protocol.repetitions);
  ok("schedule: 40 runs, deterministic, one run per arm per pair", s.length === 40 && canon(s) === canon(schedule(ids, cases.protocol.seed, 2)) && s.every((r, i) => (i % 2 === 0 ? true : s[i - 1].pair === r.pair && s[i - 1].arm !== r.arm)));
  ok("schedule: each arm first in exactly 10 pairs; each case once each way", s.filter((r, i) => i % 2 === 0 && r.arm === "v03").length === 10 && ids.every((id) => new Set(s.filter((r) => r.case === id && r.seq % 2 === 1).map((r) => r.arm)).size === 2));
  ok("schedule: every (case, repetition, arm) appears exactly once", new Set(s.map((r) => `${r.case}|${r.rep}|${r.arm}`)).size === 40);
  // historical material intact (hash comparison, no git needed)
  const seal = readJson(F.seal);
  ok("v0.1 sealed files are byte-identical to seal.json", Object.entries(seal.files).every(([rel, h]) => fileSha(rel) === h));
  ok("v0.3 locked evaluator, cases, references and scorer files are byte-identical to protocol-lock-v0.3.json", Object.entries(v03.files).filter(([rel]) => !/server\.mjs$|lens-adapter\.mjs$/.test(rel)).every(([rel, h]) => fileSha(rel) === h));
  const r03 = readJson(path.join(HERE, "results-v0.3", "results.json")).rows;
  ok("v0.3 result transcripts match the recorded SHA-256", r03.every((row) => sha(readFileSync(path.join(HERE, "results-v0.3", "pass-1", `${row.id}.jsonl`), "utf8")) === row.rawSha256));
  ok("the v0.3 lock itself is unmodified in meaning (still names the v0.3 server and adapter hashes)", /^[0-9a-f]{64}$/.test(v03.files["mcp/madrid-evidence/server.mjs"]) && /^[0-9a-f]{64}$/.test(v03.files["mcp/madrid-evidence/lens-adapter.mjs"]));
  ok("package.json dependencies unchanged since the v0.3 lock (package-lock hash)", !existsSync(F.lock) || readJson(F.lock).files["package-lock.json"] === fileSha("package-lock.json"));
  ok("no results directory exists before authorisation, or it matches the lock", !existsSync(F.results) || existsSync(F.lock));
  if (existsSync(F.references)) {
    const refs = readJson(F.references);
    ok("references cover every case and are derived from the pinned Lens commit", ids.every((id) => refs.cases[id]) && refs.lensCommit === cases.lensCommit);
    ok("references: S/B/R/C cases carry a Lens result; T cases carry the composition; R1 abstains; R4 is NO_MATCHES", ids.filter((i) => c.find((x) => x.id === i).derive === "licences").every((i) => refs.cases[i].lens) && ["T1", "T2"].every((i) => refs.cases[i].typesByFamily) && refs.cases.R1.lens.kind === "ABSTENTION" && refs.cases.R4.lens.value.state === "NO_MATCHES");
    ok("references: S3 has every family below 200 and a combination above 200 (premise of the case)", (() => { const v = Object.values(refs.cases.S3.lens.value.perFamily); return v.every((n) => n < 200) && v.reduce((x, y) => x + y, 0) > 200; })());
    ok("references: C1 has no first-occupancy licence in the circle and C2 has some (premise of the pair)", refs.cases.C1.firstOccupancyInCircleAndWindow === 0 && refs.cases.C2.firstOccupancyInCircleAndWindow > 0);
  }
  if (existsSync(F.lock)) {
    const lock = readJson(F.lock);
    ok("lock: every locked file matches its recorded SHA-256", LOCKED.every((rel) => lock.files[rel] === fileSha(rel)), LOCKED.filter((rel) => lock.files[rel] !== fileSha(rel)).join(","));
    ok("lock: v0.3 arm hashes equal the ones locked for the evaluated v0.3", lock.arms.v03.server === v03.files["mcp/madrid-evidence/server.mjs"] && lock.arms.v03.adapter === v03.files["mcp/madrid-evidence/lens-adapter.mjs"]);
    ok("lock: v0.4 arm hashes equal the working tree and differ from v0.3", lock.arms.v04.server === fileSha("mcp/madrid-evidence/server.mjs") && lock.arms.v04.adapter === fileSha("mcp/madrid-evidence/lens-adapter.mjs") && lock.arms.v04.server !== lock.arms.v03.server);
    ok("lock: model, system prompt, schedule and seed match the cases file", lock.model === cases.protocol.model && lock.systemPrompt === cases.protocol.systemPrompt && canon(lock.schedule) === canon(s) && lock.seed === cases.protocol.seed);
    ok("lock: references SHA-256 matches", lock.files["mcp/madrid-evidence/eval/references-v0.4cmp.json"] === fileSha("mcp/madrid-evidence/eval/references-v0.4cmp.json"));
  } else ok("lock not yet written (expected before authorisation)", true, "pending");
  return res;
}

// ---- Lens (wired directly, independent of lens-adapter.mjs) -------------------------------

function lensPins() {
  const pins = ["lens-pin.json", "lens-pin-licences.json"].map((f) => readJson(path.join(HERE, "..", f)));
  if (pins[0].commit !== pins[1].commit) throw new Error("the two Lens pins name different commits");
  return { commit: pins[0].commit, files: pins.flatMap((p) => p.files.map((x) => ({ path: x.path, sha256: x.sha256 }))) };
}
async function openLens() {
  const root = process.env.MADRID_LENS_ROOT;
  if (!root) throw new Error("MADRID_LENS_ROOT must point to a checkout of the pinned Lens commit");
  const pins = lensPins();
  const head = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  if (head !== pins.commit) throw new Error(`Lens checkout is at ${head || "(not a git checkout)"}, pinned ${pins.commit}`);
  for (const f of pins.files) if (sha(readFileSync(path.join(root, ...f.path.split("/")))) !== f.sha256) throw new Error(`${f.path} does not match the pinned Lens commit`);
  const file = (rel) => path.join(root, ...rel.split("/")), json = (rel) => readJson(file(rel));
  const R = createRequire(file("package.json"))("./js/evidence-registry.js");
  const planning = await import(pathToFileURL(file("js/planning-ambito.js")).href);
  const licences = await import(pathToFileURL(file("js/urban-licences.js")).href);
  const artifact = json("data/planning/madrid_urban_licences.json");
  const registry = R.createEvidenceRegistry({
    registry: json("data/source_registry.json"),
    planningIndex: planning.createPlanningIndex({ geometry: json("data/planning/madrid_ambitos.geojson"), state: json("data/planning/madrid_ambito_state.json") }),
    planningModule: { AMBITO_STATE: planning.AMBITO_STATE, AVAILABILITY: planning.AVAILABILITY },
    licenceIndex: licences.createLicenceIndex(artifact),
  });
  const raw = (params) => wire(registry.query("LICENCES_IN_LENS", params));
  const lensQuery = (params) => { const r = raw(params); if (r.value) delete r.value.records; return r; };
  const types = {};
  for (const r of artifact.records) (types[r.family] ??= new Set()).add(r.tipo);
  const typesByFamily = Object.fromEntries(Object.keys(types).sort().map((f) => [f, [...types[f]].sort()]));
  return { raw, lensQuery, typesByFamily, pins };
}

async function cmdReferences() {
  const { raw, lensQuery, typesByFamily, pins } = await openLens();
  const cases = readJson(F.cases);
  const out = { protocolVersion: cases.protocolVersion, lensCommit: pins.commit, derivedFrom: "registry.query('LICENCES_IN_LENS') on the pinned Lens; value.records removed as the MCP does. typesByFamily and firstOccupancyInCircleAndWindow are adjudicator-only truth, never shown to the model.", cases: {} };
  for (const c of cases.cases) {
    const ref = { id: c.id, params: c.params ?? null };
    if (c.params) {
      ref.lens = lensQuery(c.params);
      const full = raw(c.params);
      if (full.value?.records) ref.firstOccupancyInCircleAndWindow = full.value.records.filter((r) => /^Licencia de 1ª ocupación/.test(r.tipo ?? "")).length;
    }
    if (c.derive === "composition") ref.typesByFamily = typesByFamily;
    out.cases[c.id] = ref;
  }
  writeFileSync(F.references, JSON.stringify(out, null, 1) + "\n");
  console.log(`references-v0.4cmp.json: ${cases.cases.length} cases derived from Lens ${pins.commit.slice(0, 7)}`);
}

// ---- lock ----------------------------------------------------------------------------------

const cliVersion = () => spawnSync("claude", ["--version"], { encoding: "utf8" }).stdout.trim();
const gitShow = (commit, rel) => { const r = spawnSync("git", ["-C", REPO, "show", `${commit}:${rel}`], { encoding: "buffer" }); if (r.status !== 0) throw new Error(`git show ${commit}:${rel} failed`); return r.stdout; };

async function cmdLock(flag) {
  if (existsSync(F.lock) && !flag("force")) throw new Error("protocol-lock-v0.4cmp.json exists; refusing to overwrite without --force (a re-lock after a run invalidates that run)");
  const cases = readJson(F.cases), v03 = readJson(F.v03lock);
  const { pins } = await openLens();
  const arms = { v03: { commit: cases.arms.v03.commit, server: sha(gitShow(cases.arms.v03.commit, "mcp/madrid-evidence/server.mjs")), adapter: sha(gitShow(cases.arms.v03.commit, "mcp/madrid-evidence/lens-adapter.mjs")) },
    v04: { commit: cases.arms.v04.commit, server: fileSha("mcp/madrid-evidence/server.mjs"), adapter: fileSha("mcp/madrid-evidence/lens-adapter.mjs") } };
  if (arms.v03.server !== v03.files["mcp/madrid-evidence/server.mjs"] || arms.v03.adapter !== v03.files["mcp/madrid-evidence/lens-adapter.mjs"]) throw new Error("the v0.3 arm tree does not match the hashes locked in protocol-lock-v0.3.json");
  if (arms.v04.server !== sha(gitShow(cases.arms.v04.commit, "mcp/madrid-evidence/server.mjs")) || arms.v04.adapter !== sha(gitShow(cases.arms.v04.commit, "mcp/madrid-evidence/lens-adapter.mjs"))) throw new Error("the working-tree v0.4 server/adapter differ from the v0.4 commit");
  const lock = {
    protocolVersion: cases.protocolVersion, status: "LOCKED BEFORE THE RUN", lockedAt: new Date().toISOString(), seed: cases.protocol.seed,
    lens: { commit: pins.commit, files: pins.files }, arms, files: Object.fromEntries(LOCKED.map((rel) => [rel, fileSha(rel)])),
    model: cases.protocol.model, systemPrompt: cases.protocol.systemPrompt, maxTurns: cases.protocol.maxTurns, claudeCli: cliVersion(), node: process.version,
    mcpSdk: readJson(path.join(REPO, "package.json")).dependencies["@modelcontextprotocol/sdk"], schedule: schedule(cases.cases.map((c) => c.id), cases.protocol.seed, cases.protocol.repetitions),
    howToRepeat: "export MADRID_LENS_ROOT=<Lens at the commit above>; node eval-v04cmp.mjs check; node eval-v04cmp.mjs preflight; node eval-v04cmp.mjs run",
  };
  if (lock.claudeCli !== v03.claudeCli || lock.node !== v03.node || lock.mcpSdk !== v03.mcpSdk) throw new Error(`CLI/Node/SDK differ from the v0.3 lock (${lock.claudeCli} / ${lock.node} / ${lock.mcpSdk}); a different environment is a different experiment`);
  writeFileSync(F.lock, JSON.stringify(lock, null, 2) + "\n");
  console.log(`locked: ${lock.schedule.length} runs, model ${lock.model}, ${lock.claudeCli}, Lens ${pins.commit.slice(0, 7)}, ${LOCKED.length} files hashed`);
}

function verifyLock() {
  if (!existsSync(F.lock)) throw new Error("no protocol-lock-v0.4cmp.json: run `lock` first");
  const lock = readJson(F.lock), bad = LOCKED.filter((rel) => lock.files[rel] !== fileSha(rel));
  for (const [k, v] of Object.entries({ claudeCli: cliVersion(), node: process.version })) if (lock[k] !== v) bad.push(`${k} (locked ${lock[k]} / now ${v})`);
  if (bad.length) throw new Error(`lock mismatch: ${bad.join("; ")}`);
  return { lock, lockSha256: sha(readFileSync(F.lock)) };
}

// ---- arms ----------------------------------------------------------------------------------

function armServer(arm, lock, cache) {
  if (cache[arm]) return cache[arm];
  if (arm === "v04") return (cache[arm] = path.join(REPO, "mcp", "madrid-evidence", "server.mjs"));
  const dir = mkdtempSync(path.join(tmpdir(), "madrid-v03-arm-"));
  const r = spawnSync("sh", ["-c", `git -C "${REPO}" archive ${lock.arms.v03.commit} mcp/madrid-evidence package.json | tar -x -C "${dir}"`]);
  if (r.status !== 0) throw new Error("could not export the v0.3 tree");
  symlinkSync(path.join(REPO, "node_modules"), path.join(dir, "node_modules"));
  const server = path.join(dir, "mcp", "madrid-evidence", "server.mjs");
  if (sha(readFileSync(server)) !== lock.arms.v03.server || sha(readFileSync(path.join(dir, "mcp", "madrid-evidence", "lens-adapter.mjs"))) !== lock.arms.v03.adapter) throw new Error("exported v0.3 tree differs from the evaluated v0.3");
  return (cache[arm] = server);
}
const mcpConfig = (server) => {
  const f = path.join(mkdtempSync(path.join(tmpdir(), "madrid-cmp-cfg-")), "mcp.json");
  writeFileSync(f, JSON.stringify({ mcpServers: { "madrid-evidence": { command: process.execPath, args: [server], env: { MADRID_LENS_ROOT: path.resolve(process.env.MADRID_LENS_ROOT) } } } }));
  return f;
};

async function cmdPreflight() {
  const { lock } = verifyLock();
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const refs = readJson(F.references), cache = {}, res = [];
  for (const arm of ["v03", "v04"]) {
    const client = new Client({ name: "v04cmp-preflight", version: "1" }, { capabilities: {} });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [armServer(arm, lock, cache)], env: { ...process.env, MADRID_LENS_ROOT: path.resolve(process.env.MADRID_LENS_ROOT) } }));
    const tools = (await client.listTools()).tools, t = tools.find((x) => x.name === "licences_in_lens");
    const call = await client.callTool({ name: "licences_in_lens", arguments: { lon: -3.7038, lat: 40.4168, radiusM: 500 } });
    const has = Object.hasOwn(call.structuredContent ?? {}, "registerComposition");
    res.push([`${arm}: 4 tools exposed`, tools.length === 4 && EXPECTED_TOOLS_V03.every((n) => tools.some((x) => x.name === n))]);
    res.push([`${arm}: no-total sentence ${arm === "v04" ? "present" : "absent"} in the description`, t.description.includes(NEW_SENTENCE) === (arm === "v04")]);
    res.push([`${arm}: registerComposition ${arm === "v04" ? "present" : "absent"} in the payload`, has === (arm === "v04")]);
    if (arm === "v04") res.push(["v04: registerComposition equals the artifact's types", canon(call.structuredContent.registerComposition.typesByFamily) === canon(refs.cases.T1.typesByFamily)]);
    await client.close();
  }
  for (const [n, p] of res) console.log(`${p ? "PASS" : "FAIL"} ${n}`);
  if (res.some(([, p]) => !p)) throw new Error("preflight failed: do not run");
  console.log("preflight ok: the treatment is delivered as specified");
}

// ---- run -----------------------------------------------------------------------------------

const claudeArgs = (lock, mcp, prompt) => ["-p", "--model", lock.model, "--system-prompt", lock.systemPrompt, "--strict-mcp-config", "--setting-sources", "project", "--disable-slash-commands", "--no-session-persistence",
  "--tools", "", "--permission-prompts", "none", "--max-turns", String(lock.maxTurns), "--output-format", "stream-json", "--verbose", "--mcp-config", mcp, `--allowedTools=${TOOL_PREFIX}*`, "--", prompt];
const attemptOnce = (args, timeoutMs) => new Promise((resolve) => {
  const env = { ...process.env }; delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;
  const child = spawn("claude", args, { cwd: mkdtempSync(path.join(tmpdir(), "madrid-cmp-")), env, stdio: ["ignore", "pipe", "pipe"] });
  let buf = "", err = "";
  child.stdout.on("data", (d) => (buf += d)); child.stderr.on("data", (d) => (err += d));
  const timer = setTimeout(() => child.kill(), timeoutMs);
  child.on("close", (code) => { clearTimeout(timer); resolve({ stdout: buf + (code ? `\n{"type":"harness","exit":${code}}\n` : ""), stderr: err }); });
});

async function cmdRun(opt, flag) {
  const cases = readJson(F.cases), byId = Object.fromEntries(cases.cases.map((c) => [c.id, c]));
  const plan = flag("dry-run") ? schedule(cases.cases.map((c) => c.id), cases.protocol.seed, cases.protocol.repetitions) : readJson(F.lock).schedule;
  if (flag("dry-run")) { for (const r of plan) console.log(`${r.key}  (pair ${r.pair})`); console.log(`DRY RUN: ${plan.length} runs, nothing executed`); return; }
  const { lock, lockSha256 } = verifyLock();
  if (!checkAll().every((r) => r.pass)) throw new Error("check fails: refusing to run");
  await cmdPreflight(); // deterministic MCP tools only; throws (nothing runs) if the treatment is not delivered as specified
  const { lensQuery, typesByFamily } = await openLens(), cache = {};
  const out = path.resolve(opt("out", path.join(F.results, "runs")));
  mkdirSync(out, { recursive: true });
  const logFile = path.join(path.dirname(out), "run-log.json");
  const log = existsSync(logFile) ? readJson(logFile) : { lockSha256, startedAt: new Date().toISOString(), runs: {} };
  if (log.lockSha256 !== lockSha256) throw new Error("this results directory was started under a different lock");
  log.preflight = "passed";
  const stopAt = cases.decisionRules.thresholds.pairsPlanned - cases.decisionRules.thresholds.minValidPairs + 1;
  const infraPairs = () => new Set(Object.entries(log.runs).filter(([, v]) => v.status === "INFRA_FAILURE").map(([k]) => plan.find((r) => r.key === k).pair));
  for (const r of plan) {
    const rawFile = path.join(out, `${r.key}.jsonl`);
    if (existsSync(rawFile) && log.runs[r.key] && log.runs[r.key].status !== "INFRA_FAILURE") { console.log(`skip ${r.key} (exists)`); continue; }
    verifyLock();
    const mcp = mcpConfig(armServer(r.arm, lock, cache)), prompt = byId[r.case].prompt;
    const res = await retryOnInfraFailure((n) => attemptOnce(claudeArgs(lock, mcp, prompt), cases.protocol.timeoutMs), { promptText: prompt, expectedTools: EXPECTED_TOOLS_V03, onFailure: (n, v) => console.log(`INFRA_FAILURE ${r.key} attempt ${n}: ${v.reason}`) });
    writeFileSync(rawFile, res.stdout);
    if (res.stderr.trim()) writeFileSync(path.join(out, `${r.key}.stderr.txt`), res.stderr.slice(0, 20000));
    const faults = res.verdict.status === "INFRA_FAILURE" ? [] : systemFaults(res.stdout, r.arm, { lensQuery, composition: typesByFamily });
    log.runs[r.key] = { status: res.verdict.status, attempts: res.attempts, systemFaults: faults, rawSha256: sha(res.stdout) };
    writeFileSync(logFile, JSON.stringify(log, null, 2) + "\n");
    console.log(`done ${r.key} [${res.verdict.status}] attempts=${res.attempts}${faults.length ? ` SYSTEM_FAULT: ${faults.join(" | ")}` : ""}`);
    if (faults.length) { process.exitCode = 3; console.log("STOP: system fault, the comparison is invalid until fixed"); break; }
    if (infraPairs().size >= stopAt) { process.exitCode = 3; console.log(`STOP: ${stopAt} pairs excluded by infrastructure failures; 18 valid pairs can no longer be reached`); break; }
  }
  log.finishedAt = new Date().toISOString();
  writeFileSync(logFile, JSON.stringify(log, null, 2) + "\n");
}

// ---- blind packets and score ----------------------------------------------------------------

// Tool use is a covariate, never a proxy for correctness. Pure.
export function toolUseOf(raw) {
  const calls = parseTranscript(raw).calls, lic = calls.filter((c) => c.name === `${TOOL_PREFIX}licences_in_lens`);
  const ok = (c) => !c.isError && typeof c.resultText === "string";
  return { calls: calls.length, licencesCalls: lic.length, otherCalls: calls.length - lic.length, licencesResultsOk: lic.filter(ok).length, registerCompositionInResult: lic.filter(ok).some((c) => c.resultText.includes('"registerComposition"')) };
}

function cmdBlind() {
  const cases = readJson(F.cases), refs = readJson(F.references).cases, lock = readJson(F.lock), byId = Object.fromEntries(cases.cases.map((c) => [c.id, c]));
  const runs = path.join(F.results, "runs"), ids = blindIds(lock.schedule.map((r) => r.key), lock.seed), key = {}, s1 = [], s2 = [];
  for (const r of lock.schedule) {
    const f = path.join(runs, `${r.key}.jsonl`), base = { run: r.key, case: r.case, rep: r.rep, arm: r.arm, pair: r.pair };
    if (!existsSync(f)) { key[ids[r.key]] = { ...base, status: "NOT_RUN" }; continue; }
    const raw = readFileSync(f, "utf8"), t = parseTranscript(raw), v = verifyTranscript(raw, { promptText: byId[r.case].prompt, expectedTools: EXPECTED_TOOLS_V03 });
    if (v.status === "INFRA_FAILURE") { key[ids[r.key]] = { ...base, status: "INFRA_FAILURE", reason: v.reason }; continue; }
    const toolUse = toolUseOf(raw);
    key[ids[r.key]] = { ...base, status: "VALID", toolUse };
    s1.push({ blindId: ids[r.key], caseId: r.case, prompt: byId[r.case].prompt, rubric: byId[r.case].rubric, reference: refs[r.case], answer: t.answer });
    s2.push({ blindId: ids[r.key], supportHints: { licencesResultsOk: toolUse.licencesResultsOk, registerCompositionInResult: toolUse.registerCompositionInResult }, toolCalls: t.calls.map((c) => ({ input: c.input, isError: c.isError, result: c.resultText })) });
  }
  const byBlind = (a, b) => a.blindId.localeCompare(b.blindId);
  mkdirSync(F.results, { recursive: true });
  writeFileSync(path.join(F.results, "blind-stage1.jsonl"), s1.sort(byBlind).map((x) => JSON.stringify(x)).join("\n") + "\n");
  writeFileSync(path.join(F.results, "blind-stage2.jsonl"), s2.sort(byBlind).map((x) => JSON.stringify(x)).join("\n") + "\n");
  writeFileSync(path.join(F.results, "blind-key.json"), JSON.stringify(key, null, 1) + "\n");
  console.log(`${s1.length} blind items written (${Object.values(key).filter((k) => k.status !== "VALID").length} runs without a packet: infrastructure failure or not run). Give the reader blind-stage1.jsonl first, then blind-stage2.jsonl; never blind-key.json.`);
}

const effective = (e) => { const x = e.user?.reviewed ? e.user : e; return { verdict: x.verdict, errors: x.errors ?? [], unsupported: !!x.unsupported, claim: x.claim ?? null }; };
const CLAIMS = ["SUPPORTED", "TRUE_UNSUPPORTED", "FALSE", "NONE"];

// Problems that make an adjudication file unusable. Empty list = well formed. Pure.
export function validateAdjudication(key, adj, cases) {
  const bad = [], claimCases = cases.adjudication.claimCases;
  if (!adj.reader || typeof adj.readerIsHuman !== "boolean") bad.push("adjudication needs `reader` and a boolean `readerIsHuman`");
  for (const [bid, e] of Object.entries(adj.entries ?? {})) {
    const k = key[bid];
    if (!k) { bad.push(`${bid}: not in the key`); continue; }
    if (k.status !== "VALID") { bad.push(`${bid}: run is ${k.status}, nothing to adjudicate`); continue; }
    const x = effective(e);
    if (!["pass", "fail"].includes(x.verdict)) bad.push(`${bid}: verdict must be pass or fail`);
    if (!x.errors.every((c) => /^E([1-9]|10)$/.test(c))) bad.push(`${bid}: invalid error class`);
    if (claimCases.includes(k.case)) {
      if (!CLAIMS.includes(x.claim)) bad.push(`${bid} (${k.case}): claim must be one of ${CLAIMS.join("|")}`);
      else if (x.claim === "FALSE" && !x.errors.some((c) => c === "E1" || c === "E5")) bad.push(`${bid}: a FALSE claim needs E1 or E5`);
      else if (x.claim === "TRUE_UNSUPPORTED" && !x.unsupported) bad.push(`${bid}: TRUE_UNSUPPORTED needs unsupported=true`);
      else if (x.claim === "SUPPORTED" && x.unsupported) bad.push(`${bid}: SUPPORTED conflicts with unsupported=true`);
    }
  }
  return bad;
}

// Run, pair and comparison states. Individual records are never dropped: `runs` lists every scheduled run.
export function summarize(key, adjudication, critical, rules) {
  const entries = adjudication.entries ?? {}, local = rules.localAttributionCases;
  const rows = Object.entries(key).map(([bid, k]) => ({ bid, ...k, adj: entries[bid] ?? null }));
  const eff = (r) => effective(r.adj), isCrit = (r) => !!r.adj && eff(r).errors.some((e) => critical.includes(e));
  const runState = (r) => (r.status === "INFRA_FAILURE" ? "INFRA_FAILURE" : r.status === "NOT_RUN" ? "NOT_RUN" : !r.adj ? "VALID_UNADJUDICATED" : eff(r).errors.length || eff(r).verdict === "fail" ? "ADJUDICATED_ERROR" : "ADJUDICATED_OK");
  const pairs = {};
  for (const r of rows) (pairs[r.pair] ??= {})[r.arm] = r;
  const pairState = (p) => { const st = [p.v03, p.v04].map(runState); return st.includes("INFRA_FAILURE") ? "EXCLUDED" : st.some((x) => x === "NOT_RUN" || x === "VALID_UNADJUDICATED") ? "PENDING" : "VALID"; };
  const pstate = Object.fromEntries(Object.entries(pairs).map(([id, p]) => [id, pairState(p)]));
  const valid = Object.entries(pairs).filter(([id]) => pstate[id] === "VALID").map(([, p]) => p);
  const discordantPairs = valid.filter((p) => isCrit(p.v03) !== isCrit(p.v04)).map((p) => p.v03.pair);
  const pending = rows.filter((r) => r.adj && !r.adj.user?.reviewed && (isCrit(r) || r.adj.doubtful || discordantPairs.includes(r.pair))).map((r) => r.bid);
  const arm = (a) => {
    const rs = valid.map((p) => p[a]), has = (r, cls) => eff(r).errors.some((e) => cls.includes(e));
    return { n: rs.length, critical: rs.filter(isCrit).length, criticalCases: [...new Set(rs.filter(isCrit).map((r) => r.case))], unsupportedTrials: rs.filter((r) => eff(r).unsupported).length,
      severe: [...new Set(rs.filter((r) => has(r, ["E1", "E2", "E9"])).map((r) => r.case))],
      regFail: [...new Set(rs.filter((r) => ["R1", "R4"].includes(r.case) && (eff(r).verdict === "fail" || eff(r).errors.length)).map((r) => r.case))],
      localUnsupported: rs.filter((r) => local.includes(r.case) && (eff(r).claim === "TRUE_UNSUPPORTED" || eff(r).unsupported)).length,
      toolUse: { runsWithLicencesCall: rs.filter((r) => r.toolUse?.licencesCalls > 0).length, runsWithRegisterCompositionSeen: rs.filter((r) => r.toolUse?.registerCompositionInResult).length } };
  };
  const caseIds = [...new Set(rows.map((r) => r.case))];
  const count = (xs) => xs.reduce((o, x) => ((o[x] = (o[x] ?? 0) + 1), o), {});
  return { v03: arm("v03"), v04: arm("v04"), validPairs: valid.length, uncoveredCases: caseIds.filter((c) => !valid.some((p) => p.v03.case === c)),
    pairStates: count(Object.values(pstate)), runStates: count(rows.map(runState)), discordantPairs, pending, unadjudicated: rows.filter((r) => runState(r) === "VALID_UNADJUDICATED").map((r) => r.bid), notRun: rows.filter((r) => r.status === "NOT_RUN").map((r) => r.bid),
    runs: rows.map((r) => ({ bid: r.bid, run: r.run, case: r.case, rep: r.rep, arm: r.arm, pair: r.pair, state: runState(r), pairState: pstate[r.pair], toolUse: r.toolUse ?? null, adjudication: r.adj ? { ...eff(r), doubtful: !!r.adj.doubtful, userReviewed: !!r.adj.user?.reviewed } : null })),
    byCase: Object.fromEntries(caseIds.map((c) => [c, Object.fromEntries(["v03", "v04"].map((a) => [a, valid.filter((p) => p[a].case === c).map((p) => (isCrit(p[a]) ? "CRIT" : eff(p[a]).verdict === "fail" ? "fail" : eff(p[a]).unsupported ? "unsup" : "ok"))]))])) };
}

function cmdScore(opt) {
  const cases = readJson(F.cases), key = readJson(path.join(F.results, "blind-key.json")), logFile = path.join(F.results, "run-log.json");
  const adjFile = opt("adjudication", path.join(F.results, "adjudication.json"));
  if (!existsSync(adjFile)) throw new Error(`no adjudication file at ${adjFile}`);
  const adj = readJson(adjFile), problems = validateAdjudication(key, adj, cases);
  if (problems.length) throw new Error(`adjudication file is not well formed:\n- ${problems.join("\n- ")}`);
  const s = summarize(key, adj, cases.criticalClasses, cases.decisionRules), log = existsSync(logFile) ? readJson(logFile) : { runs: {} };
  const technical = [...(log.preflight === "passed" ? [] : ["preflight is not recorded as passed in the run log"]), ...Object.entries(log.runs).flatMap(([k, v]) => v.systemFaults.map((f) => `${k}: ${f}`))];
  const d = decide(s, cases.decisionRules, technical), provisional = s.pending.length > 0 || s.unadjudicated.length > 0 || s.notRun.length > 0;
  const comparison = d.conclusive ? { criticalTrials: { v03: wilson(s.v03.critical, s.v03.n), v04: wilson(s.v04.critical, s.v04.n) }, summary: { v03: s.v03, v04: s.v04 }, byCase: s.byCase, discordantPairs: s.discordantPairs, improvedCases: d.improvedCases, worsenedCases: d.worsenedCases, note: "descriptive observations, not a significance or improvement claim" } : null;
  const out = { disclosure: cases.adjudication.disclosure, reader: adj.reader, readerIsHuman: adj.readerIsHuman, provisional, decision: { verdict: d.verdict, kind: d.kind ?? null, reasons: d.reasons },
    states: { pairs: s.pairStates, runs: s.runStates, validPairs: s.validPairs, uncoveredCases: s.uncoveredCases }, pendingUserReview: s.pending, unadjudicated: s.unadjudicated, notRun: s.notRun, comparison, runs: s.runs };
  writeFileSync(path.join(F.results, "results.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(`${provisional ? "PROVISIONAL (pending user review, unadjudicated or not-run items) " : ""}verdict: ${d.verdict}${d.kind ? ` (${d.kind})` : ""}\n${d.reasons.join("\n")}`);
  console.log(`pairs ${JSON.stringify(s.pairStates)}; runs ${JSON.stringify(s.runStates)}; valid pairs ${s.validPairs}/${cases.decisionRules.thresholds.pairsPlanned}`);
  if (comparison) console.log(`critical trials v0.3 ${s.v03.critical}/${s.v03.n}  v0.4 ${s.v04.critical}/${s.v04.n}; local unsupported v0.4 ${s.v04.localUnsupported}; improved ${d.improvedCases.join(",") || "-"}; worsened ${d.worsenedCases.join(",") || "-"} (descriptive)`);
  else console.log("No comparative result is reported as conclusive; every individual record is in results.json (runs).");
  console.log(cases.adjudication.disclosure);
}

// ---- main ----------------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (name, fallback) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : fallback; };
  const flag = (name) => rest.includes(`--${name}`);
  const commands = {
    check: async () => { const r = checkAll(); for (const x of r) console.log(`${x.pass ? "PASS" : "FAIL"} ${x.name}${x.pass || !x.detail ? "" : ` [${x.detail}]`}`); if (r.some((x) => !x.pass)) process.exitCode = 1; else console.log(`check ok: ${r.length} checks`); },
    plan: async () => { const c = readJson(F.cases); for (const r of schedule(c.cases.map((x) => x.id), c.protocol.seed, c.protocol.repetitions)) console.log(`${String(r.seq).padStart(2)} pair ${String(r.pair).padStart(2)} ${r.case} rep ${r.rep} ${r.arm}`); },
    references: cmdReferences, lock: () => cmdLock(flag), preflight: cmdPreflight, run: () => cmdRun(opt, flag), blind: async () => cmdBlind(), score: async () => cmdScore(opt),
  };
  if (!commands[cmd]) { console.error(`usage: eval-v04cmp.mjs <${Object.keys(commands).join("|")}> [options]`); process.exit(2); }
  try { await commands[cmd](); } catch (e) { console.error(`eval-v04cmp: ${e.message}`); process.exit(1); }
}
