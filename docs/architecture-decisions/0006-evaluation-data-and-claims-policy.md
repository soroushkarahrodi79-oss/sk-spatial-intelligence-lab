# ADR 0006: Evaluation data, splits, and what scores may be claimed

- **Status:** Accepted for the V0.2 draft
- **Date:** 2026-10-24

## Context

The only data available are invented fixtures. A high score on them is easy to mistake for evidence of real-world quality, and the same author writes the generator, the oracle and the answer vocabulary.

## Decision

1. The mandatory offline baseline is a seeded synthetic generator with an oracle that does not import the code under test, plus hand-typed expectations on committed fixtures. Results are always printed with a scope notice that they are synthetic.
2. Real reports are optional and external. They enter only through sidecar metadata that records source provenance, rights evidence, redistribution permission, absence of personal data, the report hash, an assigned split, independent labels with labeller role, human-review status and uncertainty notes. The repository bundles none. Reports without complete metadata fail the gate. Reports whose review status is not `reviewed` are listed but excluded from every aggregate.
3. Development and held-out splits are fixed seed ranges with recorded digests. The first held-out draft was inspected when it exposed defects and was folded into development; the recorded held-out result is from seeds drawn afterwards. They are run as a gate, are not used to build the vocabulary or tune the gate, and no held-out failure has driven a change since they were drawn. If one does, those seeds are retired.
4. Every rate carries n and a Wilson 95% interval, with the statement that generated cases are not independent. Perfect rates are reported as "no failure in n".
5. Synthetic scores must not be described as scientific accuracy, and human-review status must be stated wherever labels are cited.

## Consequences

The framework can absorb real data later without redesign, and cannot overstate what it has now. The held-out split is procedural, not organisationally independent. Meaningful claims about real accuracy remain blocked on the data described in the V0.3 release gate.
