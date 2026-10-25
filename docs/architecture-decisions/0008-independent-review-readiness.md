# ADR 0008: Independent review readiness before any model experiment

- **Status:** Accepted for the V0.2.1 draft
- **Date:** 2026-10-25

## Context

V0.2 ended with a vocabulary, labels and an evaluation framework that one author wrote and tested. Its tests required the review record to remain `unreviewed` forever, its external-report path could not distinguish a genuine report from a synthetic one, and its review checklist gave a reviewer 52 undifferentiated entries. ADR 0007 forbids any SDK, key or model call until a release gate passes; it does not say what must be true before even a small first experiment.

## Decision

1. **Review state is a fact about people, not a constant in a test.** The committed record may be `unreviewed` (blank) or `reviewed` (complete, current, naming a person). Names that identify an automated system, placeholders and fixtures for the committed record, and future dates are refused. A stale approval still fails closed. No script writes the record.
2. **A reviewer gets a packet, not a list.** It is generated, bound to the vocabulary digest, groups mechanically verified repeats, puts affirmative claims first, and shows source evidence, applicability, exact slots and the author's unresolved concerns. Every decision field is blank.
3. **Genuine reports enter through a separate, human-written intake record** with origin, rights and two named verifications. Reports identical to anything the repository ships or generates are refused. If no genuine report exists, the evaluation stays synthetic and says so.
4. **An independent test set is a sealed manifest of digests and attestations**, with no-leakage rules, blind labelling, a second reviewer, and distinct floors for a pilot (8 reports, no thresholds) and the release gate (300).
5. **The first Sonnet experiment is a Tier A pilot** with limits and thresholds committed before it runs, a pre-call token estimate and claim ceiling, zero tolerance for fact and abstention changes, and server-side secret controls that must be built and signed off first. A checker prints HOLD while any prerequisite is unmet.
6. Nothing in this ADR authorises an SDK, a key, a call, a deployment or an approval.

## Consequences

An independent review and a pilot become executable steps with objective pass conditions. The software can refuse obvious fabrication and cannot prove identity, independence or authenticity; those remain declarations by people, and the documents say so. The cost is more process before any model is tried, which is the intended trade given that the product's value depends on facts never changing.
