#!/usr/bin/env node
// Madrid Evidence MCP exploratory evaluation v0.3 (licences_in_lens). See README.md, "v0.3".
// Separate from eval.mjs (v0.1), which is bound to cases.json + seal.json and is not touched.
//
//   references  build references-v0.3.json from the pinned Lens (never typed by hand)
//   lock        write protocol-lock-v0.3.json: model, CLI, files, hashes, Lens pins (before the run)
//   verify      check the lock against the files, the CLI and the Lens checkout
//   preflight   check the CLI + MCP server connect with a non-case prompt; writes nothing
//   run         ONE pass of the ten cases, mcp arm only (uses the logged-in Claude CLI)
//   score       verify transcripts, apply candidate flags and the hand adjudication, print results
//
// Lens is only read from MADRID_LENS_ROOT after every pinned file matches its SHA-256.

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { wilson } from "../../../geoimpact-copilot/evaluation/metrics.mjs";
import { KIND_CATEGORY, scoreCase } from "./score-v03.mjs";
import { EXPECTED_TOOLS_V03, TOOL_PREFIX, parseTranscript, retryOnInfraFailure, verifyTranscript } from "./verify-transcript.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const F = {
  cases: path.join(HERE, "cases-v0.3.json"),
  references: path.join(HERE, "references-v0.3.json"),
  lock: path.join(HERE, "protocol-lock-v0.3.json"),
  results: path.join(HERE, "results-v0.3"),
};
// Files whose bytes define the protocol, the evaluator and the system under test.
const LOCKED = [
  "mcp/madrid-evidence/eval/cases-v0.3.json", "mcp/madrid-evidence/eval/references-v0.3.json",
  "mcp/madrid-evidence/eval/eval-v03.mjs", "mcp/madrid-evidence/eval/score-v03.mjs",
  "mcp/madrid-evidence/eval/score.mjs", "mcp/madrid-evidence/eval/verify-transcript.mjs", "geoimpact-copilot/evaluation/metrics.mjs",
  "mcp/madrid-evidence/server.mjs", "mcp/madrid-evidence/lens-adapter.mjs",
  "mcp/madrid-evidence/lens-pin.json", "mcp/madrid-evidence/lens-pin-licences.json", "package-lock.json",
];
const sha = (b) => createHash("sha256").update(b).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const wire = (v) => JSON.parse(JSON.stringify(v));
const [cmd, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : fallback; };
const flag = (name) => rest.includes(`--${name}`);
const cliVersion = () => spawnSync("claude", ["--version"], { encoding: "utf8" }).stdout.trim();
const git = (...a) => spawnSync("git", a, { cwd: REPO, encoding: "utf8" }).stdout.trim();

// ---- Lens (wired directly, independent of lens-adapter.mjs) ----------------------------

function lensPins() {
  const pins = ["lens-pin.json", "lens-pin-licences.json"].map((f) => readJson(path.join(HERE, "..", f)));
  if (pins[0].commit !== pins[1].commit) throw new Error("lens-pin.json and lens-pin-licences.json name different commits");
  return { commit: pins[0].commit, files: pins.flatMap((p) => p.files.map((x) => ({ path: x.path, sha256: x.sha256 }))) };
}

async function openLens() {
  const root = process.env.MADRID_LENS_ROOT;
  if (!root) throw new Error("MADRID_LENS_ROOT must point to a checkout of the pinned Lens commit");
  const pins = lensPins();
  const head = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  if (head !== pins.commit) throw new Error(`Lens checkout is at ${head || "(not a git checkout)"}, pinned ${pins.commit}`);
  for (const f of pins.files) if (sha(readFileSync(path.join(root, ...f.path.split("/")))) !== f.sha256) throw new Error(`${f.path} does not match the pinned Lens commit`);
  const file = (rel) => path.join(root, ...rel.split("/"));
  const json = (rel) => readJson(file(rel));
  const R = createRequire(file("package.json"))("./js/evidence-registry.js");
  const planning = await import(pathToFileURL(file("js/planning-ambito.js")).href);
  const licences = await import(pathToFileURL(file("js/urban-licences.js")).href);
  const registry = R.createEvidenceRegistry({
    registry: json("data/source_registry.json"),
    planningIndex: planning.createPlanningIndex({ geometry: json("data/planning/madrid_ambitos.geojson"), state: json("data/planning/madrid_ambito_state.json") }),
    planningModule: { AMBITO_STATE: planning.AMBITO_STATE, AVAILABILITY: planning.AVAILABILITY },
    licenceIndex: licences.createLicenceIndex(json("data/planning/madrid_urban_licences.json")),
  });
  return { registry, pins };
}

// ---- references -------------------------------------------------------------------------

function expectOk(c, r) {
  const state = r.value?.state;
  const ok = { ABSTAIN: r.kind === "ABSTENTION" && r.reason === "OUTSIDE_TEMPORAL_COVERAGE", ANSWER_EMPTY: r.kind === "EVIDENCE" && state === "NO_MATCHES" }[c.expect]
    ?? (r.kind === "EVIDENCE" && state === "AVAILABLE");
  if (!ok) throw new Error(`${c.id}: Lens returned ${r.kind}/${r.reason ?? state}, which contradicts expect=${c.expect}`);
}

async function cmdReferences() {
  const { registry, pins } = await openLens();
  const cases = readJson(F.cases);
  const out = { protocolVersion: cases.protocolVersion, lensCommit: pins.commit, derivedFrom: "registry.query('LICENCES_IN_LENS', params) on the pinned Lens; value.records removed as the MCP does", cases: {} };
  for (const c of cases.cases) {
    const params = c.params ?? c.referenceParams;
    const ref = { id: c.id, expect: c.expect, params: params ?? null, lens: null };
    if (params) {
      const lens = wire(registry.query("LICENCES_IN_LENS", params));
      expectOk(c, lens);
      if (lens.value) delete lens.value.records;
      ref.lens = lens;
      if (lens.kind === "EVIDENCE") {
        ref.shownCounts = Object.fromEntries(lens.value.familiesShown.map((f) => [f, lens.value.perFamily[f]]));
        ref.window = { from: lens.value.window.from, to: lens.value.window.to };
        ref.coverage = { total_rows: lens.value.coverage.total_rows, unresolved_rows: lens.value.coverage.unresolved_rows, row_match_rate: lens.value.coverage.row_match_rate };
      }
    }
    out.cases[c.id] = ref;
  }
  writeFileSync(F.references, JSON.stringify(out, null, 1) + "\n");
  console.log(`references-v0.3.json: ${cases.cases.length} cases derived from Lens ${pins.commit.slice(0, 7)}`);
}

// ---- lock -------------------------------------------------------------------------------

function lockState() {
  const cases = readJson(F.cases);
  return {
    files: Object.fromEntries(LOCKED.map((rel) => [rel, sha(readFileSync(path.join(REPO, ...rel.split("/"))))])),
    model: cases.protocol.model, systemPrompt: cases.protocol.systemPrompt, maxTurns: cases.protocol.maxTurns,
    claudeCli: cliVersion(), node: process.version, mcpSdk: readJson(path.join(REPO, "package.json")).dependencies["@modelcontextprotocol/sdk"],
  };
}

async function cmdLock() {
  if (existsSync(F.lock) && !flag("force")) throw new Error("protocol-lock-v0.3.json exists; refusing to overwrite without --force (a re-lock after a run invalidates that run)");
  const { pins } = await openLens(); // also proves the checkout is the pinned one
  const state = lockState();
  const lock = {
    protocolVersion: readJson(F.cases).protocolVersion, status: "LOCKED BEFORE THE RUN", lockedAt: new Date().toISOString(),
    repoBaseCommit: git("rev-parse", "HEAD"), repoBaseNote: "HEAD when locked; the evaluator files themselves are identified by the hashes below, not by this commit",
    lens: { repository: "https://github.com/soroushkarahrodi79-oss/madrid-tourism-intelligence-lens", commit: pins.commit, files: pins.files },
    ...state,
    claudeArgs: ["-p", "--model", state.model, "--system-prompt", "<systemPrompt>", "--strict-mcp-config", "--setting-sources", "project", "--disable-slash-commands", "--no-session-persistence", "--tools", "", "--permission-prompts", "none", "--max-turns", String(state.maxTurns), "--output-format", "stream-json", "--verbose", "--mcp-config", "<generated>", `--allowedTools=${TOOL_PREFIX}*`, "--", "<prompt>"],
    howToRepeat: "export MADRID_LENS_ROOT=<checkout at the Lens commit above>; node eval-v03.mjs verify; node eval-v03.mjs run --out <new dir>; node eval-v03.mjs score --runs <that dir>",
  };
  writeFileSync(F.lock, JSON.stringify(lock, null, 2) + "\n");
  console.log(`locked: model ${state.model}, ${state.claudeCli}, Lens ${pins.commit.slice(0, 7)}, ${LOCKED.length} files hashed`);
}

async function verifyLock() {
  if (!existsSync(F.lock)) throw new Error("no protocol-lock-v0.3.json: run `lock` first");
  const lock = readJson(F.lock);
  const now = lockState();
  const bad = [...Object.keys(now.files).filter((k) => lock.files[k] !== now.files[k])];
  for (const k of ["model", "systemPrompt", "maxTurns", "claudeCli", "node", "mcpSdk"]) if (lock[k] !== now[k]) bad.push(`${k} (locked ${lock[k]} / now ${now[k]})`);
  if (bad.length) throw new Error(`lock mismatch: ${bad.join("; ")}`);
  const { pins } = await openLens();
  if (pins.commit !== lock.lens.commit || JSON.stringify(pins.files) !== JSON.stringify(lock.lens.files)) throw new Error("Lens pins differ from the lock");
  return { lock, lockSha256: sha(readFileSync(F.lock)) };
}

// ---- run --------------------------------------------------------------------------------

function claudeArgs(lock, mcpConfig, prompt) {
  return ["-p", "--model", lock.model, "--system-prompt", lock.systemPrompt, "--strict-mcp-config", "--setting-sources", "project", "--disable-slash-commands", "--no-session-persistence",
    "--tools", "", "--permission-prompts", "none", "--max-turns", String(lock.maxTurns), "--output-format", "stream-json", "--verbose",
    "--mcp-config", mcpConfig, `--allowedTools=${TOOL_PREFIX}*`, "--", prompt];
}

function writeMcpConfig() {
  if (!process.env.MADRID_LENS_ROOT) throw new Error("MADRID_LENS_ROOT must be set");
  const dir = mkdtempSync(path.join(tmpdir(), "madrid-eval-cfg-"));
  const file = path.join(dir, "mcp.json");
  writeFileSync(file, JSON.stringify({ mcpServers: { "madrid-evidence": { command: process.execPath, args: [path.join(REPO, "mcp", "madrid-evidence", "server.mjs")], env: { MADRID_LENS_ROOT: path.resolve(process.env.MADRID_LENS_ROOT) } } } }));
  return file;
}

const attemptOnce = (args, timeoutMs) => new Promise((resolve) => {
  const env = { ...process.env };
  delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;
  const cwd = mkdtempSync(path.join(tmpdir(), "madrid-eval-"));
  const child = spawn("claude", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  let buf = "", err = "";
  child.stdout.on("data", (d) => (buf += d));
  child.stderr.on("data", (d) => (err += d));
  const timer = setTimeout(() => child.kill(), timeoutMs);
  child.on("close", (code) => { clearTimeout(timer); resolve({ stdout: buf + (code ? `\n{"type":"harness","exit":${code}}\n` : ""), stderr: err }); });
});

async function cmdPreflight() {
  const { lock } = await verifyLock();
  const r = await attemptOnce(claudeArgs(lock, writeMcpConfig(), "Without calling any tool, reply with the single word: ready"), 120000);
  const t = parseTranscript(r.stdout);
  const init = JSON.parse(r.stdout.split("\n").find((l) => l.includes('"subtype":"init"')) ?? "{}");
  console.log(`servers: ${JSON.stringify(t.init?.servers)}\nmodel in init: ${init.model}\ntools: ${(t.init?.tools ?? []).join(", ")}\nverdict: ${JSON.stringify(verifyTranscript(r.stdout, { expectedTools: EXPECTED_TOOLS_V03 }))}`);
}

async function cmdRun() {
  const { lock, lockSha256 } = await verifyLock();
  const cases = readJson(F.cases);
  const out = path.resolve(opt("out", path.join(F.results, "pass-1")));
  mkdirSync(out, { recursive: true });
  const mcpConfig = writeMcpConfig();
  const metaFile = path.join(out, "run-meta.json");
  const meta = existsSync(metaFile) ? readJson(metaFile) : { protocolVersion: cases.protocolVersion, lockSha256, model: lock.model, claudeCli: lock.claudeCli, lensCommit: lock.lens.commit, lensRoot: "<MADRID_LENS_ROOT>", arm: "mcp", startedAt: new Date().toISOString(), attempts: {} };
  if (meta.lockSha256 !== lockSha256) throw new Error("this run directory was started under a different lock");
  const only = opt("only") ? new Set(opt("only").split(",")) : null;
  for (const c of cases.cases) {
    if (only && !only.has(c.id)) continue;
    const raw = path.join(out, `${c.id}.jsonl`);
    const failedBefore = existsSync(raw) && verifyTranscript(readFileSync(raw, "utf8"), { expectedTools: EXPECTED_TOOLS_V03 }).status === "INFRA_FAILURE";
    // A recorded model answer is never re-run (one pass). Only an INFRA_FAILURE is retried.
    if (existsSync(raw) && !failedBefore) { console.log(`skip ${c.id} (exists)`); continue; }
    let last;
    const r = await retryOnInfraFailure((n) => attemptOnce(claudeArgs(lock, mcpConfig, c.prompt), cases.protocol.timeoutMs).then((x) => (last = x)), {
      promptText: c.prompt, expectedTools: EXPECTED_TOOLS_V03,
      onFailure: (n, v) => { console.log(`INFRA_FAILURE ${c.id} attempt ${n}: ${v.reason}`); writeFileSync(path.join(out, `${c.id}.attempt${n}.jsonl`), last.stdout); },
    });
    writeFileSync(raw, r.stdout);
    if (r.stderr.trim()) writeFileSync(path.join(out, `${c.id}.stderr.txt`), r.stderr.slice(0, 20000)); // capped
    meta.attempts[c.id] = (meta.attempts[c.id] ?? 0) + r.attempts;
    if (r.verdict.status === "INFRA_FAILURE") process.exitCode = 1; // incomplete run, not a model result
    console.log(`done ${c.id} [${r.verdict.status}] attempts=${r.attempts}`);
  }
  meta.finishedAt = new Date().toISOString();
  writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n");
}

// ---- score ------------------------------------------------------------------------------

function cmdScore() {
  const dir = path.resolve(opt("runs", path.join(F.results, "pass-1")));
  const cases = readJson(F.cases);
  const refs = readJson(F.references).cases;
  const lock = readJson(F.lock);
  const adjFile = opt("adjudication", path.join(F.results, "adjudication.json"));
  const adj = existsSync(adjFile) ? readJson(adjFile) : {};
  const critical = new Set(readJson(path.join(HERE, "cases.json")).criticalClasses);
  const rows = [];
  for (const c of cases.cases) {
    const rawFile = path.join(dir, `${c.id}.jsonl`);
    if (!existsSync(rawFile)) continue;
    const raw = readFileSync(rawFile, "utf8");
    const transcript = parseTranscript(raw);
    const verification = verifyTranscript(raw, { promptText: c.prompt, expectedTools: EXPECTED_TOOLS_V03 });
    const initLine = raw.split("\n").find((l) => l.includes('"subtype":"init"'));
    const modelServed = initLine ? JSON.parse(initLine).model ?? null : null;
    const infra = verification.status === "INFRA_FAILURE";
    const { flags, notes } = infra || transcript.answer == null ? { flags: [{ kind: infra ? "infra_failure" : "no_answer", detail: verification.reason ?? "no result event" }], notes: [] }
      : scoreCase({ caseDef: c, reference: refs[c.id], transcript, verification });
    const resultKinds = transcript.calls.map((x) => { try { const p = JSON.parse(x.resultText); return p?.result?.kind ?? "other"; } catch { return x.isError ? "TOOL_ERROR" : "unparsed"; } });
    rows.push({
      id: c.id, expect: c.expect, toolRequired: c.toolRequired, answer: transcript.answer, modelServed, modelMatchesLock: modelServed === lock.model,
      toolCalls: transcript.calls.map((x, i) => ({ name: x.name.replace(TOOL_PREFIX, ""), input: x.input, isError: x.isError, lensKind: resultKinds[i] })),
      verification, flags, notes, categories: [...new Set(flags.map((f) => KIND_CATEGORY[f.kind] ?? f.kind))],
      rawSha256: sha(raw), adjudication: adj[c.id] ?? null,
    });
  }
  const outFile = opt("out", path.join(F.results, "results.json"));
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify({ lockSha256: sha(readFileSync(F.lock)), runDir: path.basename(dir), rows }, null, 1) + "\n");

  const infraRows = rows.filter((r) => r.verification.status === "INFRA_FAILURE");
  const a = rows.filter((r) => r.verification.status !== "INFRA_FAILURE");
  console.log(`n=${rows.length} cases scored; INFRA_FAILURE (excluded from n and rates): ${infraRows.map((r) => r.id).join(", ") || "none"}`);
  const bad = a.filter((r) => !r.modelMatchesLock); if (bad.length) console.log(`WARNING: model served differs from lock in ${bad.map((r) => r.id).join(", ")}`);
  for (const r of a) console.log(`${r.id} ${r.verification.status.padEnd(13)} flags=${r.flags.map((f) => f.kind).join(",") || "-"} verdict=${r.adjudication?.verdict ?? "UNADJUDICATED"}`);
  const req = a.filter((r) => r.toolRequired);
  const backed = req.filter((r) => r.verification.status === "BACKED").length;
  console.log(`toolRequired cases BACKED: ${backed}/${req.length} ${JSON.stringify(wilson(backed, req.length))}`);
  const adjd = a.filter((r) => r.adjudication);
  const byClass = {};
  for (const r of adjd) for (const e of r.adjudication.errors ?? []) byClass[e] = (byClass[e] ?? 0) + 1;
  const critFail = adjd.filter((r) => (r.adjudication.errors ?? []).some((e) => critical.has(e)));
  const pass = adjd.filter((r) => r.adjudication.verdict === "pass").length;
  console.log(`adjudicated ${adjd.length}/${a.length}; errors by class ${JSON.stringify(byClass)}; verdict pass ${pass}/${adjd.length} ${JSON.stringify(wilson(pass, adjd.length))}`);
  console.log(`answers with >=1 critical error: ${critFail.length}/${adjd.length}; no-critical-error ${JSON.stringify(wilson(adjd.length - critFail.length, adjd.length))}`);
}

const commands = { references: cmdReferences, lock: cmdLock, verify: async () => console.log(`lock ok ${(await verifyLock()).lockSha256}`), preflight: cmdPreflight, run: cmdRun, score: cmdScore };
if (!commands[cmd]) { console.error(`usage: eval-v03.mjs <${Object.keys(commands).join("|")}> [options]`); process.exit(2); }
try { await commands[cmd](); } catch (e) { console.error(`eval-v03: ${e.message}`); process.exit(1); }
