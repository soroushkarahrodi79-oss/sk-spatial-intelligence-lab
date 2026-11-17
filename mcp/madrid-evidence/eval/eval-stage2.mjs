#!/usr/bin/env node
// Madrid Evidence MCP Stage 2 (single arm, unchanged v0.4 MCP). See cases-stage2.json. Imports, and does not modify, eval-v04cmp.mjs.
//   check | plan | references | lock | preflight | run [--dry-run] | blind | score
// Only `run` calls a model. Run and adjudication are separate commands; `blind` never writes model names.
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { wilson } from "../../../geoimpact-copilot/evaluation/metrics.mjs";
import { EXPECTED_TOOLS_V03, TOOL_PREFIX, parseTranscript, verifyTranscript } from "./verify-transcript.mjs";
import { NEW_SENTENCE, blindIds, runWithRecords, systemFaults, toolUseOf, validateAdjudication } from "./eval-v04cmp.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.resolve(HERE, "..", "..", "..");
export const F = { cases: path.join(HERE, "cases-stage2.json"), references: path.join(HERE, "references-stage2.json"), lock: path.join(HERE, "protocol-lock-stage2.json"), v04lock: path.join(HERE, "protocol-lock-v0.4cmp.json"), results: path.join(HERE, "results-stage2") };
const LOCKED = ["mcp/madrid-evidence/eval/cases-stage2.json", "mcp/madrid-evidence/eval/references-stage2.json", "mcp/madrid-evidence/eval/eval-stage2.mjs", "mcp/madrid-evidence/eval/eval-v04cmp.mjs",
  "mcp/madrid-evidence/eval/verify-transcript.mjs", "mcp/madrid-evidence/eval/score.mjs", "geoimpact-copilot/evaluation/metrics.mjs", "mcp/madrid-evidence/server.mjs", "mcp/madrid-evidence/lens-adapter.mjs",
  "mcp/madrid-evidence/lens-pin.json", "mcp/madrid-evidence/lens-pin-licences.json", "package-lock.json"];
const sha = (b) => createHash("sha256").update(b).digest("hex"), readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const fileSha = (rel) => sha(readFileSync(path.join(REPO, ...rel.split("/")))), wire = (v) => JSON.parse(JSON.stringify(v));
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function schedule(ids, seed, reps) {
  const rnd = mulberry32(parseInt(sha(seed).slice(0, 8), 16));
  const a = ids.flatMap((c) => Array.from({ length: reps }, (_, k) => ({ case: c, rep: k + 1 })));
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.map((p, i) => ({ seq: i + 1, ...p, key: `${String(i + 1).padStart(2, "0")}-${p.case}-r${p.rep}` }));
}

export function decide(s, rules, technical = []) {
  if (technical.length) return { verdict: "HOLD", kind: "technical", reasons: technical };
  if (s.valid < rules.thresholds.minValidRuns || s.uncovered.length) return { verdict: "INCONCLUSIVE", reasons: [`valid runs ${s.valid}/${rules.thresholds.runsPlanned}`, ...(s.uncovered.length ? [`no valid run for ${s.uncovered.join(",")}`] : [])] };
  const reasons = [];
  if (s.severe.length) return { verdict: "HOLD", kind: "outcome", reasons: [`E1/E2/E9 in valid runs of: ${s.severe.join(",")}`] };
  if (s.criticalRuns) reasons.push(`critical errors: ${s.criticalRuns} run(s), cases ${s.criticalCases.join(",")}`);
  if (s.unsupportedRuns) reasons.push(`unsupported local claims: ${s.unsupportedRuns} run(s)`);
  return { verdict: reasons.length ? "MODIFY" : "GO", reasons };
}

const eff = (e) => { const x = e.user?.reviewed ? e.user : e; return { verdict: x.verdict, errors: x.errors ?? [], unsupported: !!x.unsupported, claim: x.claim ?? null }; };
export function summarize(key, adj, critical) {
  const rows = Object.entries(key).map(([bid, k]) => ({ bid, ...k, a: adj.entries?.[bid] ? eff(adj.entries[bid]) : null, raw: adj.entries?.[bid] ?? null }));
  const valid = rows.filter((r) => r.status === "VALID"), judged = valid.filter((r) => r.a);
  const crit = judged.filter((r) => r.a.errors.some((e) => critical.includes(e)));
  const uns = judged.filter((r) => r.a.unsupported || r.a.claim === "TRUE_UNSUPPORTED");
  const pending = rows.filter((r) => r.raw && !r.raw.user?.reviewed && (r.a.errors.some((e) => critical.includes(e)) || r.raw.doubtful)).map((r) => r.bid);
  const ids = [...new Set(rows.map((r) => r.case))];
  return { runs: rows.length, valid: valid.length, judged: judged.length, unadjudicated: valid.filter((r) => !r.a).map((r) => r.bid), infra: rows.filter((r) => r.status === "INFRA_FAILURE").map((r) => r.bid), notRun: rows.filter((r) => r.status === "NOT_RUN").map((r) => r.bid),
    criticalRuns: crit.length, criticalCases: [...new Set(crit.map((r) => r.case))], unsupportedRuns: uns.length, unsupportedCases: [...new Set(uns.map((r) => r.case))],
    severe: [...new Set(judged.filter((r) => r.a.errors.some((e) => ["E1", "E2", "E9"].includes(e))).map((r) => r.case))], uncovered: ids.filter((c) => !valid.some((r) => r.case === c)), pending,
    byCase: Object.fromEntries(ids.map((c) => [c, valid.filter((r) => r.case === c).map((r) => (!r.a ? "unjudged" : r.a.errors.some((e) => critical.includes(e)) ? "CRIT" : r.a.unsupported || r.a.claim === "TRUE_UNSUPPORTED" ? "unsup" : r.a.verdict === "fail" ? "fail" : "ok"))])) };
}

async function openLens() {
  const root = process.env.MADRID_LENS_ROOT; if (!root) throw new Error("MADRID_LENS_ROOT must point to a checkout of the pinned Lens commit");
  const pins = ["lens-pin.json", "lens-pin-licences.json"].map((f) => readJson(path.join(HERE, "..", f)));
  const head = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  if (head !== pins[0].commit) throw new Error(`Lens checkout at ${head}, pinned ${pins[0].commit}`);
  for (const f of pins.flatMap((p) => p.files)) if (sha(readFileSync(path.join(root, ...f.path.split("/")))) !== f.sha256) throw new Error(`${f.path} does not match the pin`);
  const file = (r) => path.join(root, ...r.split("/")), json = (r) => readJson(file(r)), R = createRequire(file("package.json"))("./js/evidence-registry.js");
  const planning = await import(pathToFileURL(file("js/planning-ambito.js")).href), licences = await import(pathToFileURL(file("js/urban-licences.js")).href), artifact = json("data/planning/madrid_urban_licences.json");
  const registry = R.createEvidenceRegistry({ registry: json("data/source_registry.json"), planningIndex: planning.createPlanningIndex({ geometry: json("data/planning/madrid_ambitos.geojson"), state: json("data/planning/madrid_ambito_state.json") }), planningModule: { AMBITO_STATE: planning.AMBITO_STATE, AVAILABILITY: planning.AVAILABILITY }, licenceIndex: licences.createLicenceIndex(artifact) });
  const raw = (p) => wire(registry.query("LICENCES_IN_LENS", p)), lensQuery = (p) => { const r = raw(p); if (r.value) delete r.value.records; return r; };
  const types = {}; for (const r of artifact.records) (types[r.family] ??= new Set()).add(r.tipo);
  return { raw, lensQuery, typesByFamily: Object.fromEntries(Object.keys(types).sort().map((f) => [f, [...types[f]].sort()])), commit: pins[0].commit };
}

async function cmdReferences() {
  const { raw, lensQuery, commit } = await openLens(), cases = readJson(F.cases), out = { protocolVersion: cases.protocolVersion, lensCommit: commit, note: "Lens output verbatim (records removed). firstOccupancyInCircleAndWindow is adjudicator-only truth, never shown to the model.", cases: {} };
  for (const c of cases.cases) { const full = raw(c.params); out.cases[c.id] = { id: c.id, params: c.params, lens: lensQuery(c.params), firstOccupancyInCircleAndWindow: (full.value?.records ?? []).filter((r) => /^Licencia de 1ª ocupación/.test(r.tipo ?? "")).length }; }
  writeFileSync(F.references, JSON.stringify(out, null, 1) + "\n"); console.log(`references-stage2.json: ${cases.cases.length} cases from Lens ${commit.slice(0, 7)}`);
}

export function checkAll() {
  const res = [], ok = (name, pass, detail = "") => res.push({ name, pass: !!pass, detail });
  const cs = readJson(F.cases), c = cs.cases, ids = c.map((x) => x.id), v04c = readJson(path.join(HERE, "cases-v0.4cmp.json")), v03c = readJson(path.join(HERE, "cases-v0.3.json")), v01 = readJson(path.join(HERE, "cases.json")), lockCmp = readJson(F.v04lock);
  ok("six cases, unique ids", ids.length === 6 && new Set(ids).size === 6, ids.join(","));
  const old = new Set([...v04c.cases, ...v03c.cases, ...v01.cases].map((x) => x.prompt ?? ""));
  ok("prompts are not reused from v0.1, v0.3 or v0.4cmp", c.every((x) => x.prompt.length > 30 && !old.has(x.prompt)));
  const oldSites = new Set([...v04c.cases, ...v03c.cases].filter((x) => x.params).map((x) => `${x.params.lon},${x.params.lat}`));
  ok("no site (lon,lat) is shared with v0.3 or v0.4cmp", c.every((x) => !oldSites.has(`${x.params.lon},${x.params.lat}`)));
  ok("each case has critical rules with critical classes and an E8 requirement", c.every((x) => x.rubric.critical?.length && x.rubric.critical.every((r) => cs.criticalClasses.includes(r.class)) && x.rubric.required?.some((r) => r.class === "E8")));
  ok("no expected number typed in the rubrics", !c.some((x) => /\d/.test(JSON.stringify(x.rubric).replace(/"class":"E\d+"/g, ""))));
  ok("critical classes equal cases.json", canon(cs.criticalClasses) === canon(v01.criticalClasses));
  ok("model, system prompt and turns equal the v0.4cmp protocol", cs.protocol.model === v04c.protocol.model && cs.protocol.systemPrompt === v04c.protocol.systemPrompt && cs.protocol.maxTurns === v04c.protocol.maxTurns && cs.protocol.timeoutMs === v04c.protocol.timeoutMs && cs.lensCommit === v04c.lensCommit);
  ok("planned runs = 6 x 2 = 12", cs.protocol.runsPlanned === c.length * cs.protocol.repetitions && cs.protocol.runsPlanned === 12);
  const s = schedule(ids, cs.protocol.seed, 2);
  ok("schedule: deterministic, 12 runs, every (case, rep) once", s.length === 12 && canon(s) === canon(schedule(ids, cs.protocol.seed, 2)) && new Set(s.map((r) => `${r.case}|${r.rep}`)).size === 12);
  ok("MCP server and adapter are byte-identical to the v0.4 arm locked in protocol-lock-v0.4cmp.json", fileSha("mcp/madrid-evidence/server.mjs") === lockCmp.arms.v04.server && fileSha("mcp/madrid-evidence/lens-adapter.mjs") === lockCmp.arms.v04.adapter);
  const seal = readJson(path.join(HERE, "seal.json")); ok("v0.1 sealed files unchanged", Object.entries(seal.files).every(([r, h]) => fileSha(r) === h));
  ok("v0.4cmp lock inputs unchanged (cases, references, verifier, scorer)", ["cases-v0.4cmp.json", "references-v0.4cmp.json", "verify-transcript.mjs", "score.mjs"].every((f) => lockCmp.files[`mcp/madrid-evidence/eval/${f}`] === fileSha(`mcp/madrid-evidence/eval/${f}`)));
  if (existsSync(F.references)) {
    const r = readJson(F.references).cases;
    ok("references cover every case, from the pinned Lens", ids.every((i) => r[i]?.lens?.value?.perFamily) && readJson(F.references).lensCommit === cs.lensCommit);
    const pf = Object.values(r.X2.lens.value.perFamily), th = c.find((x) => x.id === "X2").threshold;
    ok("X2 premise: every family below the threshold, the combination above it", pf.every((n) => n < th) && pf.reduce((a, b) => a + b, 0) > th);
    ok("Y2 premise: first-occupancy present in the circle; Y3 premise: none", r.Y2.firstOccupancyInCircleAndWindow > 0 && r.Y3.firstOccupancyInCircleAndWindow === 0);
  }
  if (existsSync(F.lock)) {
    const l = readJson(F.lock);
    ok("lock: every locked file matches", LOCKED.every((rel) => l.files[rel] === fileSha(rel)), LOCKED.filter((rel) => l.files[rel] !== fileSha(rel)).join(","));
    ok("lock: schedule, seed and model match the cases file", canon(l.schedule) === canon(s) && l.seed === cs.protocol.seed && l.model === cs.protocol.model);
    ok("lock: every difference of CLI/Node/SDK against the v0.4cmp lock is declared (constant within Stage 2, not across stages)", ["claudeCli", "node", "mcpSdk"].every((k) => l[k] === lockCmp[k] || l.environmentVsV04cmp?.[k]?.v04cmp === lockCmp[k]));
  } else ok("lock not yet written (expected before authorisation)", true, "pending");
  return res;
}

const cliVersion = () => spawnSync("claude", ["--version"], { encoding: "utf8" }).stdout.trim();
async function cmdLock(flag) {
  if (existsSync(F.lock) && !flag("force")) throw new Error("lock exists; refusing to overwrite");
  const cs = readJson(F.cases), { commit } = await openLens(), c = readJson(F.v04lock);
  const lock = { protocolVersion: cs.protocolVersion, status: "LOCKED BEFORE THE RUN", lockedAt: new Date().toISOString(), seed: cs.protocol.seed, lens: { commit }, arm: { server: fileSha("mcp/madrid-evidence/server.mjs"), adapter: fileSha("mcp/madrid-evidence/lens-adapter.mjs") },
    files: Object.fromEntries(LOCKED.map((r) => [r, fileSha(r)])), model: cs.protocol.model, systemPrompt: cs.protocol.systemPrompt, maxTurns: cs.protocol.maxTurns, claudeCli: cliVersion(), node: process.version,
    mcpSdk: readJson(path.join(REPO, "package.json")).dependencies["@modelcontextprotocol/sdk"], schedule: schedule(cs.cases.map((x) => x.id), cs.protocol.seed, cs.protocol.repetitions),
    howToRepeat: "export MADRID_LENS_ROOT=<Lens at the pinned commit>; node eval-stage2.mjs check; node eval-stage2.mjs preflight; node eval-stage2.mjs run" };
  lock.environmentVsV04cmp = Object.fromEntries(["claudeCli", "node", "mcpSdk"].filter((k) => lock[k] !== c[k]).map((k) => [k, { v04cmp: c[k], stage2: lock[k] }]));
  writeFileSync(F.lock, JSON.stringify(lock, null, 2) + "\n"); console.log(`locked: ${lock.schedule.length} runs, ${lock.model}, ${lock.claudeCli}`);
}
function verifyLock() {
  if (!existsSync(F.lock)) throw new Error("no lock: run `lock` first");
  const l = readJson(F.lock), bad = LOCKED.filter((r) => l.files[r] !== fileSha(r));
  for (const [k, v] of Object.entries({ claudeCli: cliVersion(), node: process.version })) if (l[k] !== v) bad.push(k);
  if (bad.length) throw new Error(`lock mismatch: ${bad.join("; ")}`); return { lock: l, lockSha256: sha(readFileSync(F.lock)) };
}
const server = () => path.join(REPO, "mcp", "madrid-evidence", "server.mjs");
const mcpConfig = () => { const f = path.join(mkdtempSync(path.join(tmpdir(), "madrid-st2-cfg-")), "mcp.json"); writeFileSync(f, JSON.stringify({ mcpServers: { "madrid-evidence": { command: process.execPath, args: [server()], env: { MADRID_LENS_ROOT: path.resolve(process.env.MADRID_LENS_ROOT) } } } })); return f; };

async function cmdPreflight() {
  verifyLock();
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js"), { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const client = new Client({ name: "stage2-preflight", version: "1" }, { capabilities: {} });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server()], env: { ...process.env, MADRID_LENS_ROOT: path.resolve(process.env.MADRID_LENS_ROOT) } }));
  const tools = (await client.listTools()).tools, t = tools.find((x) => x.name === "licences_in_lens"), call = await client.callTool({ name: "licences_in_lens", arguments: { lon: -3.7038, lat: 40.4168, radiusM: 500 } });
  const res = [["4 tools exposed", tools.length === 4 && EXPECTED_TOOLS_V03.every((n) => tools.some((x) => x.name === n))], ["no-total sentence present", t.description.includes(NEW_SENTENCE)], ["registerComposition present", Object.hasOwn(call.structuredContent ?? {}, "registerComposition")]];
  await client.close(); for (const [n, p] of res) console.log(`${p ? "PASS" : "FAIL"} ${n}`); if (res.some(([, p]) => !p)) throw new Error("preflight failed: do not run"); console.log("preflight ok");
}

const claudeArgs = (lock, mcp, prompt) => ["-p", "--model", lock.model, "--system-prompt", lock.systemPrompt, "--strict-mcp-config", "--setting-sources", "project", "--disable-slash-commands", "--no-session-persistence", "--tools", "", "--permission-prompts", "none", "--max-turns", String(lock.maxTurns), "--output-format", "stream-json", "--verbose", "--mcp-config", mcp, `--allowedTools=${TOOL_PREFIX}*`, "--", prompt];
const attemptOnce = (args, timeoutMs) => new Promise((resolve) => {
  const env = { ...process.env }; delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;
  const child = spawn("claude", args, { cwd: mkdtempSync(path.join(tmpdir(), "madrid-st2-")), env, stdio: ["ignore", "pipe", "pipe"] }); let buf = "", err = "";
  child.stdout.on("data", (d) => (buf += d)); child.stderr.on("data", (d) => (err += d)); const timer = setTimeout(() => child.kill(), timeoutMs);
  child.on("close", (code) => { clearTimeout(timer); resolve({ stdout: buf + (code ? `\n{"type":"harness","exit":${code}}\n` : ""), stderr: err }); });
});

async function cmdRun(opt, flag) {
  const cs = readJson(F.cases), byId = Object.fromEntries(cs.cases.map((c) => [c.id, c]));
  if (flag("dry-run")) { for (const r of schedule(cs.cases.map((c) => c.id), cs.protocol.seed, cs.protocol.repetitions)) console.log(r.key); console.log("DRY RUN: nothing executed"); return; }
  const { lock, lockSha256 } = verifyLock(); if (!checkAll().every((r) => r.pass)) throw new Error("check fails: refusing to run"); await cmdPreflight();
  const { lensQuery, typesByFamily } = await openLens(), out = path.resolve(opt("out", path.join(F.results, "runs"))); mkdirSync(out, { recursive: true });
  const logFile = path.join(path.dirname(out), "run-log.json"), log = existsSync(logFile) ? readJson(logFile) : { lockSha256, startedAt: new Date().toISOString(), runs: {} };
  if (log.lockSha256 !== lockSha256) throw new Error("results directory started under a different lock"); log.preflight = "passed";
  const infraRuns = () => Object.values(log.runs).filter((v) => v.status === "INFRA_FAILURE").length;
  for (const r of lock.schedule) {
    const rawFile = path.join(out, `${r.key}.jsonl`); if (existsSync(rawFile) && log.runs[r.key] && log.runs[r.key].status !== "INFRA_FAILURE") { console.log(`skip ${r.key}`); continue; }
    verifyLock(); const prompt = byId[r.case].prompt, mcp = mcpConfig();
    const res = await runWithRecords({ attemptFn: () => attemptOnce(claudeArgs(lock, mcp, prompt), cs.protocol.timeoutMs), key: r.key, out, promptText: prompt, onFailure: (n, v) => console.log(`INFRA_FAILURE ${r.key} attempt ${n}: ${v.reason}`) });
    writeFileSync(rawFile, res.stdout); if (res.stderr.trim()) writeFileSync(path.join(out, `${r.key}.stderr.txt`), res.stderr.slice(0, 20000));
    const faults = res.verdict.status === "INFRA_FAILURE" ? [] : systemFaults(res.stdout, "v04", { lensQuery, composition: typesByFamily });
    log.runs[r.key] = { status: res.verdict.status, attempts: res.attempts, systemFaults: faults, rawSha256: sha(res.stdout) }; writeFileSync(logFile, JSON.stringify(log, null, 2) + "\n");
    console.log(`done ${r.key} [${res.verdict.status}] attempts=${res.attempts}${faults.length ? ` SYSTEM_FAULT: ${faults.join(" | ")}` : ""}`);
    if (faults.length) { process.exitCode = 3; console.log("STOP: system fault"); break; }
    if (infraRuns() > 1) { process.exitCode = 3; console.log("STOP: 2 runs lost to infrastructure; 11 valid runs unreachable"); break; }
  }
  log.finishedAt = new Date().toISOString(); writeFileSync(logFile, JSON.stringify(log, null, 2) + "\n");
}

function cmdBlind() {
  const cs = readJson(F.cases), refs = readJson(F.references).cases, lock = readJson(F.lock), byId = Object.fromEntries(cs.cases.map((c) => [c.id, c])), runs = path.join(F.results, "runs"), ids = blindIds(lock.schedule.map((r) => r.key), lock.seed), key = {}, s1 = [], s2 = [];
  for (const r of lock.schedule) {
    const f = path.join(runs, `${r.key}.jsonl`), base = { run: r.key, case: r.case, rep: r.rep }; if (!existsSync(f)) { key[ids[r.key]] = { ...base, status: "NOT_RUN" }; continue; }
    const raw = readFileSync(f, "utf8"), t = parseTranscript(raw), v = verifyTranscript(raw, { promptText: byId[r.case].prompt, expectedTools: EXPECTED_TOOLS_V03 });
    if (v.status === "INFRA_FAILURE") { key[ids[r.key]] = { ...base, status: "INFRA_FAILURE", reason: v.reason }; continue; }
    const tu = toolUseOf(raw); key[ids[r.key]] = { ...base, status: "VALID", toolUse: tu };
    s1.push({ blindId: ids[r.key], caseId: r.case, prompt: byId[r.case].prompt, rubric: byId[r.case].rubric, reference: refs[r.case], answer: t.answer });
    s2.push({ blindId: ids[r.key], toolCalls: t.calls.map((c) => ({ input: c.input, isError: c.isError, result: c.resultText })) });
  }
  const by = (a, b) => a.blindId.localeCompare(b.blindId); mkdirSync(F.results, { recursive: true });
  writeFileSync(path.join(F.results, "blind-stage1.jsonl"), s1.sort(by).map((x) => JSON.stringify(x)).join("\n") + "\n"); writeFileSync(path.join(F.results, "blind-stage2.jsonl"), s2.sort(by).map((x) => JSON.stringify(x)).join("\n") + "\n");
  writeFileSync(path.join(F.results, "blind-key.json"), JSON.stringify(key, null, 1) + "\n"); console.log(`${s1.length} blind items; key written separately (reader never sees blind-key.json)`);
}

function cmdScore(opt) {
  const cs = readJson(F.cases), key = readJson(path.join(F.results, "blind-key.json")), logFile = path.join(F.results, "run-log.json"), adjFile = opt("adjudication", path.join(F.results, "adjudication.json"));
  if (!existsSync(adjFile)) throw new Error(`no adjudication at ${adjFile}`); const adj = readJson(adjFile), bad = validateAdjudication(key, adj, cs); if (bad.length) throw new Error(`adjudication malformed:\n- ${bad.join("\n- ")}`);
  const s = summarize(key, adj, cs.criticalClasses), log = existsSync(logFile) ? readJson(logFile) : { runs: {} };
  const technical = [...(log.preflight === "passed" ? [] : ["preflight not recorded as passed"]), ...Object.entries(log.runs).flatMap(([k, v]) => v.systemFaults.map((f) => `${k}: ${f}`))];
  const d = decide(s, cs.decisionRules, technical), provisional = s.pending.length > 0 || s.unadjudicated.length > 0 || s.notRun.length > 0, n = s.judged;
  const out = { reader: adj.reader, readerIsHuman: adj.readerIsHuman, provisional, decision: d, summary: s, wilson95: { criticalRuns: wilson(s.criticalRuns, n), unsupportedRuns: wilson(s.unsupportedRuns, n) }, note: "descriptive; n is tiny; zero failures is not evidence of safety" };
  writeFileSync(path.join(F.results, "results.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(`${provisional ? "PROVISIONAL " : ""}verdict ${d.verdict}${d.kind ? ` (${d.kind})` : ""}: ${d.reasons.join("; ") || "no critical or unsupported"}\nvalid ${s.valid}/${s.runs}, critical ${s.criticalRuns}, unsupported ${s.unsupportedRuns}, pending review ${s.pending.length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2), opt = (n, f) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : f; }, flag = (n) => rest.includes(`--${n}`);
  const commands = { check: async () => { const r = checkAll(); for (const x of r) console.log(`${x.pass ? "PASS" : "FAIL"} ${x.name}${x.pass || !x.detail ? "" : ` [${x.detail}]`}`); if (r.some((x) => !x.pass)) process.exitCode = 1; else console.log(`check ok: ${r.length} checks`); },
    plan: async () => { const c = readJson(F.cases); for (const r of schedule(c.cases.map((x) => x.id), c.protocol.seed, c.protocol.repetitions)) console.log(r.key); }, references: cmdReferences, lock: () => cmdLock(flag), preflight: cmdPreflight, run: () => cmdRun(opt, flag), blind: async () => cmdBlind(), score: async () => cmdScore(opt) };
  if (!commands[cmd]) { console.error(`usage: eval-stage2.mjs <${Object.keys(commands).join("|")}>`); process.exit(2); }
  try { await commands[cmd](); } catch (e) { console.error(`eval-stage2: ${e.message}`); process.exit(1); }
}
