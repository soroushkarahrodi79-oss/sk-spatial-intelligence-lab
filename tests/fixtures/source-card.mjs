// A fully "checked" source card for tests. The host is reserved (.invalid), so it can never be
// mistaken for a real source, and the card is built in memory and never written to data/sources/.
// Every call returns fresh objects: mutating one field in a negative case must not alter another.

export const FIXTURE_HOST = "example.invalid";
export const FIXTURE_URL = `https://${FIXTURE_HOST}/fixture`;
export const FIXTURE_DATE = "2026-11-02";

export const text = () => ({ es: "Texto de prueba", en: "Test text" });
export const consulted = () => ({ url: FIXTURE_URL, consultedOn: FIXTURE_DATE });

export const checkedCard = () => ({
  schemaVersion: 1,
  id: "test-fixture",
  label: { es: "Ficha de prueba", en: "Test fixture" },
  officialTitle: { status: "checked", text: text(), ...consulted() },
  producer: { name: { status: "checked", text: text(), ...consulted() }, officialHosts: [FIXTURE_HOST] },
  measures: { status: "checked", population: text(), unit: text(), unitClass: "site-visits", method: "sensor-count", ...consulted() },
  doesNotMeasure: [{ status: "checked", text: text(), ...consulted() }],
  coverage: {
    temporal: { status: "checked", from: "2020-01", to: "ongoing", resolution: "month", ...consulted() },
    spatial: { status: "checked", extent: text(), granularity: "site", ...consulted() },
  },
  methodBreaks: {
    review: { status: "checked", outcome: "breaks-documented", ...consulted() },
    items: [{ id: "brk-01", status: "checked", date: "2024-05-01", description: text(), documentedEffect: { kind: "not-documented" }, ...consulted() }],
  },
  license: { status: "checked", name: text(), reuseConditions: text(), ...consulted() },
  claimCeiling: { level: "descriptive", basis: "default-v0.1", causalInference: "not-supported" },
});
