// Captures the landing hero at the review viewports.
// Usage: node scripts/hero-review-capture.mjs <before|after> [outDir]
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const label = process.argv[2] ?? "after";
const outDir = process.argv[3] ?? "docs/review/hero-geo-layers-v0.1";
mkdirSync(outDir, { recursive: true });

const server = createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(readFileSync("space/index.html"));
}).listen(0, "127.0.0.1");
const browser = await chromium.launch();
const page = await browser.newPage();
const consoleProblems = [];
page.on("console", (message) => { if (["error", "warning"].includes(message.type())) consoleProblems.push(message.text()); });
page.on("pageerror", (error) => consoleProblems.push(error.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle" });

for (const language of ["en", "es"]) {
  if ((await page.locator("html").getAttribute("lang")) !== language) await page.getByRole("button", { name: "Change language" }).click();
  for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 0); });
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(outDir, `${label}-${language}-${width}x${height}.png`), fullPage: false });
    // Mobile / tablet: also the part of the page holding the illustration, which sits below the fold.
    if (width <= 850) {
      await page.evaluate(() => { document.querySelector(".visual").scrollIntoView({ block: "center" }); });
      await page.waitForTimeout(100);
      await page.screenshot({ path: path.join(outDir, `${label}-${language}-${width}x${height}-visual.png`), fullPage: false });
    }
  }
}
console.log(`${label}: console problems = ${JSON.stringify(consoleProblems)}`);
await browser.close();
server.close();
