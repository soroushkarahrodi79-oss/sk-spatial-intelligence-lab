# SK Spatial Intelligence Lab

**Independent, reproducible geospatial research and spatial evidence systems.**

[![Validate](https://github.com/soroushkarahrodi79-oss/sk-spatial-intelligence-lab/actions/workflows/validate.yml/badge.svg)](https://github.com/soroushkarahrodi79-oss/sk-spatial-intelligence-lab/actions/workflows/validate.yml)
[![Hugging Face Space](https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-Live%20Space-blue)](https://huggingface.co/spaces/soroushkararodi/sk-spatial-intelligence-lab)
![Version](https://img.shields.io/badge/version-0.1.0-informational)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933)

[**Live Space**](https://huggingface.co/spaces/soroushkararodi/sk-spatial-intelligence-lab) · [Roadmap](docs/architecture-roadmap.md) · [Case Study 01](docs/case-studies/01-mahou-calderon.md) · [Changelog](CHANGELOG.md) · [Docs](docs/)

> *Resumen en español:* laboratorio de investigación geoespacial con enfoque *evidence-first*. Los hechos espaciales salen de cálculos deterministas e inspeccionables; cualquier explicación generada por un modelo se mantiene separada de las observaciones y declara procedencia, alcance, incertidumbre y límites. El sitio público es bilingüe (ES/EN).

---

## What this is

SK Spatial Intelligence Lab is a research and engineering project built on one rule: **spatial claims must be traceable to deterministic, inspectable calculations**. Model-generated text, where it is ever used, must stay distinct from observations and carry provenance, geographic and temporal scope, uncertainty, and interpretation limits.

### Honest status

| Component | State |
|---|---|
| Public Space | Static, bilingual HTML site on Hugging Face. |
| Evidence Explorer V0.1 | Static search over a fixed 12-record catalog. Plain text search, not AI. |
| Claim-to-Source Trace V0.1 | Draft. Exact line-range permalinks for three records. |
| GeoImpact Evidence Copilot V0.1–V0.2.1 | Local, deterministic prototype. Draft. Verdict **HOLD**. |
| Madrid Evidence MCP | Local, read-only stdio server with four tools over five Madrid Urban Evidence Lens registry query shapes. Integrates no LLM. Draft. Not scientifically validated. [Case Study 01](docs/case-studies/01-mahou-calderon.md) (Spanish). |
| LLM, agent, EO inference, hosted model | **None implemented.** Roadmap items are plans only. |

Scores in this repository are measured on synthetic data and are not real-world accuracy.

## Components

### Static Space (`space/`)
The Hugging Face Space root: a bilingual landing page plus the Evidence Explorer, with no build step and no runtime dependency.

### Evidence Explorer V0.1 (`data/`)
A commit-pinned catalog of 12 records, each with separate **provenance, reproducibility, validation and review** labels (there is deliberately no single "VERIFIED" badge). Limitations and HOLD states are shown, not hidden. Claim-level traces tie a claim, method and limitation to exact line ranges of pinned documents.
See [Evidence Explorer V0.1](docs/evidence-explorer-v0.1.md) and [Claim-to-Source Trace V0.1](docs/claim-trace-v0.1.md).

### GeoImpact Evidence Copilot (`geoimpact-copilot/`)
A local, deterministic question-answering prototype over canonical GeoImpact-CI report V4/V5 JSON. It:

- validates report structure and cross-field consistency;
- ties every quantity to a typed report path and binds versions and identifiers to exact cited strings;
- rejects a value attached to the wrong field, label or unit (V0.2 semantic claim binding);
- **abstains** when the report cannot support the question.

No LLM client, credentials, API or UI is included. A server-side adapter boundary is documented and fail-closed: a model could only select pre-authorized claim IDs while the application renders all facts and numbers.

```sh
npm run copilot -- --report geoimpact-copilot/fixtures/block-v5.json --question "Why did this report BLOCK?"
```

Details: [V0.1](docs/geoimpact-evidence-copilot-v0.1.md) · [V0.2](docs/geoimpact-evidence-copilot-v0.2.md) · [V0.2.1 review readiness](docs/geoimpact-v0.2.1-independent-review-readiness.md) · [V0.3 design and release gate](docs/geoimpact-v0.3-claude-integration-design.md).


### Madrid Evidence MCP v0 (`mcp/madrid-evidence/`)
A read-only stdio MCP server exposing four tools over five deterministic query shapes that Madrid Urban Evidence Lens already resolves (`AMBITO_AT_POINT`, `AMBITO_PHASES`, `AMBITO_EDITION_DIFF`, `SOURCE_PROVENANCE`, `LICENCES_IN_LENS`). It reuses Lens's registry code at a pinned commit, verifies eleven pinned files before starting, and integrates no LLM. The v0.3 evaluation cases are defined but have not been run in an automated evaluation. See [its README](mcp/madrid-evidence/README.md) and [Case Study 01: Nuevo Mahou-Calderón](docs/case-studies/01-mahou-calderon.md) (Spanish; an unvalidated technical demonstrator).

## Repository layout

```text
space/                 Hugging Face Space root (static site)
data/                  Evidence catalog, JSON schema, claim excerpts
geoimpact-copilot/     Deterministic report parser and evidence-linked Q&A prototype
mcp/madrid-evidence/   Local read-only MCP server over the Madrid Lens evidence registry
scripts/               Content checks, link checks, deploy planner, browser checks
tests/                 Test suites
docs/                  Roadmap, ADRs, deployment, security, release and review records
backups/               Exact snapshot of the deployed Space at commit da10c68f
.github/workflows/     validate.yml (CI) and deploy-space.yml (manual, approval-gated)
```

Architecture decisions are recorded as ADRs in [`docs/architecture-decisions/`](docs/architecture-decisions/).

## Getting started

Requires **Node.js 22+**. Dependencies are development-only and pinned in `package-lock.json`.

```sh
npm ci
npm run validate
npm run test:copilot
npm run evaluate:copilot
npm run check:links
npx playwright install chromium
npm run test:browser
```

`npm test` runs every check once Chromium is installed. CI runs the same checks on GitHub Actions. Serving the site needs no build step.

## Deployment and safety

Deployment to Hugging Face is **manual only**: no push trigger, a previewed inventory, an explicit approval input, a protected GitHub environment, a three-file allowlist (`space/README.md`, `space/index.html`, `space/style.css`), and deletion disabled. Unexpected destination files or metadata drift stop preflight.

Read before enabling production sync: [deployment and first-run approval](docs/deployment.md) · [credential setup](docs/security-and-credentials.md) · [change inventory](docs/pre-deployment-inventory.md) · [rollback](docs/rollback.md).

## Research integrity principles

1. Spatial facts come from deterministic, inspectable calculations.
2. Model output is never presented as observation.
3. Every claim carries provenance, scope, uncertainty and limits.
4. Status is multi-dimensional; unreviewed means unreviewed.
5. Systems abstain rather than guess.
6. Roadmap items are never described as implemented.

## Contributing and license

Issues and discussion are welcome through GitHub. Please keep changes consistent with the principles above and run `npm test` before opening a pull request. No license file is currently published, so all rights are reserved by default until one is added.

**Author:** Soroush Karahrodi
