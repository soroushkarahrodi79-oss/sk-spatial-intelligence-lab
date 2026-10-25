# V0.2.2 — Madrid V5 CI artifact inspection receipt (NOT ADMITTED)

Inspection date: 2026-10-25. Inspection role: mechanical file inspection and SHA-256 comparison; **not independent human review**, not a licence decision, not a report-intake record.

## Immutable origin reference

- Producer repository: [GeoImpact-CI](https://github.com/soroushkarahrodi79-oss/geoimpact-ci).
- Workflow run: [39253997774](https://github.com/soroushkarahrodi79-oss/geoimpact-ci/actions/runs/39253997774), 2026-10-19.
- Linux artifact name: `geoimpact-madrid-benchmark-linux-py311` (GitHub Actions artifact ID `12187835063`).
- Windows artifact name: `geoimpact-madrid-benchmark-windows-py314` (GitHub Actions artifact ID `12187870158`).
- Both artifact archives were downloaded and inspected. Artifacts have limited GitHub retention; this record does **not** assert their links will stay live.
- The report payload is not added to the laboratory repository. Archive copies must be kept private until rights and sensitive-location review.

## Mechanical inspection of exact bytes

| Property | Linux | Windows | Finding |
| --- | --- | --- | --- |
| `report_version` | 5 | 5 | V5 in both |
| `provenance.engine.geoimpact_ci` | 1.2.0 | 1.2.0 | Matches published tagged version |
| `verdict` | BLOCK | BLOCK | Same policy outcome |
| `relationships` array length | 2,112 | 2,112 | Same report structure |
| `relationship_regressions` array length | 2,112 | 2,112 | Same bounded case outcome |
| `report.json` SHA-256 | `29a9337a90c7a1c591f7c05c109ee29b8c38b33324e0bb02867c1fb6a6b272df` | Same | Byte-identical |
| `report.md` SHA-256 | `ec7124260275f8ae473a9eea00da59eca2866527a8cf57714ae5bb0d681b5253` | Same | Byte-identical |
| `relationship-regressions.geojson` SHA-256 | `0689f0983441f4c3c745690c9f7bf409347862f93d94754a2ef15826c49e6bcf` | Same | Byte-identical |

The report's V5 `provenance.inputs` includes:
- config: `7395510b1bc4b760dd606f1998d2ec317af0512768d223198544c7b6e52fc5b1`
- primary BASE: `9987b42293ffdda93b3cb5a1d897bccea4b084ed1ba0e1bd5eaf7f4eb303c453`
- primary CANDIDATE: `18956b960c4b8adf5d750c04cf51a5db638ed8054e5e83988003ea59ce4d9da3`
- fixed dependency: `a8ad452cb74dcc77cdfe43fb040b5e4b6ecee38c63710932e3de4209f74f6ec0`

All four values match the frozen derived input file SHA-256 values documented in [GeoImpact-CI Gate 5 source register](https://github.com/soroushkarahrodi79-oss/geoimpact-ci/blob/main/docs/GATE_5_SOURCE_REGISTER.md). That corroborates declared input identity and cross-platform deterministic serialization **for this one source case**; it does not prove INE licensing, the report's real-world correctness or its suitability for third-party model processing.

## Required next steps before any admission

1. Retain a private immutable copy of `report.json` and its workflow provenance while source artifacts are available.
2. Independently verify producer/run provenance, source licence and permitted downstream purpose for both INE section geometry and municipal portal data. A free-download/attribution statement does not by itself establish third-party model rights.
3. Check whether identifiers/locations in the report or its evidence pack are sensitive or personal under the intended use.
4. Have a named human independently document origin and rights checks and create `NAME.intake.json` beside the report **outside the repository**, initially `candidate`.
5. Run the real intake checker and link any pilot test-set case to the admitted exact report hash. Until then, leave `P3` and `P4` **HOLD**.

**Scientific count:** one inspected V5 report derived from one real-source Madrid case; zero **admitted** reports. The matching Windows and Linux outputs are cross-platform reproducibility evidence, not two independent observations or two eligible cases. No human signature, label, seal or Sonnet call has occurred.
