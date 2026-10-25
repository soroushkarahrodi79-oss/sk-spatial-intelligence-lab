// Evidence-first provider contract for a FUTURE language-model integration (V0.3).
//
// Nothing here calls a model, reads a credential, or opens a network connection. It defines
// what a provider is given, the only shape it may return, and the gate that decides whether
// its output is used. Every failure falls back to the deterministic answer.
import Ajv from "ajv";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { verifyAnswerEvidence } from "../lib/evidence.mjs";

const outputSchema = JSON.parse(await readFile(new URL("./provider-output.schema.json", import.meta.url), "utf8"));
const validateShape = new Ajv({ allErrors: true, strict: true }).compile(outputSchema);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const PACK_SCHEMA = "geoimpact-evidence-pack/1";

export function reportDigest(report) {
  return sha256(JSON.stringify(report));
}

export function questionDigest(question) {
  return sha256(question);
}

/**
 * What the provider is shown: the question (untrusted) and the claims the deterministic
 * layer already authorized, each with its field bindings. The raw report is not included.
 */
export function buildEvidencePack({ question, answer, report }) {
  return {
    schema: PACK_SCHEMA,
    report_sha256: reportDigest(report),
    question_sha256: questionDigest(question),
    untrusted_question: question,
    decision: answer.decision,
    allowed_claims: answer.claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      bindings: (claim.bindings ?? []).map(({ field, path, label, unit, value }) => ({ field, path, label, unit, value }))
    })),
    instruction: "Return JSON matching geoimpact-provider-output/1. Select every allowed claim id exactly once, in the order that best answers the question. Do not write text, numbers or citations. Do not change the decision."
  };
}

function reject(reason, detail) {
  return { accepted: false, reason, detail };
}

/** Structural and referential checks on a provider's raw output. Does not look at prose, because there is none. */
export function validateProviderOutput(output, pack) {
  if (!validateShape(output)) return reject("schema_violation", validateShape.errors.map((error) => `${error.instancePath || "/"} ${error.message}`).slice(0, 3).join("; "));
  if (output.report_sha256 !== pack.report_sha256) return reject("report_hash_mismatch");
  if (output.question_sha256 !== pack.question_sha256) return reject("question_hash_mismatch");
  if (output.decision !== pack.decision) return reject("decision_changed", `${pack.decision} -> ${output.decision}`);
  const allowed = new Set(pack.allowed_claims.map((claim) => claim.id));
  const unknown = output.claim_ids.filter((id) => !allowed.has(id));
  if (unknown.length) return reject("unknown_claim_id", unknown[0]);
  if (output.claim_ids.length !== allowed.size) return reject("claims_omitted_or_missing");
  return { accepted: true };
}

/**
 * Apply a provider's ordering. The rendered claims are always the deterministic ones, and
 * the full semantic evidence gate runs on the result, so a provider cannot change what is said.
 */
export function applyProviderOutput({ output, answer, report, pack }) {
  const shape = validateProviderOutput(output, pack);
  if (!shape.accepted) return { ...answer, adapter: { status: "provider_output_rejected_fallback", reason: shape.reason, mode: "deterministic" } };
  const byId = new Map(answer.claims.map((claim) => [claim.id, claim]));
  const claims = output.claim_ids.map((id) => byId.get(id));
  const ordered = { ...answer, answer: claims.map((claim) => claim.text).join(" "), claims };
  try {
    verifyAnswerEvidence(ordered, report);
  } catch (error) {
    return { ...answer, adapter: { status: "evidence_gate_rejected_fallback", reason: error.message.slice(0, 200), mode: "deterministic" } };
  }
  return { ...ordered, adapter: { status: "provider-selected-order", mode: "provider-selected-order" } };
}
