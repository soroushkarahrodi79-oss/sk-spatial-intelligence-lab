# Changelog

## Unreleased

- GeoImpact Evidence Copilot V0.2 (draft): add field-level semantic claim binding (labels, units, paths, a reviewed claim vocabulary, verdict-word checks), reject hidden Unicode in report strings, abstain on ambiguous and time/place questions, fix identifiers with spaces/digits or quotes breaking answers and an O(n²) report-validation lookup, add a seeded synthetic evaluation framework with adversarial mutations and development/held-out splits, an external-report intake contract, an offline provider contract and Claude evaluation specification, ADRs 0005–0007, and CI steps for the vocabulary check and V0.2 evaluation. No LLM, API, key or deployment was added.
- Add a local deterministic GeoImpact Evidence Copilot V0.1 with strict V4/V5 report parsing, evidence-linked answers, numerical gating, explicit abstention, synthetic fixtures, and evaluation coverage. No LLM provider or Hugging Face deployment was added.
- Fix V5 software-version provenance being tokenized as a measurement; bind versions and digit-bearing identifiers to exact report strings, narrow numeric evidence to measured paths, and add real CLI-generated synthetic V4/V5 contract fixtures plus adversarial fidelity coverage.

## 0.1.0 — 2026-10-24

- Imported the verified Static HTML Space files and recorded the original Space revision and checksums.
- Added reproducible validation, link and responsive browser checks.
- Added a manual, approval-gated Hugging Face sync workflow with a narrow upload allowlist and deletion disabled.
- Added architecture, security, recovery, inventory, and release documentation.
- Added a keyboard skip link and semantic navigation landmark without changing the page's visual layout.
