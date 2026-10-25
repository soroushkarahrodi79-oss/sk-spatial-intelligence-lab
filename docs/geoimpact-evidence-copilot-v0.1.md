# GeoImpact Evidence Copilot V0.1

> V0.2 (draft) supersedes parts of this document: answer text now labels identifiers, the evidence gate adds semantic field binding, and ambiguous, time and place questions abstain. See [V0.2](geoimpact-evidence-copilot-v0.2.md). The counts below describe V0.1 as merged.

**Status:** local deterministic prototype, audited update 2026-10-24. **GO** for local compatibility evaluation with synthetic or rights-cleared reports; **HOLD** for a hosted LLM, research conclusions, or production use.

## Scope and source contract

The existing lab website remains a static project catalog. This prototype runs locally from Node.js and reads one GeoImpact-CI `report.json` at a time. It supports report versions V4 and V5 from the public GeoImpact-CI V1.2.0 contract. V5 requires raw-byte input hashes and engine-version provenance; V4 retains the complete primary change section without V5 provenance. V3 and other versions are rejected.

The public contract was inspected read-only from the GeoImpact-CI [`v1.2.0` README](https://github.com/soroushkarahrodi79-oss/geoimpact-ci/blob/v1.2.0/README.md), [`ARCHITECTURE_V1.md`](https://github.com/soroushkarahrodi79-oss/geoimpact-ci/blob/v1.2.0/docs/ARCHITECTURE_V1.md), [`REPORT_V5_MIGRATION.md`](https://github.com/soroushkarahrodi79-oss/geoimpact-ci/blob/v1.2.0/docs/REPORT_V5_MIGRATION.md), and report/model/policy source. The README defines PASS as a completed run whose configured regression threshold was met, BLOCK as a completed run whose threshold was exceeded, and ERROR as an operational/configuration/input failure with no policy verdict. The report itself contains only PASS or BLOCK; an ERROR does not produce a `report.json` verdict. Relationship records describe declared exact `within` assignments; boundary touches are separate evidence. These relationships do not establish source correctness, legal status, causality, resident impact, service access, or socioeconomic outcome.

The V4/V5 schema shipped in `geoimpact-copilot/schema/report-v4-v5.schema.json` is intentionally closed: unknown fields and unsupported predicates are rejected. Semantic checks additionally require the top-level verdict to match policy status, the observed count to match the regression records, policy evidence IDs to match those records, policy status to match the configured comparison, regression records to match relationship rows, and primary change ID lists to match the status map.

## Architecture

1. **Input boundary:** UTF-8 JSON only, with a 10 MiB input limit. The reader rejects a BOM, malformed UTF-8, duplicate object keys, malformed JSON, unsupported report versions, and schema/consistency failures. Parsed reports are recursively frozen before use.
2. **Evidence layer:** claims cite a report JSON Pointer, a deterministic operation over a report field (for example, count of non-unchanged relationship rows), or an identified source record with a URL and named fact. References are resolved against the parsed report before output.
3. **Deterministic baseline:** a small intent router selects policy, relationship, primary-change/metric, provenance, error-semantics, or evidence-limit templates. Ambiguous questions and unsupported real-world claims abstain.
4. **Typed evidence gate:** numerical quantities are accepted only from the named report measurement paths (`changed_footprint_area_m2`, `max_boundary_displacement_m`, `policy.observed_value`, `policy.threshold`) or deterministic supported counts. Coordinates, input sizes, hashes, arbitrary numeric JSON fields, source-record prose, and software-version strings do not authorize measurements. Digit-bearing identifiers and software versions are handled as exact string literals: the claim must cite the matching string path and include the exact source value. A numeric-looking token such as `2.1` inside `Shapely 2.1.2` is therefore not a measurement, but replacing the source value with `2.1.3` is rejected. Negative, decimal, and scientific-notation quantities are still parsed and compared to supported report evidence.
5. **Optional explanation boundary:** `geoimpact-copilot/server/explanation-boundary.mjs` accepts a server-injected provider interface, but none is configured or shipped. A future provider can only select and order all pre-authorized deterministic claim IDs. It cannot add text, citations, numbers, or omit a claim. The server renders the final claims. There is no client-side secret, model API request, or LLM claim in V0.1.

Each emitted claim has one or more `references`. For report-backed claims those references contain exact JSON Pointers and resolved values; source-record claims identify the public contract source and named fact. The JSON CLI output preserves this structure. The text CLI prints each claim ID and its evidence paths.

## Use

Run from the repository root after `npm ci`:

```sh
npm run copilot -- --report geoimpact-copilot/fixtures/block-v5.json --question "Why did this report BLOCK?"
npm run copilot -- --report PATH/TO/report.json --question "Which dependent assignment changed?" --json
npm run copilot -- --report PATH/TO/report.json --question "What confidence interval is reported?"
npm run test:copilot
npm run evaluate:copilot
```

An answer returns exit code 0, an abstention returns 3, and invalid input/arguments return 2. `--json` includes decisions, claims, references, and mode. No command writes to the report or its input files.

## Synthetic fixtures and licensing

`geoimpact-copilot/fixtures/block-v5.json` and `pass-v5.json` are hand-authored, fictional schema examples. They include invented IDs, metrics, geometries, hashes, and engine labels. They are not real GeoImpact-CI outputs or research observations. The companion fixture README dedicates these original fixture files to CC0 1.0 Universal. No third-party data or source repository fixtures were copied. Do not cite these examples as scientific findings.

The public GeoImpact-CI report contract and software are separate from the fixture license. The prototype records source URLs and inspected contract facts in `geoimpact-copilot/source-records.json`; it does not claim to license third-party research data.

## Threat model

| Threat | V0.1 handling | Remaining limit |
| --- | --- | --- |
| Malformed, oversized, duplicate-key, or unexpected report fields | Byte limit, UTF-8/JSON checks, duplicate-key scan, strict V4/V5 schema, consistency checks | No JSON streaming; reports over 10 MiB are rejected even if otherwise valid. |
| Prompt injection in a question or report string | No model is called; deterministic intent routing; strings are never evaluated as code; the future provider receives a separate untrusted question and a fixed claim allowlist | Intent routing is lexical and can misclassify unfamiliar phrasing. |
| Fabricated number, version, or digit-bearing identifier | Numeric evidence is limited to typed measurement/count paths; exact string references bind engine versions and IDs to their JSON values | This checks literal fidelity, not whether a non-numeric interpretation is scientifically sound. |
| Forged or stale citation | JSON Pointer references are resolved against the immutable parsed object; source-record IDs/fact keys must exist in the local registry | A report's claimed hashes are not independently verified because raw source input files are not supplied to this Q&A CLI. |
| Model invents or suppresses claims | No model in V0.1; future provider contract allows only exact claim IDs and requires every claim once | No LLM provider, model, host, or semantic judge has been integrated or evaluated. |
| Secret exposure or data mutation | No network client, secret loading, report writes, GIS tools, or deployment integration | A future hosted backend needs authentication, rate limits, secret management, audit controls, and a separate security review. |
| Synthetic example mistaken for research | Every fixture is labeled synthetic and licensed separately; CLI is local; root README describes the prototype | Human readers can still remove labels when reusing a fixture; keep the fixture notice with any copied example. |
| CI or published Space changes unintentionally | Only the validation workflow and non-Space files were extended; the deployment workflow remains manual-only and its static Space allowlist is unchanged | The production deployment workflow was intentionally not run. |

## Evaluation criteria and results

The deterministic evaluation is a small regression suite, not a statistically representative benchmark. Each case checks expected answer/abstention, required or forbidden text, and required evidence references. Every claim is then checked for resolvable citations and typed literal fidelity. Adversarial gate mutations verify rejection of altered versions, IDs, negative/decimal quantities, and unsupported scientific notation. The suite covers generated V4/V5 contract artifacts as well as the original synthetic fixtures.

| Category | Passed | Cases |
| --- | ---: | ---: |
| Correct questions | 6 | 6 |
| Misleading questions | 1 | 1 |
| Injection attempts | 3 | 3 |
| Unsupported claims | 2 | 2 |
| Missing evidence | 1 | 1 |
| Numeric fidelity | 10 | 10 |
| Version fidelity | 2 | 2 |
| Identifier fidelity | 1 | 1 |
| Legacy V4 compatibility | 1 | 1 |
| **Total** | **27** | **27** |

The original hand-authored fixtures and the generated artifacts cover BLOCK and PASS. The V5 generated reports came from the actual public GeoImpact-CI `v1.2.0` CLI; the V4 artifact came from the actual `v1.1.0` CLI because `v1.2.0` emits V5 only, while its migration contract retains V4 compatibility. Inputs are newly authored synthetic GeoJSON and config, dedicated to CC0 1.0; the upstream GeoImpact-CI software is MIT licensed, but no upstream fixture or source code is copied. See [`geoimpact-copilot/fixtures/generated-v1.2.0/README.md`](../geoimpact-copilot/fixtures/generated-v1.2.0/README.md) for tag commit identities, runtime versions, SHA-256 input provenance, reproduction details, and reuse boundaries.

Observed result: 27/27 expected decisions, content checks, citation checks, and specified gate-rejection checks passed. The generated V5 answer preserved the exact source strings `GeoImpact-CI 1.2.0`, `Shapely 2.1.2`, `GEOS 3.13.1`, `PyProj 3.7.2`, and `PROJ 9.5.1`. All 18 Copilot unit tests passed. Valid generated V4/V5 reports were exercised against nine supported intent patterns each (27 report/question combinations) with no evidence-gate exception. These results are fixed regression evidence, not a general accuracy estimate.

The browser/Space is unchanged. Screenshots are not applicable to this command-line prototype.

## Limitations

- No LLM or hosted backend is implemented. The optional interface is only a fail-closed provider boundary and claim-order selector.
- V4/V5 only; V3 and later report versions require reviewed schema changes.
- No geometry recalculation, GeoJSON loading, CRS transformation, causal inference, source-quality validation, or policy recomputation from raw spatial inputs. The report remains the evidence source.
- No quantitative uncertainty or source positional-accuracy estimate is present in the supported report schema. Computational grids are not source accuracy.
- The deterministic Q&A supports a narrow set of English intent patterns. It is not a general chatbot, retrieval system, or service API.
- The original V0.1 fixtures still contain synthetic placeholder hashes and engine strings. The new generated V5 artifacts contain genuine tool-reported provenance for their synthetic test inputs; this does not make the geometry observations real research.
- Numeric parsing is intentionally narrow. It recognizes tested signed decimal and scientific forms plus correctly grouped three-digit thousands separators, and masks digit-bearing literal tokens before comparing quantities. Malformed comma grouping and ambiguous comma spacing fail closed; broader locale/Unicode number formats need their own tests.
- Human review is still needed for non-numeric interpretations and for broader evaluation across real report diversity. No real research or operational report has been used in this prototype's evaluation.

## Next step toward a hosted LLM backend

Before adding a hosted model, collect legally reusable, independently reviewed V4/V5 report examples or obtain explicit rights for each real report. Expand the evaluation set with human-labeled correct answers, ambiguous questions, report-version drift, Unicode/identifier attacks, numeric formats, and citation errors. Then implement a separate authenticated server adapter that keeps credentials server-side, sends only the question plus the smallest relevant allowlisted evidence pack, forces structured output referencing deterministic claim IDs, runs schema/citation/numeric gates before rendering, logs source hashes and model/version metadata without unnecessary sensitive content, and fails closed to the deterministic baseline. Validate privacy, access control, latency, cost, and provider behavior before any production release.

## Recommendation

**GO** for local use of the deterministic parser and answer baseline with synthetic or rights-cleared reports: the V4/V5 path now passes against real CLI-generated contract artifacts, and software versions/identifiers are checked as exact cited strings instead of being treated as measurements. **HOLD** for research or operational conclusions, a hosted LLM, or production use. The next release gate is a human-reviewed, legally cleared set of diverse real reports and questions, followed by a separately reviewed hosted-backend security and privacy design. No operating LLM is implemented.
