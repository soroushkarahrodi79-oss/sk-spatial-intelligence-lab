import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { answerQuestion } from "./lib/answer.mjs";
import { loadReportFile, validateReportObject } from "./lib/report.mjs";
import { verifyAnswerEvidence } from "./lib/evidence.mjs";

const here = new URL(".", import.meta.url);
const cases = JSON.parse(await readFile(new URL("./evaluation/cases.json", here), "utf8"));
const reportCache = new Map();
const results = [];

for (const item of cases.cases) {
  const path = fileURLToPath(new URL(`./fixtures/${item.fixture}`, here));
  if (!reportCache.has(path)) reportCache.set(path, await loadReportFile(path));
  let report = reportCache.get(path);
  if (item.inject_report_string) {
    const injected = structuredClone(report);
    injected.relationships[0].dependent_id = item.inject_report_string;
    injected.relationship_regressions[0].dependent_id = item.inject_report_string;
    report = validateReportObject(injected);
  }
  const answer = answerQuestion(report, item.question);
  assert.equal(answer.decision, item.decision, `${item.id}: outcome mismatch`);
  for (const text of item.contains ?? []) assert.ok(answer.answer.includes(text), `${item.id}: missing expected text ${JSON.stringify(text)}`);
  for (const text of item.not_contains ?? []) assert.ok(!answer.answer.includes(text), `${item.id}: contained forbidden text ${JSON.stringify(text)}`);
  verifyAnswerEvidence(answer, report);
  let gateMutationRejected = null;
  if (item.gate_mutation) {
    const altered = structuredClone(answer);
    const claim = altered.claims.find((candidate) => candidate.id === item.gate_mutation.claim_id);
    assert.ok(claim, `${item.id}: missing claim to mutate`);
    assert.ok(claim.text.includes(item.gate_mutation.find), `${item.id}: mutation target not found`);
    claim.text = claim.text.replace(item.gate_mutation.find, item.gate_mutation.replace);
    altered.answer = altered.claims.map((candidate) => candidate.text).join(" ");
    assert.throws(() => verifyAnswerEvidence(altered, report), new RegExp(item.gate_mutation.rejects), `${item.id}: evidence gate accepted a tampered claim`);
    gateMutationRejected = true;
  }
  const references = new Set(answer.claims.flatMap((claim) => claim.references.map((reference) =>
    reference.path ?? reference.id)));
  for (const expected of item.references ?? []) assert.ok(references.has(expected), `${item.id}: missing evidence reference ${expected}`);
  results.push({ id: item.id, category: item.category, result: "PASS", decision: answer.decision, evidence_references: references.size, gate_mutation_rejected: gateMutationRejected });
}

const categories = Object.fromEntries([...new Set(cases.cases.map((item) => item.category))].sort().map((category) => {
  const selected = results.filter((item) => item.category === category);
  return [category, { passed: selected.filter((item) => item.result === "PASS").length, total: selected.length }];
}));
const summary = {
  evaluation_version: cases.version,
  fixture_notice: cases.fixture_notice,
  deterministic_cases_passed: results.length,
  deterministic_cases_total: cases.cases.length,
  outcome_accuracy: results.filter((item) => item.result === "PASS").length / results.length,
  citation_checks: "all claims resolve to report pointers, exact cited literals, deterministic derived values, or identified source records; quantities are limited to report measurement/count evidence",
  categories,
  results
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
