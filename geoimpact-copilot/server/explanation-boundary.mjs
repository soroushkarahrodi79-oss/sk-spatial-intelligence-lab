import { verifyAnswerEvidence } from "../lib/evidence.mjs";

/**
 * Optional server-side adapter boundary. No provider or model client ships in
 * V0.1. A future provider may select and order pre-authorized deterministic
 * claim IDs; it cannot generate claim text or numeric facts.
 */
export function createExplanationBoundary({ provider = null } = {}) {
  if (provider !== null && typeof provider.selectClaims !== "function") {
    throw new TypeError("A configured explanation provider must expose selectClaims().");
  }

  return {
    status: provider ? "provider-injected-not-included" : "unavailable",
    async explain({ question, answer, report }) {
      if (!provider) return { ...answer, adapter: { status: "unavailable", mode: "deterministic" } };
      if (answer.decision !== "ANSWER") return { ...answer, adapter: { status: "abstained", mode: "deterministic" } };
      verifyAnswerEvidence(answer, report);
      const allowlist = answer.claims.map(({ id, text }) => ({ id, text }));
      try {
        const proposed = await provider.selectClaims({
          question,
          untrusted_question: true,
          allowed_claims: allowlist,
          instruction: "Return only claimIds that exactly match every allowed claim once. Do not create or rewrite claims."
        });
        if (!proposed || typeof proposed !== "object" || Object.keys(proposed).some((key) => key !== "claimIds") || !Array.isArray(proposed.claimIds)) {
          return { ...answer, adapter: { status: "evidence_gate_rejected_fallback", mode: "deterministic" } };
        }
        const allowed = new Map(answer.claims.map((claim) => [claim.id, claim]));
        if (proposed.claimIds.length !== allowed.size || new Set(proposed.claimIds).size !== allowed.size || proposed.claimIds.some((id) => !allowed.has(id))) {
          return { ...answer, adapter: { status: "evidence_gate_rejected_fallback", mode: "deterministic" } };
        }
        const claims = proposed.claimIds.map((id) => allowed.get(id));
        const result = { ...answer, answer: claims.map((claim) => claim.text).join(" "), claims, adapter: { status: "claim-order-only", mode: "provider-selected-order" } };
        verifyAnswerEvidence(result, report);
        return result;
      } catch {
        return { ...answer, adapter: { status: "provider_error_fallback", mode: "deterministic" } };
      }
    }
  };
}
