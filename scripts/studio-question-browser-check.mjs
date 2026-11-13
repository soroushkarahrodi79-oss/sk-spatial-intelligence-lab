// End-to-end browser check of Studio v0.2 (Question-Driven Evidence) over the REAL Madrid Evidence MCP.
//   MADRID_LENS_ROOT=/path/to/lens npm run test:studio-question-browser   (PLAYWRIGHT_CHROMIUM=/path/to/chrome optional)
// Map tiles are blocked so the check is deterministic. The v0.1 flow is exercised again at the end.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createStudio } from "../studio/server.mjs";

const LENS_ROOT = process.env.MADRID_LENS_ROOT;
assert.ok(LENS_ROOT, "MADRID_LENS_ROOT is not set: the browser check needs the real MCP");

const studio = await createStudio({ lensRoot: LENS_ROOT });
const port = await studio.listen(0);
const blocked = await createStudio({ lensRoot: "/nonexistent/lens-checkout" });
const blockedPort = await blocked.listen(0);
// Count MCP calls to prove that a routing abstention reaches no tool.
const mcpCalls = [];
const orig = studio.session.call.bind(studio.session);
studio.session.call = async (tool, args) => (mcpCalls.push(tool), orig(tool, args));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}) });
  const newPage = async (viewport) => {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/^https:\/\/tile\.openstreetmap\.org\//, (r) => r.abort());
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector(".mcp-status[data-state=READY]");
    await page.waitForSelector("#guided-list .chip");
    return { page, errors };
  };
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const ask = async (page, { chip, text, source }) => {
    if (source) await page.selectOption("#source", source);
    if (chip) await page.click(`#guided-list .chip[data-id="${chip}"]`);
    if (text !== undefined) await page.fill("#question", text);
    await page.click("#ask-run");
    await page.waitForFunction(() => !document.querySelector("#ask-run").disabled || document.querySelector("#ask-run").textContent === "Preguntar");
    await page.waitForSelector("#interpretation .interp, #sec-routing-abstention");
  };

  const { page, errors } = await newPage({ width: 1440, height: 1000 });
  assert.equal(await page.locator("#guided-list .chip").count(), 4, "four guided questions");
  assert.equal(await page.isVisible("#question"), true);
  const w = (await page.locator("#question").boundingBox()).width;
  assert.ok(w > 300, `question field is usable (${w}px)`);
  assert.equal(await page.isVisible("#ask-run"), true);
  assert.equal(await page.isVisible("#run"), true, "the v0.1 full investigation stays reachable");
  assert.match(await page.textContent(".full-run-label"), /Investigación completa/);

  // 1) Guided licences at the pilot point: interpretation first, then per-family counts straight from the MCP.
  await ask(page, { chip: "licencias" });
  assert.equal(await page.inputValue("#question"), "¿Qué licencias se concedieron en el círculo?");
  const order = await page.evaluate(() => {
    const a = document.querySelector("#interpretation").getBoundingClientRect().top;
    const b = document.querySelector("#sections").getBoundingClientRect().top;
    return a < b;
  });
  assert.ok(order, "the interpretation card comes before the results");
  const interp = await page.textContent("#interpretation");
  for (const s of ["licences_in_lens", "controles de la interfaz", "pregunta guiada", "-3.692207", "40.446612", "radiusM"]) assert.ok(interp.includes(s), `interpretation shows ${s}`);
  const response = await page.evaluate(() => window.__studio.last());
  const perFamily = response.calls.licences.structuredContent.result.value.perFamily;
  const tiles = await page.$$eval("#sec-licences .family", (els) => els.map((e) => ({ key: e.querySelector(".fam-key")?.textContent, count: e.querySelector(".fam-count")?.textContent })));
  assert.deepEqual(tiles, Object.entries(perFamily).map(([key, v]) => ({ key, count: String(v) })));
  const sum = Object.values(perFamily).reduce((a, b) => a + b, 0);
  const shownValues = await page.$$eval("#sections .fam-count, #sections .item-value", (els) => els.map((e) => e.textContent.trim()));
  assert.ok(!shownValues.includes(String(sum)), `the cross-family sum ${sum} must not be shown as a value`);
  assert.equal(await page.locator("#sec-ambito, #sec-phases, #sec-diff").count(), 0, "only the requested sections");
  assert.match(await page.textContent("#sec-licences"), /Concedida ≠ construida/);
  assert.match(await page.textContent("#sections"), /Procedencia · urban_licences/);
  assert.deepEqual(mcpCalls.splice(0), ["licences_in_lens", "source_provenance"]);
  // inspector keeps the pointer
  await page.locator("#sec-licences .family > .trace").nth(1).click();
  const meta = await page.$$eval("#insp-meta dd", (d) => d.map((x) => x.textContent));
  assert.equal(meta[5], "/structuredContent/result/value/perFamily/ACTIVITY_LICENCE_FAMILY");
  assert.equal(meta[6], String(perFamily.ACTIVITY_LICENCE_FAMILY));
  await page.click("#inspector .close");

  // 2) Guided ámbito and editions: sections requested only; phases only in the inspector (editions).
  await ask(page, { chip: "ambito" });
  assert.match(await page.textContent("#sec-ambito"), /API\.06\.03/);
  assert.equal(await page.locator("#sec-phases, #sec-diff, #sec-licences").count(), 0);
  mcpCalls.splice(0);
  await ask(page, { chip: "ediciones" });
  assert.equal(await page.locator("#sec-diff").count(), 1);
  assert.equal(await page.locator("#sec-phases").count(), 0, "phases are not a section");
  await page.locator("#sec-diff .trace").first().click();
  assert.ok((await page.textContent("#insp-raw")).includes('"ambitoPhases"'), "the phases remain available in the inspector's original response");
  await page.click("#inspector .close");

  // 3) Provenance needs an explicit source (D4)
  mcpCalls.splice(0);
  await ask(page, { chip: "procedencia" });
  assert.match(await page.textContent("#sec-routing-abstention"), /SOURCE_NOT_NAMED/);
  assert.deepEqual(mcpCalls, [], "no MCP call without a named source");
  await ask(page, { chip: "procedencia", source: "planning_ambito_geometry" });
  assert.match(await page.textContent("#sections"), /Procedencia · planning_ambito_geometry/);
  assert.match(await page.textContent("#query-line"), /sin punto/);
  assert.deepEqual(mcpCalls.splice(0), ["source_provenance"]);

  // 4) Incompatible question: abstention, reason, alternatives, nothing queried, nothing shown
  await ask(page, { text: "¿Cuántas licencias se concedieron en total?" });
  const abst = await page.textContent("#sec-routing-abstention");
  assert.match(abst, /CROSS_FAMILY_TOTAL/);
  assert.match(abst, /no existe un total entre familias/);
  assert.match(abst, /no se ha consultado el MCP/i);
  assert.deepEqual(mcpCalls, [], "a routing abstention reaches no MCP tool");
  assert.equal(await page.locator("#sec-licences, .family").count(), 0, "no figures under an abstention");
  assert.equal(await page.evaluate(() => window.__studio.last()), null);
  assert.equal(await page.locator("#interpretation .interp").count(), 0);
  // partial answers are only offered: nothing ran until the click
  assert.match(await page.textContent(".alts"), /responde solo a una parte/);
  assert.deepEqual(mcpCalls, []);
  await page.click(".alts .chip");
  await page.waitForSelector("#interpretation .interp");
  assert.deepEqual(mcpCalls.splice(0), ["licences_in_lens", "source_provenance"], "the alternative ran only after the click");

  // 5) Other abstentions through the free-text field
  for (const [text, reason] of [["licencias cerca de Atocha", "UNINTERPRETED_TERMS"], ["licencias en 2024", "PARAMETERS_IN_TEXT"], ["¿Cuál es la zonificación del punto?", "ZONING_OR_LANDUSE"], ["¿Cuántas viviendas añadieron las licencias?", "BUILT_OR_COMPLETED"]]) {
    await ask(page, { text });
    assert.match(await page.textContent("#sec-routing-abstention"), new RegExp(reason), text);
    assert.deepEqual(mcpCalls, [], text);
  }
  // Free text that the lexicon recognises
  await ask(page, { text: "licencias concedidas alrededor del punto" });
  assert.match(await page.textContent("#interpretation"), /texto libre/);
  mcpCalls.splice(0);

  // 6) Spatial arguments come from the controls: change radius, ask again
  await page.click('input[name=radius][value="250"]', { force: true });
  await ask(page, { chip: "licencias" });
  assert.equal((await page.evaluate(() => window.__studio.last())).calls.licences.structuredContent.result.applied.radiusM, 250);
  assert.match(await page.textContent("#interpretation"), /"radiusM":250/);

  // 7) v0.1 full investigation still works, with all its sections
  await page.click("#run");
  await page.waitForSelector("#sec-phases");
  assert.equal(await page.locator("#sec-ambito, #sec-phases, #sec-diff, #sec-licences").count(), 4);
  assert.equal(await page.locator("#interpretation .interp").count(), 0, "no interpretation card on the full investigation");
  assert.equal(await page.textContent("#run"), "Investigar");
  assert.equal(await overflow(page), 0);
  assert.deepEqual(errors, []);

  // 8) Mobile 390 px: no horizontal overflow, field and button usable, in every state
  const mobile = await newPage({ width: 390, height: 844 });
  const mp = mobile.page;
  assert.ok((await mp.locator("#question").boundingBox()).width > 200);
  assert.ok(await overflow(mp) <= 0, "overflow before asking");
  await ask(mp, { chip: "licencias" });
  assert.ok(await overflow(mp) <= 0, `overflow after an answer: ${await overflow(mp)}px`);
  const top = await mp.evaluate(() => document.querySelector("#results").getBoundingClientRect().top);
  assert.ok(top < 844, "the answer is brought into view on a narrow screen");
  await ask(mp, { text: "¿Cuántas licencias en total?" });
  assert.ok(await overflow(mp) <= 0, "overflow after an abstention");
  await ask(mp, { chip: "ediciones" });
  assert.ok(await overflow(mp) <= 0, "overflow after editions");
  assert.deepEqual(mobile.errors, []);

  // 9) Blocked MCP: both buttons disabled
  const bp = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await bp.goto(`http://127.0.0.1:${blockedPort}/`);
  await bp.waitForSelector(".mcp-status[data-state=BLOCKED]");
  assert.equal(await bp.isDisabled("#run"), true);
  assert.equal(await bp.isDisabled("#ask-run"), true);

  console.log("studio question-driven browser check passed: 4 guided questions; interpretation before results; per-family counts equal the MCP's; abstentions run no MCP tool; phases only in the inspector; v0.1 full investigation intact; mobile 390 px without overflow; blocked state ok");
} finally {
  await browser?.close();
  await studio.close();
  await blocked.close();
}
