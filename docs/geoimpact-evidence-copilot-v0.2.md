# GeoImpact Evidence Copilot V0.2

**Status:** independent scientific evaluation and semantic evidence-hardening phase, 2026-10-24. Draft; not merged. **No language model is integrated, called, or specified as live.** Recommendation: **GO** for the V0.2 deterministic hardening and evaluation framework as a local engineering baseline; **HOLD** on any real LLM integration, hosted service, or claim of scientific accuracy. See [the recommendation](#recommendation).

V0.1 (merged) answers questions about a GeoImpact-CI V4/V5 report with deterministic templates, and checks that every number and literal in an answer exists in cited evidence. V0.2 asks a harder question: *is each value attached to the right field, label and unit?* V0.1 could not tell.

## What was wrong in V0.1 (measured, not assumed)

**Comparison basis.** "V0.1 checks" below means the repository's current reference verifier (citation, typed-literal and numeric checks) run with the semantic gate disabled (`verifyAnswerEvidence(..., { semantic: false })`). It is *not* a rerun of the historical V0.1 executable: it already includes this PR's identifier-masking and escaped-literal fixes. It isolates what the semantic gate adds; it does not measure the shipped V0.1 byte for byte. The V0.1 numeric-gate behaviour on the original suites is covered separately by the unchanged 18 V0.1 tests and 27 V0.1 cases.

The V0.1 gate checks membership: a number is accepted if it equals some number in some cited field. Running a catalogue of meaning-changing edits against the V0.1 checks alone (`verifyAnswerEvidence(..., { semantic: false })`) showed:

| Edit that keeps every number, identifier and citation individually valid | Accepted with semantic gate disabled |
| --- | --- |
| Swap observed regression count and policy threshold | yes |
| Swap changed footprint area and boundary displacement | yes |
| Report area in `m` or displacement in `m²`; drop the label | yes |
| Swap `before` and `after`, dependent dataset and ID, added and removed, `Shapely` and `GEOS` versions | yes |
| State `PASS` for a `BLOCK` report, or the `PASS` definition under a `BLOCK` verdict | yes |
| Quantities in Arabic-Indic or full-width digits | yes (the digit scanner is ASCII-only) |
| Bidirectional-override character in a claim | yes |
| Append a causal, geographic or instruction-like sentence with no digits | yes |
| A threshold stated without citing it, when its value equals a cited count | yes |

Of 2,731 mutated claims over the 120 held-out reports, the gate-disabled verifier rejected 576 (21%); every one it rejected was a number or identifier that did not exist in the evidence at all. The V0.2 gate rejected all 2,731.

Three further V0.1 defects surfaced from evaluation and were fixed (these are the documented exceptions to "preserve V0.1 behaviour"):

1. **Identifiers with spaces and digits made the answer throw.** A dependent ID such as `Zone 12` put `12` into the text as a free-standing token, and the numeric gate rejected the engine's own answer with `unsupported numeric value 12`. Identifier spans are now masked before quantity scanning. Identifiers containing quotes or backslashes (JSON-escaped in the answer) are now matched in rendered form.
2. **Time and place questions received a feature-change answer.** "Did the change happen after the 2020 survey?" matched the word *change*. Lexical guards now abstain with `unsupported_temporal_or_geographic_claim`.
3. **Multi-topic questions were silently half-answered.** "What is the verdict and which relationships regressed?" returned only the relationship answer. It now abstains with `ambiguous_question` and names the topics. A cost: policy and relationship wording that co-occurs in one natural question now abstains rather than answering one half.

Also: invisible, direction-changing, private-use and non-ASCII-space characters in any report string or key are rejected at the input boundary, because a rendered identifier containing U+202E can display as a different string. An O(n²) relationship lookup in report validation was replaced by a map (parse time for a 7.8 MB report fell from about 4.0 s to about 1.9 s, identical results).

## The semantic claim-binding contract

Implemented in [`lib/semantic.mjs`](../geoimpact-copilot/lib/semantic.mjs); decision record in [ADR 0005](architecture-decisions/0005-semantic-claim-binding.md).

Every measurement and exact identifier is one **span**: the field's registered label, the value, and for measurements the unit. For example `Changed footprint area: 4.5 m²`, `before "zone-north"`, `Shapely 2.1.2`. A claim passes only if all of the following hold, each recomputed from the claim text and the parsed report, never from the claim's own metadata:

1. **Value.** Each measurement span's number equals the report value at that field's path (numeric equivalents such as `4.5e0` still pass; grouped or ambiguous forms still fail closed).
2. **Label and unit.** The label and unit are the registered ones for that path. A number under another field's label or unit is a binding mismatch; the diagnostic names the field whose value was used (`the value of policy.threshold`).
3. **Cited and stated.** A measurement cannot be stated without citing its path. Every cited exact-string field (identifier, list, version) must appear under its own label.
4. **No unbound residue.** After removing all spans, the remaining text (the claim's *skeleton*, with `{{field}}` placeholders) must be one of the sentences in [`semantic/approved-skeletons.json`](../geoimpact-copilot/semantic/approved-skeletons.json), under that entry's report conditions (for example, "although primary feature changes are present" only when `changed_feature_ids` is non-empty). This is what rejects unsupported causal, geographic, temporal and instruction-like prose that contains no digits. Unknown claim IDs fail closed.
5. **Verdict words.** `PASS`, `BLOCK` and `ERROR` in a claim that cites `#/verdict` or `#/policy/status` must equal the report status (`ERROR` never can); elsewhere they must be backed by a cited contract definition. `Report verdict: X` must name the actual verdict.
6. **Characters.** Control and format characters are rejected in claim text.

Each emitted claim also carries a `bindings` array (field, path, reference ID, label, unit, value, rendered span, and Unicode notes for non-ASCII identifiers) so a reader or a downstream system can see exactly what was bound. The verifier recomputes it; a forged binding fails.

Examples (real output of `verifyAnswerEvidence`; the gate-disabled verifier accepted all of these):

```text
observed 1 relationship regression against a threshold of 0  ->  observed 0 ... threshold of 1
  rejected: field binding mismatch: policy.observed_value is 1 relationship regressions in the
  report but the claim states "0" (the value of policy.threshold)

Changed footprint area: 4.5 m². Maximum boundary displacement: 3 m.  ->  3 m² ... 4.5 m
  rejected: field binding mismatch: primary_change.changed_footprint_area_m2 is 4.5 m² in the
  report but the claim states "3" (the value of primary_change.max_boundary_displacement_m)

Shapely 2.1.2; GEOS 3.13.1  ->  Shapely 3.13.1; GEOS 2.1.2
  rejected: #/provenance/engine/shapely must appear as "Shapely 2.1.2"
  (the value is present but not under its field label)

before "zone-west"; after none  ->  before none; after "zone-west"
  rejected: #/relationship_regressions/0/before must appear as "before \"zone-west\""

4.5 m²  ->  4.5 m           rejected: unbound numeric or digit character
4.5 m²  ->  ٤.٥ m²          rejected: unbound numeric or digit character
... accuracy.  ->  ... accuracy. This change caused harm to nearby residents.
  rejected: narrative text outside the recorded claim vocabulary
```

Rendering changes in answers (documented because they alter V0.1 text): relationship claims now read `Dependent dataset "d"; dependent ID "i": before …; after … (change type t). Evidence ID "e" links the change to primary feature IDs …` (labels added where V0.1 printed `"d" / "i"`), and dataset claims read `primary dataset "p"; dependency dataset "a"`. The unlabelled forms allowed a dataset/ID swap to pass.

Known strictness: the verifier accepts only registered phrasings. A reworded but correct sentence is rejected until its skeleton is reviewed and added. For a deterministic renderer that is the point; it is also why a future model may not write free text (see the [V0.3 design](geoimpact-v0.3-claude-integration-design.md)). The derived operation `count_non_unchanged(#/relationships)` has no distinct label and is intentionally unbound.

## Evaluation framework

Run `npm run evaluate:copilot:v2` (exits non-zero on any gate failure; `--out FILE`, `--skip-performance`, `--external DIR`). Layers, provenance and reading guidance are in [`geoimpact-copilot/evaluation/README.md`](../geoimpact-copilot/evaluation/README.md).

* **Deterministic unit tests**: 30 new tests in `tests/geoimpact-semantic.test.mjs`, 12 review-lifecycle tests in `tests/geoimpact-review-lifecycle.test.mjs`, plus the 18 V0.1 tests (60 total, all passing).
* **Independent expected answers**: 18 hand-typed cases on the committed fixtures (`evaluation/expected-answers.json`). Labelled by the author; **human review status: unreviewed** (each case carries `human_review_status`). Reported separately from any reviewed set.
* **Generated oracle**: a seeded generator ([`synthetic/generator.mjs`](../geoimpact-copilot/evaluation/synthetic/generator.mjs)) builds schema-valid V4/V5 reports with measurement styles including integers, long doubles, `1e-7` and `1.5e+21`, 1–3 dependency datasets, 0–5 regressions, and PASS/BLOCK. An oracle ([`oracle.mjs`](../geoimpact-copilot/evaluation/oracle.mjs)) states expected strings and field values from the report data without importing the code under test. 16 questions cover 11 categories.
* **Adversarial catalogue**: 28 mutations in 9 risk groups ([`mutations.mjs`](../geoimpact-copilot/evaluation/mutations.mjs)), plus 21 input-boundary cases (version drift, unknown metadata, contradictory verdict, hidden Unicode, non-finite numbers, duplicate keys, BOM, truncation, over 10 MiB), 5 report-field injection payloads, and a mixed-script identifier flag check.
* **Splits**: `development` (180 reports) and `held_out` (120 reports), fixed seed ranges with SHA-256 digests in `synthetic/manifest.json`; regeneration is checked. The first held-out draft drove fixes and was folded into development; `held_out` was drawn afterward. The approved-sentence vocabulary is built from development only.
* **External reports**: supported through `--external DIR` with a metadata schema requiring source provenance, rights evidence (`redistribution_allowed: true`, `contains_personal_data: false`), report hash, assigned split, independent labels with labeller role, human-review status and uncertainty notes. **None are bundled and none are required.** Unreviewed reports never enter an aggregate. Missing rights or a hash mismatch fails the gate. The intake path is tested with a synthetic stand-in, not real data.

### Results (synthetic data only)

> **These figures describe software behaviour on invented reports built by the same author who wrote the answer vocabulary. They are not accuracy on real GeoImpact-CI output and must not be quoted as such.** Intervals are Wilson 95% and assume independent cases, which generated reports are not; a perfect rate means no failure in *n*, and the lower bound shows how little that establishes.

Held-out split, 120 reports × 16 questions = 1,920 report–question pairs (development: 180 reports, 2,880 pairs, also 0 failures):

| Category | Correct / n | 95% interval |
| --- | ---: | ---: |
| policy_verdict (PASS/BLOCK) | 360 / 360 | 0.989–1 |
| error_semantics | 120 / 120 | 0.969–1 |
| relationship_evidence | 120 / 120 | 0.969–1 |
| numeric_fidelity | 120 / 120 | 0.969–1 |
| primary_changes | 120 / 120 | 0.969–1 |
| provenance (V4 and V5) | 120 / 120 | 0.969–1 |
| missing_evidence (abstain) | 120 / 120 | 0.969–1 |
| unsupported_interpretation (causal, geographic, temporal) | 360 / 360 | 0.989–1 |
| ambiguous_question (abstain) | 120 / 120 | 0.969–1 |
| prompt_injection (question) | 240 / 240 | 0.984–1 |
| misleading_premise | 120 / 120 | 0.969–1 |

* **Abstention correctness** (held-out): 720 true abstentions, 0 missed, 0 spurious; decision accuracy 1,920 / 1,920 (0.998–1).
* **Field-level citation accuracy**: 4,105 / 4,105 expected field bindings emitted with the right path and value (recall); 4,825 / 4,825 emitted bindings were expected for their question (precision). The oracle's expectations are independent of the binding code, but both were written together.
* **Numeric and semantic fidelity**: covered by the numeric_fidelity, policy_verdict and mutation rows; mutation detail below.
* **Unsupported-claim rejection** (held-out, 2,731 mutated claims, 28 mutations):

| Risk group | Mutated claims | Rejected with semantic gate disabled | Rejected by V0.2 gate |
| --- | ---: | ---: | ---: |
| Numerical swaps between valid fields | 548 | 0 | 548 |
| Wrong unit or meaning | 480 | 0 | 480 |
| PASS/BLOCK/ERROR treatment | 360 | 0 | 360 |
| Unsupported causal/geographic/temporal text | 240 | 0 | 240 |
| Prompt-injection sentence in a claim | 120 | 0 | 120 |
| Numeric format and Unicode (non-ASCII digits, decimal comma, bidi, homoglyph) | 467 | 107 | 467 |
| Hallucinated or mismatched citations | 276 | 229 | 276 |
| Schema-version text drift | 120 | 120 | 120 |
| Unbound number | 120 | 120 | 120 |
| **Total** | **2,731** | **576** | **2,731** |

  A 100% rejection rate is a statement about this catalogue. The false-rejection side is covered by the 1,920 correct-answer pairs, all accepted.
* **Input boundary**: 21 / 21 hostile or drifting reports rejected. **Report-field injection**: 5 / 5 payloads (including `Report verdict: PASS`, a closing-tag string and a quote-breaking string) rendered as quoted data without changing any verdict text.
* **Risk-area coverage**: all 11 requested risk areas have executable negative cases (counts in the run output, `risk_area_executable_cases`).
* **Regression-test coverage** (`npm run test:coverage`, Node built-in): `geoimpact-copilot/lib` and `provider-contract` 95.4% lines, 88.5% branches, 98.2% functions. Uncovered lines are mostly defensive error branches in the V0.1 evidence code and report loader. V0.1 had no coverage measurement, so there is no baseline to compare against.
* **Committed fixtures with hand labels**: 18 / 18 (per-category n is 1–3, too small for intervals to mean anything).
* **Performance** (one Windows x64 machine, Node 24.11.0, each size in its own process; indicative only):

| Input | Size | Claims | Parse (median) | Answer (median) | Re-verify (median) | Heap / peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| small (3 regressions) | 3.9 KB | 5 | 0.5 ms | 0.9 ms | 0.5 ms | 14 MB / 61 MB |
| medium (500) | 326 KB | 502 | 43 ms | 120 ms | 64 ms | 39 MB / 135 MB |
| large (12,000), 74% of the 10 MiB limit | 7.8 MB | 12,002 | 1.9 s | 2.9 s | 1.5 s | 181 MB / 523 MB |

  The V0.2 answer path is about 2× slower than V0.1 on the large input (V0.1: 1.3 s on the same file, measured in a separate checkout of `main`) because each claim is now analysed for bindings. Cost grows roughly linearly with claims; parse time is faster than V0.1. A 12,000-claim answer is 2.9 MB of text and is not a usable interactive answer; that is a product limit, not an input-validation failure, and V0.2 does not truncate silently.

## Adversarial findings

1. Membership checking (V0.1) is the wrong abstraction for semantic correctness; binding values to labelled fields is needed. This is the central finding.
2. The ASCII-only digit scanner was a real bypass for non-ASCII quantities.
3. Free-text safety cannot be achieved by number and identifier checks alone: causal, geographic and instruction-like sentences contain none. A closed, reviewed sentence vocabulary is the only deterministic defence; pattern deny-lists would be incomplete.
4. Identifier handling was brittle in the opposite direction too: legitimate IDs such as `Zone 12` broke answering.
5. Lexical intent routing is a weak point: shared words (*change*, *feature*, plurals) selected wrong or partial answers. The guards added here are heuristics (see limitations).
6. A rendered identifier can differ from its code points (bidi, zero-width). Rejecting these at input is simpler and safer than escaping them on output.
7. Equal values defeat citation checks: when observed count equals threshold, dropping a citation passes V0.1. The V0.2 rule "stated implies cited" closes that.

## Scientific limitations

* Everything measured is synthetic. No real GeoImpact-CI report, no human-labelled real example set, and no rights-cleared external data exist in the repository. No claim about real-world accuracy, calibration or usefulness follows.
* The oracle and the answer vocabulary share an author and a design. Shared misconceptions would pass both. The held-out split is procedural.
* The report is the evidence. Nothing is recomputed from geometry, and input-byte hashes in V5 are recorded but not re-verified (the CLI does not receive the raw inputs).
* The report schema has no uncertainty, positional accuracy, timestamp, place name or source-rights field; the copilot abstains on all of them. Computational grids are not source accuracy.
* Intent routing is English-only, lexical and brittle. Temporal/geographic and causal guards are word lists, not classifiers; paraphrases will be missed and will fall through to the "unsupported question" abstention or, rarely, to an unrelated topic.
* The sentence vocabulary is generated from the answer builder and is **unreviewed**. No person has confirmed any sentence; a worksheet exists ([human-review checklist](geoimpact-v0.2-human-review-checklist.md), 52 entries, all undecided). Until it is completed the gate enforces the recorded sentences but does not vouch that they are scientifically appropriate.
* Performance numbers are one machine, one run of three; memory is peak RSS of a process, not an allocation profile.
* A semantically wrong but vocabulary-conforming selection (for example choosing the PASS skeleton for a PASS report when the question asked about BLOCK) is not detected as *irrelevant*; the gate checks truth against the report, not relevance to the question.

## Review status

| Artifact | Status |
| --- | --- |
| `semantic/approved-skeletons.json` (sentence vocabulary) | Generated; carries a `content_digest` and **no** review state |
| `semantic/review-record.json` (the durable human record) | `unreviewed`; no reviewer, date, digest or decision entered |
| `evaluation/expected-answers.json` (hand-typed labels) | UNREVIEWED, author-written |
| `evaluation/oracle.mjs` expectations | UNREVIEWED, author-written |
| Review worksheet | [`geoimpact-v0.2-human-review-checklist.md`](geoimpact-v0.2-human-review-checklist.md), generated, all boxes unchecked; flags each sentence as affirmative or disclaimer and marks geographic, temporal, causal, legal or scientific wording |

### Review lifecycle

Approval is bound to the exact content reviewed. `lib/review.mjs` computes a SHA-256 digest over the canonical claims, their conditions (order-independent) and the semantic contract version. The generated vocabulary and the generated checklist are disposable; the review record is a separate hand-edited file that **no script reads or writes**, so regenerating cannot erase a decision, and no script can create or renew an approval.

* `unreviewed`: reviewer, date, digest and contract version are all `null`.
* `reviewed`: a named reviewer, a real `YYYY-MM-DD` date, the digest and contract version matching the current content, and an `Approve` decision for every current entry ID.
* Anything else, including a stale approval after any change to a sentence, condition, entry or the contract version, is `invalid`. `npm run check:review-record` and the evaluation gate fail on it, in CI as well. Restoring the exact content makes the same approval valid again; a changed vocabulary needs a new, complete approval.

Review state does not change enforcement: the gate reads only the vocabulary. The evaluation prints `review_status`, and the 18 author-written labels stay `unreviewed`. Nothing here is self-certified.

## Reproduction

```sh
npm ci
npm test                          # validate, unit tests, skeleton and checklist checks, V0.1 and V0.2 evaluations, links, browser
npm run evaluate:copilot:v2 -- --out work/v02.json
npm run test:coverage
node geoimpact-copilot/semantic/build-skeletons.mjs        # regenerate the vocabulary; review the diff
node geoimpact-copilot/evaluation/run-v2.mjs --write-manifest   # only after intentionally changing the generator
```

## Future provider specification and release gate

No provider, SDK, key, account, network call or paid inference is added. The offline contract in [`provider-contract/`](../geoimpact-copilot/provider-contract/) (output schema, evidence pack, validator with the full semantic gate and deterministic fallback, Claude evaluation spec) is exercised only by fake providers in tests. Design, model-selection rules and the narrow V0.3 release gate: [geoimpact-v0.3-claude-integration-design.md](geoimpact-v0.3-claude-integration-design.md); decisions: [ADR 0006](architecture-decisions/0006-evaluation-data-and-claims-policy.md), [ADR 0007](architecture-decisions/0007-claude-provider-evaluation-and-v0.3-gate.md).

## Recommendation

**GO** (V0.2 hardening and evaluation framework, local engineering baseline). The semantic gate closes a demonstrated class of silent errors, all 48 tests and both evaluation suites pass, the Space is untouched, and CI steps were added without changing the deployment workflow.

**HOLD** on any real LLM integration. The evidence that would justify one does not exist: no rights-cleared real reports, no independently reviewed labels, no measurement that any model improves on deterministic ordering, and no latency or cost data. The V0.3 gate defines the minimum to lift the hold.
