# GeoImpact-CI generated contract fixtures

SPDX-License-Identifier: CC0-1.0

These reports were generated locally from newly authored synthetic GeoJSON and
configuration files. The polygon and point coordinates are test geometry only;
they are not field observations, research findings, or evidence about actual
facilities or districts. No GeoImpact-CI research fixture or third-party
spatial data was copied or used.

## Generation provenance

- V5 `report-v5-block.json` and `report-v5-pass.json` were emitted by the
  GeoImpact-CI CLI from the public `v1.2.0` tag at commit
  `45237d7caaea2aa4b81359e46f1623918645078c`.
- The V4 `report-v4-block.json` was emitted by the CLI from public tag `v1.1.0`
  at commit `c60d2eda8b54b137145755618b9793c05ec7b228`. GeoImpact-CI V1.2.0 emits
  V5, not V4; its migration contract explicitly retains V4 compatibility, so
  the real V1.1.0 V4 artifact is used to test that legacy input path rather
  than relabeling a transformed V5 report as generated V4.
- Source checkouts were detached and read-only for this work; no files in the
  GeoImpact-CI repository were changed. The command used was
  `python -m geoimpact.cli analyze --config CONFIG --out OUTPUT`, with
  `PYTHONPATH` pointed at the detached tag's `src` directory.
- The local runtime was Python 3.14.5, Shapely 2.1.2 / GEOS 3.13.1, and PyProj
  3.7.2 / PROJ 9.5.1. V5 provenance independently records the tool-reported
  engine strings; the generator's V1.2.0 source declares the exact Shapely and
  PyProj package pins.

Read-only contract and rights sources: [V1.2.0 README](https://github.com/soroushkarahrodi79-oss/geoimpact-ci/blob/v1.2.0/README.md), [V5 migration record](https://github.com/soroushkarahrodi79-oss/geoimpact-ci/blob/v1.2.0/docs/REPORT_V5_MIGRATION.md), [V1.2.0 provenance implementation](https://github.com/soroushkarahrodi79-oss/geoimpact-ci/blob/v1.2.0/src/geoimpact/provenance.py), and [MIT software license](https://github.com/soroushkarahrodi79-oss/geoimpact-ci/blob/v1.2.0/LICENSE).

The V5 reports contain raw input SHA-256 identities from the generator:

| Input | SHA-256 |
| --- | --- |
| `config-block.yml` | `28dd20e2cff9d298ffdc9254059d47a3778be37b55f84264284f29eabc971e6c` |
| `config-pass.yml` | `ccf2bb44134404f97b0ae5356aa658132a1062b6e2d73d02ff901e7043b08ffb` |
| `zones-base.geojson` | `d506d80d51a4e083f71470ebab3b1da963d75cae65438b15bf61f28439ec7dfa` |
| `zones-candidate.geojson` | `faac11b84ed3588672885466e9772a624d43445410caf3316b55a1e4fa3a6a59` |
| `facilities.geojson` | `d0691869628ef8a2a77602638ad81c71216cb422c2525f373c6eaeee24392ef9` |

The SHA-256 values below identify the committed report artifacts themselves:

| Generated report | SHA-256 |
| --- | --- |
| `report-v4-block.json` | `de5fe18d3fb61a0be013aa625bc710ed1ba936f96b91503ed8dc2862845885d0` |
| `report-v5-block.json` | `79f815b1aeb0f0a6e67117d08d1ab061ecbdd57929f93dd2ab5126313e7fdea5` |
| `report-v5-pass.json` | `24a5d73c3c1788c552d098bc8669ff3f6018605f704cc16f28e2b071a11e3888` |

The report files and input files in this directory are original synthetic
artifacts dedicated to the public domain under CC0 1.0 Universal. The upstream
GeoImpact-CI software is separately licensed MIT; only its public CLI was run,
and no upstream source code or fixture contents are included here. This CC0
notice does not grant rights over any other GeoImpact-CI material.

## Reproduction

Clone the public GeoImpact-CI repository in a scratch directory, check out the
tag listed above, install its declared dependencies in an isolated Python
environment, then run the CLI with either YAML config. The input paths are
relative to each config. The V1.1.0 tag is required to regenerate the V4
artifact; V1.2.0 regenerates the two V5 artifacts. The V4/V5 distinction is
contract compatibility, not a scientific difference.
