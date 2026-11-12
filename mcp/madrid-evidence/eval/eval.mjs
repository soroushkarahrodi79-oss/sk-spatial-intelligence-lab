#!/usr/bin/env node
// Madrid Evidence MCP exploratory evaluation, v0.1. See README.md in this folder.
//
//   references   build references.json from the pinned Lens, wired independently of the adapter
//   seal         write seal.json (SHA-256 over cases, references, scorer, pin, protocol)
//   verify       check seal.json against the files
//   spatial      recompute point-in-polygon for the spatial cases with a separate implementation
//   run          run the cases through `claude -p` (arm: mcp | baseline)   [uses the Claude login]
//   score        score a run directory; applies adjudication.json when present
//
// Lens is only ever read from MADRID_LENS_ROOT after its files match lens-pin.json.

import { createHash } from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { wilson } from "../../../geoimpact-copilot/evaluation/metrics.mjs";
import { allowedNumbersFrom, dateAlts, scoreAnswer } from "./score.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const F = {
  cases: path.join(HERE, "cases.json"),
  references: path.join(HERE, "references.json"),
  seal: path.join(HERE, "seal.json"),
  score: path.join(HERE, "score.mjs"),
  pin: path.join(HERE, "..", "lens-pin.json"),
};
const sha = (b) => createHash("sha256").update(b).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const wire = (v) => JSON.parse(JSON.stringify(v));
const [cmd, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};
const flag = (name) => rest.includes(`--${name}`);

// ---- Lens (independent wiring, as Lens's own tests wire it) -----------------------

async function openLens() {
  const root = process.env.MADRID_LENS_ROOT;
  if (!root) throw new Error("MADRID_LENS_ROOT must point to a checkout of the pinned Lens commit");
  const pin = readJson(F.pin);
  for (const f of pin.files) {
    const actual = sha(readFileSync(path.join(root, ...f.path.split("/"))));
    if (actual !== f.sha256) throw new Error(`${f.path} does not match the pinned Lens commit ${pin.commit}`);
  }
  const file = (rel) => path.join(root, ...rel.split("/"));
  const json = (rel) => readJson(file(rel));
  const R = createRequire(file("package.json"))("./js/evidence-registry.js");
  const planning = await import(pathToFileURL(file("js/planning-ambito.js")).href);
  const change = await import(pathToFileURL(file("js/ambito-change.js")).href);
  const adapter = await import(pathToFileURL(file("js/ambito-comparison-adapter.js")).href);
  const state = json("data/planning/madrid_ambito_state.json");
  const cd = state.change_detection;
  const planningIndex = planning.createPlanningIndex({ geometry: json("data/planning/madrid_ambitos.geojson"), state });
  const edition = (s) => ({ reference_date: s.reference_date, families: s.families });
  const registry = R.createEvidenceRegistry({
    registry: json("data/source_registry.json"),
    planningIndex,
    planningModule: { AMBITO_STATE: planning.AMBITO_STATE, AVAILABILITY: planning.AVAILABILITY },
    ambitoEditionDiff: (code) => change.buildAmbitoComparison({ previous: edition(cd.previous), current: edition(cd.current), exactCode: code }),
    ambitoEditionCodeKnown: (code) => adapter.ambitoEditionContainsCode(code, state),
  });
  return { registry, pin, geojsonPath: file("data/planning/madrid_ambitos.geojson") };
}

function snapshot(registry, { lon, lat }) {
  const at = wire(registry.query("AMBITO_AT_POINT", { lon, lat }));
  const code = at.kind === "EVIDENCE" ? at.value.ambitoCode : null;
  return {
    ambitoAtPoint: at,
    ambitoPhases: code ? wire(registry.query("AMBITO_PHASES", { code })) : null,
    ambitoEditionDiff: code ? wire(registry.query("AMBITO_EDITION_DIFF", { code })) : null,
  };
}

const CODE_RE = /\b[A-Z]{2,4}\.\d[\w.]*(?:[-/][A-Z0-9]+)*/g;

function lensFor(registry, c) {
  switch (c.lens) {
    case "none": return null;
    case "point": return { ambitoAtPoint: wire(registry.query("AMBITO_AT_POINT", c.points[0])) };
    case "snapshot": return snapshot(registry, c.points[0]);
    case "snapshot2": return c.points.map((p) => snapshot(registry, p));
    case "provenance": return { sourceProvenance: Object.fromEntries(c.sourceIds.map((id) => [id, wire(registry.query("SOURCE_PROVENANCE", { sourceId: id }))])) };
    default: throw new Error(`unknown lens spec ${c.lens}`);
  }
}

// The behaviour a case declares must match what Lens actually returns for it.
function checkExpectation(c, lens) {
  const snaps = c.lens === "snapshot2" ? lens : [lens];
  if (c.lens === "provenance") {
    const results = Object.values(lens.sourceProvenance);
    const absent = results.every((r) => r.kind === "ABSTENTION");
    if ((c.expect === "ABSTAIN") !== absent) throw new Error(`${c.id}: provenance expectation ${c.expect} contradicts Lens`);
    return;
  }
  if (!lens) return;
  const at = snaps[0].ambitoAtPoint;
  if (c.expect === "ABSTAIN" && c.lens === "point" && at.kind !== "ABSTENTION") throw new Error(`${c.id}: expected Lens to abstain`);
  if (["ANSWER", "PARTIAL", "CORRECT"].includes(c.expect) && at.kind !== "EVIDENCE") throw new Error(`${c.id}: expected Lens to resolve an ámbito`);
  if (c.expect === "PARTIAL" && snaps[0].ambitoPhases?.kind === "EVIDENCE" && snaps[0].ambitoEditionDiff?.kind === "EVIDENCE") throw new Error(`${c.id}: PARTIAL needs at least one abstaining sub-answer`);
  if (c.expect === "ANSWER" && c.lens === "snapshot" && snaps[0].ambitoPhases?.kind !== "EVIDENCE" && c.derive.includes("phaseValues")) throw new Error(`${c.id}: phases abstain`);
}

function derive(c, lens) {
  const groups = [];
  const snaps = c.lens === "snapshot2" ? lens : lens ? [lens] : [];
  for (const key of c.derive) {
    if (key === "provenanceDates") {
      for (const r of Object.values(lens.sourceProvenance)) {
        if (r.kind !== "EVIDENCE") continue;
        const fr = r.value.freshness;
        if (fr.reference_date) groups.push(dateAlts(fr.reference_date));
        groups.push([String(r.value.authority).split(/[.,-]/)[0].trim()]);
      }
    } else if (key === "retrievedAt") {
      for (const r of Object.values(lens.sourceProvenance)) if (r.kind === "EVIDENCE") groups.push(dateAlts(r.value.freshness.retrieved_at.slice(0, 10)));
    } else {
      for (const s of snaps) {
        const at = s.ambitoAtPoint;
        const ph = s.ambitoPhases;
        const diff = s.ambitoEditionDiff;
        if (key === "code" && at.kind === "EVIDENCE") groups.push([at.value.ambitoCode]);
        if (key === "denomination" && at.kind === "EVIDENCE") groups.push([at.value.denomination]);
        if (ph?.kind === "EVIDENCE") {
          if (key === "phaseValues") for (const v of new Set(ph.value.phases.map((p) => p.sourceValue))) groups.push([v]);
          if (key === "surface" && ph.value.surface?.state === "PUBLISHED") groups.push([{ num: ph.value.surface.value }]);
          if (key === "district" && ph.value.district?.name) groups.push([ph.value.district.name]);
          if (key === "characteristicUse" && ph.value.characteristicUse) groups.push([ph.value.characteristicUse]);
        }
        if (key === "editionDates" && diff?.kind === "EVIDENCE") {
          groups.push(dateAlts(diff.value.dates.previous), dateAlts(diff.value.dates.current));
        }
      }
    }
  }
  return [...groups, ...c.mustInclude];
}

async function cmdReferences() {
  const { registry, pin } = await openLens();
  const cases = readJson(F.cases);
  const out = { protocolVersion: cases.protocolVersion, lensCommit: pin.commit, cases: {} };
  for (const c of cases.cases) {
    const lens = lensFor(registry, c);
    checkExpectation(c, lens);
    const codes = new Set([...(JSON.stringify(lens) ?? "").matchAll(CODE_RE)].map((m) => m[0]));
    for (const m of c.prompt.matchAll(CODE_RE)) codes.add(m[0]);
    out.cases[c.id] = {
      lens,
      mustInclude: derive(c, lens),
      knownCodes: [...codes].sort(),
      allowedNumbers: [...new Set(allowedNumbersFrom(lens))].sort((a, b) => a - b),
    };
  }
  writeFileSync(F.references, JSON.stringify(out, null, 1) + "\n");
  console.log(`references.json: ${cases.cases.length} cases against Lens ${pin.commit.slice(0, 7)}`);
}

// ---- seal -----------------------------------------------------------------------

function sealState() {
  const files = Object.fromEntries(["cases", "references", "score", "pin"].map((k) => [path.relative(REPO, F[k]).replaceAll("\\", "/"), sha(readFileSync(F[k]))]));
  const digest = sha(Object.entries(files).map(([k, v]) => `${k}:${v}`).join("\n"));
  return { files, digest };
}

function cmdSeal() {
  if (existsSync(F.seal) && !flag("force")) throw new Error("seal.json exists; refusing to reseal without --force (a reseal after a run invalidates that run)");
  const s = sealState();
  writeFileSync(F.seal, JSON.stringify({ algorithm: "sha256", sealedAt: new Date().toISOString(), lensCommit: readJson(F.pin).commit, ...s }, null, 2) + "\n");
  console.log(`sealed ${s.digest}`);
}

function verifySeal() {
  const sealed = readJson(F.seal);
  const now = sealState();
  const bad = Object.keys(now.files).filter((k) => sealed.files[k] !== now.files[k]);
  if (bad.length || sealed.digest !== now.digest) throw new Error(`seal mismatch: ${bad.join(", ") || "digest"}`);
  return sealed;
}

// ---- independent spatial check ---------------------------------------------------

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inMulti = (x, y, polys) => polys.some(([outer, ...holes]) => inRing(x, y, outer) && !holes.some((h) => inRing(x, y, h)));

async function cmdSpatial() {
  const { registry, geojsonPath } = await openLens();
  const geo = readJson(geojsonPath);
  const cases = readJson(F.cases).cases;
  const seen = new Set();
  let checked = 0;
  const diffs = [];
  for (const c of cases) {
    if (!["point", "snapshot", "snapshot2"].includes(c.lens)) continue;
    for (const p of c.points) {
      const key = `${p.lon},${p.lat}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const lens = registry.query("AMBITO_AT_POINT", p);
      const lensCode = lens.kind === "EVIDENCE" ? lens.value.ambitoCode : null;
      const mine = geo.features.filter((f) => inMulti(p.lon, p.lat, f.geometry.coordinates)).map((f) => f.properties.ambito_code).sort();
      const agree = lensCode === null ? mine.length === 0 : mine.includes(lensCode);
      checked++;
      if (!agree || mine.length > 1) diffs.push({ case: c.id, point: p, lens: lensCode, independent: mine });
      console.log(`${c.id} ${key} lens=${lensCode ?? "none"} independent=${mine.join(",") || "none"} ${agree ? "agree" : "DISAGREE"}${mine.length > 1 ? " (overlap)" : ""}`);
    }
  }
  console.log(`\n${checked} distinct points; ${diffs.length} disagreements or overlaps. This checks the algorithm on the same geometry file; it does not validate the geometry against the official source.`);
  if (diffs.some((d) => d.lens !== d.independent[0] || d.independent.length !== 1)) process.exitCode = 1;
}

// ---- run -------------------------------------------------------------------------

const TOOL_PREFIX = "mcp__madrid-evidence__";

async function cmdRun() {
  const sealed = verifySeal();
  const cases = readJson(F.cases);
  const arms = (opt("arm", "both") === "both" ? ["baseline", "mcp"] : [opt("arm")]);
  const out = path.resolve(opt("out", path.join(REPO, "work", "madrid-mcp-eval", "pass-1")));
  const only = opt("only") ? new Set(opt("only").split(",")) : null;
  mkdirSync(out, { recursive: true });
  const lensRoot = path.resolve(process.env.MADRID_LENS_ROOT ?? "");
  const mcpConfig = path.join(out, "mcp.json");
  writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { "madrid-evidence": { command: process.execPath, args: [path.join(REPO, "mcp", "madrid-evidence", "server.mjs")], env: { MADRID_LENS_ROOT: lensRoot } } } }));
  const version = spawnSync("claude", ["--version"], { encoding: "utf8" }).stdout.trim();
  writeFileSync(path.join(out, "run-meta.json"), JSON.stringify({ model: cases.protocol.model, claudeCli: version, sealDigest: sealed.digest, startedAt: new Date().toISOString(), arms }, null, 2));
  for (const arm of arms) {
    for (const c of cases.cases) {
      if (only && !only.has(c.id)) continue;
      const raw = path.join(out, `${arm}-${c.id}.jsonl`);
      if (existsSync(raw) && !flag("force")) { console.log(`skip ${arm} ${c.id} (exists)`); continue; }
      const args = ["-p", "--model", cases.protocol.model, "--system-prompt", cases.protocol.systemPrompt, "--strict-mcp-config", "--setting-sources", "project",
        "--disable-slash-commands", "--no-session-persistence", "--tools", "", "--permission-prompts", "none", "--max-turns", String(cases.protocol.maxTurns),
        "--output-format", "stream-json", "--verbose"];
      if (arm === "mcp") args.push("--mcp-config", mcpConfig, `--allowedTools=${TOOL_PREFIX}*`);
      args.push("--", c.prompt);
      const env = { ...process.env };
      delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;
      const cwd = mkdtempSync(path.join(tmpdir(), "madrid-eval-"));
      const stdout = await new Promise((resolve) => {
        const child = spawn("claude", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
        let buf = "";
        child.stdout.on("data", (d) => (buf += d));
        const timer = setTimeout(() => child.kill(), 240000);
        child.on("close", (code) => { clearTimeout(timer); resolve(buf + (code ? `\n{"type":"harness","exit":${code}}\n` : "")); });
      });
      writeFileSync(raw, stdout);
      console.log(`done ${arm} ${c.id}`);
    }
  }
}

// ---- score -----------------------------------------------------------------------

function parseRun(file) {
  const calls = new Map();
  let answer = null, cost = null, turns = null, resultError = false, harnessExit = null;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === "assistant") {
      for (const part of ev.message?.content ?? []) {
        if (part.type === "tool_use") calls.set(part.id, { name: String(part.name).replace(TOOL_PREFIX, ""), input: part.input, isError: false });
      }
    } else if (ev.type === "user") {
      for (const part of ev.message?.content ?? []) {
        if (part.type === "tool_result" && calls.has(part.tool_use_id) && part.is_error) calls.get(part.tool_use_id).isError = true;
      }
    } else if (ev.type === "result") {
      answer = ev.result ?? null; cost = ev.total_cost_usd ?? null; turns = ev.num_turns ?? null; resultError = !!ev.is_error;
    } else if (ev.type === "harness") harnessExit = ev.exit;
  }
  return { answer, toolCalls: [...calls.values()], cost, turns, resultError, harnessExit };
}

function cmdScore() {
  const dir = path.resolve(opt("runs", path.join(REPO, "work", "madrid-mcp-eval", "pass-1")));
  const cases = readJson(F.cases);
  const refs = readJson(F.references).cases;
  const sealed = verifySeal();
  const adjFile = opt("adjudication", path.join(HERE, "results", "adjudication.json"));
  const adj = existsSync(adjFile) ? readJson(adjFile) : {};
  const rows = [];
  for (const arm of ["baseline", "mcp"]) {
    for (const c of cases.cases) {
      const raw = path.join(dir, `${arm}-${c.id}.jsonl`);
      if (!existsSync(raw)) continue;
      const r = parseRun(raw);
      const flags = r.answer == null ? [{ kind: "no_answer", detail: `exit=${r.harnessExit} error=${r.resultError}` }]
        : scoreAnswer({ caseDef: c, reference: refs[c.id], answer: r.answer, toolCalls: r.toolCalls, arm, forbiddenSets: cases.forbiddenSets });
      rows.push({ arm, id: c.id, category: c.category, expect: c.expect, answer: r.answer, toolCalls: r.toolCalls, turns: r.turns, costUsd: r.cost, rawSha256: sha(readFileSync(raw)), flags, adjudication: adj[`${arm}:${c.id}`] ?? null });
    }
  }
  const outFile = opt("out", path.join(HERE, "results", "results.json"));
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify({ sealDigest: sealed.digest, runDir: path.basename(dir), rows }, null, 1) + "\n");
  const critical = new Set(cases.criticalClasses);
  for (const arm of ["baseline", "mcp"]) {
    const a = rows.filter((r) => r.arm === arm);
    if (!a.length) continue;
    const flagged = a.filter((r) => r.flags.length);
    const adjudicated = a.filter((r) => r.adjudication);
    const pending = flagged.filter((r) => !r.adjudication).length;
    const critFail = adjudicated.filter((r) => (r.adjudication.errors ?? []).some((e) => critical.has(e)));
    const byClass = {};
    for (const r of adjudicated) for (const e of r.adjudication.errors ?? []) byClass[e] = (byClass[e] ?? 0) + 1;
    const noCrit = wilson(a.length - critFail.length, a.length);
    console.log(`\n[${arm}] n=${a.length} auto-flagged=${flagged.length} adjudicated=${adjudicated.length} flagged-but-unadjudicated=${pending}`);
    console.log(`  errors by class (adjudicated): ${JSON.stringify(byClass)}`);
    console.log(`  answers with >=1 critical error: ${critFail.length}/${a.length}; no-critical-error rate ${noCrit.rate} (Wilson 95% ${noCrit.low}-${noCrit.high})`);
  }
}

const commands = { references: cmdReferences, seal: cmdSeal, verify: () => console.log(`seal ok ${verifySeal().digest}`), spatial: cmdSpatial, run: cmdRun, score: cmdScore };
if (!commands[cmd]) { console.error(`usage: eval.mjs <${Object.keys(commands).join("|")}> [options]`); process.exit(2); }
try { await commands[cmd](); } catch (e) { console.error(`eval: ${e.message}`); process.exit(1); }
