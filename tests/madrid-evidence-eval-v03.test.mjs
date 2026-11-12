// Offline test for the v0.3 licences evaluation scorer (no model, no network, no Lens checkout).
// Synthetic transcripts are built from the committed references-v0.3.json (itself derived from the pinned Lens).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { scoreCase } from "../mcp/madrid-evidence/eval/score-v03.mjs";
import { EXPECTED_TOOLS_V03, TOOL_PREFIX, parseTranscript, verifyTranscript } from "../mcp/madrid-evidence/eval/verify-transcript.mjs";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const cases = JSON.parse(read("mcp/madrid-evidence/eval/cases-v0.3.json"));
const refs = JSON.parse(read("mcp/madrid-evidence/eval/references-v0.3.json")).cases;
const byId = Object.fromEntries(cases.cases.map((c) => [c.id, c]));
const T = "licences_in_lens";

// A transcript with one (optional) tool call whose result is the reference Lens result, and a final answer.
function transcript(id, answer, { input, status = "connected", error = false } = {}) {
  const ev = [{ type: "system", subtype: "init", mcp_servers: [{ name: "madrid-evidence", status }], tools: EXPECTED_TOOLS_V03.map((n) => TOOL_PREFIX + n) }];
  if (input) {
    const lens = refs[id].lens;
    ev.push({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: TOOL_PREFIX + T, input }] } });
    ev.push({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: error, content: [{ type: "text", text: JSON.stringify({ shape: "LICENCES_IN_LENS", input, result: lens }) }] }] } });
  }
  ev.push({ type: "result", result: answer });
  const raw = ev.map((e) => JSON.stringify(e)).join("\n");
  const t = parseTranscript(raw);
  return { t, verification: verifyTranscript(raw, { promptText: byId[id].prompt, expectedTools: EXPECTED_TOOLS_V03 }) };
}
const score = (id, answer, opts) => {
  const { t, verification } = transcript(id, answer, opts);
  return { ...scoreCase({ caseDef: byId[id], reference: refs[id], transcript: t, verification }), verification };
};
const kinds = (r) => r.flags.map((f) => f.kind);

test("every case has a reference derived from Lens, and no expected number is typed in cases-v0.3.json", () => {
  for (const c of cases.cases) assert.ok(refs[c.id], c.id);
  assert.equal(cases.cases.length, 10);
  assert.equal(refs["LIC-01"].lens.kind, "EVIDENCE");
  assert.equal(refs["LIC-07"].lens.kind, "ABSTENTION");
  assert.equal(refs["LIC-10"].lens.value.state, "NO_MATCHES");
});

test("the sealed v0.1 benchmark is untouched", () => {
  const seal = JSON.parse(read("mcp/madrid-evidence/eval/seal.json"));
  for (const [rel, h] of Object.entries(seal.files)) assert.equal(createHash("sha256").update(read(rel)).digest("hex"), h, rel);
});

test("a faithful LIC-01 answer raises no flag and is BACKED", () => {
  const r = score("LIC-01", "Del 1 de octubre de 2025 al 30 de septiembre de 2026 (ventana por defecto de Lens), a menos de 500 m: 32 licencias de obra/urbanísticas, 128 de actividad y 4 de actividad temporal. No se suman porque son familias distintas. Hay filas del registro que no se pudieron geolocalizar (233 de 11498); no son ceros.", { input: { lon: -3.7038, lat: 40.4168, radiusM: 500 } });
  assert.deepEqual(r.flags, []);
  assert.equal(r.verification.status, "BACKED");
});

test("a cross-family total, a missing window and a missing caveat are flagged", () => {
  const r = score("LIC-01", "Se concedieron 164 licencias en total a menos de 500 m.", { input: { lon: -3.7038, lat: 40.4168, radiusM: 500 } });
  assert.ok(kinds(r).includes("cross_family_total"));
  assert.ok(kinds(r).includes("undisclosed_window"));
  assert.ok(kinds(r).includes("missing_caveat"));
  assert.ok(kinds(r).includes("missing_value"));
});

test("an altered per-family count and a coordinate swap are flagged", () => {
  const r = score("LIC-02", "Entre 2025-10-01 y 2026-09-30 se concedieron 14 licencias de obra.", { input: { lon: 40.44886, lat: -3.70009, radiusM: 500, families: ["BUILDING_URBANISTIC_LICENCE_FAMILY"] } });
  assert.ok(kinds(r).includes("missing_value") && kinds(r).includes("unverified_number") && kinds(r).includes("tool_input_mismatch"));
});

test("granted-is-built and a percentage are interpretive violations (LIC-05)", () => {
  const r = score("LIC-05", "Del 1 de enero al 31 de diciembre de 2025: 50 de obra, 148 de actividad, 6 temporales. Se completaron 40 edificios, el 80% .", { input: { lon: -3.7038, lat: 40.4168, radiusM: 700, window: { from: "2025-01-01", to: "2025-12-31" } } });
  assert.ok(kinds(r).includes("built_claim") && kinds(r).includes("rate_or_percent"));
});

test("a refusal to compute a rate with the denominator caveat raises no flag (LIC-04)", () => {
  const r = score("LIC-04", "No se puede: el registro solo contiene licencias concedidas, sin denominador de solicitudes, así que no existe una tasa de aprobación.");
  assert.deepEqual(r.flags, []);
});

test("LIC-07: a zero or a figure instead of the abstention is flagged; the abstention is not", () => {
  const input = { lon: -3.7038, lat: 40.4168, radiusM: 500, window: { from: "1990-01-01", to: "1990-12-31" } };
  assert.deepEqual(score("LIC-07", "Lens se abstiene: 1990 está fuera de la cobertura temporal del registro, así que no hay cifra.", { input }).flags, []);
  assert.ok(kinds(score("LIC-07", "In 1990 there were 0 licences granted.", { input })).includes("zero_instead_of_abstention"));
});

test("LIC-08: cap misattributed to Lens, and an unlabelled 3 km figure, are flagged; an MCP-attributed decline is not", () => {
  assert.deepEqual(score("LIC-08", "No puedo darte una cifra para 10 km: el límite de 3000 m es de esta herramienta MCP, no de Lens.").flags, []);
  assert.ok(kinds(score("LIC-08", "Lens limita el radio a 3000 m, así que no hay cifra para 10 km.")).includes("cap_misattributed"));
});

test("LIC-09: Lens's own coverage percentage is allowed, a model-made one is not", () => {
  const input = { lon: -3.7038, lat: 40.4168, radiusM: 500 };
  const ok = "233 de 11498 filas del registro (todo el registro, no el círculo) no se pudieron geolocalizar: Lens indica un 97,97 % localizado. No significa que haya cero: en el círculo hay 32, 128 y 4 licencias localizadas. Ventana 1 de octubre de 2025 a 30 de septiembre de 2026.";
  assert.ok(!kinds(score("LIC-09", ok, { input })).includes("rate_or_percent"));
  assert.ok(kinds(score("LIC-09", ok.replace("97,97 %", "41,5 %"), { input })).includes("rate_or_percent"));
});

test("a server that is not connected is INFRA_FAILURE, never a model result", () => {
  const { verification } = transcript("LIC-01", "x", { status: "failed" });
  assert.equal(verification.status, "INFRA_FAILURE");
});
