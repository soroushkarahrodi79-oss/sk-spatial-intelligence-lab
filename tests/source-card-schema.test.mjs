// Tests for data/source-card.schema.json and the shipped cards in data/sources/.
// They check SHAPE only. Host membership, calendar validity of dates, cross-references and
// wording are the job of scripts/source-cards.mjs (tests/source-cards.test.mjs).

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { checkedCard, consulted, FIXTURE_URL as FIXTURE, text } from "./fixtures/source-card.mjs";

const schema = JSON.parse(await readFile("data/source-card.schema.json", "utf8"));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
const files = (await readdir("data/sources")).filter((name) => name.endsWith(".json")).sort();
const cards = await Promise.all(files.map(async (name) => ({ name, card: JSON.parse(await readFile(`data/sources/${name}`, "utf8")) })));
const clone = (value) => structuredClone(value);
const errorsOf = (card) => (validate(card) ? [] : validate.errors);

test("the shipped cards: at most 8, one file per id, all valid", () => {
  assert.ok(cards.length >= 1 && cards.length <= 8, `expected 1..8 cards, found ${cards.length}`);
  assert.equal(new Set(cards.map(({ card }) => card.id)).size, cards.length, "duplicate card id");
  for (const { name, card } of cards) {
    assert.equal(`${card.id}.json`, name, `${name}: file name must equal the card id`);
    assert.deepEqual(errorsOf(card), [], name);
  }
});

test("a fully checked card is accepted (the schema is not accidentally unsatisfiable)", () => {
  assert.deepEqual(errorsOf(checkedCard()), []);
});

test("every shipped card keeps the v0.1 default ceiling and no causal level", () => {
  for (const { name, card } of cards) {
    assert.equal(card.claimCeiling.level, "descriptive", `${name}: needs a cited rationale to leave 'descriptive'`);
    assert.equal(card.claimCeiling.causalInference, "not-supported", name);
  }
});

test("pending statements accept only the literal [X] and a reason", () => {
  const cases = {
    "approximate value instead of [X]": (c) => { c.officialTitle = { status: "pending", text: "approx. 2020", pendingReason: "to be confirmed at the official page" }; },
    "pending without a reason": (c) => { delete c.officialTitle.pendingReason; c.officialTitle = { status: "pending", text: "[X]" }; },
    "pending with a one-word reason": (c) => { c.officialTitle = { status: "pending", text: "[X]", pendingReason: "later" }; },
    "pending carrying a URL as if it were evidence": (c) => { c.officialTitle = { status: "pending", text: "[X]", pendingReason: "to be confirmed at the official page", url: FIXTURE }; },
    "pending measures with a real enum value": (c) => { c.measures = { status: "pending", population: "[X]", unit: "[X]", unitClass: "site-visits", method: "[X]", pendingReason: "to be confirmed at the official page" }; },
  };
  for (const [label, mutate] of Object.entries(cases)) {
    const card = checkedCard();
    mutate(card);
    assert.notDeepEqual(errorsOf(card), [], label);
  }
});

test("checked statements need an https URL and a consultation date", () => {
  const cases = {
    "no url": (c) => { delete c.officialTitle.url; },
    "no consultedOn": (c) => { delete c.officialTitle.consultedOn; },
    "http url": (c) => { c.officialTitle.url = "http://example.invalid/x"; },
    "url with spaces": (c) => { c.officialTitle.url = "https://example.invalid/a b"; },
    "date not ISO": (c) => { c.officialTitle.consultedOn = "22/11/2026"; },
    "checked measures without url": (c) => { delete c.measures.url; },
    "checked license without date": (c) => { delete c.license.consultedOn; },
    "checked break without url": (c) => { delete c.methodBreaks.items[0].url; },
    "checked break without date": (c) => { delete c.methodBreaks.items[0].date; },
    "checked break with a pending description": (c) => { c.methodBreaks.items[0].description = "[X]"; },
    "checked coverage with a placeholder resolution": (c) => { c.coverage.temporal.resolution = "[X]"; },
    "text in one language only": (c) => { delete c.officialTitle.text.en; },
  };
  for (const [label, mutate] of Object.entries(cases)) {
    const card = checkedCard();
    mutate(card);
    assert.notDeepEqual(errorsOf(card), [], label);
  }
});

test("method breaks: an empty list cannot pass for 'no breaks'", () => {
  const none = checkedCard();
  none.methodBreaks = { review: { status: "checked", outcome: "none-documented", ...consulted() }, items: [] };
  assert.deepEqual(errorsOf(none), [], "a reviewed 'none documented' with no items is valid");

  const noneButListed = clone(none);
  noneButListed.methodBreaks.items = checkedCard().methodBreaks.items;
  assert.notDeepEqual(errorsOf(noneButListed), [], "none-documented with items");

  const documentedButEmpty = checkedCard();
  documentedButEmpty.methodBreaks.items = [];
  assert.notDeepEqual(errorsOf(documentedButEmpty), [], "breaks-documented with an empty list");

  const unreviewed = { review: { status: "pending", outcome: "[X]", pendingReason: "documentation not read yet" }, items: [] };
  const card = checkedCard();
  card.methodBreaks = unreviewed;
  assert.deepEqual(errorsOf(card), [], "an unreviewed card may list nothing, and says so as pending");
  const withoutReview = checkedCard();
  delete withoutReview.methodBreaks.review;
  assert.notDeepEqual(errorsOf(withoutReview), [], "a methodBreaks block without review");

  const effect = checkedCard();
  effect.methodBreaks.items[0].documentedEffect = { kind: "not-documented", text: text() };
  assert.notDeepEqual(errorsOf(effect), [], "not-documented carrying an estimate");
});

test("the claim ceiling cannot be causal and 'associative' needs a checked rationale", () => {
  const cases = {
    "causal level": (c) => { c.claimCeiling = { level: "causal", basis: "cited", causalInference: "not-supported" }; },
    "causalInference supported": (c) => { c.claimCeiling.causalInference = "supported"; },
    "causalInference missing": (c) => { delete c.claimCeiling.causalInference; },
    "associative without rationale": (c) => { c.claimCeiling = { level: "associative", basis: "cited", causalInference: "not-supported" }; },
    "associative with a pending rationale": (c) => { c.claimCeiling = { level: "associative", basis: "cited", causalInference: "not-supported", rationale: { status: "pending", text: "[X]", pendingReason: "to be confirmed at the official page" } }; },
    "associative resting on the default basis": (c) => { c.claimCeiling = { level: "associative", basis: "default-v0.1", causalInference: "not-supported", rationale: { status: "checked", text: text(), ...consulted() } }; },
    "descriptive with an unnecessary rationale": (c) => { c.claimCeiling.rationale = { status: "checked", text: text(), ...consulted() }; },
  };
  for (const [label, mutate] of Object.entries(cases)) {
    const card = checkedCard();
    mutate(card);
    assert.notDeepEqual(errorsOf(card), [], label);
  }
  const associative = checkedCard();
  associative.claimCeiling = { level: "associative", basis: "cited", causalInference: "not-supported", rationale: { status: "checked", text: text(), ...consulted() } };
  assert.deepEqual(errorsOf(associative), [], "associative with a checked, cited rationale is valid");
});

test("structure: limits are mandatory, no extra fields, closed vocabularies", () => {
  const cases = {
    "no doesNotMeasure": (c) => { delete c.doesNotMeasure; },
    "empty doesNotMeasure": (c) => { c.doesNotMeasure = []; },
    "no license": (c) => { delete c.license; },
    "extra top-level field": (c) => { c.reliabilityScore = 0.9; },
    "extra field in a statement": (c) => { c.officialTitle.verified = true; },
    "unknown unitClass": (c) => { c.measures.unitClass = "tourists"; },
    "unknown method": (c) => { c.measures.method = "ai-estimate"; },
    "unknown granularity": (c) => { c.coverage.spatial.granularity = "street"; },
    "host with a path": (c) => { c.producer.officialHosts = ["example.invalid/path"]; },
    "host with a scheme": (c) => { c.producer.officialHosts = ["https://example.invalid"]; },
    "duplicate hosts": (c) => { c.producer.officialHosts = ["example.invalid", "example.invalid"]; },
    "bad id": (c) => { c.id = "Not A Slug"; },
    "wrong schemaVersion": (c) => { c.schemaVersion = 2; },
    "bad evidence link": (c) => { c.evidenceLinks = ["EV-XXX-001"]; },
    "bad break id": (c) => { c.methodBreaks.items[0].id = "break-1"; },
  };
  for (const [label, mutate] of Object.entries(cases)) {
    const card = checkedCard();
    mutate(card);
    assert.notDeepEqual(errorsOf(card), [], label);
  }
  const linked = checkedCard();
  linked.evidenceLinks = ["EV-MUL-001"];
  assert.deepEqual(errorsOf(linked), [], "a well-formed evidence link is accepted");
});

test("the schema has no value for 'validated', 'verified' or a reliability rating", () => {
  const source = JSON.stringify(schema);
  for (const word of ["validated", "verified", "reliab", "certified", "\"causal\""]) {
    assert.ok(!new RegExp(word, "i").test(source.replace(/"description":"[^"]*"/g, "")), `schema must not define ${word}`);
  }
});
