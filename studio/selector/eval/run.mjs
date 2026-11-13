#!/usr/bin/env node
// Offline experiment runner for the Studio v0.2 selector (alternative B). Needs the real Madrid Evidence MCP
// (MADRID_LENS_ROOT at the pinned Lens commit); it fails closed without it.
//
//   node studio/selector/eval/run.mjs                       simulated-provider matrix (contract check, NOT a model result)
//   node studio/selector/eval/run.mjs --replay runs.json    score RECORDED raw outputs of a real model, offline
//   node studio/selector/eval/run.mjs --replay runs.json --review-packet out/   blinded A/B packet for human review
//
// Replay file: { "model": "...", "runs": [ { "caseId": "SEL-01", "raw": "<string the model returned>",
//   "meta": { "latencyMs": 0, "inputTokens": 0, "outputTokens": 0, "costUsd": 0 } } ] }
// `meta` is optional; a statistic is reported only if every run carries that field. Nothing is estimated.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wilson, summarize } from "../../../geoimpact-copilot/evaluation/metrics.mjs";
import { McpSession, investigate } from "../../mcp-session.mjs";
import { allItems, getPointer, KIND } from "../../public/evidence-view.mjs";
import { buildClaimPackage, canonicalJson, sha256 } from "../claim-package.mjs";
import { applyOrder, createSelector, evidencePreservationProblems, validateSelection } from "../selection-contract.mjs";
import { SIMULATED, EXPECT_ACCEPTED, providerFor } from "./simulated-providers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CASES = JSON.parse(readFileSync(path.join(HERE, "cases.json"), "utf8"));

// Builds the investigation of a case through the real MCP, applying the optional adversarial mutation to the
// RAW response (simulating hostile text inside the data).
export async function caseResponse(session, c) {
  const p = CASES.points[c.point];
  const response = await investigate(session, { lon: p.lon, lat: p.lat, radiusM: c.radiusM, ...(c.window ? { window: c.window } : {}) });
  if (c.mutation) {
    const copy = structuredClone(response);
    const keys = c.mutation.path.split("/").slice(1);
    const last = keys.pop();
    const parent = keys.reduce((o, k) => o?.[k], copy);
    if (!parent || !(last in parent)) throw new Error(`${c.id}: mutation target missing ${c.mutation.path}`);
    parent[last] = `${parent[last]} ${c.mutation.inject}`;
    return copy;
  }
  return response;
}

// Preconditions a case declares about the real data, so it cannot silently stop covering its tag.
export function unmetRequirements(c, response, bundle) {
  const out = [];
  const r = c.requires || {};
  const sections = new Map(bundle.view.sections.map((s) => [s.id, s]));
  for (const [id, st] of Object.entries(r.sectionStatus || {})) if (sections.get(id)?.status !== st) out.push(`section ${id} is ${sections.get(id)?.status}, expected ${st}`);
  const items = allItems(bundle.view);
  const rec = response.calls;
  if (r.abstentionReason && getPointer(rec.snapshot, "/structuredContent/ambitoAtPoint/reason") !== r.abstentionReason) out.push("abstention reason differs");
  if (r.licenceAbstention && getPointer(rec.licences, "/structuredContent/result/reason") !== r.licenceAbstention) out.push("licence abstention differs");
  if (r.familiesShown !== undefined && (sections.get("licences")?.families.length ?? 0) !== r.familiesShown) out.push("families shown differs");
  if (r.anyNull && !items.some((i) => i.value === null)) out.push("no null field in the data");
  if (r.unresolvedRowsPositive && !(getPointer(rec.licences, "/structuredContent/result/value/coverage/unresolved_rows") > 0)) out.push("no unresolved rows");
  if (r.clamped !== undefined && getPointer(rec.licences, "/structuredContent/result/value/window/clamped") !== r.clamped) out.push("clamped flag differs");
  if (r.lensKind && !items.some((i) => i.lensKindPath && getPointer(rec.snapshot, i.lensKindPath) === r.lensKind)) out.push(`no ${r.lensKind} cell`);
  if (r.registerComposition && !items.some((i) => i.kind === KIND.CONTEXT && i.source?.path?.includes("registerComposition"))) out.push("no registerComposition items");
  return out;
}

export async function runMatrix(session, { cases = CASES.cases, providerNames = Object.keys(SIMULATED), timeoutMs = 200 } = {}) {
  const rows = [];
  for (const c of cases) {
    const response = await caseResponse(session, c);
    const bundle = buildClaimPackage(response);
    const unmet = unmetRequirements(c, response, bundle);
    for (const name of providerNames) {
      const selector = createSelector({ provider: providerFor(name), timeoutMs });
      const sel = await selector.select(bundle, response, c.question);
      const shown = applyOrder(bundle, sel.order);
      rows.push({
        caseId: c.id,
        provider: name,
        status: sel.status,
        reason: sel.reason,
        orderChanged: canonicalJson(sel.order) !== canonicalJson(bundle.baselineOrder),
        claims: bundle.pkg.claims.length,
        packageBytes: Buffer.byteLength(JSON.stringify(bundle.pkg)),
        // What is actually shown, accepted or not, must preserve the evidence.
        evidenceProblems: evidencePreservationProblems(bundle, response, shown),
        unmetRequirements: unmet,
      });
    }
  }
  return rows;
}

export function summariseMatrix(rows) {
  const byProvider = {};
  for (const r of rows) {
    const p = (byProvider[r.provider] ||= { runs: 0, PROVIDER_ORDER: 0, FALLBACK: 0, DISABLED: 0, orderChanged: 0, reasons: {}, evidenceProblems: 0 });
    p.runs += 1;
    p[r.status] += 1;
    if (r.status === "PROVIDER_ORDER" && r.orderChanged) p.orderChanged += 1;
    if (r.reason) p.reasons[r.reason] = (p.reasons[r.reason] || 0) + 1;
    p.evidenceProblems += r.evidenceProblems.length;
  }
  return byProvider;
}

// ----- replay of recorded real-model outputs (never invents a missing field) -----
export async function replay(session, runs, cases = CASES.cases) {
  const byCase = new Map(cases.map((c) => [c.id, c]));
  const out = [];
  for (const run of runs) {
    const c = byCase.get(run.caseId);
    if (!c) throw new Error(`unknown case ${run.caseId}`);
    const response = await caseResponse(session, c);
    const bundle = buildClaimPackage(response);
    const verdict = validateSelection(run.raw, bundle.pkg, c.question);
    const order = verdict.accepted ? verdict.claim_ids : bundle.baselineOrder;
    const problems = evidencePreservationProblems(bundle, response, applyOrder(bundle, order));
    out.push({ caseId: c.id, accepted: verdict.accepted && problems.length === 0, reason: verdict.accepted ? (problems.length ? "EVIDENCE_GATE" : null) : verdict.reason, orderChanged: canonicalJson(order) !== canonicalJson(bundle.baselineOrder), meta: run.meta || null, bundle, response, order });
  }
  return out;
}

export function summariseReplay(results) {
  const n = results.length;
  const accepted = results.filter((r) => r.accepted).length;
  const reasons = {};
  for (const r of results) if (r.reason) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  const all = (k) => results.every((r) => typeof r.meta?.[k] === "number");
  return {
    n,
    accepted: wilson(accepted, n),
    fallback: wilson(n - accepted, n),
    reasons,
    changedOrder: results.filter((r) => r.accepted && r.orderChanged).length,
    latencyMs: all("latencyMs") ? summarize(results.map((r) => r.meta.latencyMs)) : "not recorded",
    inputTokens: all("inputTokens") ? summarize(results.map((r) => r.meta.inputTokens)) : "not recorded",
    outputTokens: all("outputTokens") ? summarize(results.map((r) => r.meta.outputTokens)) : "not recorded",
    costUsd: all("costUsd") ? Number(results.reduce((s, r) => s + r.meta.costUsd, 0).toFixed(6)) : "not recorded",
  };
}

// ----- blinded A/B packet for human review -----
const mulberry32 = (a) => () => ((a = (a + 0x6d2b79f5) | 0), (((t) => ((t ^ (t >>> 14)) >>> 0) / 4294967296)(Math.imul(a ^ (a >>> 15), 1 | a) ^ (a + Math.imul(a ^ (a >>> 7), 61 | a)))));
const seedOf = (s) => parseInt(sha256(s).slice(0, 8), 16);

export function renderText(blocks) {
  return blocks
    .map((b) => [`## ${b.sectionId}${b.role === "FAMILY" ? " (familia)" : ""} [${b.status ?? "-"}]`, ...b.items.map((i) => `- [${i.kind}] ${i.label}: ${typeof i.value === "string" ? i.value : JSON.stringify(i.value)}`)].join("\n"))
    .join("\n\n");
}

export function reviewPacket(results, seed) {
  const packet = [];
  const key = [];
  for (const r of results.filter((x) => x.accepted && x.orderChanged)) {
    const flip = mulberry32(seedOf(`${seed}|${r.caseId}`))() < 0.5;
    const a = renderText(applyOrder(r.bundle, r.bundle.baselineOrder));
    const b = renderText(applyOrder(r.bundle, r.order));
    packet.push({ caseId: r.caseId, question: CASES.cases.find((c) => c.id === r.caseId).question, X: flip ? b : a, Y: flip ? a : b, ratings: { clearer: null, moreUseful: null, misleadingEmphasis: null, note: null } });
    key.push({ caseId: r.caseId, X: flip ? "B" : "A", Y: flip ? "A" : "B" });
  }
  return { packet, key };
}

// ----- CLI -----
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
  const session = new McpSession({ lensRoot: process.env.MADRID_LENS_ROOT });
  const st = await session.start();
  if (st.state !== "READY") {
    console.error(`MCP not ready: ${st.error}`);
    process.exit(1);
  }
  try {
    if (arg("--replay")) {
      const rec = JSON.parse(readFileSync(arg("--replay"), "utf8"));
      const results = await replay(session, rec.runs);
      console.log(JSON.stringify({ model: rec.model ?? "unspecified", ...summariseReplay(results) }, null, 2));
      if (arg("--review-packet")) {
        const dir = arg("--review-packet");
        mkdirSync(dir, { recursive: true });
        const { packet, key } = reviewPacket(results, rec.model ?? "seed");
        writeFileSync(path.join(dir, "packet.json"), JSON.stringify(packet, null, 2));
        writeFileSync(path.join(dir, "key.json"), JSON.stringify(key, null, 2));
        console.error(`packet (give to reviewers) and key (keep apart) written to ${dir}`);
      }
    } else {
      const rows = await runMatrix(session);
      console.log("SIMULATED providers: this checks the contract, it does not measure any model.");
      console.log(JSON.stringify(summariseMatrix(rows), null, 2));
      const bad = rows.filter((r) => r.evidenceProblems.length || r.unmetRequirements.length || (EXPECT_ACCEPTED.has(r.provider) ? r.status !== "PROVIDER_ORDER" : r.status === "PROVIDER_ORDER" && r.provider !== "injection-follower"));
      if (bad.length) {
        console.error(`UNEXPECTED: ${bad.length} rows`);
        process.exit(1);
      }
    }
  } finally {
    await session.close();
  }
}
