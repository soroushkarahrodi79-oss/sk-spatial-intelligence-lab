# SK Spatial Intelligence Lab

An evidence-first geospatial research platform. The current public application is a static HTML showcase; it does not run an LLM, agent, Earth observation inference pipeline, or hosted model.

## Repository layout

- `space/` — Hugging Face Space root. The existing bilingual site is preserved here, with a small keyboard-accessibility improvement.
- `docs/` — architecture roadmap, deployment/security guidance, release records, and architecture decisions.
- `scripts/` — dependency-light content checks, live-link checks, a read-only Space deployment planner, and responsive browser checks.
- `.github/workflows/validate.yml` — validation on pushes and pull requests.
- `.github/workflows/deploy-space.yml` — manual-only Hugging Face deployment. It requires a previewed inventory, an explicit approval input, and a protected GitHub environment.
- `backups/huggingface-space/da10c68f/` — exact snapshot of the four files at the currently deployed Hugging Face commit.

Only `space/README.md`, `space/index.html`, and `space/style.css` are in the deployment allowlist. The action excludes `.gitattributes`; the workflow disables deletion so that the existing destination copy is retained. Unexpected destination files or metadata drift stop preflight.

## Local validation

Requires Node.js 22 or newer. Dependencies are development-only and pinned in `package-lock.json`.

```sh
npm ci
npm run validate
npm run check:links
npx playwright install chromium
npm run test:browser
```

`npm test` runs all four checks after Chromium is installed. CI runs these checks on GitHub Actions; no build step or runtime package is needed to serve the site.

## Deployment

Read [deployment and first-run approval](docs/deployment.md), [credential setup](docs/security-and-credentials.md), the [captured change inventory](docs/pre-deployment-inventory.md), and [rollback instructions](docs/rollback.md) before enabling production sync. The workflow has no push trigger and was not run as part of this work.

## Research integrity

Spatial facts must come from deterministic, inspectable calculations. Model-generated explanations must stay distinct from observations and include provenance, geographic and temporal scope, uncertainty, and interpretation limits. The roadmap is planning only; proposed AI systems are not represented as implemented.
