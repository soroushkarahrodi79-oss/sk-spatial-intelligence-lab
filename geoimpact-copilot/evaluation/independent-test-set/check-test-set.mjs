#!/usr/bin/env node
// Validates the independent test-set manifest. Read-only.
//
// The committed manifest says "not_established" and must stay internally honest: zero cases, no
// reviewer, no seal. When a person later establishes a set, this check refuses a manifest whose
// seal, labellers, reviewers, independence declarations or leakage rules do not hold. It cannot
// prove that a labeller is independent; it can only refuse a manifest that does not claim it.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { reviewerIdentityProblems } from "../../lib/review.mjs";
import { DIVERSITY_TARGET, knownSyntheticCorpus } from "../external/intake.mjs";

// A case is one genuine report with its labelled questions. The manifest cannot lower these numbers.
// A pilot can show that an experiment is feasible and what it costs; only a release_gate set can set a threshold.
export const MINIMUMS = { pilot: { cases: DIVERSITY_TARGET.minimum_reports, labels_per_case: 10 }, release_gate: { cases: 300, labels_per_case: 10 } };
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const realDate = (text) => typeof text === "string" && /^\d{4}-\d{2}-\d{2}$/.test(text) && new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;

/** The seal is a digest over every case's report digest, questions and labels, so any later edit is visible. */
export function sealDigest(cases) {
  return sha256(JSON.stringify([...cases].map((item) => ({ report_sha256: item.report_sha256, report_canonical_sha256: item.report_canonical_sha256, labels: item.labels })).sort((a, b) => a.report_sha256.localeCompare(b.report_sha256))));
}

export async function manifestProblems(manifest, { now = new Date().toISOString().slice(0, 10), known = null } = {}) {
  const problems = [];
  if (manifest?.schema !== "geoimpact-independent-test-set/1") return ["schema must be geoimpact-independent-test-set/1"];
  const cases = Array.isArray(manifest.cases) ? manifest.cases : null;
  if (!cases) return ["cases must be an array"];

  if (manifest.status === "not_established") {
    if (cases.length) problems.push("a set that is not established must hold no cases");
    if (manifest.sealed !== false) problems.push("a set that is not established cannot be sealed");
    if (manifest.purpose !== undefined && manifest.purpose !== null) problems.push("purpose must be null while the set is not established");
    for (const field of ["sealed_on", "sealed_by", "seal_digest", "first_model_run_on"]) if (manifest[field] !== null) problems.push(`${field} must be null while the set is not established`);
    if (manifest.human_review?.status !== "not_started" || (manifest.human_review?.reviewers ?? []).length) problems.push("human_review must be not_started with no reviewers while the set is not established");
    return problems;
  }
  if (manifest.status !== "established") return ["status must be not_established or established"];

  known ??= await knownSyntheticCorpus();
  if (manifest.sealed !== true) problems.push("an established set must be sealed");
  if (!realDate(manifest.sealed_on) || manifest.sealed_on > now) problems.push("sealed_on must be a real date that is not in the future");
  problems.push(...reviewerIdentityProblems(manifest.sealed_by).map((problem) => `sealed_by: ${problem}`));
  if (manifest.seal_digest !== sealDigest(cases)) problems.push("seal_digest does not match the cases: the set was changed after it was sealed");
  if (manifest.first_model_run_on !== null && !(realDate(manifest.first_model_run_on) && manifest.sealed_on < manifest.first_model_run_on)) problems.push("the set must be sealed strictly before the first model run");
  const minimum = MINIMUMS[manifest.purpose];
  if (!minimum) problems.push("purpose must be pilot or release_gate");
  if (manifest.minimum_cases_for_model_gate !== MINIMUMS.release_gate.cases) problems.push(`minimum_cases_for_model_gate must stay ${MINIMUMS.release_gate.cases}`);
  if (minimum && cases.length < minimum.cases) problems.push(`${cases.length} cases is below the ${minimum.cases} required for a ${manifest.purpose} set`);
  if (manifest.purpose === "pilot" && manifest.thresholds_may_be_set === true) problems.push("a pilot set cannot be used to set thresholds");
  const count = (key, value) => cases.filter((item) => item?.diversity?.[key] === value).length;
  if (minimum) {
    const target = DIVERSITY_TARGET;
    const met = ["4", "5"].every((v) => count("report_version", v) >= target.minimum_per_version) && ["PASS", "BLOCK"].every((v) => count("verdict", v) >= target.minimum_per_verdict) && target.size_classes.every((size) => count("size_class", size) >= 1) && new Set(cases.map((item) => item?.diversity?.region)).size >= target.minimum_distinct_regions;
    if (!met) problems.push("the cases do not meet the diversity target (both versions, both verdicts, three sizes, three regions)");
  }

  const seen = new Set();
  const ids = new Set();
  for (const item of cases) {
    const name = item?.case_id ?? "?";
    if (!item?.case_id || ids.has(item.case_id)) problems.push(`${name}: case_id missing or duplicated`);
    ids.add(item?.case_id);
    for (const field of ["report_sha256", "report_canonical_sha256"]) if (!/^[a-f0-9]{64}$/.test(item?.[field] ?? "")) problems.push(`${name}: ${field} must be a SHA-256`);
    if (seen.has(item?.report_canonical_sha256)) problems.push(`${name}: the same report appears twice`);
    seen.add(item?.report_canonical_sha256);
    // Leakage: no report the repository ships or generates, and none used to build the vocabulary.
    if (known.raw.has(item?.report_sha256) || known.canonical.has(item?.report_canonical_sha256)) problems.push(`${name}: report is in the development corpus (leakage)`);
    if (item?.intake_status !== "admitted") problems.push(`${name}: report has not been admitted by the intake check`);
    if (item?.third_party_model_permitted !== true) problems.push(`${name}: rights do not permit sending this report to a third-party model`);
    if (!Array.isArray(item?.labels) || item.labels.length === 0) { problems.push(`${name}: no labels`); continue; }
    if (minimum && item.labels.length < minimum.labels_per_case) problems.push(`${name}: ${item.labels.length} labels, at least ${minimum.labels_per_case} required`);
    if (new Set(item.labels.map((label) => label?.question)).size !== item.labels.length) problems.push(`${name}: duplicate questions`);
    for (const label of item.labels) {
      if (!label?.question || !["ANSWER", "ABSTAIN"].includes(label.expected_decision)) problems.push(`${name}: a label lacks a question or a decision`);
      problems.push(...reviewerIdentityProblems(label?.labelled_by).map((problem) => `${name}: labelled_by: ${problem}`));
      if (label?.independent_of_author !== true) problems.push(`${name}: the labeller does not declare independence from the code's author`);
      if (label?.saw_copilot_or_model_output !== false) problems.push(`${name}: the labeller must attest they did not see copilot or model output`);
      if (!realDate(label?.labelled_on) || label.labelled_on > manifest.sealed_on) problems.push(`${name}: labelled_on must be a real date no later than sealed_on`);
    }
  }
  const review = manifest.human_review ?? {};
  if (review.status !== "reviewed") problems.push("human_review.status must be reviewed for an established set");
  if (!(review.reviewers?.length >= 2)) problems.push("an established set needs a second reviewer");
  for (const reviewer of review.reviewers ?? []) problems.push(...reviewerIdentityProblems(reviewer).map((problem) => `reviewer: ${problem}`));
  if (!(review.second_reviewer_sample_fraction >= 0.2)) problems.push("a second reviewer must label at least 20% of cases (stratified)");
  if (typeof review.disagreement_rate !== "number") problems.push("the disagreement rate must be reported");
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1].replaceAll("\\", "/")}`))) {
  const manifest = JSON.parse(await readFile(new URL("./manifest.json", import.meta.url), "utf8"));
  const problems = await manifestProblems(manifest);
  process.stdout.write(`${JSON.stringify({ status: manifest.status, cases: manifest.cases.length, human_review: manifest.human_review.status, problems }, null, 2)}\n`);
  process.exitCode = problems.length ? 1 : 0;
}
