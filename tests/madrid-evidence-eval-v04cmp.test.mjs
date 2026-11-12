// Offline test for the v0.3 -> v0.4 comparison protocol. No model, no network, no Lens checkout, no MCP server.
// It checks the preregistered protocol files, the reproducible schedule, the decision rules, the blind packets'
// anonymity and the separation of system faults from model errors, using synthetic transcripts.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { blindIds, checkAll, decide, inputValid, schedule, summarize, systemFaults, toolUseOf, validateAdjudication } from "../mcp/madrid-evidence/eval/eval-v04cmp.mjs";
import { EXPECTED_TOOLS_V03, TOOL_PREFIX } from "../mcp/madrid-evidence/eval/verify-transcript.mjs";

const read = (rel) => JSON.parse(readFileSync(new URL(`../mcp/madrid-evidence/eval/${rel}`, import.meta.url), "utf8"));
const cases = read("cases-v0.4cmp.json");
const refs = read("references-v0.4cmp.json").cases;
const ids = cases.cases.map((c) => c.id);

test("the protocol files pass every deterministic check", () => {
  const failed = checkAll().filter((r) => !r.pass);
  assert.deepEqual(failed, []);
});

test("schedule: reproducible from the seed, 40 runs, balanced, and different for another seed", () => {
  const a = schedule(ids, cases.protocol.seed, 2), b = schedule(ids, cases.protocol.seed, 2), c = schedule(ids, "another seed", 2);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((r) => r.key), c.map((r) => r.key));
  assert.equal(a.length, 40);
  assert.equal(a.filter((r, i) => i % 2 === 0 && r.arm === "v03").length, 10);
  assert.equal(new Set(a.map((r) => r.key)).size, 40);
});

test("blind ids: unique, anonymous, and the mapping is a bijection", () => {
  const keys = schedule(ids, cases.protocol.seed, 2).map((r) => r.key);
  const m = blindIds(keys, cases.protocol.seed);
  assert.equal(new Set(Object.values(m)).size, 40);
  for (const v of Object.values(m)) assert.match(v, /^B\d{2}$/);
  assert.notEqual(Object.values(m).join(), keys.join());
});

test("decision rules: technical validity, conclusiveness, regressions, critical errors and unsupported local attributions", () => {
  const r = cases.decisionRules, arm = { critical: 0, criticalCases: [], severe: [], regFail: [], localUnsupported: 0 };
  const s = (a, b, extra = {}) => ({ v03: { ...arm, ...a }, v04: { ...arm, ...b }, validPairs: 20, uncoveredCases: [], ...extra });
  const v = (x, tech) => decide(x, r, tech).verdict;
  assert.equal(v(s({}, {})), "GO");
  const improved = decide(s({ critical: 3, criticalCases: ["S1", "S3"] }, {}), r);
  assert.deepEqual([improved.verdict, improved.improvedCases, improved.worsenedCases], ["GO", ["S1", "S3"], []], "improvement is an observation, not a verdict input");
  assert.equal(v(s({}, { critical: 1, criticalCases: ["B1"] })), "MODIFY");
  assert.equal(v(s({}, { localUnsupported: 1 })), "MODIFY", "a true-but-unsupported local attribution prevents GO");
  assert.equal(v(s({ regFail: ["R1"] }, { regFail: ["R1"] })), "MODIFY", "a pre-existing regression still prevents GO");
  assert.equal(v(s({}, { regFail: ["R4"] })), "HOLD", "new regression");
  assert.equal(v(s({}, { regFail: ["R1"] })), "HOLD", "R1 is an independent criterion");
  assert.equal(v(s({ regFail: ["R4"] }, { regFail: ["R1"] })), "HOLD", "R1 is new even if R4 failed in v0.3");
  assert.equal(v(s({}, { critical: 1, criticalCases: ["C1"], severe: ["C1"] })), "HOLD", "E1/E2/E9 in v0.4 and none in v0.3");
  assert.equal(v(s({ severe: ["C1"] }, { critical: 1, criticalCases: ["C1"], severe: ["C1"] })), "MODIFY", "not new");
  assert.equal(decide(s({}, {}, { validPairs: 18 }), r).verdict, "GO", "18 valid pairs are enough");
  const inc = decide(s({}, {}, { validPairs: 17 }), r);
  assert.deepEqual([inc.verdict, inc.conclusive], ["INCONCLUSIVE", false]);
  assert.equal(v(s({}, { critical: 2, criticalCases: ["B1"] }, { validPairs: 17 })), "INCONCLUSIVE", "takes precedence over MODIFY");
  assert.equal(v(s({}, {}, { uncoveredCases: ["R1"] })), "INCONCLUSIVE", "a case without a valid pair");
  const tech = decide(s({}, {}), r, ["system fault"]);
  assert.deepEqual([tech.verdict, tech.kind, tech.conclusive], ["HOLD", "technical", false]);
  assert.deepEqual(Object.keys(r.thresholds).sort(), ["minValidPairs", "pairsPlanned"], "no arbitrary difference threshold is left");
});

// A transcript with one licences_in_lens call; `result` is the tool result payload.
const transcript = (input, result, { isError = false } = {}) => [
  { type: "system", subtype: "init", mcp_servers: [{ name: "madrid-evidence", status: "connected" }], tools: EXPECTED_TOOLS_V03.map((n) => TOOL_PREFIX + n) },
  { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: `${TOOL_PREFIX}licences_in_lens`, input }] } },
  { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: isError, content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }] }] } },
  { type: "result", result: "answer" },
].map((e) => JSON.stringify(e)).join("\n");

test("system faults are separated from model errors", () => {
  const input = cases.cases.find((c) => c.id === "S3").params, lens = refs.S3.lens, comp = refs.T1.typesByFamily;
  const lensQuery = () => lens;
  const v3 = { shape: "LICENCES_IN_LENS", result: lens }, v4 = { ...v3, registerComposition: { typesByFamily: comp } };
  assert.deepEqual(systemFaults(transcript(input, v3), "v03", { lensQuery, composition: comp }), []);
  assert.deepEqual(systemFaults(transcript(input, v4), "v04", { lensQuery, composition: comp }), []);
  assert.match(systemFaults(transcript(input, v4), "v03", { lensQuery })[0], /present in the v0\.3 arm/);
  assert.match(systemFaults(transcript(input, v3), "v04", { lensQuery, composition: comp })[0], /missing in the v0\.4 arm/);
  assert.match(systemFaults(transcript(input, { ...v4, registerComposition: { typesByFamily: { X: ["y"] } } }), "v04", { lensQuery, composition: comp })[0], /differs from the artifact/);
  assert.match(systemFaults(transcript(input, { ...v3, result: { ...lens, kind: "ABSTENTION" } }), "v03", { lensQuery })[0], /differs from a direct Lens query/);
  assert.match(systemFaults(transcript(input, "not json"), "v03", {})[0], /unparsable/);
  assert.match(systemFaults(transcript(input, "boom", { isError: true }), "v03", {})[0], /schema-valid input/, "server error on a valid input is a system fault");
  assert.deepEqual(systemFaults(transcript({ ...input, radiusM: 5000 }, "radius too big", { isError: true }), "v03", {}), [], "rejection of an invalid model input is a model tool-use deviation");
});

test("inputValid mirrors the server schema limits used to classify errors", () => {
  assert.equal(inputValid({ lon: -3.7, lat: 40.4, radiusM: 3000 }), true);
  for (const bad of [{ lon: -3.7, lat: 40.4, radiusM: 3001 }, { lon: -3.7, lat: 40.4 }, { lon: -3.7, lat: 40.4, radiusM: 100, families: [] }, { lon: -3.7, lat: 40.4, radiusM: 100, families: ["X"] }, { lon: -3.7, lat: 40.4, radiusM: 100, window: { from: "2025-01-01" } }, { lon: -3.7, lat: 40.4, radiusM: 100, extra: 1 }]) assert.equal(inputValid(bad), false, JSON.stringify(bad));
});

const A = (verdict, errors = [], extra = {}) => ({ verdict, errors, ...extra });
const mkKey = () => {
  const k = {}, add = (bid, c, pair, arm, status = "VALID") => (k[bid] = { run: `${bid}-${c}-${arm}`, case: c, rep: 1, pair, arm, status, ...(status === "VALID" ? { toolUse: { licencesCalls: 1, registerCompositionInResult: arm === "v04" } } : {}) });
  add("B01", "C1", 1, "v03"); add("B02", "C1", 1, "v04");
  add("B03", "S1", 2, "v03"); add("B04", "S1", 2, "v04", "INFRA_FAILURE");
  add("B05", "B2", 3, "v03"); add("B06", "B2", 3, "v04");
  add("B07", "C2", 4, "v03"); add("B08", "C2", 4, "v04");
  return k;
};

test("summarize: run and pair states are explicit and no record of an incomplete pair is dropped", () => {
  const key = mkKey();
  const entries = {
    B01: A("fail", ["E1"], { claim: "FALSE" }), B02: A("pass", [], { claim: "SUPPORTED" }),
    B03: A("fail", ["E6"]),                                  // critical error in a run whose pair is EXCLUDED
    B06: A("pass"),                                          // B05 (its pair partner) is not adjudicated: PENDING
    B07: A("pass", [], { claim: "SUPPORTED" }), B08: A("pass", [], { claim: "TRUE_UNSUPPORTED", unsupported: true }),
  };
  const s = summarize(key, { entries }, cases.criticalClasses, cases.decisionRules);
  assert.deepEqual(s.pairStates, { VALID: 2, EXCLUDED: 1, PENDING: 1 });
  assert.deepEqual(s.runStates, { ADJUDICATED_ERROR: 2, ADJUDICATED_OK: 4, INFRA_FAILURE: 1, VALID_UNADJUDICATED: 1 });
  assert.equal(s.runs.length, 8, "every scheduled run stays in the records");
  assert.equal(s.runs.find((r) => r.bid === "B03").adjudication.errors[0], "E6", "the critical error of the excluded pair is kept");
  assert.equal(s.runs.find((r) => r.bid === "B04").state, "INFRA_FAILURE");
  assert.ok(s.pending.includes("B03"), "a critical error in an excluded pair still needs the user");
  assert.deepEqual(s.unadjudicated, ["B05"]);
  assert.equal(s.validPairs, 2);
  assert.deepEqual(s.uncoveredCases.sort(), ["B2", "S1"]);
  assert.deepEqual([s.v03.critical, s.v04.critical], [1, 0], "only VALID pairs enter the arm counts (B03 does not)");
  assert.equal(s.v04.localUnsupported, 1, "C2 true-but-unsupported is a local unsupported attribution");
  assert.deepEqual(s.discordantPairs, [1]);
  assert.deepEqual(s.v03.toolUse, { runsWithLicencesCall: 2, runsWithRegisterCompositionSeen: 0 });
  assert.deepEqual(s.v04.toolUse, { runsWithLicencesCall: 2, runsWithRegisterCompositionSeen: 2 }, "tool use is a covariate, separate from correctness");
  entries.B01.user = { reviewed: true, verdict: "pass", errors: [], claim: "TRUE_UNSUPPORTED", unsupported: true };
  entries.B03.user = { reviewed: true, verdict: "fail", errors: ["E6"] };
  const s2 = summarize(key, { entries }, cases.criticalClasses, cases.decisionRules);
  assert.equal(s2.v03.critical, 0, "the user's review overrides the first reader");
  assert.deepEqual(s2.pending, [], "reviewed items leave nothing pending");
});

test("adjudication validation: claims in T2/C1/C2, readers and runs without a result", () => {
  const key = mkKey(), ok = { reader: "GPT-6", readerIsHuman: false, entries: { B01: A("pass", [], { claim: "SUPPORTED" }) } };
  assert.deepEqual(validateAdjudication(key, ok, cases), []);
  const bad = (entries, extra = {}) => validateAdjudication(key, { reader: "GPT-6", readerIsHuman: false, entries, ...extra }, cases).join(" | ");
  assert.match(bad({ B01: A("pass") }), /claim must be one of/);
  assert.match(bad({ B01: A("fail", ["E6"], { claim: "FALSE" }) }), /FALSE claim needs E1 or E5/);
  assert.match(bad({ B01: A("pass", [], { claim: "TRUE_UNSUPPORTED" }) }), /needs unsupported=true/);
  assert.match(bad({ B01: A("pass", [], { claim: "SUPPORTED", unsupported: true }) }), /conflicts/);
  assert.match(bad({ B04: A("pass") }), /INFRA_FAILURE, nothing to adjudicate/);
  assert.match(bad({ B03: A("maybe") }), /pass or fail/);
  assert.match(bad({ B99: A("pass") }), /not in the key/);
  assert.match(validateAdjudication(key, { entries: {} }, cases).join(), /reader/);
  assert.deepEqual(validateAdjudication(key, { reader: "GPT-6", readerIsHuman: false, entries: { B03: A("fail", ["E6"]) } }, cases), [], "no claim is required outside T2, C1 and C2");
});

test("tool use is recorded as a covariate and a call does not equal support", () => {
  const input = cases.cases.find((c) => c.id === "S3").params, lens = refs.S3.lens;
  const withComp = toolUseOf(transcript(input, { shape: "LICENCES_IN_LENS", result: lens, registerComposition: { typesByFamily: refs.T1.typesByFamily } }));
  const without = toolUseOf(transcript(input, { shape: "LICENCES_IN_LENS", result: lens }));
  assert.deepEqual([withComp.licencesCalls, withComp.registerCompositionInResult], [1, true]);
  assert.deepEqual([without.licencesCalls, without.registerCompositionInResult], [1, false], "a call without the composition in its result supports no claim about types");
  assert.deepEqual(toolUseOf(transcript(input, "boom", { isError: true })).licencesResultsOk, 0);
});
