# GeoImpact Evidence Copilot V0.3: Claude provider design and release gate

**Status:** design specification only. Nothing here is implemented against a live model. This repository contains no Anthropic client or SDK, no API key or secret loading, no network call to a model provider, no account, and no paid inference. Do not describe the product as answering with Claude until the gate below passes and a later ADR says so.

## Principle: evidence first, model last

The deterministic layer decides *what may be said*: it produces the answer, the claims, and every number, identifier, unit, label and citation, and the V0.2 semantic gate verifies them. A model may help only with *presentation choices that cannot change facts*. If the model fails, is unavailable, or is wrong, the user gets the deterministic answer. Model output never bypasses the gate; the gate runs on whatever would be shown.

## Provider contract (implemented offline, exercised by fake providers)

Files: [`provider-contract/provider-contract.mjs`](../geoimpact-copilot/provider-contract/provider-contract.mjs), [`provider-output.schema.json`](../geoimpact-copilot/provider-contract/provider-output.schema.json).

1. **Evidence pack (input).** `buildEvidencePack` gives the provider the question (marked untrusted), the decision, and the pre-authorized claims, each with ID, text and field bindings. The raw report body (geometries, hashes, input identities) is not sent. The pack carries SHA-256 digests of the report and question.
2. **Structured output (tier A).** The only permitted shape is `geoimpact-provider-output/1`: schema string, the two digests, `decision`, and `claim_ids`. `additionalProperties: false`; no prose, numbers or citations. Provider-side constrained decoding or tool-schema enforcement is a defence in depth, not the control.
3. **Validation.** Reject, and fall back, if: the schema fails; either digest differs from the pack; the decision differs (a model cannot turn an abstention into an answer or the reverse); any ID is unknown, duplicated or omitted.
4. **Claim-to-field binding.** Claims are the deterministic ones, so each already carries bindings recomputed by the verifier from the report. The provider cannot rebind a value to another field because it cannot write one.
5. **Final gate.** After reordering, `verifyAnswerEvidence` (citations, typed literals, semantic binding, approved vocabulary, verdict words) runs on the exact output. Failure returns the deterministic answer with `adapter.status = evidence_gate_rejected_fallback`.
6. **Deterministic fallbacks.** Provider error, timeout, rate limit, refusal, malformed output, schema violation, gate failure and cost-budget exhaustion all return the deterministic answer. Fallback is a normal outcome and is counted, not hidden.
7. **Abstentions and ambiguity** are decided by the deterministic router. The provider is never asked to answer a question that the router abstained on.

### Tier B (constrained paraphrase) is out of scope for V0.3

Letting a model write sentences is where fabricated causal, geographic and temporal interpretation re-enters. V0.2's approved-vocabulary gate would reject any sentence not already reviewed, so Tier B could only ship together with a separately reviewed process for adding vocabulary and an ADR that accepts the residual risk. Do not build it inside V0.3.

## Candidate models and selection

Specified in [`claude-evaluation-spec.json`](../geoimpact-copilot/provider-contract/claude-evaluation-spec.json). Selection is by measurement, not by name:

| Candidate | Role | Used only if |
| --- | --- | --- |
| `claude-sonnet-5-5` | Baseline, evaluated first | It meets every bar |
| `claude-haiku-5-5` | Optional lower-cost router or first pass | It meets the same bars as the baseline on the task class it would serve |
| `claude-opus-5-5` | Optional comparator on cases the baseline fails | It reveals whether failures are model capability or contract design; not a default |

Rule: choose the cheapest candidate that meets every quality and safety bar on the held-out set, then break ties on p95 latency. If no candidate beats the deterministic ordering in blinded human review, **ship no model**. For each candidate record: schema-valid, hash-consistent, decision-preserved and complete rates; semantic-gate rejection and fallback rates; ordering preference versus deterministic; p50/p95 latency; input and output tokens per request; cost per 1,000 requests at the published price on the test date; run count; sampling settings; and the model and API version string as returned. No price or latency is asserted in this repository because none has been measured.

## Security and privacy requirements for a hosted adapter

Server-side only; credentials from a secret manager, never in the repository, client, logs or evidence pack; authenticated callers with rate and cost limits; the question treated as untrusted; no tool use, file access, web access or code execution for the model; logs hold digests, claim IDs, model and version, latency, token counts and gate outcome, never report bodies or question text unless a documented retention policy covers them; an egress allowlist; report data sent only after the rights field of the report's metadata permits it. Privacy and rights review of every report class precedes any real data leaving the machine.

## Narrow release gate for the first real LLM integration (V0.3)

All must hold. Any single failure keeps the status at HOLD.

**Data and evaluation**
1. At least 300 independent, **rights-cleared real** V4/V5 reports (or an explicit written decision that synthetic-only is acceptable for tier A, since tier A cannot alter facts), each with sidecar metadata passing `external/metadata.schema.json`, assigned to development or held-out before any model sees it.
2. Labels by someone other than the code's author, with a second reviewer on at least a stratified 20% sample; disagreement rate reported.
3. A fresh held-out set never inspected during development. If a held-out failure drives a change, the seeds are retired.
4. Each rate reported with n and a Wilson 95% interval; no threshold set from fewer than 300 independent cases.

**Safety (zero tolerance, measured over the held-out set and the adversarial catalogue, including new attacks added by someone other than the author)**
5. Zero accepted outputs that change a number, identifier, unit, label, verdict, claim set or decision.
6. Zero effect on decision or claim set from instructions embedded in report strings or the question.
7. Zero credentials or report bodies in logs, traces or error messages (checked by test and by log review).

**Value**
8. Blinded reviewers prefer the model ordering over the deterministic ordering with a stated effect size and interval; otherwise do not ship.
9. Measured p95 end-to-end latency and cost per 1,000 requests are within budgets the owner states **before** the run.

**Engineering**
10. Provider behind a feature flag defaulting off; deterministic mode remains the default and complete product.
11. The verifier, vocabulary and contract versions are pinned in every logged request; `check:skeletons`, unit tests and `evaluate:copilot:v2` run in CI on every change.
12. A security and privacy review and a new ADR accept the hosted design. The Hugging Face Space stays static unless that ADR says otherwise.

## What V0.2 does not decide

Whether a model adds value. That is an empirical question that needs the data in items 1–4; this document only makes the question testable without risk to correctness.
