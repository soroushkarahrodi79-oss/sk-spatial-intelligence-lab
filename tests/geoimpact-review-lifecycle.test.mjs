import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { answerQuestion } from "../geoimpact-copilot/lib/answer.mjs";
import { verifyAnswerEvidence } from "../geoimpact-copilot/lib/evidence.mjs";
import { loadReportFile } from "../geoimpact-copilot/lib/report.mjs";
import { assertReviewValid, currentEntryIds, entryId, evaluateReview, vocabularyDigest } from "../geoimpact-copilot/lib/review.mjs";
import { SEMANTIC_CONTRACT_VERSION } from "../geoimpact-copilot/lib/semantic.mjs";
import { gateFailures, runEvaluation } from "../geoimpact-copilot/evaluation/run-v2.mjs";
import { collectSkeletons } from "../geoimpact-copilot/semantic/build-skeletons.mjs";

const semantic = (name) => new URL(`../geoimpact-copilot/semantic/${name}`, import.meta.url);
const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));
const registry = await readJson(semantic("approved-skeletons.json"));
const committedRecord = await readJson(semantic("review-record.json"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Test-only reviewer. This is a fixture inside a test and is never written to the repository's record.
const approvalFor = (vocabulary, overrides = {}) => ({
  schema: "geoimpact-vocabulary-review-record/1",
  status: "reviewed",
  reviewed_by: "Test Fixture Reviewer (not a real person)",
  reviewed_on: "2026-01-02",
  content_digest: vocabularyDigest(vocabulary),
  contract_version: SEMANTIC_CONTRACT_VERSION,
  decisions: currentEntryIds(vocabulary).map((id) => ({ entry_id: id, decision: "Approve" })),
  ...overrides
});
const withEntry = (vocabulary, mutate) => {
  const copy = structuredClone(vocabulary);
  mutate(copy);
  return copy;
};

test("the committed record is an honest unreviewed state covering the current 52 entries", async () => {
  assert.equal(committedRecord.status, "unreviewed");
  for (const field of ["reviewed_by", "reviewed_on", "content_digest", "contract_version"]) assert.equal(committedRecord[field], null, field);
  assert.deepEqual(committedRecord.decisions, [], "no decision has been entered by anyone");
  assert.equal(evaluateReview(committedRecord, registry).state, "unreviewed");
  assert.equal(currentEntryIds(registry).length, 52);
  assert.equal(new Set(currentEntryIds(registry)).size, 52, "entry IDs are unique");
  const labels = await readJson(new URL("../geoimpact-copilot/evaluation/expected-answers.json", import.meta.url));
  assert.equal(labels.cases.length, 18);
  assert.ok(labels.cases.every((item) => item.human_review_status === "unreviewed"));
});

test("the generated vocabulary carries a digest but no review state and no approval", () => {
  assert.equal(registry.review, undefined);
  assert.equal(registry.content_digest, vocabularyDigest({ claims: registry.claims }));
});

test("both legitimate states are accepted: unreviewed, and reviewed with identity, date and a matching digest", () => {
  assert.equal(evaluateReview(committedRecord, registry).state, "unreviewed");
  const reviewed = approvalFor(registry);
  assert.deepEqual(evaluateReview(reviewed, registry), { state: "reviewed", problems: [] });
  assert.equal(assertReviewValid(reviewed, registry), "reviewed");
});

test("the digest is deterministic, order-independent and sensitive to every reviewed element", () => {
  const digest = vocabularyDigest(registry);
  assert.match(digest, /^[a-f0-9]{64}$/);
  const reversed = { claims: Object.fromEntries(Object.entries(registry.claims).reverse().map(([id, entries]) => [id, [...entries].reverse()])) };
  assert.equal(vocabularyDigest(reversed), digest, "claim and entry order do not matter");
  const sentence = withEntry(registry, (copy) => { copy.claims["metric-limits"][0].skeleton += " "; });
  const condition = withEntry(registry, (copy) => { copy.claims["relationship-limits"].find((entry) => entry.when?.includes("has_regressions")).when = ["no_regressions"]; });
  const added = withEntry(registry, (copy) => { copy.claims["new-claim"] = [{ skeleton: "A new sentence." }]; });
  const removed = withEntry(registry, (copy) => { delete copy.claims["metric-limits"]; });
  const whenOrder = withEntry(registry, (copy) => { const entry = copy.claims["relationship-limits"].find((item) => item.when?.length === 2); entry.when = [...entry.when].reverse(); });
  for (const changed of [sentence, condition, added, removed]) assert.notEqual(vocabularyDigest(changed), digest);
  assert.equal(vocabularyDigest(whenOrder), digest, "the order of conditions within an entry does not matter");
  assert.notEqual(vocabularyDigest(registry, "geoimpact-claim-binding/2"), digest, "the contract version is part of the digest");
  assert.notEqual(entryId("metric-limits", registry.claims["metric-limits"][0]), entryId("metric-limits", sentence.claims["metric-limits"][0]));
});

test("altered content with a stale approval fails closed, whatever kind of change it is", () => {
  const approval = approvalFor(registry);
  const changes = {
    "sentence text edited": (copy) => { copy.claims["policy-verdict"][0].skeleton = "Report verdict is shown below."; },
    "condition changed": (copy) => { copy.claims["relationship-limits"][0].when = ["has_regressions"]; },
    "entry added": (copy) => { copy.claims["policy-verdict"].push({ skeleton: "Another sentence." }); },
    "entry removed": (copy) => { copy.claims["policy-meaning"].pop(); },
    "claim removed": (copy) => { delete copy.claims["error-semantics"]; }
  };
  for (const [name, mutate] of Object.entries(changes)) {
    const changed = withEntry(registry, mutate);
    const result = evaluateReview(approval, changed);
    assert.equal(result.state, "invalid", name);
    assert.ok(result.problems.some((problem) => /stale approval: content_digest/.test(problem)), name);
    assert.throws(() => assertReviewValid(approval, changed), /Vocabulary review record is invalid: .*stale approval/, name);
  }
  const contractMoved = evaluateReview(approval, registry, "geoimpact-claim-binding/2");
  assert.equal(contractMoved.state, "invalid");
  assert.ok(contractMoved.problems.some((problem) => /stale approval: contract_version/.test(problem)));
});

test("an approval is never renewed by itself: a new digest needs new decisions for every new entry", () => {
  const approval = approvalFor(registry);
  const changed = withEntry(registry, (copy) => { copy.claims["metric-limits"][0].skeleton += "!"; });
  assert.equal(evaluateReview(approval, changed).state, "invalid");
  assert.equal(evaluateReview(approval, structuredClone(registry)).state, "reviewed", "restoring the exact content restores validity");
  const staleDecisions = approvalFor(changed, { decisions: approval.decisions });
  const result = evaluateReview(staleDecisions, changed);
  assert.equal(result.state, "invalid");
  assert.ok(result.problems.some((problem) => /no decision|no longer exist/.test(problem)));
  assert.equal(evaluateReview(approvalFor(changed), changed).state, "reviewed", "a fresh, complete approval of the new content is the only way forward");
});

test("incomplete, malformed or half-filled records are invalid", () => {
  const ids = currentEntryIds(registry);
  const cases = {
    "no reviewer": { reviewed_by: null },
    "blank reviewer": { reviewed_by: "   " },
    "no date": { reviewed_on: null },
    "impossible date": { reviewed_on: "2026-02-31" },
    "wrong date format": { reviewed_on: "02/01/2026" },
    "missing digest": { content_digest: null },
    "wrong digest": { content_digest: "0".repeat(64) },
    "missing contract version": { contract_version: null },
    "no decisions": { decisions: [] },
    "one entry rejected": { decisions: ids.map((id, index) => ({ entry_id: id, decision: index === 0 ? "Reject" : "Approve" })) },
    "one entry awaiting change": { decisions: ids.map((id, index) => ({ entry_id: id, decision: index === 1 ? "Change" : "Approve" })) },
    "one entry missing": { decisions: ids.slice(1).map((id) => ({ entry_id: id, decision: "Approve" })) },
    "duplicate entry": { decisions: [...approvalFor(registry).decisions, approvalFor(registry).decisions[0]] },
    "unknown entry": { decisions: [...approvalFor(registry).decisions, { entry_id: "ffffffffffff", decision: "Approve" }] },
    "unknown status": { status: "approved" },
    "wrong schema": { schema: "geoimpact-vocabulary-review-record/2" }
  };
  for (const [name, overrides] of Object.entries(cases)) {
    assert.equal(evaluateReview(approvalFor(registry, overrides), registry).state, "invalid", name);
  }
  for (const half of [{ reviewed_by: "Someone" }, { reviewed_on: "2026-01-02" }, { content_digest: vocabularyDigest(registry) }, { contract_version: SEMANTIC_CONTRACT_VERSION }]) {
    assert.equal(evaluateReview({ ...committedRecord, ...half }, registry).state, "invalid", `unreviewed record with ${Object.keys(half)[0]} set`);
  }
  for (const bad of [null, [], "reviewed", 7]) assert.equal(evaluateReview(bad, registry).state, "invalid");
});

test("regenerating the vocabulary and the checklist neither reads nor changes the review record", async () => {
  const before = sha(await readFile(semantic("review-record.json")));
  const vocabularyBefore = sha(await readFile(semantic("approved-skeletons.json")));
  const checklistPath = fileURLToPath(new URL("../docs/geoimpact-v0.2-human-review-checklist.md", import.meta.url));
  const checklistBefore = sha(await readFile(checklistPath));
  for (const script of ["build-skeletons.mjs", "build-review-checklist.mjs"]) {
    execFileSync(process.execPath, [fileURLToPath(semantic(script))], { encoding: "utf8" });
  }
  assert.equal(sha(await readFile(semantic("review-record.json"))), before, "review record untouched");
  assert.equal(sha(await readFile(semantic("approved-skeletons.json"))), vocabularyBefore, "regeneration is deterministic");
  assert.equal(sha(await readFile(checklistPath)), checklistBefore, "checklist regeneration is deterministic");
  const source = await readFile(semantic("build-skeletons.mjs"), "utf8");
  assert.doesNotMatch(source, /URL\([^)]*review-record|\.review\b|evaluateReview|assertReviewValid/, "the generator never opens, evaluates or writes the review record");
  const generated = await collectSkeletons();
  assert.equal(generated.review, undefined);
  assert.deepEqual(generated, registry);
});

test("the checklist is a disposable worksheet bound to the digest and holds no decisions", async () => {
  const checklist = await readFile(new URL("../docs/geoimpact-v0.2-human-review-checklist.md", import.meta.url), "utf8");
  assert.ok(checklist.includes(`Content digest under review: \`${vocabularyDigest(registry)}\``));
  assert.ok(checklist.includes(`\`${SEMANTIC_CONTRACT_VERSION}\``));
  assert.match(checklist, /review-record\.json/);
  assert.match(checklist, /never renewed automatically/);
  for (const id of currentEntryIds(registry)) assert.ok(checklist.includes(`Entry ID: \`${id}\``), id);
  assert.equal((checklist.match(/Decision \(Approve \/ Reject \/ Change\): ________/g) ?? []).length, 52);
  assert.doesNotMatch(checklist, /- \[x\]/i);
});

test("the check command passes an honest unreviewed record, and a stale approval would fail it", () => {
  const output = JSON.parse(execFileSync(process.execPath, [fileURLToPath(semantic("check-review.mjs"))], { encoding: "utf8" }));
  assert.deepEqual(output, { state: "unreviewed", current_content_digest: vocabularyDigest(registry), problems: [] });
  const exitCodeFor = (record, vocabulary) => (evaluateReview(record, vocabulary).state === "invalid" ? 1 : 0);
  assert.equal(exitCodeFor(committedRecord, registry), 0);
  assert.equal(exitCodeFor(approvalFor(registry), registry), 0);
  assert.equal(exitCodeFor(approvalFor(registry), withEntry(registry, (copy) => { copy.claims["metric-limits"][0].skeleton += "."; })), 1);
});

test("the evaluation reports the review state and its gate fails on a stale or malformed approval", async () => {
  const clean = await runEvaluation({ performance: false });
  assert.equal(clean.review_status.skeleton_vocabulary, "unreviewed");
  assert.equal(clean.review_status.skeleton_vocabulary_content_digest, vocabularyDigest(registry));
  assert.deepEqual(gateFailures(clean), []);

  const approved = await runEvaluation({ performance: false, reviewRecord: approvalFor(registry) });
  assert.equal(approved.review_status.skeleton_vocabulary, "reviewed");
  assert.deepEqual(gateFailures(approved), []);

  const stale = await runEvaluation({ performance: false, reviewRecord: approvalFor(registry, { content_digest: "1".repeat(64) }) });
  assert.equal(stale.review_status.skeleton_vocabulary, "invalid");
  assert.ok(gateFailures(stale).some((failure) => /vocabulary review record is invalid: .*stale approval/.test(failure)));
});

test("review state is not a way around the gate: enforcement reads only the vocabulary", async () => {
  const report = await loadReportFile(new URL("../geoimpact-copilot/fixtures/block-v5.json", import.meta.url));
  const answer = answerQuestion(report, "What verdict does this report contain?");
  const altered = structuredClone(answer);
  altered.claims[0].text += " This caused harm to residents.";
  delete altered.claims[0].bindings;
  altered.answer = altered.claims.map((claim) => claim.text).join(" ");
  assert.throws(() => verifyAnswerEvidence(altered, report), /recorded claim vocabulary/);
  assert.equal(verifyAnswerEvidence(answer, report), true);
});
