# ADR 0004: Local deterministic GeoImpact Evidence Copilot V0.1

- **Status:** Accepted for prototype scope
- **Date:** 2026-10-24

## Context

GeoImpact-CI emits a deterministic report, but the lab has no backend or operating LLM. The lab roadmap requires field-level provenance, abstention, and model separation from measurements and policy outcomes.

## Decision

Implement a local CLI that accepts only strict GeoImpact-CI V4/V5 report JSON. Use a closed JSON Schema plus semantic consistency checks. Answer a narrow set of question intents with deterministic templates. Each claim must cite resolvable report JSON Pointers, deterministic derivations, or named public source records. Numerical text must exactly match values in the cited evidence. Unsupported or missing evidence yields an explicit abstention.

Ship only hand-authored synthetic, CC0 fixtures, clearly labeled as non-research examples. Do not include real or third-party spatial data.

Provide an optional server-side provider interface, but ship no model client, credentials, network call, or deployed UI. A future provider may only select and order a complete set of pre-authorized claims. Server-rendered deterministic text remains authoritative.

## Consequences

The prototype is useful for local report inspection and evaluation but is not a chatbot, hosted LLM, spatial analysis engine, or scientific result. The static Hugging Face Space and its manual-only protected deployment path remain unchanged. A hosted model requires independent rights review, broader human-labeled evaluations, authenticated backend controls, and a new architecture/security decision.
