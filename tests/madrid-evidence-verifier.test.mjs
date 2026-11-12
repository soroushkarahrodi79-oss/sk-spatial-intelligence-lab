// Offline test for the Madrid Evidence MCP transcript verifier (v0.2).
// Synthetic stream-json transcripts only: no model, no Lens checkout, no network.
//   npm run test:madrid-verifier

import assert from "node:assert/strict";
import test from "node:test";
import { preflight, retryOnInfraFailure, verifyTranscript, EXPECTED_TOOLS, TOOL_PREFIX } from "../mcp/madrid-evidence/eval/verify-transcript.mjs";

const TOOLS = EXPECTED_TOOLS.map((n) => TOOL_PREFIX + n);
const init = (status = "connected", tools = TOOLS) => ({ type: "system", subtype: "init", mcp_servers: [{ name: "madrid-evidence", status }], tools });
const call = (id, name, input) => ({ type: "assistant", message: { content: [{ type: "tool_use", id, name: TOOL_PREFIX + name, input }] } });
const result = (id, payload, isError = false) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error: isError, content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload) }] }] } });
const answer = (text) => ({ type: "result", result: text });
const jsonl = (...evs) => evs.map((e) => JSON.stringify(e)).join("\n");

const ABSTENTION = { shape: "AMBITO_AT_POINT", result: { kind: "ABSTENTION", reason: "NO_EVIDENCE_FOR_SCOPE" } };
const EVIDENCE = { shape: "AMBITO_AT_POINT", result: { kind: "EVIDENCE", value: { ambitoCode: "APE.05.30", surface: 1234.5 } } };

test("server failed + answer from memory is INFRA_FAILURE, not a model result (the MEV-10 repeat)", () => {
  const t = jsonl(init("failed", []), answer("No Madrid planning ámbito contains that point."));
  const v = verifyTranscript(t);
  assert.equal(v.status, "INFRA_FAILURE");
  assert.match(v.reason, /status=failed/);
});

test("preflight rejects missing init, absent server and missing tools", () => {
  assert.equal(preflight(null).ok, false);
  assert.equal(verifyTranscript(jsonl(answer("x"))).status, "INFRA_FAILURE");
  assert.equal(verifyTranscript(jsonl({ type: "system", subtype: "init", mcp_servers: [], tools: [] }, answer("x"))).status, "INFRA_FAILURE");
  assert.equal(verifyTranscript(jsonl(init("connected", TOOLS.slice(0, 2)), answer("x"))).status, "INFRA_FAILURE");
});

test("connected server, no call, Lens-dependent answer is UNBACKED", () => {
  const v = verifyTranscript(jsonl(init(), answer("Ningún ámbito de planeamiento contiene ese punto.")));
  assert.equal(v.status, "UNBACKED");
  assert.equal(v.backingCalls, 0);
});

test("connected server, no call, no Lens content is NO_LENS_CLAIM", () => {
  assert.equal(verifyTranscript(jsonl(init(), answer("Hola, ¿en qué puedo ayudar?"))).status, "NO_LENS_CLAIM");
});

test("successful call returning an abstention backs the answer", () => {
  const v = verifyTranscript(jsonl(init(), call("a", "ambito_at_point", { lon: 2.17, lat: 41.38 }), result("a", ABSTENTION), answer("Ningún ámbito contiene ese punto (NO_EVIDENCE_FOR_SCOPE).")));
  assert.equal(v.status, "BACKED");
  assert.equal(v.backingCalls, 1);
});

test("a rejected call (is_error) or a non-Lens payload does not back the answer", () => {
  const rejected = verifyTranscript(jsonl(init(), call("a", "ambito_at_point", { lon: 0, lat: 0 }), result("a", "Input validation error", true), answer("Ningún ámbito lo contiene.")));
  assert.equal(rejected.status, "UNBACKED");
  const junk = verifyTranscript(jsonl(init(), call("a", "ambito_at_point", {}), result("a", "not json"), answer("El ámbito es X.")));
  assert.equal(junk.status, "UNBACKED");
});

test("snapshot payload (ambitoAtPoint.kind) backs the answer", () => {
  const snap = { composition: ["AMBITO_AT_POINT"], ambitoAtPoint: { kind: "EVIDENCE", value: { ambitoCode: "APE.05.30" } } };
  const v = verifyTranscript(jsonl(init(), call("a", "ambito_snapshot_at_point", { lon: -3.7, lat: 40.4 }), result("a", snap), answer("El ámbito es APE.05.30.")));
  assert.equal(v.status, "BACKED");
});

test("a cited ámbito code absent from tool results and prompt makes the answer UNBACKED", () => {
  const t = jsonl(init(), call("a", "ambito_at_point", { lon: -3.7, lat: 40.4 }), result("a", EVIDENCE), answer("Es APE.05.30 y también APE.99.99."));
  const v = verifyTranscript(t);
  assert.equal(v.status, "UNBACKED");
  assert.deepEqual(v.unsupportedCodes, ["APE.99.99"]);
  // A code that the prompt itself supplied is not an invention; a sentence-final dot is not part of the code.
  assert.equal(verifyTranscript(t, { promptText: "¿Y APE.99.99?" }).status, "BACKED");
  assert.equal(verifyTranscript(jsonl(init(), call("a", "ambito_at_point", {}), result("a", EVIDENCE), answer("Es APE.05.30."))).status, "BACKED");
});

test("requireServer:false (baseline arm) skips the preflight", () => {
  assert.equal(verifyTranscript(jsonl(answer("Hola")), { requireServer: false }).status, "NO_LENS_CLAIM");
  assert.equal(verifyTranscript(jsonl(answer("El ámbito es X")), { requireServer: false }).status, "UNBACKED");
});

test("retry: when every attempt fails the last one is returned as INFRA_FAILURE after max attempts", async () => {
  const failed = { stdout: jsonl(init("failed", []), answer("No Madrid planning ámbito contains that point.")), stderr: "" };
  let calls = 0;
  const seen = [];
  const r = await retryOnInfraFailure(async () => { calls++; return failed; }, { max: 3, onFailure: (n) => seen.push(n) });
  assert.equal(calls, 3);
  assert.equal(r.attempts, 3);
  assert.equal(r.verdict.status, "INFRA_FAILURE");
  assert.deepEqual(seen, [1, 2, 3]);
});

test("retry: stops at the first connected attempt and does not retry an UNBACKED answer", async () => {
  const bad = { stdout: jsonl(init("failed", []), answer("x")), stderr: "" };
  const good = { stdout: jsonl(init(), call("a", "ambito_at_point", {}), result("a", ABSTENTION), answer("Ningún ámbito.")), stderr: "" };
  let n = 0;
  const r = await retryOnInfraFailure(async () => (++n === 1 ? bad : good), { max: 3 });
  assert.equal(r.attempts, 2);
  assert.equal(r.verdict.status, "BACKED");
  let m = 0;
  const u = await retryOnInfraFailure(async () => { m++; return { stdout: jsonl(init(), answer("Ningún ámbito contiene ese punto.")), stderr: "" }; }, { max: 3 });
  assert.equal(m, 1);
  assert.equal(u.verdict.status, "UNBACKED");
});

test("malformed lines are ignored", () => {
  const t = `garbage\n${jsonl(init(), call("a", "ambito_at_point", {}), result("a", ABSTENTION), answer("Ningún ámbito."))}\n{broken`;
  assert.equal(verifyTranscript(t).status, "BACKED");
});
