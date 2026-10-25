#!/usr/bin/env node
// Reports whether the first Sonnet experiment may start. It never calls a model, reads a credential
// or opens a connection. It reads repository files only, and prints HOLD while any prerequisite is
// unmet. It exits 1 only when the prerequisites file is inconsistent or claims readiness it has not
// earned, so CI stays green while the honest answer is HOLD.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { answerQuestion } from "../lib/answer.mjs";
import { evaluateReview, committedRecordProblems } from "../lib/review.mjs";
import { manifestProblems } from "../evaluation/independent-test-set/check-test-set.mjs";
import { buildEvidencePack } from "./provider-contract.mjs";
import { allQuestions, collectReports } from "../semantic/build-skeletons.mjs";
import { buildReport, makeSpec } from "../evaluation/synthetic/generator.mjs";

const root = new URL("../../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));

export const secretPatterns = [
  { name: "Anthropic-style key", pattern: /sk-ant-[A-Za-z0-9_-]{8,}/ },
  { name: "API key assignment", pattern: /\b(ANTHROPIC|CLAUDE)_(API_)?KEY\s*[:=]/ },
  { name: "key read from the environment", pattern: /process\.env\.[A-Z0-9_]*(ANTHROPIC|CLAUDE|API_KEY)/ },
  { name: "model-vendor SDK import", pattern: /from\s+["']@anthropic-ai\/|require\(["']@anthropic-ai\/|import\s+Anthropic\b/ },
  { name: "provider endpoint in executable code", pattern: /api\.anthropic\.com/ },
  { name: "provider secret in a workflow", pattern: /secrets\.(ANTHROPIC|CLAUDE)/i }
];

/** Tracked executable files (code, scripts, workflows, package manifests) that contain a key pattern, SDK import or endpoint. Documentation, tests and the specifications that name these things are excluded on purpose. */
export function repositoryViolations() {
  const files = execFileSync("git", ["ls-files"], { cwd: fileURLToPath(root), encoding: "utf8" }).split("\n").filter(Boolean);
  const executable = files.filter((name) => /\.(mjs|js|cjs|ts|yml|yaml|html)$/.test(name) || name === "package.json" || name === "package-lock.json");
  const skip = (name) => name.startsWith("tests/") || name.startsWith("docs/") || name.startsWith("backups/") || name.startsWith("node_modules/") || name === "geoimpact-copilot/provider-contract/check-sonnet-prerequisites.mjs";
  const found = [];
  return Promise.all(executable.filter((name) => !skip(name)).map(async (name) => {
    const text = await readFile(new URL(name, root), "utf8").catch(() => "");
    for (const { name: label, pattern } of secretPatterns) if (pattern.test(text)) found.push(`${name}: ${label}`);
  })).then(() => found);
}

/** The same measurement documented in the prerequisites file, so the documented numbers cannot drift from the code. */
export async function measurePacks() {
  let answered = 0; let total = 0; let max = 0;
  for (const report of await collectReports()) {
    for (const question of allQuestions()) {
      const answer = answerQuestion(report, question);
      if (answer.decision !== "ANSWER") continue;
      const size = JSON.stringify(buildEvidencePack({ question, answer, report })).length;
      answered += 1; total += size; max = Math.max(max, size);
    }
  }
  const chars = {};
  for (const count of [3, 50]) {
    const report = buildReport(makeSpec(5, { report_version: "5", regression_count: count }));
    const answer = answerQuestion(report, "Which dependent assignment changed and what was before and after?");
    chars[count] = JSON.stringify(buildEvidencePack({ question: "q", answer, report })).length;
  }
  return { answered_packs: answered, mean_chars: Math.round(total / answered), max_chars: max, chars_by_regression_count: chars };
}

export const estimateInputTokens = (pack) => Math.ceil(Buffer.byteLength(JSON.stringify(pack), "utf8") / 3);

/** Consistency problems in the file itself, independent of repository state. */
export function specProblems(spec) {
  const problems = [];
  if (spec.live_calls_enabled !== false) problems.push("live_calls_enabled must be false");
  if (spec.experiment?.tier !== "A") problems.push("only tier A may be piloted");
  if (spec.experiment?.model_candidate !== spec.limits?.model_id_exact) problems.push("the model in the experiment and the limits must be the same exact id");
  const per = spec.limits?.per_request ?? {};
  const run = spec.limits?.per_run ?? {};
  for (const [name, value] of Object.entries({ max_input_tokens: per.max_input_tokens, max_output_tokens: per.max_output_tokens, max_claims: per.max_claims, max_requests: run.max_requests, max_total_input_tokens: run.max_total_input_tokens, max_total_output_tokens: run.max_total_output_tokens, hard_cost_cap_usd: run.hard_cost_cap_usd })) {
    if (!(Number.isFinite(value) && value > 0)) problems.push(`limit ${name} must be a positive number`);
  }
  if (run.max_requests * per.max_input_tokens < run.max_total_input_tokens) problems.push("max_total_input_tokens exceeds what max_requests could ever send; the cap would not bind");
  if (run.max_requests * per.max_output_tokens < run.max_total_output_tokens) problems.push("max_total_output_tokens exceeds what max_requests could ever receive; the cap would not bind");
  if (!(run.soft_stop_fraction_of_cap > 0 && run.soft_stop_fraction_of_cap < 1)) problems.push("soft_stop_fraction_of_cap must be between 0 and 1");
  for (const item of spec.thresholds?.zero_tolerance ?? []) if (item.allowed !== 0) problems.push(`zero-tolerance ${item.id} must allow 0`);
  for (const metric of spec.thresholds?.fidelity_metrics ?? []) if (["abstention_fidelity", "claim_preservation"].includes(metric.id) && metric.required !== 1.0) problems.push(`${metric.id} must require 1.0`);
  if ((spec.secret_controls ?? []).length < 9) problems.push("secret controls S1 to S9 must all be present");
  if (spec.limits?.status === "proposed" && spec.owner_approval?.owner_approved === true) problems.push("limits are still marked proposed but owner_approved is true");
  if (spec.owner_approval?.owner_approved === true) {
    const approval = spec.owner_approval;
    for (const field of ["approved_by", "approved_on", "price_per_million_input_tokens_usd", "price_per_million_output_tokens_usd", "price_source_url", "price_retrieved_on"]) if (approval[field] == null) problems.push(`owner_approval.${field} is required once approved`);
    const worst = (run.max_requests * (per.max_input_tokens * approval.price_per_million_input_tokens_usd + per.max_output_tokens * approval.price_per_million_output_tokens_usd)) / 1e6;
    if (!(worst <= run.hard_cost_cap_usd)) problems.push(`worst-case cost ${worst} exceeds the hard cap ${run.hard_cost_cap_usd}`);
  }
  return problems;
}

export async function assess() {
  const spec = await readJson("geoimpact-copilot/provider-contract/sonnet-experiment-prerequisites.json");
  const registry = await readJson("geoimpact-copilot/semantic/approved-skeletons.json");
  const record = await readJson("geoimpact-copilot/semantic/review-record.json");
  const labels = await readJson("geoimpact-copilot/evaluation/expected-answers.json");
  const testSet = await readJson("geoimpact-copilot/evaluation/independent-test-set/manifest.json");
  const review = evaluateReview(record, registry);
  const reviewProblems = [...review.problems, ...(review.state === "reviewed" ? committedRecordProblems(record) : [])];
  const violations = await repositoryViolations();
  const setProblems = await manifestProblems(testSet);
  const met = {
    review_record_reviewed: review.state === "reviewed" && reviewProblems.length === 0,
    labels_reviewed: labels.labeling?.human_review?.status === "reviewed" && labels.labeling.human_review.independent_of_author === true,
    // The repository never holds reports, so admitted-report evidence can only come from an established, sealed test set.
    intake_admitted: testSet.status === "established" && setProblems.length === 0 && testSet.cases.length >= 8,
    test_set_established: testSet.status === "established" && setProblems.length === 0,
    owner_approved: spec.owner_approval?.owner_approved === true && specProblems(spec).length === 0,
    secret_controls_signed_off: false,
    repository_clean: violations.length === 0,
    none: false
  };
  const unmet = spec.prerequisites.filter((item) => !met[item.automated_check]).map((item) => ({ id: item.id, title: item.title, automated_check: item.automated_check }));
  const consistency = specProblems(spec);
  if (violations.length) consistency.push(...violations.map((item) => `repository violation: ${item}`));
  if (spec.status === "ready" && unmet.length) consistency.push("status is ready while prerequisites are unmet");
  return { verdict: unmet.length === 0 && consistency.length === 0 ? "READY_FOR_OWNER_GO_DECISION" : "HOLD", unmet, consistency_problems: consistency, live_calls_enabled: spec.live_calls_enabled };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1].replaceAll("\\", "/")}`))) {
  const result = await assess();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.consistency_problems.length ? 1 : 0;
}
