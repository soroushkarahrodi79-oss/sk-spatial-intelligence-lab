// Tests for scripts/source-cards.mjs (Tourism Data Guard, step B).
// They exercise the validator on the shipped cards, on a fully checked in-memory fixture, and on
// deliberately broken variants of it. No network: --online is tested with an injected fetch.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkCards, checkOnline, checkedUrls, compileValidator, describeSchemaErrors, hostAllowed, isRealDate, isRealMonth, loadCards, loadEvidenceIds, loadSchema, wordingProblems } from "../scripts/source-cards.mjs";
import { checkedCard, consulted, FIXTURE_HOST, text } from "./fixtures/source-card.mjs";

const validate = compileValidator(await loadSchema());
const evidenceIds = await loadEvidenceIds();
const TODAY = "2026-11-22";
const run = (cards, options = {}) => checkCards(cards.map((card) => ({ file: `${card.id}.json`, card })), { validate, evidenceIds, today: TODAY, ...options });
const problemsOf = (card, options) => run([card], options).problems;
const SCRIPT = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "scripts", "source-cards.mjs");
const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", timeout: 30000 });

test("the shipped cards pass the default check and report what is pending", async () => {
  const entries = await loadCards();
  const { problems, stats } = checkCards(entries, { validate, evidenceIds, today: TODAY });
  assert.deepEqual(problems, []);
  assert.equal(stats.cards, entries.length);
  assert.ok(stats.pending > 0, "the skeleton cards are pending, and the report must say so");
  assert.equal(stats.checked, 0, "no statement may be 'checked' before it is read at its official source");
});

test("--release refuses every pending statement and names each one", async () => {
  const entries = await loadCards();
  const { problems, stats } = checkCards(entries, { validate, evidenceIds, today: TODAY, release: true });
  assert.equal(problems.length, stats.pending);
  assert.ok(problems.every((message) => /still pending/.test(message)));
  assert.ok(problems.some((message) => message.startsWith("sit-madrid-flujo-visitantes.json measures")));
});

test("--release can be limited to chosen cards, and an unknown id is an error", () => {
  const filled = checkedCard();
  const skeleton = { ...checkedCard(), id: "skeleton" };
  skeleton.officialTitle = { status: "pending", text: "[X]", pendingReason: "not read at its official source yet" };
  const both = [filled, skeleton];
  assert.equal(run(both, { release: true }).problems.length, 1, "the skeleton blocks a full release");
  assert.deepEqual(run(both, { release: true, releaseOnly: new Set([filled.id]) }).problems, []);
  assert.equal(run(both, { release: true, releaseOnly: new Set([skeleton.id]) }).problems.length, 1);
  assert.match(run(both, { release: true, releaseOnly: new Set(["no-such-card"]) }).problems.join("\n"), /unknown card id no-such-card/);
  assert.deepEqual(run(both).problems, [], "without --release a pending card is allowed");
});

test("a fully checked card passes, including --release", () => {
  const { problems, stats } = run([checkedCard()], { release: true });
  assert.deepEqual(problems, []);
  assert.equal(stats.pending, 0);
  assert.ok(stats.checked > 0);
});

test("checked statements: the URL host must be one the producer declares", () => {
  assert.ok(hostAllowed(`https://${FIXTURE_HOST}/a`, [FIXTURE_HOST]));
  assert.ok(hostAllowed(`https://www.${FIXTURE_HOST}/a`, [FIXTURE_HOST]), "subdomains of a declared host are accepted");
  for (const url of [
    `https://evil-${FIXTURE_HOST}/a`, // look-alike prefix
    `https://${FIXTURE_HOST}.evil.example/a`, // declared host used as a subdomain of another
    `https://${FIXTURE_HOST}@evil.example/a`, // userinfo trick
    `https://user:pw@${FIXTURE_HOST}/a`, // credentials
    `https://${FIXTURE_HOST}:8443/a`, // non-default port
    `http://${FIXTURE_HOST}/a`, // not https
    "not a url",
  ]) {
    assert.ok(!hostAllowed(url, [FIXTURE_HOST]), url);
  }
  const card = checkedCard();
  card.officialTitle.url = "https://other.example/page";
  assert.match(problemsOf(card).join("\n"), /officialTitle: URL host is not one of this card's producer\.officialHosts/);

  const noHosts = checkedCard();
  noHosts.producer.officialHosts = [];
  assert.ok(problemsOf(noHosts).length > 0, "with no declared host nothing can be 'checked'");
});

test("checked statements: every kind of block is host-checked (breaks, review, license, ceiling rationale)", () => {
  const card = checkedCard();
  card.methodBreaks.items[0].url = "https://other.example/b";
  card.methodBreaks.review.url = "https://other.example/r";
  card.license.url = "https://other.example/l";
  card.measures.url = "https://other.example/m";
  card.claimCeiling = { level: "associative", basis: "cited", causalInference: "not-supported", rationale: { status: "checked", text: text(), url: "https://other.example/c", consultedOn: "2026-11-02" } };
  const joined = problemsOf(card).join("\n");
  for (const where of ["methodBreaks.items[0]", "methodBreaks.review", "license", "measures", "claimCeiling.rationale"]) {
    assert.ok(joined.includes(`${where}: URL host`), `${where} must be host-checked`);
  }
});

test("consultation dates: real and not in the future; an earlier date is not an error", () => {
  assert.ok(isRealDate("2026-11-22") && isRealDate("2028-02-29"));
  for (const bad of ["2026-02-30", "2026-13-01", "2026-00-10", "2027-02-29", "26-11-22", "2026-1-2"]) assert.ok(!isRealDate(bad), bad);
  const cases = {
    "not a calendar date": ["2026-02-30", /not a real calendar date/],
    "future date": ["2026-11-23", /in the future/],
  };
  for (const [label, [date, pattern]] of Object.entries(cases)) {
    const card = checkedCard();
    card.officialTitle.consultedOn = date;
    assert.match(problemsOf(card).join("\n"), pattern, label);
  }
  // No lower bound other than a real calendar date: a consultation made before this repository
  // existed is as valid as any other, and the owner never has to re-consult only to satisfy the tool.
  for (const ok of ["2019-03-01", "2026-10-23", TODAY]) {
    const card = checkedCard();
    card.officialTitle.consultedOn = ok;
    assert.deepEqual(problemsOf(card), [], `${ok} is a real, non-future date`);
  }
});

test("coverage months and break dates must be real; from cannot follow to", () => {
  assert.ok(isRealMonth("2020-12") && !isRealMonth("2020-13") && !isRealMonth("2020-00"));
  const cases = {
    "month 13": [(c) => { c.coverage.temporal.from = "2020-13"; }, /not a real month/],
    "to month 00": [(c) => { c.coverage.temporal.to = "2021-00"; }, /not a real month/],
    "from after to": [(c) => { c.coverage.temporal.from = "2024-05"; c.coverage.temporal.to = "2023-01"; }, /is after to/],
    "break on 30 February": [(c) => { c.methodBreaks.items[0].date = "2025-02-30"; }, /not a real calendar date/],
  };
  for (const [label, [mutate, pattern]] of Object.entries(cases)) {
    const card = checkedCard();
    mutate(card);
    assert.match(problemsOf(card).join("\n"), pattern, label);
  }
  const future = checkedCard();
  future.methodBreaks.items[0].date = "2027-01-01";
  assert.deepEqual(problemsOf(future), [], "a break may be dated after today (an announced change of method)");
});

test("ids: unique, file name equals id, break ids unique, evidence links exist", () => {
  const a = checkedCard();
  const b = checkedCard();
  assert.match(run([a, b]).problems.join("\n"), /duplicate card id test-fixture/);
  assert.match(checkCards([{ file: "other-name.json", card: checkedCard() }], { validate, evidenceIds, today: TODAY }).problems.join("\n"), /file name must be test-fixture\.json/);
  const breaks = checkedCard();
  breaks.methodBreaks.items.push({ ...structuredClone(breaks.methodBreaks.items[0]) });
  assert.match(problemsOf(breaks).join("\n"), /duplicate break id brk-01/);
  const unknown = checkedCard();
  unknown.evidenceLinks = ["EV-LAB-999"];
  assert.match(problemsOf(unknown).join("\n"), /unknown evidence record EV-LAB-999/);
  const known = checkedCard();
  known.evidenceLinks = [[...evidenceIds][0]];
  assert.deepEqual(problemsOf(known), []);
});

test("schema violations are reported once, readably, and stop the semantic checks for that card", () => {
  const card = checkedCard();
  delete card.officialTitle.url;
  const { problems } = run([card]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /officialTitle: matches neither the checked form .* nor the pending form/);
  assert.match(problems[0], /url/);
  const extra = checkedCard();
  extra.reliabilityScore = 0.9;
  assert.match(problemsOf(extra).join("\n"), /additional properties \(reliabilityScore\)/);
  assert.deepEqual(describeSchemaErrors([]), []);
});

test("wording: validation, quality, resilience and causal claims are rejected, in both languages", () => {
  const bad = [
    "The data are validated against a survey.",
    "Estos datos están verificados por el INE.",
    "A robust method.",
    "Un método robusto y fiable.",
    "This source is reliable.",
    "Shows the resilience of destinations.",
    "Muestra la resiliencia del destino.",
    "Visits fell because of the new fee.",
    "El descenso se debe a la tasa.",
    "Tourism is driven by events.",
    "El evento provoca más visitantes.",
    "Ground truth for tourist flows.",
    "Demostrado por la serie.",
  ];
  for (const sentence of bad) {
    const card = checkedCard();
    card.doesNotMeasure[0].text = { es: sentence, en: sentence };
    assert.ok(problemsOf(card).length > 0, `should be rejected: ${sentence}`);
  }
  for (const sentence of ["Does not support causal inference.", "No permite inferencia causal.", "Counts of devices present in an area.", "Recuento de dispositivos presentes en una zona.", "The producer publishes a methodological note.", "Reliability is not assessed by this card."]) {
    const card = checkedCard();
    card.doesNotMeasure[0].text = { es: sentence, en: sentence };
    assert.deepEqual(problemsOf(card), [], `should be accepted: ${sentence}`);
  }
});

test("wording: a method break may explain its own cause and documented effect, but nothing else may be loosened", () => {
  const explain = checkedCard();
  explain.methodBreaks.items[0].description = { es: "Cambio de operador debido a un nuevo contrato.", en: "Change of operator due to a new contract." };
  explain.methodBreaks.items[0].documentedEffect = { kind: "documented", text: { es: "Nivel de la serie distinto tras el cambio, según el productor.", en: "A different series level after the change, according to the producer." } };
  assert.deepEqual(problemsOf(explain), [], "causal connectors are allowed in the producer's method explanation");

  const stillStrict = checkedCard();
  stillStrict.methodBreaks.items[0].documentedEffect = { kind: "documented", text: { es: "El método es robusto.", en: "The method is robust." } };
  assert.ok(problemsOf(stillStrict).length > 0, "quality claims stay rejected inside a break");
  const verified = checkedCard();
  verified.methodBreaks.items[0].description = { es: "Datos validados tras el cambio.", en: "Validated data after the change." };
  assert.ok(problemsOf(verified).length > 0, "validation claims stay rejected inside a break");

  const label = checkedCard();
  label.label = { es: "Fuente fiable", en: "Reliable source" };
  assert.ok(problemsOf(label).length > 0, "the card label is not exempt");
  assert.deepEqual(wordingProblems("measures.unit.es", "Visitantes"), []);
});

test("wording: pending reasons are scanned for validation and quality claims too", () => {
  const card = checkedCard();
  card.officialTitle = { status: "pending", text: "[X]", pendingReason: "Pendiente: el productor dice que los datos están validados." };
  assert.match(problemsOf(card).join("\n"), /validation wording not allowed/);
});

test("--online: reports unreachable and failing URLs, and falls back to GET when HEAD is refused", async () => {
  const card = checkedCard();
  card.methodBreaks.items[0].url = `https://${FIXTURE_HOST}/break`;
  card.license.url = `https://${FIXTURE_HOST}/licence`;
  card.measures.url = `https://${FIXTURE_HOST}/refuses-head`;
  const entries = [{ file: "test-fixture.json", card }];
  const urls = checkedUrls(entries);
  assert.ok(urls.length >= 4 && new Set(urls).size === urls.length, "URLs are listed once each");
  const calls = [];
  const fake = async (url, init) => {
    calls.push(`${init.method} ${url}`);
    if (url.endsWith("/break")) return { ok: false, status: 404 };
    if (url.endsWith("/licence")) throw new Error("network down");
    if (url.endsWith("/refuses-head")) return init.method === "HEAD" ? { ok: false, status: 405 } : { ok: true, status: 206 };
    return { ok: true, status: 200 };
  };
  const failures = await checkOnline(entries, fake);
  assert.deepEqual(failures, [`https://${FIXTURE_HOST}/break: HTTP 404`, `https://${FIXTURE_HOST}/licence: network down`]);
  assert.ok(calls.includes(`GET https://${FIXTURE_HOST}/refuses-head`));
  assert.deepEqual(await checkOnline([{ file: "x.json", card: structuredClone(card) }], async () => ({ ok: true, status: 200 })), []);
  assert.deepEqual(checkedUrls(await loadCards()), [], "the skeleton cards have no checked URL to request");
});

test("command line: exit codes and output for the shipped cards, --release, --cards and a tampered directory", async () => {
  const ok = cli();
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /PASS \d+ source cards/);
  assert.match(ok.stdout, /0 checked statement\(s\), \d+ pending \(\[X\]\)/);
  assert.match(ok.stdout, /not publishable/);

  const release = cli("--release");
  assert.equal(release.status, 1);
  assert.match(release.stderr, /still pending \(\[X\]\)/);

  assert.equal(cli("--cards", "a").status, 1, "--cards without --release is refused");
  const unknown = cli("--release", "--cards", "no-such-card");
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown card id no-such-card/);

  const copy = mkdtempSync(path.join(tmpdir(), "source-cards-"));
  try {
    cpSync("data/sources", copy, { recursive: true });
    assert.equal(cli("--dir", copy).status, 0, "an untouched copy passes");
    const target = path.join(copy, readdirSync(copy)[0]);
    const card = JSON.parse(readFileSync(target, "utf8"));
    card.officialTitle = { status: "checked", text: text(), url: "https://other.example/x", consultedOn: "2026-11-02" };
    writeFileSync(target, JSON.stringify(card, null, 2));
    const tampered = cli("--dir", copy);
    assert.equal(tampered.status, 1);
    assert.match(tampered.stderr, /producer\.officialHosts|URL host/);

    card.officialTitle = { status: "pending", text: "approximately 2020", pendingReason: "to be confirmed at the official page" };
    writeFileSync(target, JSON.stringify(card, null, 2));
    assert.equal(cli("--dir", copy).status, 1, "a pending statement that is not [X] is rejected");
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});
