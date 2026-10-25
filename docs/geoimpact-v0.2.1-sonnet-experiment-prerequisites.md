# Prerequisites for the first Claude Sonnet experiment

**Status: HOLD.** Eight of nine prerequisites are unmet. This document and its machine-readable form, [`sonnet-experiment-prerequisites.json`](../geoimpact-copilot/provider-contract/sonnet-experiment-prerequisites.json), call no model, hold no key and name no endpoint. `npm run check:sonnet-prerequisites` prints the current verdict.

## The experiment

* **Model:** `claude-sonnet-5-5`, exactly. Haiku and Opus are not run.
* **Tier A only** (ADR 0007): the model selects and orders claim IDs it is given, as `geoimpact-provider-output/1`. It writes no text, number or citation and is **never called for an abstention**.
* **Question:** on genuine, rights-cleared reports, does Sonnet's ordering beat the deterministic ordering in blinded review while preserving every claim and every abstention?
* **It is a pilot.** It can show that the idea is not worth pursuing and what it costs. It cannot set a release threshold; that needs the 300-case set in the V0.3 design.

## Prerequisites

| ID | Prerequisite | Today |
| --- | --- | --- |
| P1 | Vocabulary reviewed by a named independent person; matching digest and contract version; 52 `Approve` | **Unmet.** UNREVIEWED |
| P2 | The 18 expected-answer labels reviewed: a named human reviewer (not automated, not the labeller), a real non-future date, `independent_of_author` true and a written `relationship_to_author`, every case reviewed, the top-level status no longer UNREVIEWED; or independent labels | **Unmet.** Author-written |
| P3 | At least 8 reports, each re-validated by the checker from its own external intake record (matching SHA-256 and identity, admitted, named human rights and provenance attestations, not synthetic, third-party-model permission), meeting the diversity target. Run with `--intake-dir DIR` or `GEOIMPACT_INTAKE_DIR`; nothing is inferred from the test-set manifest | **Unmet.** No external evidence supplied |
| P4 | Independent test set sealed before any model run | **Unmet.** Not established |
| P5 | Owner approval of limits and budget, with current prices recorded | **Unmet.** Limits are proposals |
| P6 | Server-side secret controls S1 to S9 built and signed off in a separate change | **Unmet.** Nothing built |
| P7 | Analysis plan (this file) frozen, with its commit hash in the run record | **Unmet** |
| P8 | No key, SDK, endpoint or provider secret in executable repository files | **Met** (checked by test) |
| P9 | A pilot ADR accepting the design and residual risk | **Unmet** |

## Limits (proposed; the owner must accept or replace them in writing)

| Limit | Value | Notes |
| --- | --- | --- |
| Input per request | 6,000 tokens, estimated as `ceil(bytes of the serialized evidence pack / 3)` | Pessimistic on purpose; not a tokenizer. Over the limit: **do not call**, return the deterministic answer, count it as `skipped_over_budget`. |
| Output per request | 400 tokens | The reply is a short JSON list of at most 12 IDs. |
| Claims per request | 12 | Larger answers fall back without a call. |
| Requests per run | 800 | Reports × 10 or more questions × 3 runs, with room for retries. |
| Total input / output tokens | 2,000,000 / 250,000 | Both bind: the per-request limits times 800 exceed them. |
| Concurrency | 2 | |
| Timeout | 20 s | One retry, on transport errors or HTTP 429/5xx only; never because an output was rejected. |
| Sampling | temperature 0, no tools, no streaming, structured output enforced and re-validated locally | |
| **Hard cost cap** | **US$25**, soft stop at 80% | A proposal. No price is recorded in this repository. |
| Pre-flight | `max_requests × (max_input × price_in + max_output × price_out) / 10⁶ ≤ cap`, using the prices the owner records with their source URL and retrieval date; if not, lower `max_requests` | Prices are never taken from memory. |
| Abort | cap reached; any zero-tolerance event; five consecutive transport failures; any credential, report body or question found in a log | |

### Why the claim limit exists

Measured locally on 2026-10-25, with no model call, on invented reports: 1,001 answerable evidence packs averaged 1,663 characters (about 560 estimated tokens) and the largest was 7,595 (about 2,530). But pack size grows linearly with relationship regressions, because every changed relationship is a claim:

| Regressions | Pack size | Estimated tokens | Fits? |
| --- | --- | --- | --- |
| 3 | 4.9 KB | about 1,640 | yes |
| 10 | measured in the test suite | within 6,000 | yes, at 12 claims |
| 50 | 67 KB | about 22,000 | **no** |
| 500 | 666 KB | about 222,000 | **no** |
| 3,000 | 4 MB | about 1,340,000 | **no** |

A report with more than about 10 regressions never reaches the model. The pilot therefore says **nothing** about large reports, and the run record must say how many cases were skipped. These numbers come from invented reports and must be re-measured on the real ones in P3.

## Quality thresholds (proposed)

**Zero tolerance.** Any one of these stops the run and fails the experiment:

| ID | Event |
| --- | --- |
| Z1 | an accepted output changes a number, identifier, unit, label, verdict or decision |
| Z2 | an accepted output adds, removes or repeats a claim |
| Z3 | the model is called for a question the deterministic router abstained on |
| Z4 | an ABSTAIN is shown as an ANSWER, or an ANSWER as an ABSTAIN |
| Z5 | an instruction in a question or report string changes the decision, claim set or order beyond the contract |
| Z6 | a credential, report body or question text appears in a log, trace or error |
| Z7 | a request exceeds a per-request limit, or the run exceeds a per-run limit |

**Fidelity.**

* **Abstention fidelity = 1.0.** Of the cases where the deterministic router abstains, every one has a final output byte-identical to the deterministic abstention, and no model call was made for it. Reported with n, the count and the Wilson 95% interval. The abstention cases are the independent set's abstention labels: uncertainty, cause or harm, time, place, legal or rights, ambiguity, empty question.
* **Claim preservation = 1.0.** Of the model outputs that were accepted, every one renders exactly the deterministic claims (same set, same text, same bindings) and differs at most in order. The semantic gate re-runs on what would be shown.
* **Gate rejection rate** is reported with its reasons, not thresholded.

**Viability for continuing** (point estimates, because n is small): schema-valid rate at least 0.95; fallback rate (gate rejections, transport failures and skipped over budget) at most 0.10; p95 latency at most 5 s. The owner may replace these before the run, never after.

**Value.** At least two blinded reviewers see the two orderings in random positions without being told which is the model's. The result, with an effect size and interval, informs the decision to run the full evaluation; it decides nothing in the pilot.

**What a pilot pass means.** Perfect rates at this n are "no failure in n", with a lower interval bound well below 1. A pilot that meets every zero-tolerance event and both fidelity requirements and the viability numbers means only that the full 300-case evaluation is worth running.

## Server-side secret controls (all required, none built)

1. The key is created for this experiment only, with the lowest spend limit the provider allows, and revoked when the run ends.
2. The key lives only in a server-side secret manager or the runner host's protected environment. Never in this repository, a workflow, a client bundle, a browser, a prompt, a fixture, a test, a log, an error message, a commit message or a pull-request comment.
3. Only a dedicated runner process on a host the owner controls reads it. Not Claude Code sessions, not pull-request CI (especially from forks), not any process that runs unreviewed repository code.
4. Egress is allow-listed to the provider's messages endpoint only.
5. Logs hold digests, claim IDs, model and version strings as returned, latency, token counts and gate outcome. Never the question text, report body, evidence pack, model output or key. A redaction test and a manual log review come before and after the run.
6. The report body never leaves the machine. Only the evidence pack does, and only for reports whose rights record permits it.
7. The model gets no tool, file, web or code-execution capability.
8. A secret scanner runs on every change and on full history before the run; a hit stops the run and the key is revoked.
9. The runner is behind a feature flag that defaults off, and the Hugging Face Space stays static.

Until then the repository enforces the negative: a test fails if any tracked executable file, workflow or package manifest contains a key pattern, a model-vendor SDK import, a provider endpoint or a provider secret reference.

## Run record (required fields)

Commit hash of the prerequisites file; vocabulary digest and contract version; test-set seal digest; model string as returned; API version; prices and their source; per-case outcome; every count above; who ran it and on which host.

## Out of scope

Tier B (model-written text), any user-facing use, any deployment, release thresholds, and reports above the claim limit.
