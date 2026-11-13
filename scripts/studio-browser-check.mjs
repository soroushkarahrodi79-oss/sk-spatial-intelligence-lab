// End-to-end browser check of Spatial Investigation Studio over the REAL Madrid Evidence MCP.
//   MADRID_LENS_ROOT=/path/to/lens npm run test:studio-browser
// External map tiles are blocked so the check is deterministic and exercises the offline notice.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createStudio } from "../studio/server.mjs";

const LENS_ROOT = process.env.MADRID_LENS_ROOT;
assert.ok(LENS_ROOT, "MADRID_LENS_ROOT is not set: the browser check needs the real MCP");

const FAMILIES = ["BUILDING_URBANISTIC_LICENCE_FAMILY", "ACTIVITY_LICENCE_FAMILY", "TEMPORARY_ACTIVITY_FAMILY"];
// Family tiles equal the MCP's perFamily, one by one; the cross-family sum never appears.
async function renderedLicenceChecks(page) {
  const response = await page.evaluate(() => window.__studio.last());
  const perFamily = response.calls.licences.structuredContent.result.value.perFamily;
  const tiles = await page.$$eval("#sec-licences .family", (els) => els.map((e) => ({ key: e.querySelector(".fam-key")?.textContent, count: e.querySelector(".fam-count")?.textContent })));
  assert.deepEqual(tiles.map((t) => t.key), FAMILIES);
  for (const t of tiles) assert.equal(t.count, String(perFamily[t.key]), `${t.key} count shown equals MCP`);
  const sum = Object.values(perFamily).reduce((a, b) => a + b, 0);
  const licText = await page.textContent("#sec-licences");
  assert.ok(!new RegExp(`(^|[^\\d.-])${sum}([^\\d.]|$)`).test(licText), `cross-family sum ${sum} must not appear in the licences section`);
  assert.ok(!/\btotal\s*[:=]?\s*\d/i.test(licText));
  assert.match(licText, /no se suman/);
  return { perFamily, tiles };
}

const studio = await createStudio({ lensRoot: LENS_ROOT });
const port = await studio.listen(0);
const blocked = await createStudio({ lensRoot: "/nonexistent/lens-checkout" });
const blockedPort = await blocked.listen(0);
let browser;
try {
  // PLAYWRIGHT_CHROMIUM lets a machine with a preinstalled Chromium reuse it instead of downloading one.
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}) });
  const newPage = async (viewport) => {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/^https:\/\/tile\.openstreetmap\.org\//, (r) => r.abort());
    return { page, errors };
  };

  // Desktop: default pilot = Renfe 2019 reference point (resolves an ámbito in the pinned layer).
  const { page, errors } = await newPage({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector(".mcp-status[data-state=READY]");
  assert.equal(await page.inputValue("#lon"), "-3.692207");
  assert.equal(await page.inputValue("#lat"), "40.446612");
  const pilotText = await page.textContent(".pilot");
  assert.match(pilotText, /Renfe \(2019\)/);
  assert.match(pilotText, /UTM/);
  assert.match(await page.textContent(".external-ref"), /Referencia externa al MCP/);
  assert.match(await page.textContent(".external-ref"), /135\/2025\/00114/);
  await page.click("#run");
  await page.waitForSelector("#sec-licences");
  assert.equal(await page.locator("#sections .card.st-CONSULTED_LAYER").count(), 0, "no consulted layer when an ámbito resolves");
  assert.match(await page.textContent("#sec-ambito"), /API\.06\.03/);
  assert.match(await page.textContent("#sec-phases"), /no es estado de avance/);
  // The external reference never appears among MCP results.
  assert.doesNotMatch(await page.textContent("#sections"), /135\/2025\/00114/);
  await renderedLicenceChecks(page);

  // Previous approximate point: a real NO_EVIDENCE_FOR_SCOPE case.
  await page.fill("#lon", "-3.6920");
  await page.fill("#lat", "40.4460");
  await page.click("#run");
  await page.waitForFunction(() => window.__studio.last()?.request.lon === -3.692);
  await page.waitForSelector("#sec-layer-planning_ambito_geometry");

  const { perFamily, tiles } = await renderedLicenceChecks(page);
  const layer = page.locator("#sec-layer-planning_ambito_geometry");
  assert.match(await layer.textContent(), /Capa consultada/);
  assert.match(await layer.textContent(), /NO_EVIDENCE_FOR_SCOPE/);
  assert.equal(await layer.locator(".item.k-FACT").count(), 0, "the consulted layer shows no fact");
  assert.match(await page.textContent("#sec-ambito"), /no permite concluir que no exista planeamiento/);

  const ambitoText = await page.textContent("#sec-ambito");
  assert.match(ambitoText, /NO_EVIDENCE_FOR_SCOPE/);
  assert.equal(await page.locator("#sec-ambito .item.k-FACT").count(), 0);
  assert.match(await page.textContent("#sec-phases"), /No consultado/);
  assert.equal(await page.locator("#sec-ambito .v-null").count() >= 1, true, "null shown literally");

  // Map: one query circle, no other vector geometry (no ámbito polygons, no licence points).
  assert.equal(await page.locator("#map path.leaflet-interactive").count(), 2, "only the circle and the point marker");
  await page.waitForSelector("#tiles-note:not([hidden])", { timeout: 12000 });

  // Inspector: the pointer resolves to the displayed value in the raw response.
  await page.locator("#sec-licences .family > .trace").nth(1).click();
  const meta = await page.$$eval("#insp-meta dd", (dds) => dds.map((d) => d.textContent));
  assert.equal(meta[5], "/structuredContent/result/value/perFamily/ACTIVITY_LICENCE_FAMILY");
  assert.equal(meta[6], String(perFamily.ACTIVITY_LICENCE_FAMILY));
  assert.ok((await page.textContent("#insp-raw")).includes('"LICENCES_IN_LENS"'));
  assert.ok((await page.locator("#insp-supports li").count()) >= 1);
  await page.click("#inspector .close");
  assert.deepEqual(errors, []);

  // Mobile: no horizontal overflow.
  const mobile = await newPage({ width: 390, height: 844 });
  await mobile.page.goto(`http://127.0.0.1:${port}/`);
  await mobile.page.waitForSelector(".mcp-status[data-state=READY]");
  await mobile.page.click("#run");
  await mobile.page.waitForSelector("#sec-licences");
  const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `horizontal overflow ${overflow}px at 390px`);
  assert.deepEqual(mobile.errors, []);

  // Blocked MCP: the run button is disabled and no result is rendered.
  const bl = await newPage({ width: 1200, height: 900 });
  await bl.page.goto(`http://127.0.0.1:${blockedPort}/`);
  await bl.page.waitForSelector(".mcp-status[data-state=BLOCKED]");
  assert.equal(await bl.page.isDisabled("#run"), true);
  assert.equal(await bl.page.locator("#sections .card").count(), 0);

  console.log(`studio browser check passed: Renfe 2019 point resolves API.06.03 (no consulted layer); previous point abstains with consulted layer, families ${tiles.map((t) => t.count).join(" / ")} (separate); inspector traceable; mobile ok; blocked state ok`);
} finally {
  await browser?.close();
  await studio.close();
  await blocked.close();
}
