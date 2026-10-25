# Independent test set and label protocol

**Status: not established. 0 reports, 0 labels, 0 labellers, 0 reviewers.** `geoimpact-copilot/evaluation/independent-test-set/manifest.json` says so and `npm run check:test-set` fails if it ever claims otherwise without the evidence below.

Why this exists: every number the repository produces today comes from reports, an oracle, a vocabulary and labels written by one author. The "held-out" synthetic split guards against overfitting to inspected cases; it is not independent. A claim about real GeoImpact-CI output needs data and labels that the author could not have tuned against.

## Definitions

* **Development corpus**: everything the author has seen or used: `geoimpact-copilot/fixtures/`, every seed in the synthetic manifest (development and held-out), the vocabulary-building corpus, and the 18 expected-answer labels.
* **Independent test set**: genuine reports admitted by [the intake check](geoimpact-v0.2.1-evidence-intake.md), labelled by people independent of the author, sealed before use, and used only to measure.
* **Labeller**: a person who writes the expected answer for a question about a report.
* **Reviewer**: a person who checks a labeller's work.

## No-leakage rules

These are rules for people. The checker enforces the ones software can see and says which.

1. **No overlap with development.** No test-set report may be byte-identical or content-identical to anything in the development corpus. *Enforced:* the checker recomputes the corpus digests and rejects any case whose raw or canonical digest is in it.
2. **No use for building.** Test-set reports and labels never enter the vocabulary generator, the synthetic generator, the mutation catalogue, the prompts, the examples shown to a model, or the 18 existing labels. *Not enforceable by software; the reviewer of any change that touches those files checks it.*
3. **Labels are written blind.** A labeller sees the report and the question. They never see the copilot's answer, a model's answer, or another labeller's label for the same item. *Declared in the label sheet and the manifest (`saw_copilot_or_model_output: false`); a declaration, not proof.*
4. **Labels come from the contract, not the output.** The basis for each expected answer is the GeoImpact-CI contract and the report's own fields, written down in `basis`.
5. **Seal before running.** The set is sealed by a named person with a digest over every report and label. After sealing, nothing changes. *Enforced:* the digest is recomputed; `first_model_run_on`, when set, must be strictly later than `sealed_on`.
6. **A test failure never tunes the system on the set that exposed it.** If a failure on the test set leads to a code, vocabulary, prompt or threshold change, the affected reports are retired from the test set and moved to development, and fresh reports are drawn. This is the same rule ADR 0006 applies to the synthetic held-out seeds. *Procedural.*
7. **Rights follow the data.** Only reports admitted with `may_be_sent_to_third_party_model: true` may be sent to any model provider. *Enforced:* the checker requires it for every case in an established set, because the set exists to evaluate a model.
8. **Reports and label sheets stay outside the repository.** The committed manifest holds digests, identifiers and attestations only. If the rights allow redistribution, a later decision may change this; it is not assumed.

## Who may label and review

* A labeller must not be the author of the vocabulary, the gate, the generator, the oracle or the 18 labels, and must say so in the label sheet (`independent_of_author: true`).
* A labeller must be a person. The checker refuses names that identify an automated system.
* A **domain expert** (someone who understands GeoImpact-CI policy semantics) labels the questions about verdict, threshold and relationships. A **report producer** may label provenance questions about their own report. Neither role is sufficient alone for abstention labels, which need someone who has read the contract's limits.
* A **second reviewer**, who did not label the item, independently labels a **stratified sample of at least 20%** (stratified by report version, verdict, size and decision type), and the **disagreement rate is reported** before the set is sealed. Disagreements are resolved by discussion and recorded; they are never deleted.

## What gets labelled

For each report, at least 10 questions covering: verdict and policy meaning; threshold and observed value; relationship changes (when any exist, and when none); primary feature changes and metrics; provenance (V5) and its absence (V4); and the abstention families: uncertainty, cause or harm, time, place, legal or rights, ambiguity across two or more topics, and an empty question. At least a quarter of the questions should be ones the development corpus does not contain in the same wording.

Each label (`label-sheet.template.json`) records: the question; `expected_decision` (`ANSWER` or `ABSTAIN`); `expected_reason` for abstentions; text that must and must not appear; the exact field values that must be bound; the basis; and the labeller's uncertainty.

## Establishing the set

1. Admit reports ([intake](geoimpact-v0.2.1-evidence-intake.md)).
2. Labellers fill one sheet per report, working blind.
3. Second reviewer labels the stratified sample. Compute and record agreement.
4. A named person assembles the cases: `case_id`, both digests of each report, `intake_status: admitted`, `third_party_model_permitted`, and the labels with `labelled_by`, `independent_of_author`, `saw_copilot_or_model_output: false` and `labelled_on`.
5. That person sets `status: established`, `sealed: true`, `sealed_on`, `sealed_by`, computes `seal_digest` with `sealDigest` from `check-test-set.mjs`, fills `human_review` (reviewers, sample fraction, disagreement rate) and commits the manifest.
6. `npm run check:test-set` must pass.

## Size and purpose

A **case** is one genuine report together with its labelled questions. The manifest declares a `purpose`, and the checker holds it to that purpose's floor. The manifest cannot lower a floor.

| Purpose | Cases (reports) | Labelled questions per case | May set thresholds? |
| --- | --- | --- | --- |
| `pilot`: feasibility and cost of the first Sonnet experiment | at least 8, meeting the diversity target (both versions, both verdicts, small/medium/large, 3 regions) | at least 10, all distinct | **No.** A pilot result is reported as "no failure in n" with its interval and is never a release threshold. |
| `release_gate`: set thresholds, claim real accuracy | at least **300** | at least 10, all distinct | Yes, with n and Wilson 95% intervals reported |

Every established set, of either purpose, also needs the seal, labellers declared independent and blind, two reviewers, a second-reviewer sample of at least 20% and a reported disagreement rate.

## What the current numbers do and do not mean

All current results are about software behaviour on invented, schema-valid reports. A perfect rate on them means "no failure in n" with a Wilson interval, and nothing about GeoImpact-CI reports in the world. After this protocol is carried out, results on the independent set may be quoted with the set's size, its interval, the labellers' roles, the disagreement rate and the sentence "labels reviewed by [roles]; independence declared by the labellers, not verified".
