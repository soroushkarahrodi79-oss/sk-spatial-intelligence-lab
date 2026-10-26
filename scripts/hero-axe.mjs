// Runs axe-core (supplied by path, not a repo dependency) on the hero in both languages and five viewports.
// Usage: node scripts/hero-axe.mjs <path-to-axe.min.js> [out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "playwright";

const axeSource = readFileSync(process.argv[2], "utf8");
const server = createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(readFileSync("space/index.html"));
}).listen(0, "127.0.0.1");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle" });
await page.addScriptTag({ content: axeSource });
const results = [];
for (const language of ["en", "es"]) {
  if ((await page.locator("html").getAttribute("lang")) !== language) await page.getByRole("button", { name: "Change language" }).click();
  for (const [width, height] of [[360, 800], [390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    const violations = await page.evaluate(async () => (await axe.run(".hero", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } })).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })));
    results.push({ language, width, violations });
  }
}
writeFileSync(process.argv[3] ?? "docs/review/hero-geo-layers-v0.1/axe-results.json", JSON.stringify(results, null, 1) + "\n");
console.log(`runs: ${results.length}, runs with violations: ${results.filter((r) => r.violations.length).length}`);
console.log(JSON.stringify(results.filter((r) => r.violations.length)).slice(0, 1500));
await browser.close();
server.close();
