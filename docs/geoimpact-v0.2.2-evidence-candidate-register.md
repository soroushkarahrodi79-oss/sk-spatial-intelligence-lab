# V0.2.2 — Real-evidence candidate register (NOT ADMITTED)

**Research snapshot: 2026-10-25.** This is a discovery register, not an intake record or a completed scientific validation. Every candidate is **HOLD** until its actual V4/V5 output, source rights, provenance and external human attestations are checked against [the existing intake protocol](geoimpact-v0.2.1-evidence-intake.md).

## Confirmed input families from GeoImpact-CI's research record

| Candidate family | Existing real-source input evidence | Observed historical research result | Report available for current intake? | Rights / downstream-model gate |
| --- | --- | --- | --- | --- |
| **MAD-INE-2024-2025** — Madrid census sections with fixed official postal portals | Official 2024/2025 INE section layers; fixed 2026-10-03 Ayuntamiento portal extract. Compact frozen research inputs exist in GeoImpact-CI. [Gate 5 source register](https://github.com/soroushkarahrodi79-oss/geoimpact-ci/blob/main/docs/GATE_5_SOURCE_REGISTER.md). | Bounded subset: 2,112 reassigned point relationships; policy BLOCK. Historical Gate 5 output was an *earlier report-contract version*. | **NOT VERIFIED for intake.** A 2026-10-19 GitHub Actions run uploaded a Madrid benchmark artifact; preserve and inspect the exact report version, hashes and producer before any intake. | **HOLD.** INE's official service expressly requires attribution but its dataset-specific reuse permission needs confirmation. Municipal portal data documented CC BY 4.0. Do not assume joint rights or third-party-provider permission. |
| **BAZA-EENNPP-2015-2025** — Sierra de Baza boundaries with fixed REDIAM facilities | Official 2015 and Dec-2025 protected-area boundaries, and fixed 2026-10-05 public-use facility inventory. Compact frozen research inputs exist. [Gate 8 source register](https://github.com/soroushkarahrodi79-oss/geoimpact-ci/blob/main/docs/GATE_8_SOURCE_REGISTER.md). | Bounded negative control: 52 relationships unchanged, zero regressions; policy PASS. Historic V2/V3 reports are not V4/V5 intake records. | **NOT VERIFIED for intake.** Re-run the pinned official-input fixture using an approved V4/V5-generating CLI version outside the laboratory repo and independently inspect the output; do not rename V2/V3 as V5. | **HOLD.** The 2015 layer explicitly carries CC BY 4.0, but the current December 2025 WFS and fixed 2026 facilities layers require separate rights confirmation. Attribution is not automatically permission to send values to a third-party model. |

These are **two underlying study families**, not eight independent cases. Repeating the same fixture across systems, different report versions or multiple random seeds does not create independent geography/data families, and must not be misrepresented as eight distinct real-world validation cases.

## Public sources and evidence

- [INE annual census-section OGC feature service](https://www.ine.es/geoserver/ogc/features/v1/collections) requires acknowledgement: *Seccionado cedido por el Instituto Nacional de Estadística*. The specific dataset licence / permission for redistribution and model-provider use needs independent human review.
- [Junta de Andalucía EENNPP 2015 catalogue](https://www.juntadeandalucia.es/datosabiertos/portal/dataset/limites-de-los-espacios-naturales-protegidos-de-andalucia-eennpp-2015) explicitly states CC BY 4.0.
- [REDIAM December 2025 protected-boundary release](https://www.juntadeandalucia.es/medioambiente/portal/acceso-rediam/visor-condicionantes-ambientales/fichas-descriptivas/eennpp/renpa/limites) documents the updated Sierra de Baza boundary; this is not a substitute for the exact service's rights record.
- [REDIAM WFS overview](https://www.juntadeandalucia.es/medioambiente/portal/acceso-rediam/geoportal/servicios-ogc/web-feature-service-wfs) describes access and download but is **not**, by itself, a licence for forwarding claim packs to an external model.
- [GeoImpact-CI research case documentation](https://github.com/soroushkarahrodi79-oss/geoimpact-ci/blob/main/README.md) distinguishes the Madrid positive benchmark and Sierra de Baza negative control.
- [GeoImpact-CI CI run with Madrid artifacts](https://github.com/soroushkarahrodi79-oss/geoimpact-ci/actions/runs/39253997774): run completed successfully on 2026-10-19 and advertised Madrid benchmark artifacts for Windows and Linux when inspected on 2026-10-25; artifacts have limited retention and may expire. Their contents have **not** been reviewed here.

## Acquisition / qualification checklist (human or independent examiner)

1. Preserve immutable copies of the two compact source-input fixtures and their recorded SHA-256 digests. Do not change GeoImpact-CI's source code or fixtures.
2. Locate exact generated `report.json` and the associated run/config/input identities. For Madrid, inspect the CI artifact **before its retention expires**, or re-run. For Sierra, create a fresh V4/V5 output in an isolated output directory with an approved tagged GeoImpact-CI CLI. A real-source input is necessary but not enough: verify every resulting report against its report version and machine schema.
3. Confirm source provenance, retained hashes, generated report's actual output version, runner identity, timestamps (if supplied externally), report verdict and data-source attribution. The Python CLI's policy BLOCK exit 1 is a completed BLOCK, not a failed analysis.
4. Have a real person check separately: (a) rights to reuse/redistribute, (b) explicit permission for an evidence pack to reach a third-party provider, (c) whether IDs or coordinates reveal personal data/sensitive locations, and (d) whether the run came from authentic real inputs.
5. Keep `NAME.report.json`, `NAME.intake.json` and licences/run logs **outside the public repository**. Start at `status: candidate`; mark `admitted` only after both documented human verification checks and valid software intake.
6. Verify with `node geoimpact-copilot/evaluation/external/intake.mjs DIRECTORY --third-party-model-only`, and independently reconcile with the V0.2.1 Sonnet-prerequisites command. A check can validate paperwork, not prove independent reviewer identity or authenticity.

### Pilot cohort that is still missing

The **pilot floor**, not a release threshold, is at least eight genuine rights-cleared reports: at least three V4 and three V5, two PASS and two BLOCK, a mix of small/medium/large, and at least three independent regions/datasets. Each independent test case needs at least ten blindly human-labelled questions, later sealed before any model run. The full release threshold procedure requires 300 independently assessed cases.

**Current count: 0 verified and admitted, 0 sealed independent cases, 0 review decisions.** Madrid and Sierra are only two leads. No evidence may be counted multiple times simply to satisfy a numerical floor.

## Immediate next actions

- **First:** preserve and inspect the Madrid GitHub Actions report artifact (V4/V5 version and hashes still unknown).
- **Second:** plan an isolated V4/V5 replay of the Sierra frozen fixtures, without writing to GeoImpact-CI.
- **Third:** obtain independent licensing and provenance assessment; where rights are unclear leave the candidate on HOLD.
- **Fourth:** find at least one additional geographically independent real-source case family before planning the eventual eight-report cohort.

No model inference, test-set sealing, fake labels, or approval is authorized by this register.
