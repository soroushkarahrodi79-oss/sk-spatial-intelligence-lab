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

  const expectedLinks = [
    "https://soroushkarahrodi79-oss.github.io/madrid-tourism-intelligence-lens/",
    "https://github.com/soroushkarahrodi79-oss/madrid-tourism-intelligence-lens",
    "https://github.com/soroushkarahrodi79-oss/geoimpact-ci",
    "https://github.com/soroushkarahrodi79-oss/salmas-flood-spatial-forensics",
  ];
  for (const url of expectedLinks) assert.equal(await page.locator(`a[href="${url}"]`).count(), 1, `Missing project link: ${url}`);

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
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
  assert.equal(await page.getByRole("navigation").getAttribute("aria-label"), "Navegación principal");
  await page.getByRole("button", { name: "Change language" }).click();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.equal(await page.getByRole("heading", { level: 2, name: "Research & systems" }).count(), 1);
  assert.deepEqual(pageErrors, [], `Browser errors: ${pageErrors.join("; ")}`);
  console.log("PASS keyboard skip link, bilingual switch, landmark label, title, cards, and project links");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
