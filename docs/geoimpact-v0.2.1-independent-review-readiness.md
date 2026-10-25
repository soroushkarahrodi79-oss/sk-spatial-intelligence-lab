# GeoImpact Evidence Copilot V0.2.1: independent review readiness

**Verdict: HOLD.** Nothing in this release was reviewed by an independent person, no genuine GeoImpact-CI report was evaluated, and no model was called. V0.2.1 makes an independent review and a first model experiment *possible and checkable*; it does not perform either.

Scope: this repository only. GeoImpact-CI, Madrid Lens, Salmas Flood and the Hugging Face Space were not touched. No API key, SDK, paid inference, deployment or automatic approval was added.

## What exists after V0.2.1

| Need | Artifact | State |
| --- | --- | --- |
| A reviewer can actually do the review | [Review packet](review/geoimpact-v0.2.1-review-packet.md) and [blank decision sheet](review/geoimpact-v0.2.1-decision-sheet.template.json), generated from the vocabulary and bound to its digest | Ready. **All 52 entries UNREVIEWED.** |
| Review state cannot be faked | Hardened lifecycle in `lib/review.mjs` and `check-review.mjs`; tests no longer pin the status | Tested |
| A route to genuine reports | [Evidence intake and reviewer instructions](geoimpact-v0.2.1-evidence-intake.md), `intake-record.schema.json`, `intake.mjs` | Ready. **No report supplied; none admitted.** |
| A test set nobody tuned against | [Protocol](geoimpact-v0.2.1-independent-test-set-protocol.md), `independent-test-set/manifest.json`, label-sheet template, `check-test-set.mjs` | Protocol ready. **Set not established: 0 cases.** |
| Exact conditions for a first Sonnet run | [Prerequisites](geoimpact-v0.2.1-sonnet-experiment-prerequisites.md), `sonnet-experiment-prerequisites.json`, `check-sonnet-prerequisites.mjs` | Specified. **HOLD: 8 of 9 prerequisites unmet.** |

## Audit of V0.2 as merged (PR #2, `24ddb82`)

Findings, each with what V0.2.1 did about it.

1. **Lifecycle tests required the committed record to stay `unreviewed` forever.** Four places pinned it: the lifecycle test, the check-command test, the evaluation test and a test in the semantic suite. A genuine review committed tomorrow would have turned CI red, which is an incentive to edit the tests. *Fixed:* tests accept either legitimate state and reject everything else; the committed record may be `unreviewed` (blank) or `reviewed` (complete, current, a named person, not a placeholder). The label tests do the same.
2. **`reviewed_by` accepted any non-blank string**, including `Claude` or `automated review`, and `reviewed_on` accepted future dates. *Fixed:* automated-system names and future dates make a record invalid. This is a guard against accident and obvious fabrication; **nothing in software can prove who typed a name.**
3. **A committed approval signed `Test Fixture Reviewer (not a real person)` would have passed** the check, because the unit-test fixture is a valid record for the lifecycle logic. *Fixed:* `committedRecordProblems` rejects placeholder and fixture identities for the committed file, while unit tests may still use the fixture.
4. **The V0.2 checklist was a flat 45 KB list of 52 entries**: 26 of them near-identical abstention variants, no priority, no example rendering, no per-entry applicability in plain words, no author concerns. A tired reviewer would skim the 26 and miss the 5 that matter. *Fixed:* the review packet.
5. **A source-record URL pointed at a feature branch** (`feat%2Fgeoimpact-evidence-copilot-v0.1`) that is usually deleted after merge, so reviewers could not open the evidence. *Fixed:* pinned to commit `d0e97cb`, the last commit that changed the schema. No generated artefact changed.
6. **The external-report schema could not tell a genuine report from a synthetic one.** The V0.2 unit test itself passes a generated report through it with the producer "test fixture standing in for a producer". Anyone could do the same and the result would look like real-data evaluation. *Fixed:* a separate intake record with an explicit `origin`, per-check verification by a named person, and a refusal of any report byte-identical or content-identical (re-indented, keys re-ordered) to a report this repository ships or can generate. **Limit: a lying attestation cannot be detected by software.** See the intake document.
7. **The 18 author-written labels cover 23 of 52 vocabulary entries.** Not exercised: 25 of the 26 ambiguity variants, the empty-question message, the unsupported-intent message, one dataset variant and one relationship-limits variant. All 18 labels run on 5 fixtures, 3 of them the same two verdict reports. *Not fixed here*, because labels written by the same author would add nothing; the independent protocol is the remedy.
8. **Token cost scales with the report.** An evidence pack grows linearly with relationship regressions: about 4.9 KB at 3, 67 KB at 50, 666 KB at 500, 4 MB at 3000. A per-request token limit therefore needs a claim-count ceiling and a no-call fallback. *Addressed* in the experiment prerequisites with a measured, tested limit.
9. **The "held-out" synthetic split is procedural**, from one author and one generator (ADR 0006 already says so). Unchanged; the independent test set replaces it for any claim beyond software behaviour.
10. **`VERSION` and `package.json` still say 0.1.0** while the changelog carries V0.2 as unreleased. Left alone: this repository's version tracks the static site, and bumping it would imply a release.

Not a finding but worth stating: the "generated-v1.2.0" fixtures are real GeoImpact-CI CLI output **on invented inputs**. They validate the report contract; they are not real-world reports and must never be counted as such.

## What was changed

* `lib/review.mjs`: `reviewerIdentityProblems`, `committedRecordProblems`, future-date check. `check-review.mjs` applies the committed-record rules.
* `semantic/build-review-packet.mjs`, `review-concerns.mjs`: the packet and sheet; `check:review-packet` fails when they are stale or hand-edited.
* `semantic/build-review-checklist.mjs`: exports the evidence index it already computed; output byte-identical.
* `evaluation/external/intake.mjs` and `intake-record.schema.json`; `evaluation/independent-test-set/*`.
* `evaluation/run-v2.mjs`: reviewed external labels now enter an aggregate only for a report with an admitted intake record; otherwise it is listed as `origin_unverified`. Previously a self-described "producer" was enough.
* `provider-contract/sonnet-experiment-prerequisites.json` and `check-sonnet-prerequisites.mjs`.
* `source-records.json`: one URL pinned.
* Tests: `tests/geoimpact-readiness.test.mjs` (21 tests); lifecycle and semantic tests rewritten as described.
* CI and `npm test` run the three new checks. Dependencies unchanged.

## Review state, stated plainly

| Item | Status | By whom |
| --- | --- | --- |
| Skeleton vocabulary, 52 entries | UNREVIEWED | nobody |
| Expected-answer labels, 18 cases | UNREVIEWED, author-written | nobody |
| Oracle expectations | UNREVIEWED, author-written | nobody |
| Review packet decisions | blank | nobody |
| Genuine GeoImpact-CI reports admitted | 0 | n/a |
| Independent test set | not established, 0 cases | n/a |

`review-record.json` is byte-identical to `main`. No reviewer was invented and no approval was written.

## Final-gate hardening

Two gaps in the prerequisite checker were closed. **P3** is no longer inferred from the test-set manifest: the checker re-validates one external intake record per report (hash, identity, admission, named human attestations, third-party-model permission) from a directory outside the repository, and P3 stays unmet without it; P4 additionally requires every sealed case to match an admitted report by SHA-256. **P2** now requires a named human reviewer, a valid non-future date, an independence declaration plus a written relationship to the author, and consistent case and top-level statuses; a boolean alone is not enough. With no evidence the checker still prints HOLD and exits 0.

## Remaining HOLD conditions

Each is a fact about the world that no code change can supply.

1. **A named, independent person completes the review packet** and records decisions in `review-record.json` (P1).
2. **The 18 labels are independently reviewed or replaced** (P2).
3. **At least 8 genuine, rights-cleared V4/V5 reports** are admitted by the intake check, spanning both versions, both verdicts, three sizes and three regions, each with explicit permission to be sent to a third-party model (P3).
4. **An independent test set is sealed** before any model sees it (P4).
5. **The owner accepts or replaces the proposed limits and budget**, records current prices, and the worst case fits the cap (P5).
6. **Server-side secret controls are built and signed off** in a separate change (P6).
7. **The analysis plan is frozen and a pilot ADR is accepted** (P7, P9).
8. Separately, and not required for the pilot: the 300-case independent set, two reviewers and a blinded preference result needed before any release (see `geoimpact-v0.3-claude-integration-design.md`).

Run `npm run check:sonnet-prerequisites` at any time for the current list. It prints `HOLD` and exits 0 while that is the honest answer, and exits 1 if the file claims readiness it has not earned.

## Limitations of this release

* **Independence is declared, not proven.** Reviewer, labeller and verifier identities are names typed by a person. The software refuses automated names and placeholders; it cannot verify identity or independence.
* **Intake cannot detect a false attestation.** A synthetic report that is not in this repository's corpus, with a record that says "genuine", would pass the mechanical checks. The controls against that are procedural: a named verifier, a method statement, a run-record URL, and (recommended) an independent re-run of GeoImpact-CI on the stated inputs.
* **Author concerns in the packet are the author's.** They are prompts, not findings. An independent reviewer will find others.
* **Keyword flags are hints**, and sample renderings come from invented reports.
* **Token estimates are `ceil(bytes / 3)`**, not a tokenizer, and the pack sizes were measured on invented reports. They must be re-measured on the real ones before any run.
* **Cost limits are proposals.** No price is recorded anywhere in this repository, and none was looked up.
* **Intake and test-set checks have only been exercised on test stand-ins.** There is no real input to run them on.

## Verification

See the pull request for the commands run and for the CI result on the final head commit.
