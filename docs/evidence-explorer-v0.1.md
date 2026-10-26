# GeoAI-2A — Evidence Explorer V0.1

Status: draft, 2026-10-26. Static, client-side, no model, no backend, no runtime network call.

Starting point: `origin/main` at `1d430a8f8f99405666173f57d5a05b855502566d` (Landing Evidence-First V0.2 preserved).

## Search gate: GO

Interactive search is justified only with at least six substantively distinct, source-backed records. The catalog has **12 records across 4 projects and 6 evidence types**. `npm run check:evidence` fails if the count drops below six. The records are not 12 independent studies: EV-LAB-001 inspects the same Madrid case as EV-GIC-001 (linked with `relatedTo`), and the Windows and Linux copies of a report count as one observation.

## Four status dimensions (never one badge)

| Dimension | Values | Meaning |
| --- | --- | --- |
| `sourceProvenance` | `pinned`, `pinned-partial` | The cited document is fixed to a commit or CI run. Says nothing about correctness. `pinned-partial` means some upstream inputs are live services or not archived. |
| `reproducibility` | `ci-contract`, `build-time-pinned`, `local-deterministic`, `receipt-only`, `not-applicable` | Whether the result can be regenerated from fixed inputs. |
| `scientificValidation` | `none-claimed`, `synthetic-only`, `hold`, `pending`, `not-applicable` | There is deliberately **no** "validated" value. The schema cannot express a validation claim. |
| `independentReview` | `none-recorded`, `pending` | There is deliberately no "reviewed" value. |

`dataOrigin` (`real-source`, `synthetic`, `documentation`) is shown separately; synthetic data must be `synthetic-only` and nothing else may use that value.

## Candidate inventory (read-only inspection, pinned revisions)

Pins: GeoImpact-CI `c39733b`, Madrid Lens `704fffb`, Salmas `97be23c`, this repository `1d430a8`.

| ID | Project | Type | Supported finding | Status notes |
| --- | --- | --- | --- | --- |
| EV-GIC-001 | GeoImpact-CI | real-source case | Madrid census sections: 2,112 assignment changes, 26 section pairs, policy BLOCK (bounded subset) | INE reuse licence unconfirmed; counterfactual, not time-aligned |
| EV-GIC-002 | GeoImpact-CI | real-source case | Sierra de Baza: 52 points, 0 regressions, PASS (negative control) | Current WFS rights need separate confirmation |
| EV-GIC-003 | GeoImpact-CI | reproducibility | ~1.5e-10 m Windows/Linux drift fixed by a 1e-6 m grid | Engineering finding; pinned toolchain only |
| EV-GIC-004 | GeoImpact-CI | validation status | External validation protocol; result PENDING, zero evaluators | HOLD |
| EV-LAB-001 | Lab | reproducibility | Madrid V5 report byte-identical on two platforms | Not admitted; rights/provenance review pending |
| EV-LAB-002 | Lab | synthetic evaluation | 2,731 mutated claims: V0.1-style checks reject 576, semantic gate rejects all | Synthetic only |
| EV-MUL-001 | Madrid Lens | source gate | Granted licences: 11,265 of 11,498 matched to addresses; 233 withheld | Grant is not construction |
| EV-MUL-002 | Madrid Lens | source gate | Accommodation numerator: municipal register admitted, regional MODIFY | Sources only; no indicator |
| EV-MUL-003 | Madrid Lens | source gate | Domestic origin GO, international HOLD | Suppression below 30 tourists |
| EV-MUL-004 | Madrid Lens | source gate | Hospitality choropleth fill suspended | HOLD |
| EV-SAL-001 | Salmas | claim register | Eight dated claims with explicit statuses; extent unknown | Flood extent HOLD; no casualty figures copied |
| EV-SAL-002 | Salmas | source gate | Only pre-event Sentinel scenes catalogued; no flood polygon | Flood extent HOLD |

Not published: dataset contents, report bodies, coordinates, casualty or household details. Madrid V5 is shown with its 2,112 regressions and explicit "not admitted" state. Salmas stays HOLD.

## Architecture

- `data/evidence-catalog.json` is the source of truth; `data/evidence-catalog.schema.json` is its JSON Schema.
- `npm run build:evidence` embeds the catalog into `space/index.html` as `<script type="application/json">`. The Space remains three static files, so the deployment allowlist, manual approval and rollback are untouched.
- `npm run check:evidence` checks schema, unique IDs, duplicates, pinned sources (URL SHA must equal pin and project revision), existing internal paths, status consistency, overclaiming words in titles and findings, e-mail/token/coordinate patterns, the search gate, and that the embedded copy is current. `npm run check:evidence:online` also requests all source URLs (25 passed on 2026-10-26).
- Search is a deterministic AND of case- and accent-insensitive substrings over the active language, plus project and evidence-type filters.

## Limits

Provenance is not correctness. Pinned documents reflect their repositories at the pinned commit; later changes (for example Salmas, days after the event) are not reflected. No independent review exists for any record. The explorer demonstrates traceability, not validation.

## Claim traces (GeoAI-2B)

Three records carry optional claim-level traces with exact line-range permalinks; see [Claim-to-Source Evidence Trace V0.1](claim-trace-v0.1.md).
