# ADR 0007: Claude provider evaluation specification and the V0.3 release gate

- **Status:** Accepted as a specification; no implementation
- **Date:** 2026-10-24

## Context

A language model could help order or present deterministic claims, but the product's value depends on facts never changing. The earlier boundary (ADR 0004) already limits a provider to claim IDs. V0.2 adds a verifier strong enough to enforce that on rendered output.

## Decision

1. The first model integration is **tier A only**: the provider selects and orders pre-authorized claim IDs through a strict structured output (`geoimpact-provider-output/1`). It cannot write text, numbers or citations and cannot change the decision. Constrained paraphrase (tier B) is deferred behind a separate ADR.
2. The deterministic router owns abstention and ambiguity. Every provider failure falls back to the deterministic answer, and the full semantic gate runs on whatever is shown.
3. Candidate models are evaluated, not assumed: `claude-sonnet-5-5` as baseline, `claude-haiku-5-5` as an optional lower-cost router, `claude-opus-5-5` as an optional comparator on hard cases. The choice is the cheapest candidate meeting every bar on held-out data, tie-broken on p95 latency, and *no model* if none beats deterministic ordering in blinded review.
4. This repository adds no SDK, key, account, network call or hosted model until the gate in `docs/geoimpact-v0.3-claude-integration-design.md` passes. A test asserts the specification declares live calls disabled, names no credential or endpoint, and that no model-vendor package is a dependency.
5. The offline contract (schema, evidence pack, validator, fallback) is committed and tested with fake providers so that the later integration is a drop-in behind a feature flag.

## Consequences

The riskiest part of an LLM feature, factual drift, is closed by construction rather than by prompting. The cost is a small feature surface: a model can reorder, not explain. If that proves not worth the latency and cost, the measured answer is to ship nothing, which this ADR explicitly allows.
