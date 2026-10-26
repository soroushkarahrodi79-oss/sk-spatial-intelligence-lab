import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
const axeSrc = readFileSync(process.argv[2], "utf8");
const srv = createServer((q, r) => { r.writeHead(200, {"content-type":"text/html; charset=utf-8"}); r.end(readFileSync("space/index.html")); }).listen(0);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "networkidle" });
const results = [];
for (const lang of ["en", "es"]) {
  if ((await p.locator("html").getAttribute("lang")) !== lang) await p.getByRole("button", { name: "Change language" }).click();
  for (const [w, h] of [[360,800],[390,844],[768,1024],[1024,768],[1440,900]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.locator("details[open]").evaluateAll(e => e.forEach(x => x.open = false));
    await p.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; document.querySelector("#evidence").scrollIntoView(); window.scrollBy(0, -80); });
    await p.waitForTimeout(100);
    await p.screenshot({ path: `docs/review/evidence-explorer-v0.1/${lang}-${w}x${h}-controls.png` });
    await p.locator(".ev summary").first().click();
    await p.evaluate(() => { document.querySelector("#ev-EV-GIC-001").scrollIntoView({block:"start"}); });
    await p.waitForTimeout(100);
    await p.screenshot({ path: `docs/review/evidence-explorer-v0.1/${lang}-${w}x${h}-disclosure.png` });
    await p.addScriptTag({ content: axeSrc }).catch(()=>{});
    const r = await p.evaluate(async () => (await axe.run("#evidence", { runOnly: { type: "tag", values: ["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa","best-practice"] } })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0].target.join(" ") + " :: " + (v.nodes[0].any[0]?.message || "").slice(0,150) })));
    results.push({ lang, w, violations: r });
    await p.locator("details[open]").evaluateAll(e => e.forEach(x => x.open = false));
  }
}
writeFileSync("docs/review/evidence-explorer-v0.1/axe-results.json", JSON.stringify(results, null, 1));
console.log(JSON.stringify(results.filter(x => x.violations.length), null, 1).slice(0, 3000), "\nruns:", results.length);
await b.close(); srv.close();
