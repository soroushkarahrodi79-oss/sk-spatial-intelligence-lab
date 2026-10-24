# ADR 0003: Deterministic spatial evidence remains authoritative

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

Future features may use LLMs to retrieve documentation, explain spatial outputs, or request GIS operations. The lab publishes scientific and decision-support claims where fabricated geometry or numerical results would be misleading.

## Decision

All geometry, distance, area, measurements, confidence values derived from data, and policy outcomes must come from deterministic, inspectable algorithms with versioned inputs and methods. Models may explain verified evidence, must cite sources, and must abstain when evidence is unavailable. Future spatial tools will be typed, allowlisted, read-only, and evaluated independently.

## Consequences

Any future GeoAI feature must expose provenance, geographic and temporal scope, uncertainty, and interpretation limits. Model-generated prose must be labeled separately from observed data and deterministic results. The GeoImpact Evidence Copilot is the first planned feature because its source project already provides deterministic JSON evidence.
