# GeoAI-2B — Claim-to-Source Evidence Trace V0.1

Status: draft, 2026-10-26. Static, client-side, deterministic. No model, no retrieval, no backend, no runtime network call.

Starting point: `origin/main` at `23629f3183a20fb00f0dfea87965cac3c1a5018c` (GeoAI-2A Evidence Explorer V0.1 merged).

## What it adds

A reader can go from a specific claim to the exact documentary evidence behind it in two interactions: open **View evidence** / **Ver evidencia** on a record card, then follow the permalink. The disclosure shows the claim, the source document and pinned commit, the exact permalink, methodological context, the claim's limitations, the record's geographic and temporal scope, and its review status. Method and limitation statements carry their own line-range permalinks.

Three records are traced. Each has one claim, one method statement and one limitation statement:

| Record | Claim (summary) | Source at pinned commit | Claim / method / limitation lines |
| --- | --- | --- | --- |
| EV-GIC-001 | CLI run on the checked-in subset: 2,112 `assignment_changed` across 26 old-to-new section pairs, verdict BLOCK | geoimpact-ci `c39733b`, `docs/GATE_5_REAL_WORLD_CASE.md` | 53–61 / 33–40 / 130–136 |
| EV-GIC-002 | 52 relationship records, 0 regressions, PASS against a zero threshold | geoimpact-ci `c39733b`, `docs/GATE_8_REAL_WORLD_GENERALIZATION.md` | 124–128 / 92–97 / 184–192 |
| EV-SAL-002 | Pre-event Sentinel-1D (2026-10-21) and Sentinel-2C (2026-10-22, tile cloud 27.63% / 48.13%) listed; gate status HOLD for flood extent | salmas-flood-spatial-forensics `97be23c`, `docs/SENSOR_GATE.md` | 3–15 / 17–28 / 30–38 |

Claim texts are written to be exactly as strong as their cited lines. For example, the EV-SAL-002 claim says what the sensor-gate document *lists*; the absence of post-event scenes is not asserted by that document and is not traced here.

## Data model

`record.claims[]` is optional. Each claim has `id` (`CL-<project>-<nnn>-<nn>`), `source` (a commit-pinned blob URL that must be one of the record's sources), `status`, and `statements.{claim,method,limitation}`. Each statement has bilingual `text`, `lines` `[start, end]`, a `permalink` (`source#Lstart-Lend`) and `terms` (short anchor strings that must occur in the cited lines).

`claim.status` repeats the record's `scientificValidation` and `independentReview`; it can never differ (no upgrade). `traceStatus` has a single value, `line-range-checked`, meaning only that the automated check passed.

`data/claim-excerpts.json` holds the verbatim cited lines, copied mechanically from the pinned files by `npm run build:trace-excerpts` (78 lines from three of the author's own public documents). It is used only for checking and is not embedded in the Space.

## Checks

Offline and deterministic, in `npm run check:evidence` (`scripts/claim-trace.mjs`), unit-tested by `npm run test:trace`:

- schema: claim and statement shapes, 40-hex pinned URLs, `#L` permalinks, no value such as "validated";
- the three scoped records must carry a claim (fail closed);
- unique claim IDs and claim texts; claim IDs extend their record ID;
- source is listed on the record, in the project's pinned repository at the project's pinned commit;
- valid, ordered line ranges of at most 40 lines; permalink equals source plus range;
- an excerpt exists, has exactly as many lines as the range, and is not blank;
- every anchor term occurs in the cited lines (whitespace-normalised);
- every number in the statement occurs in the cited lines; EN and ES state the same numbers (separator-insensitive: `2,112` = `2.112`);
- claim and method texts avoid overclaiming words; claim status equals the record's status.

`npm run check:trace:online` (also a CI step) re-fetches each pinned file from `raw.githubusercontent.com` and requires the recorded excerpt to equal the upstream lines exactly, and the range to lie within the file. A URL that merely responds is never accepted.

## Limits

- The check confirms that the cited lines contain the claim's anchor terms and numbers. It cannot establish that the sentence means what the claim says; that judgement was made by reading the lines (recorded here) and remains open to independent review.
- A source document stating a result is **not** independent validation of that result. No record's `scientificValidation` or `independentReview` changed; EV-SAL-002 stays on HOLD and EV-GIC-001/002 stay `none-claimed` / `none-recorded`.
- Pinned documents reflect their repositories at the pinned commit. Later edits are not reflected, and the cited documents are self-reports by the same author.
- Geographic and temporal scope are those of each record (shown inside the disclosure). EV-GIC-001 is a spatial counterfactual with 2026 address points against 2024/2025 sections; EV-GIC-002 uses a fixture inventory not aligned with either boundary date; EV-SAL-002 predates any post-event acquisition and its catalogue snapshot may be outdated.
- Nine statements across three records is a proof of the mechanism, not coverage. Nine other records have no trace.
