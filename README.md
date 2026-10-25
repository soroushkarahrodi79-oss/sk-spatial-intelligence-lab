# SK Spatial Intelligence Lab

An evidence-first geospatial research platform. The current public application is a static HTML showcase; it does not run an LLM, agent, Earth observation inference pipeline, or hosted model.

## Repository layout

- `space/` — Hugging Face Space root. The existing bilingual site is preserved here, with a small keyboard-accessibility improvement.
- `docs/` — architecture roadmap, deployment/security guidance, release records, and architecture decisions.
- `scripts/` — dependency-light content checks, live-link checks, a read-only Space deployment planner, and responsive browser checks.
- `.github/workflows/validate.yml` — validation on pushes and pull requests.
- `.github/workflows/deploy-space.yml` — manual-only Hugging Face deployment. It requires a previewed inventory, an explicit approval input, and a protected GitHub environment.
- `backups/huggingface-space/da10c68f/` — exact snapshot of the four files at the currently deployed Hugging Face commit.
- `geoimpact-copilot/` — local deterministic report parser and evidence-linked question-answering prototype. It is not an operating LLM or hosted service.

Only `space/README.md`, `space/index.html`, and `space/style.css` are in the deployment allowlist. The action excludes `.gitattributes`; the workflow disables deletion so that the existing destination copy is retained. Unexpected destination files or metadata drift stop preflight.

## Local validation

Requires Node.js 22 or newer. Dependencies are development-only and pinned in `package-lock.json`.

```sh
npm ci
npm run validate
npm run test:copilot
npm run evaluate:copilot
npm run check:links
npx playwright install chromium
npm run test:browser
```

`npm test` runs all validation, copilot, link, and browser checks after Chromium is installed. CI runs these checks on GitHub Actions; no build step or runtime package is needed to serve the static site.

## GeoImpact Evidence Copilot V0.1 and V0.2 hardening

The local deterministic prototype accepts canonical GeoImpact-CI report V4/V5 JSON and answers a narrow set of questions about policy verdicts, relationship changes, primary geometry differences, metrics, provenance, and evidence limits. It validates report structure and cross-field consistency, ties quantities to typed report paths, binds versions and digit-bearing identifiers to exact cited strings, and abstains when the report cannot support a question. Hand-authored fixtures and generated CLI reports use synthetic inputs; none are research observations.

```sh
npm run copilot -- --report geoimpact-copilot/fixtures/block-v5.json --question "Why did this report BLOCK?"
npm run test:copilot
npm run evaluate:copilot
```

The default path is deterministic. No LLM client, model credentials, API, or user interface is included. A server-side adapter boundary is documented and fail-closed; it may only select pre-authorized claim IDs, while the application renders all factual text and numbers. See [the V0.1 architecture, threat model, evaluation, limitations, and recommendation](docs/geoimpact-evidence-copilot-v0.1.md).

V0.2 (draft) adds field-level semantic claim binding, so a value attached to the wrong field, label or unit is rejected even when every number and citation is individually valid, plus a synthetic evaluation framework with adversarial cases, development and held-out splits, an intake path for rights-cleared external reports, and an offline specification for a possible future Claude provider. No model is integrated and no API is called. Scores are measured on synthetic reports only and are not real-world accuracy. See [GeoImpact Evidence Copilot V0.2](docs/geoimpact-evidence-copilot-v0.2.md) and the [V0.3 design and release gate](docs/geoimpact-v0.3-claude-integration-design.md).

V0.2.1 (draft) prepares an independent review without performing one: a [review packet](docs/review/geoimpact-v0.2.1-review-packet.md), hardened review-record checks, an evidence intake for genuine reports, an independent test-set protocol and the exact prerequisites for a first Sonnet pilot. **Verdict: HOLD.** Every review is still UNREVIEWED, no genuine report has been evaluated and no model is called. See [V0.2.1 independent review readiness](docs/geoimpact-v0.2.1-independent-review-readiness.md).

## Deployment

Read [deployment and first-run approval](docs/deployment.md), [credential setup](docs/security-and-credentials.md), the [captured change inventory](docs/pre-deployment-inventory.md), and [rollback instructions](docs/rollback.md) before enabling production sync. The workflow has no push trigger and was not run as part of this work.

## Research integrity

Spatial facts must come from deterministic, inspectable calculations. Model-generated explanations must stay distinct from observations and include provenance, geographic and temporal scope, uncertainty, and interpretation limits. The roadmap is planning only; proposed AI systems are not represented as implemented.
