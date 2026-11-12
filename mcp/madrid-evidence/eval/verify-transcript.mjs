// Transcript verifier for the Madrid Evidence MCP (v0.2). Pure functions, no I/O, no model.
//
// Principle: whether an answer is backed by Lens is a property of the transcript (did the MCP
// server connect, did a tool return Lens evidence or a Lens abstention), never of the model's
// prose. This does not make the model call the tool; it prevents a Lens-dependent answer from
// being presented as verified when no query supports it, and it separates an infrastructure
// failure (server not connected) from a model decision.
//
// BACKED means "a successful Lens query exists in this transcript and no cited ámbito code is
// missing from its results". It is NOT proof that every statement in the answer is correct or
// derived from that result; the model's prose can still add or distort claims.
//
// Limits: "Lens-dependent" is a lexical heuristic (default-deny: recall is incomplete and a
// conceptual question that mentions "ámbito" is labelled UNBACKED, which only means "not
// verified against Lens"). Backing is per answer, not per sentence; only ámbito codes are
// checked against the tool results. Cited figures are listed, not judged.
//
// Status:
//   INFRA_FAILURE  server not connected / tools missing / no init event: not a model result
//   BACKED         >=1 successful madrid-evidence tool result (EVIDENCE or ABSTENTION) and no
//                  cited ámbito code absent from the tool results
//   UNBACKED       Lens-dependent answer without such a result, or citing a code no result contains
//   NO_LENS_CLAIM  no backing, and nothing in the answer depends on Lens

import { allowedNumbersFrom, norm, numbersIn } from "./score.mjs";

export const SERVER = "madrid-evidence";
export const TOOL_PREFIX = `mcp__${SERVER}__`;
export const EXPECTED_TOOLS = ["ambito_at_point", "ambito_snapshot_at_point", "source_provenance"];
// v0.3 server: the same three plus licences_in_lens. A caller opts in with { expectedTools }; the default
// stays the three-tool set, so v0.1/v0.2 transcripts are verified exactly as before.
export const EXPECTED_TOOLS_V03 = [...EXPECTED_TOOLS, "licences_in_lens"];
// Added to LENS_TERMS only for a v0.3 run, so a historical answer that merely mentions licences keeps its status.
const LICENCE_TERMS = /licenc|licence|license|urban_licences/;

const CODE_RE = /\b[A-Z]{2,4}\.\d[\w.]*(?:[-/][A-Z0-9]+)*/g;
const LENS_TERMS = /ambito|no_evidence_for_scope|outside_source_universe|outside_temporal_coverage|source_registry|planning_ambito/;

const textOf = (content) =>
  typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join("") : "";

export function parseTranscript(text) {
  const t = { init: null, calls: [], answer: null };
  const byId = new Map();
  for (const line of String(text).split("\n")) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === "system" && ev.subtype === "init") {
      t.init = { servers: ev.mcp_servers ?? [], tools: ev.tools ?? [] };
    } else if (ev.type === "assistant") {
      for (const p of ev.message?.content ?? []) {
        if (p.type === "tool_use") { const c = { id: p.id, name: String(p.name), input: p.input, isError: false, resultText: null }; byId.set(p.id, c); t.calls.push(c); }
      }
    } else if (ev.type === "user") {
      for (const p of ev.message?.content ?? []) {
        if (p.type === "tool_result" && byId.has(p.tool_use_id)) { const c = byId.get(p.tool_use_id); c.isError = !!p.is_error; c.resultText = textOf(p.content); }
      }
    } else if (ev.type === "result") {
      t.answer = ev.result ?? null;
    }
  }
  return t;
}

// The server must be connected and expose all three tools before an answer counts as a model result.
export function preflight(init, expectedTools = EXPECTED_TOOLS) {
  if (!init) return { ok: false, reason: "no init event in transcript" };
  const s = init.servers.find((x) => x.name === SERVER);
  if (!s) return { ok: false, reason: `server ${SERVER} not listed` };
  if (s.status !== "connected") return { ok: false, reason: `server ${SERVER} status=${s.status}` };
  const missing = expectedTools.filter((n) => !init.tools.includes(TOOL_PREFIX + n));
  if (missing.length) return { ok: false, reason: `tools missing: ${missing.join(",")}` };
  return { ok: true, reason: null };
}

// A call backs an answer only if it succeeded and returned a Lens kind (evidence or abstention).
function backingOf(call) {
  if (!call.name.startsWith(TOOL_PREFIX) || call.isError || !call.resultText) return false;
  let p;
  try { p = JSON.parse(call.resultText); } catch { return false; }
  const kinds = [p?.result?.kind, p?.ambitoAtPoint?.kind];
  return kinds.some((k) => k === "EVIDENCE" || k === "ABSTENTION");
}

// Run `attemptFn` (async, returns { stdout, stderr }) until the transcript is not an INFRA_FAILURE or
// `max` attempts are used. The last attempt is always returned, with its verdict, so a persistent
// failure stays visible as INFRA_FAILURE and is never turned into a model result.
export async function retryOnInfraFailure(attemptFn, { max = 3, promptText = "", onFailure = () => {}, expectedTools = EXPECTED_TOOLS } = {}) {
  let last, verdict, attempts = 0;
  do {
    attempts++;
    last = await attemptFn(attempts);
    verdict = verifyTranscript(last.stdout, { promptText, expectedTools });
    if (verdict.status === "INFRA_FAILURE") onFailure(attempts, verdict);
  } while (verdict.status === "INFRA_FAILURE" && attempts < max);
  return { ...last, verdict, attempts };
}

export function verifyTranscript(input, { requireServer = true, promptText = "", expectedTools = EXPECTED_TOOLS } = {}) {
  const t = typeof input === "string" ? parseTranscript(input) : input;
  if (requireServer) {
    const pf = preflight(t.init, expectedTools);
    if (!pf.ok) return { status: "INFRA_FAILURE", reason: pf.reason, lensDependent: null, backingCalls: 0, unsupportedCodes: [], unsupportedNumbers: [] };
  }
  const answer = String(t.answer ?? "");
  const backing = t.calls.filter(backingOf);
  const licenceRun = expectedTools.includes("licences_in_lens");
  const lensDependent = LENS_TERMS.test(norm(answer)) || (licenceRun && LICENCE_TERMS.test(norm(answer))) || (answer.match(CODE_RE) ?? []).length > 0;
  const resultsText = backing.map((c) => c.resultText).join("\n");
  const codesIn = (s) => (s.match(CODE_RE) ?? []).map((c) => c.replace(/\.+$/, "")); // a sentence-final dot is not part of a code
  const known = new Set(codesIn(`${resultsText}\n${promptText}`));
  const unsupportedCodes = [...new Set(codesIn(answer).filter((c) => !known.has(c)))];
  const allowed = [...allowedNumbersFrom(resultsText, promptText)];
  const near = (a, b) => Math.abs(a - b) <= Math.max(0.005, Math.abs(b) * 0.0005) || (Number.isInteger(b) && Math.round(a) === b);
  const unsupportedNumbers = backing.length ? [...new Set(numbersIn(answer).filter((n) => !allowed.some((a) => near(n, a))))] : [];
  let status;
  if (backing.length) status = unsupportedCodes.length ? "UNBACKED" : "BACKED";
  else status = lensDependent ? "UNBACKED" : "NO_LENS_CLAIM";
  const reason = status === "UNBACKED" ? (backing.length ? `cites ámbito code(s) absent from tool results: ${unsupportedCodes.join(", ")}` : "Lens-dependent answer with no successful madrid-evidence result") : null;
  return { status, reason, lensDependent, backingCalls: backing.length, unsupportedCodes, unsupportedNumbers };
}
