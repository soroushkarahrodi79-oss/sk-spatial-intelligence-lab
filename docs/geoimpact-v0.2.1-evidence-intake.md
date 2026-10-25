# Evidence intake: genuine GeoImpact-CI V4/V5 reports

**Status: no report has been supplied or admitted.** This repository bundles none, and none may be invented, generated or substituted for this purpose. A report produced by GeoImpact-CI on invented inputs (including the committed `generated-v1.2.0` fixtures) is a synthetic report. A report written by hand or by a model is a synthetic report. If genuine, rights-cleared reports are not available, the evaluation stays synthetic and every claim about real-world behaviour stays on HOLD.

Everything below is for a person to carry out. No script in this repository verifies rights, runs GeoImpact-CI, fills in a field or marks anything verified.

## What we are looking for

A **small, diverse** first set: at least **8 reports**, so that a reviewer can look at each one properly.

| Dimension | Floor |
| --- | --- |
| Report version | at least 3 V4 and 3 V5 |
| Verdict | at least 2 PASS and 2 BLOCK |
| Size | at least one small, one medium, one large (large is allowed to exceed the experiment's claim limit; it will be counted and not sent to a model) |
| Region or dataset | at least 3 distinct ones |
| Relationship rows | include reports with none, one and several dependency datasets |

This is a floor for a first look. It is not a statistical sample, and it does not substitute for the 300-case gate in the V0.3 design.

## The four questions every report must answer before use

1. **Did GeoImpact-CI really produce it, on real data?** Not a generator, a hand edit, a model, or a run on invented inputs.
2. **Do we have the right to use it?** Who holds the rights, under what licence, with what evidence, and does that cover redistribution in this repository's evaluation and (separately) sending its evidence pack to a third-party model?
3. **Does it contain personal data or sensitive locations?** If yes, it is not admissible.
4. **Is it intact?** The bytes match the digest recorded at intake, and the report loads under the V4/V5 schema.

## Procedure

Do this outside the repository (or in a git-ignored directory). Nothing here goes into a commit.

1. **Collect candidates.** For each, ask the producer for: the report file exactly as written by GeoImpact-CI; the GeoImpact-CI version and commit or tag; the run date; a short description of the inputs; a link to a run record or CI log if one exists.
2. **Establish rights.** Find the licence or written permission. Save its URL and the date you retrieved it. Record who holds the rights. Decide, separately, whether the terms allow the evidence pack (claims and field values, not the geometry) to be sent to a third-party model provider. If the terms are silent, the answer is **no**.
3. **Establish provenance.** Confirm with the producer that the report is unedited. For a V5 report, check that `provenance.engine.geoimpact_ci` equals the version they state. **Recommended:** a second person re-runs GeoImpact-CI at that version on the stated inputs and compares the report digest or content. If the producer will not or cannot allow this, say so in `method`; it weakens, but does not by itself forbid, admission.
4. **Compute the digest** of the report file: `sha256sum NAME.report.json`.
5. **Write the record** `NAME.intake.json` beside the report, following `geoimpact-copilot/evaluation/external/intake-record.schema.json`:
   * `status`: start at `candidate`. Change to `admitted` only when both verifications below are done.
   * `origin`: kind `genuine_geoimpact_ci_run`, `real_input_data: true`, version, run date, who ran it, what it was run on, and `input_hashes_match_report: true` only if the producer confirmed it.
   * `rights`: holder, licence, evidence URL and retrieval date, `redistribution_allowed`, `contains_personal_data: false`, `contains_sensitive_locations: false`, and `may_be_sent_to_third_party_model` (true only on explicit permission).
   * `verification.rights` and `verification.provenance`: each with `status: verified`, **your own name**, the real date, and a `method` that says what you did.
   * `diversity`: version, verdict, size class, dependency class and a region description, so the set can be balanced.
6. **Run the check:**

   ```bash
   node geoimpact-copilot/evaluation/external/intake.mjs /path/to/directory
   ```

   It exits 1 if any report is rejected, and prints the diversity counts. A report that has no record is rejected, not ignored.

## What the check refuses

* a report whose digest does not match the record;
* a report byte-identical, or content-identical after re-indenting or re-ordering keys, to any report in `geoimpact-copilot/fixtures/` or any report the synthetic generator can produce in the development, held-out or vocabulary-building seed ranges;
* `origin.kind` other than `genuine_geoimpact_ci_run`, `real_input_data` false, or input hashes unconfirmed;
* a V5 report whose producer version differs from `provenance.engine.geoimpact_ci`, or whose engine labels look like placeholders (`synthetic`, `fixture`, `example`, `test`, `mock`, and so on);
* a record whose `report_version` or `verdict` disagrees with the report;
* admission without both verifications, or with a verifier named as an automated system, a missing method, or a date in the future;
* redistribution not allowed, personal data, sensitive locations;
* a report that fails the V4/V5 schema or the unsafe-Unicode checks.

`may_be_sent_to_third_party_model: false` does not reject a report; it admits it for local use only and excludes it from the Sonnet pilot.

## What the check cannot do

It cannot tell a freshly generated synthetic report that is not in this repository's corpus from a real one if the record lies. The controls against that are the named verifier, the method statement, the run record and, above all, the independent re-run in step 3. **Do not treat "admitted" as proof of authenticity; treat it as "the paperwork is complete and nothing mechanical contradicts it".**

## Instructions for the person verifying (the reviewer)

You are not the person who ran GeoImpact-CI on the data if you can avoid it, and you must not be the author of this software.

1. Open the licence URL in the record in a browser. Does it say what the record says? Does it cover this use? Write what you checked in `method`.
2. Open the report. Does `report_version` match? For V5, does the provenance block name the GeoImpact-CI version you were told? Are any engine strings placeholders?
3. Skim `analysis.primary_dataset` and the dependency dataset names, and the feature and dependent IDs. Do they identify people, addresses of private individuals, or protected sites? If you are unsure, the answer is **do not admit**.
4. Record `verified` for a check only if you did it. Leave `unverified` and the status `candidate` otherwise.
5. Reject with a reason when in doubt. A report you reject costs nothing; a report you wrongly admit contaminates every number built on it.

## After admission

Admitted reports enter the development pool, or the independent test set if sealed under [the protocol](geoimpact-v0.2.1-independent-test-set-protocol.md). They are **never** added to the vocabulary-building corpus, because that would leak them into the thing being tested. Reports whose label review is not `reviewed` stay out of every aggregate, as before.
