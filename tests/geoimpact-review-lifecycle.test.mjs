import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { answerQuestion } from "../geoimpact-copilot/lib/answer.mjs";
import { verifyAnswerEvidence } from "../geoimpact-copilot/lib/evidence.mjs";
import { loadReportFile } from "../geoimpact-copilot/lib/report.mjs";
import { assertReviewValid, committedRecordProblems, currentEntryIds, entryId, evaluateReview, reviewerIdentityProblems, vocabularyDigest } from "../geoimpact-copilot/lib/review.mjs";
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

// The committed record may legitimately be in either state. What it may never be is a claim the
// repository cannot back: an unreviewed record must be blank, and a reviewed one must be complete,
// current, attributed to a person and not a placeholder. This test does not pin the status, so a
// real review can be committed without editing the tests, and a fabricated one still fails.
test("the committed record is in a legitimate state and covers the current 52 entries", async () => {
  const result = evaluateReview(committedRecord, registry);
  assert.ok(["unreviewed", "reviewed"].includes(result.state), `committed record is ${result.state}: ${result.problems.join("; ")}`);
  assert.deepEqual(result.problems, []);
  assert.equal(currentEntryIds(registry).length, 52);
  assert.equal(new Set(currentEntryIds(registry)).size, 52, "entry IDs are unique");
  if (result.state === "unreviewed") {
    for (const field of ["reviewed_by", "reviewed_on", "content_digest", "contract_version"]) assert.equal(committedRecord[field], null, field);
    assert.deepEqual(committedRecord.decisions, [], "an unreviewed record holds no decision");
  } else {
    assert.equal(committedRecord.content_digest, vocabularyDigest(registry));
    assert.equal(committedRecord.contract_version, SEMANTIC_CONTRACT_VERSION);
    assert.deepEqual(reviewerIdentityProblems(committedRecord.reviewed_by), []);
    assert.deepEqual(committedRecordProblems(committedRecord), [], "a committed approval cannot be a placeholder or fixture");
    assert.deepEqual(committedRecord.decisions.map((item) => item.entry_id).sort(), [...currentEntryIds(registry)].sort(), "one decision for every current entry");
    assert.ok(committedRecord.decisions.every((item) => item.decision === "Approve"));
  }
});

test("expected-answer labels carry an honest, internally consistent review status", async () => {
  const labels = await readJson(new URL("../geoimpact-copilot/evaluation/expected-answers.json", import.meta.url));
  assert.equal(labels.cases.length, 18);
  const statuses = new Set(labels.cases.map((item) => item.human_review_status));
  assert.ok([...statuses].every((status) => ["unreviewed", "reviewed"].includes(status)));
  assert.equal(statuses.size, 1, "labels are either all reviewed or all unreviewed; a half-reviewed set is not reported as reviewed");
  const review = labels.labeling.human_review;
  assert.equal(review.status, [...statuses][0]);
  if (review.status === "reviewed") {
    assert.deepEqual(reviewerIdentityProblems(review.reviewed_by), [], "reviewed labels name a person");
    assert.match(review.reviewed_on ?? "", /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(review.independent_of_author === true, "reviewed labels declare independence from their author");
  } else {
    assert.equal(labels.labeling.labeled_by, "author_hand_label", "unreviewed labels are attributed to their author, not to an independent labeller");
  }
});

test("the generated vocabulary carries a digest but no review state and no approval", () => {
  assert.equal(registry.review, undefined);
  assert.equal(registry.content_digest, vocabularyDigest({ claims: registry.claims }));
});

test("both legitimate states are accepted: unreviewed, and reviewed with identity, date and a matching digest", () => {
  assert.equal(evaluateReview({ ...committedRecord, status: "unreviewed", reviewed_by: null, reviewed_on: null, content_digest: null, contract_version: null, decisions: [] }, registry).state, "unreviewed");
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

test("the check command reports the committed record's real state, and a stale approval would fail it", () => {
  const output = JSON.parse(execFileSync(process.execPath, [fileURLToPath(semantic("check-review.mjs"))], { encoding: "utf8" }));
  assert.equal(output.state, evaluateReview(committedRecord, registry).state);
  assert.ok(["unreviewed", "reviewed"].includes(output.state));
  assert.equal(output.current_content_digest, vocabularyDigest(registry));
  assert.deepEqual(output.problems, []);
  const exitCodeFor = (record, vocabulary) => (evaluateReview(record, vocabulary).state === "invalid" ? 1 : 0);
  assert.equal(exitCodeFor({ ...committedRecord, status: "unreviewed", reviewed_by: null, reviewed_on: null, content_digest: null, contract_version: null, decisions: [] }, registry), 0);
  assert.equal(exitCodeFor(approvalFor(registry), registry), 0);
  assert.equal(exitCodeFor(approvalFor(registry), withEntry(registry, (copy) => { copy.claims["metric-limits"][0].skeleton += "."; })), 1);
});

test("a reviewed record must name a person, not an automated system or a fixture", () => {
  for (const name of ["Claude", "Claude Sonnet 5.5", "Anthropic", "GPT-5 reviewer", "automated review", "Copilot", "ci bot", "GitHub Actions"]) {
    const result = evaluateReview(approvalFor(registry, { reviewed_by: name }), registry);
    assert.equal(result.state, "invalid", name);
    assert.ok(result.problems.some((problem) => /automated system/.test(problem)), name);
  }
  for (const name of ["Ai Tanaka", "Maria Garcia Lopez", "J. Okafor"]) {
    assert.equal(evaluateReview(approvalFor(registry, { reviewed_by: name }), registry).state, "reviewed", name);
  }
  // The unit-test fixture is a valid record for the lifecycle logic, but could never be committed.
  const fixture = approvalFor(registry);
  assert.equal(evaluateReview(fixture, registry).state, "reviewed");
  assert.ok(committedRecordProblems(fixture).length > 0);
  for (const name of ["Placeholder", "TBD", "Example Reviewer", "unknown"]) assert.ok(committedRecordProblems(approvalFor(registry, { reviewed_by: name })).length > 0, name);
  assert.deepEqual(committedRecordProblems(committedRecord), []);
});

test("a review date cannot be in the future, and decisions must use the exact vocabulary", () => {
  const future = evaluateReview(approvalFor(registry, { reviewed_on: "2030-01-01" }), registry, undefined, { today: "2026-10-25" });
  assert.equal(future.state, "invalid");
  assert.ok(future.problems.some((problem) => /in the future/.test(problem)));
  assert.equal(evaluateReview(approvalFor(registry, { reviewed_on: "2026-10-25" }), registry, undefined, { today: "2026-10-25" }).state, "reviewed");
  const lowercase = approvalFor(registry, { decisions: currentEntryIds(registry).map((id) => ({ entry_id: id, decision: "approve" })) });
  assert.equal(evaluateReview(lowercase, registry).state, "invalid");
});

test("a blank decision sheet is not a review record and cannot pass as one", async () => {
  const sheet = await readJson(new URL("../docs/review/geoimpact-v0.2.1-decision-sheet.template.json", import.meta.url));
  assert.equal(evaluateReview(sheet, registry).state, "invalid");
  assert.equal(evaluateReview({ ...{ ...committedRecord, status: "unreviewed", reviewed_by: null, reviewed_on: null, content_digest: null, contract_version: null, decisions: [] }, status: "reviewed" }, registry).state, "invalid", "flipping the status of a blank record is not an approval");
});

test("the evaluation reports the review state and its gate fails on a stale or malformed approval", async () => {
  const clean = await runEvaluation({ performance: false });
  assert.equal(clean.review_status.skeleton_vocabulary, evaluateReview(committedRecord, registry).state);
  assert.ok(["unreviewed", "reviewed"].includes(clean.review_status.skeleton_vocabulary));
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
