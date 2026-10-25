import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "space");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8" };
const server = createServer(async (request, response) => {
  const requestPath = new URL(request.url, "http://localhost").pathname;
  const fileName = requestPath === "/" ? "index.html" : requestPath.slice(1);
  if (!new Set(["index.html", "style.css"]).has(fileName)) {
    response.writeHead(404).end("Not found");
    return;
  }
  const filePath = path.join(root, fileName);
  try {
    const fileStats = await stat(filePath);
    response.writeHead(200, { "content-type": types[path.extname(fileName)], "content-length": fileStats.size, "cache-control": "no-store" });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => pageErrors.push(`${request.url()}: ${request.failure()?.errorText ?? "request failed"}`));
  const response = await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  assert.equal(response.status(), 200);
  assert.equal(await page.title(), "SK Spatial Intelligence Lab");
  assert.equal(await page.locator("nav[aria-label='Primary navigation']").count(), 1);
  assert.equal(await page.locator("main").count(), 1);
  assert.equal(await page.locator(".card").count(), 3);

  // Fix 1: each hero proof chip deep-links to its own project card (stable, language-independent IDs)
  for (const [chip, cardId] of [[1, "madrid"], [2, "geoimpact"], [3, "salmas"]]) {
    assert.equal(await page.locator(`.proof a[href="#${cardId}"]`).count(), 1, `Proof chip ${chip} must link to #${cardId}`);
    assert.equal(await page.locator(`article.card#${cardId}`).count(), 1, `Project card #${cardId} must exist`);
  }
  // Fix 2: proof chip interactive target must be at least 44px tall
  for (const height of await page.locator(".proof a").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
    assert.ok(height >= 44, `Proof chip target too short: ${height}px`);
  }
  // Fix 3: Methods stage markers are language-neutral numerics
  assert.deepEqual((await page.locator(".stage .num").allTextContents()).map((text) => text.trim()), ["01", "02", "03", "04", "05"], "Methods stage markers must be language-neutral numerics");
  assert.deepEqual(await page.locator(".stage h3").allTextContents(), ["Source", "Validate", "Compute", "Evaluate", "Interpret"], "Methods headings must be English in EN");
  console.log("PASS hero proof chips deep-link to cards, 44px targets, and language-neutral Methods markers (EN)");

  const expectedLinks = [
    "https://soroushkarahrodi79-oss.github.io/madrid-tourism-intelligence-lens/",
    "https://github.com/soroushkarahrodi79-oss/madrid-tourism-intelligence-lens",
    "https://github.com/soroushkarahrodi79-oss/geoimpact-ci",
    "https://github.com/soroushkarahrodi79-oss/salmas-flood-spatial-forensics",
  ];
  for (const url of expectedLinks) assert.equal(await page.locator(`a[href="${url}"]`).count(), 1, `Missing project link: ${url}`);

  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      columns: getComputedStyle(document.querySelector(".grid")).gridTemplateColumns.split(" ").length,
    }));
    assert.ok(layout.scrollWidth <= layout.width, `Horizontal overflow at ${viewport.width}px (${layout.scrollWidth}px)`);
    assert.equal(layout.columns, viewport.width <= 850 ? 1 : 3, `Unexpected project grid columns at ${viewport.width}px`);
    console.log(`PASS responsive layout ${viewport.width}x${viewport.height}: ${layout.columns} project column(s), no horizontal overflow`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const skip = page.locator(".skip-link");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.className), "skip-link", "Skip link must be first keyboard stop");
  assert.equal(await skip.evaluate((element) => getComputedStyle(element).top), "10px", "Skip link must become visible on focus");
  await page.getByRole("button", { name: "Change language" }).click();
  assert.equal(await page.locator("html").getAttribute("lang"), "es");
  assert.equal(await page.getByRole("heading", { level: 2, name: "Investigación y sistemas" }).count(), 1);
  assert.equal(await page.locator("#primaryMenu").getAttribute("aria-label"), "Navegación principal");
  assert.deepEqual(await page.locator(".stage h3").allTextContents(), ["Fuente", "Validar", "Calcular", "Evaluar", "Interpretar"], "Methods headings must be Spanish in ES");
  assert.deepEqual((await page.locator(".stage .num").allTextContents()).map((text) => text.trim()), ["01", "02", "03", "04", "05"], "Methods stage markers stay numeric in ES");
  for (const cardId of ["madrid", "geoimpact", "salmas"]) assert.equal(await page.locator(`.proof a[href="#${cardId}"]`).count(), 1, `Proof chip link to #${cardId} must persist in ES`);
  console.log("PASS Spanish Methods headings, numeric markers, and persistent proof-chip deep-links (ES)");
  await page.getByRole("button", { name: "Change language" }).click();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.equal(await page.getByRole("heading", { level: 2, name: "Research & systems" }).count(), 1);

  // P0: accessible mobile navigation (disclosure menu keeps Projects and Roadmap discoverable)
  await page.setViewportSize({ width: 360, height: 800 });
  const toggle = page.locator("#navToggle");
  const menu = page.locator("#primaryMenu");
  assert.ok(await toggle.isVisible(), "Mobile menu toggle must be visible on small screens");
  assert.equal(await toggle.getAttribute("aria-expanded"), "false", "Mobile menu must start collapsed");
  assert.equal(await menu.locator("a[href='#projects']").isVisible(), false, "Nav links stay hidden until the menu opens");
  const toggleBox = await toggle.boundingBox();
  assert.ok(toggleBox.width >= 44 && toggleBox.height >= 44, `Toggle touch target too small: ${toggleBox.width}x${toggleBox.height}`);
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true", "Toggle must set aria-expanded=true when opened");
  assert.ok(await menu.locator("a[href='#projects']").isVisible(), "Projects link must be reachable when the menu is open");
  assert.ok(await menu.locator("a[href='#roadmap']").isVisible(), "Roadmap link must be reachable when the menu is open");
  await page.keyboard.press("Escape");
  assert.equal(await toggle.getAttribute("aria-expanded"), "false", "Escape must close the menu");
  assert.equal(await page.evaluate(() => document.activeElement.id), "navToggle", "Focus must return to the toggle after Escape");
  await toggle.click();
  await menu.locator("a[href='#projects']").click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "false", "Selecting a menu link must close the menu");
  await page.setViewportSize({ width: 1280, height: 800 });
  assert.equal(await toggle.isVisible(), false, "Toggle must be hidden on desktop");
  assert.ok(await menu.locator("a[href='#methods']").isVisible(), "Nav links must be inline on desktop");
  console.log("PASS accessible mobile navigation: toggle, aria-expanded, Escape, focus return, desktop inline");

  assert.deepEqual(pageErrors, [], `Browser errors: ${pageErrors.join("; ")}`);
  console.log("PASS keyboard skip link, bilingual switch, landmark label, title, cards, and project links");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
