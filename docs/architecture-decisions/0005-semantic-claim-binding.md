# ADR 0005: Semantic claim binding and a closed claim vocabulary

- **Status:** Accepted for the V0.2 draft
- **Date:** 2026-10-24

## Context

The V0.1 evidence gate accepted a number or literal if it existed in any cited evidence. A claim could therefore swap two valid values (observed count and threshold, area and displacement, `before` and `after`, two engine versions), attach a valid number to the wrong unit, state the wrong verdict, or append prose containing no digits, and still pass with every citation present. Measured on a 2,731-claim mutation catalogue, the current reference verifier with the semantic gate disabled (not the historical V0.1 executable) accepted 79%.

## Decision

1. Register a contract per field in `lib/semantic.mjs`: path, label, unit, rendering. A measurement or exact string is valid only as the registered `label value unit` span, with the value taken from the parsed report.
2. Treat the text left after removing spans as a *skeleton* and require it to be in a generated vocabulary file (`semantic/approved-skeletons.json`) that stays marked **unreviewed** until a person completes the review checklist, conditioned on report facts where a sentence depends on them. Unknown claim IDs fail closed.
3. Cross-check `PASS`/`BLOCK`/`ERROR` wording against the report status and cited contract definitions.
4. Re-derive and compare the `bindings` that accompany each claim; never trust supplied ones.
5. Reject invisible and direction-changing characters in the report at the input boundary, and flag mixed-script or non-NFC identifiers instead of rejecting them.
6. Keep the V0.1 checks and run the semantic layer after them, so existing error behaviour is preserved. `semantic: false` remains available only so evaluation can measure the V0.1 gap.

## Consequences

* Positive: a swap, a unit change or an invented sentence is detected without a model or a classifier; failures name the field.
* Negative: only registered phrasings pass. Rewording needs a vocabulary change. The vocabulary is generated and **unreviewed**; its security value rests on a person completing `docs/geoimpact-v0.2-human-review-checklist.md` and reviewing the diffs of later changes. Heuristic intent guards (ambiguity, temporal/geographic) are word lists.
* The gate checks truth against the report, not relevance to the question.
* Answer text changed slightly (labels added to identifiers); this is the one intentional V0.1 behaviour change, alongside the fixes listed in the V0.2 document.
* Any future claim type (new report field, new sentence) requires a contract entry, a vocabulary entry and a negative test.
