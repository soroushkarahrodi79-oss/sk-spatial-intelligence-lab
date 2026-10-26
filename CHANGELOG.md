# Changelog

## Unreleased

- GeoAI-2A Evidence Explorer V0.1 (draft): add a bilingual, static evidence index to the Space with 12 commit-pinned records, four separate status dimensions (no VERIFIED badge), visible limitations and HOLD states, deterministic client-side search with project and type filters, a JSON catalog with schema, `npm run check:evidence`, and browser tests at five viewports in EN and ES. No LLM, backend, new dependency or deployment change. See docs/evidence-explorer-v0.1.md.
- GeoImpact Evidence Copilot V0.2.1 (draft): independent review readiness. Add a generated review packet and blank decision sheet that group the 26 repeated abstention variants and put affirmative claims first; stop tests from pinning the committed review record to `unreviewed`, while refusing placeholder, automated or future-dated approvals; add an intake record and checker for genuine rights-cleared reports that refuses repository synthetic reports, an independent test-set manifest, protocol and checker with pilot and release-gate floors, and machine-checked prerequisites, limits and secret controls for a first Sonnet pilot; pin one evidence URL that pointed at a feature branch. Verdict HOLD. Every review remains UNREVIEWED, no genuine report was evaluated, no LLM, API, key, SDK, deployment or approval was added.
- GeoImpact Evidence Copilot V0.2 (draft): add field-level semantic claim binding (labels, units, paths, a generated claim vocabulary (unreviewed), verdict-word checks), reject hidden Unicode in report strings, abstain on ambiguous and time/place questions, fix identifiers with spaces/digits or quotes breaking answers and an O(n²) report-validation lookup, add a seeded synthetic evaluation framework with adversarial mutations and development/held-out splits, an external-report intake contract, an offline provider contract and Claude evaluation specification, ADRs 0005–0007, and CI steps for the vocabulary check and V0.2 evaluation. No LLM, API, key or deployment was added.
- Add a local deterministic GeoImpact Evidence Copilot V0.1 with strict V4/V5 report parsing, evidence-linked answers, numerical gating, explicit abstention, synthetic fixtures, and evaluation coverage. No LLM provider or Hugging Face deployment was added.
- Fix V5 software-version provenance being tokenized as a measurement; bind versions and digit-bearing identifiers to exact report strings, narrow numeric evidence to measured paths, and add real CLI-generated synthetic V4/V5 contract fixtures plus adversarial fidelity coverage.

## 0.1.0 — 2026-10-24

- Imported the verified Static HTML Space files and recorded the original Space revision and checksums.
- Added reproducible validation, link and responsive browser checks.
- Added a manual, approval-gated Hugging Face sync workflow with a narrow upload allowlist and deletion disabled.
- Added architecture, security, recovery, inventory, and release documentation.
- Added a keyboard skip link and semantic navigation landmark without changing the page's visual layout.
