import { createHash } from "node:crypto";
import { SEMANTIC_CONTRACT_VERSION } from "./semantic.mjs";

// Human review of the sentence vocabulary is bound to the exact content that was reviewed.
//
// The vocabulary file is generated and may change at any time. The review record is a
// separate, hand-edited file that no script writes. An approval is valid only while the
// digest it names equals the digest of the current vocabulary and contract version; any
// change makes it invalid and the check fails. Nothing here ever renews an approval.

export const REVIEW_RECORD_SCHEMA = "geoimpact-vocabulary-review-record/1";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function canonicalEntries(registry) {
  return Object.keys(registry.claims).sort().flatMap((claimId) =>
    registry.claims[claimId]
      .map((entry) => ({ claim: claimId, skeleton: entry.skeleton, when: [...(entry.when ?? [])].sort() }))
      .sort((a, b) => a.skeleton.localeCompare(b.skeleton) || a.when.join(",").localeCompare(b.when.join(","))));
}

/** Stable identifier for one allowed sentence under one set of conditions. */
export function entryId(claimId, entry) {
  return sha256(JSON.stringify([claimId, entry.skeleton, [...(entry.when ?? [])].sort()])).slice(0, 12);
}

export function currentEntryIds(registry) {
  return canonicalEntries(registry).map((entry) => entryId(entry.claim, entry));
}

/** Digest over the canonical claims, their conditions and the semantic contract version. */
export function vocabularyDigest(registry, contractVersion = SEMANTIC_CONTRACT_VERSION) {
  return sha256(JSON.stringify({ contract: contractVersion, entries: canonicalEntries(registry) }));
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
function realDate(text) {
  if (typeof text !== "string" || !isoDate.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/**
 * Classify a review record against the current vocabulary.
 *  - "unreviewed": a well-formed record that makes no approval claim.
 *  - "reviewed":   named reviewer, real date, matching digest and contract version, and an
 *                  Approve decision for every current entry.
 *  - "invalid":    anything else, including a stale approval. Callers must fail closed.
 */
export function evaluateReview(record, registry, contractVersion = SEMANTIC_CONTRACT_VERSION) {
  const problems = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return { state: "invalid", problems: ["review record is not an object"] };
  if (record.schema !== REVIEW_RECORD_SCHEMA) problems.push(`schema must be ${REVIEW_RECORD_SCHEMA}`);
  const decisions = Array.isArray(record.decisions) ? record.decisions : null;
  if (!decisions) problems.push("decisions must be an array");

  if (record.status === "unreviewed") {
    for (const field of ["reviewed_by", "reviewed_on", "content_digest", "contract_version"]) {
      if (record[field] !== null) problems.push(`${field} must be null while status is unreviewed`);
    }
    return problems.length ? { state: "invalid", problems } : { state: "unreviewed", problems };
  }
  if (record.status !== "reviewed") return { state: "invalid", problems: [...problems, "status must be unreviewed or reviewed"] };

  if (typeof record.reviewed_by !== "string" || record.reviewed_by.trim().length === 0) problems.push("reviewed_by must name the reviewer");
  if (!realDate(record.reviewed_on)) problems.push("reviewed_on must be a real YYYY-MM-DD date");
  const digest = vocabularyDigest(registry, contractVersion);
  if (record.contract_version !== contractVersion) problems.push(`stale approval: contract_version ${JSON.stringify(record.contract_version)} is not ${contractVersion}`);
  if (record.content_digest !== digest) problems.push("stale approval: content_digest does not match the current vocabulary; the approved content has changed and must be reviewed again");
  if (decisions) {
    const expected = currentEntryIds(registry);
    const seen = new Map(decisions.map((item) => [item?.entry_id, item?.decision]));
    if (seen.size !== decisions.length) problems.push("decisions contain a duplicate or missing entry_id");
    const missing = expected.filter((id) => !seen.has(id));
    const unknown = [...seen.keys()].filter((id) => !expected.includes(id));
    if (missing.length) problems.push(`${missing.length} current entries have no decision`);
    if (unknown.length) problems.push(`${unknown.length} decisions refer to entries that no longer exist`);
    const notApproved = expected.filter((id) => seen.has(id) && seen.get(id) !== "Approve");
    if (notApproved.length) problems.push(`${notApproved.length} entries are not marked Approve`);
  }
  return problems.length ? { state: "invalid", problems } : { state: "reviewed", problems };
}

export function assertReviewValid(record, registry) {
  const result = evaluateReview(record, registry);
  if (result.state === "invalid") throw new Error(`Vocabulary review record is invalid: ${result.problems.join("; ")}`);
  return result.state;
}
