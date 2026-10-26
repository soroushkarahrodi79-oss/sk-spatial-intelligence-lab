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

  // ---- GeoAI-2A Evidence Explorer V0.1 ----
  const catalog = JSON.parse(await readFile(path.resolve(root, "..", "data", "evidence-catalog.json"), "utf8"));
  const total = catalog.records.length;
  const shotDir = process.env.EVIDENCE_SCREENSHOTS;
  const visible = () => page.locator(".ev:not([hidden])").count();
  const evidenceViewports = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }];
  const copy = { en: { count: (n) => `Showing ${n} of ${total} records`, project: "Project", type: "Evidence type", search: "Search records", clear: "Clear filters", none: "No records match." }, es: { count: (n) => `Mostrando ${n} de ${total} registros`, project: "Proyecto", type: "Tipo de evidencia", search: "Buscar registros", clear: "Borrar filtros", none: "Ningún registro coincide." } };

  assert.equal(await page.locator("#primaryMenu a[href='#evidence']").count(), 1, "Navigation must link to the evidence section");
  assert.equal(await page.locator("section#evidence").count(), 1);
  assert.equal(await page.locator(".card").count(), 3, "Landing project cards must be unchanged");

  for (const language of ["en", "es"]) {
    if ((await page.locator("html").getAttribute("lang")) !== language) await page.getByRole("button", { name: "Change language" }).click();
    assert.equal(await page.locator("html").getAttribute("lang"), language);
    for (const viewport of evidenceViewports) {
      await page.setViewportSize(viewport);
      assert.equal(await page.locator(".ev").count(), total, `All ${total} records must render (${language} ${viewport.width}px)`);
      assert.equal(await visible(), total);
      assert.equal(await page.locator("#evCount").textContent(), copy[language].count(total));
      const layout = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, columns: getComputedStyle(document.querySelector("#evList")).gridTemplateColumns.split(" ").length, evidenceOverflow: [...document.querySelectorAll("#evidence *")].filter((el) => !el.closest("details:not([open])") || el.matches("summary, summary *")).filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).map((el) => el.tagName + "." + el.className + " right=" + Math.round(el.getBoundingClientRect().right) + " " + el.textContent.slice(0, 40)) }));
      assert.ok(layout.scrollWidth <= layout.width, `Horizontal overflow at ${viewport.width}px ${language}`);
      assert.deepEqual(layout.evidenceOverflow, [], `Evidence content exceeds the viewport at ${viewport.width}px ${language}`);
      assert.equal(layout.columns, viewport.width <= 980 ? 1 : 2, `Unexpected evidence columns at ${viewport.width}px`);
      if (shotDir) await page.locator("#evidence").screenshot({ path: path.join(shotDir, `evidence-${language}-${viewport.width}x${viewport.height}.png`) });
    }
    console.log(`PASS evidence section (${language}): ${total} records, no overflow, expected columns at 360/390/768/1024/1440`);

    // Every record: limitation visible by default, four separate status dimensions, safe links, 44px targets
    await page.setViewportSize({ width: 390, height: 844 });
    for (const record of await page.locator(".ev").all()) {
      const id = await record.getAttribute("data-id");
      assert.ok(await record.locator(".limit").first().isVisible(), `${id}: limitation must be visible without interaction`);
      assert.equal(await record.locator(".evstatus dt").count(), 4, `${id}: four separate status dimensions`);
      assert.equal(await record.locator(".evstatus dd").count(), 4);
      assert.equal(await record.locator("details").evaluate((el) => el.open), false, `${id}: detail starts collapsed`);
      for (const link of await record.locator(".evlinks a").all()) {
        assert.match(await link.getAttribute("href"), /^https:\/\/github\.com\/soroushkarahrodi79-oss\//);
        assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
        assert.equal(await link.getAttribute("target"), "_blank");
        assert.ok((await link.boundingBox()).height >= 44, `${id}: link target below 44px`);
      }
      assert.ok((await record.locator("summary").boundingBox()).height >= 44, `${id}: disclosure target below 44px`);
    }
    const sectionText = await page.locator("#evidence").innerText();
    assert.doesNotMatch(sectionText, /\bverified\b|\bvalidated\b|\bverificad[oa]|\bvalidad[oa]/i, `No overclaiming status wording may be shown (${language})`);
    console.log(`PASS evidence records (${language}): limits visible by default, four separate status labels, safe 44px links, no VERIFIED/validated badge`);
  }

  // Interaction tests, English then Spanish
  await page.setViewportSize({ width: 1024, height: 768 });
  for (const language of ["en", "es"]) {
    if ((await page.locator("html").getAttribute("lang")) !== language) await page.getByRole("button", { name: "Change language" }).click();
    const t = copy[language];
    const search = page.getByRole("searchbox", { name: t.search });
    const projectSelect = page.getByRole("combobox", { name: t.project, exact: true });
    const typeSelect = page.getByRole("combobox", { name: t.type, exact: true });
    assert.equal(await search.count(), 1, "Search box needs an accessible name");
    assert.equal(await projectSelect.count(), 1);
    assert.equal(await typeSelect.count(), 1);

    await projectSelect.selectOption("salmas");
    assert.equal(await visible(), catalog.records.filter((r) => r.project === "salmas").length);
    assert.equal(await page.locator("#evCount").textContent(), t.count(await visible()));
    await typeSelect.selectOption("claim-register");
    assert.equal(await visible(), 1, "Project + type filters combine");
    await page.getByRole("button", { name: t.clear }).click();
    assert.equal(await visible(), total, "Clear restores every record");
    assert.equal(await page.evaluate(() => document.activeElement.id), "evQ", "Clear returns focus to the search box");
    assert.equal(await projectSelect.inputValue(), "");

    const query = language === "en" ? "synthetic" : "sintéticos";
    await search.fill(query);
    const synthIds = catalog.records.filter((r) => r.dataOrigin === "synthetic").map((r) => r.id);
    assert.ok(synthIds.length > 0);
    const found = await page.locator(".ev:not([hidden])").evaluateAll((els) => els.map((el) => el.dataset.id));
    for (const id of synthIds) assert.ok(found.includes(id), "Search must find the synthetic record");
    assert.ok(found.length < total, "Search narrows the list");
    await search.fill(language === "en" ? "block regressions" : "BLOCK regresiones");
    assert.ok((await visible()) >= 1 && (await visible()) < total, "Multi-word search narrows results (AND)");
    await search.fill(language === "en" ? "SALMAS  sentinel" : "sentínel SALMAS");
    assert.equal(await visible(), 1, "Search is case-, spacing- and accent-insensitive");
    assert.equal(await page.locator(".ev:not([hidden])").first().getAttribute("data-id"), "EV-SAL-002");
    await search.fill("zzzz-no-such-evidence");
    assert.equal(await visible(), 0);
    assert.ok(await page.locator("#evEmpty").isVisible(), "Empty state must show");
    assert.ok((await page.locator("#evEmpty").textContent()).includes(t.none));
    assert.equal(await page.locator("#evCount").textContent(), t.count(0));
    await page.getByRole("button", { name: t.clear }).click();
    assert.equal(await page.locator("#evEmpty").isVisible(), false);
    assert.equal(await visible(), total);
    console.log(`PASS evidence search/filters (${language}): text, case/accent, AND, project+type, result count, empty state, clear/reset`);

    // Keyboard: tab order and visible focus, disclosure by Enter and Space
    await search.focus();
    for (let step = 0; step < 6; step++) {
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => { const el = document.activeElement; const style = getComputedStyle(el); return { inside: !!el.closest("#evidence"), outline: style.outlineStyle, width: parseFloat(style.outlineWidth) }; });
      assert.ok(focus.inside && focus.outline !== "none" && focus.width >= 2, `Keyboard focus must be visible inside the evidence section (step ${step})`);
    }
    const summary = page.locator(".ev:not([hidden]) summary").first();
    await summary.focus();
    await page.keyboard.press("Enter");
    assert.equal(await summary.evaluate((el) => el.parentElement.open), true, "Enter opens the evidence detail");
    await page.keyboard.press("Space");
    assert.equal(await summary.evaluate((el) => el.parentElement.open), false, "Space closes the evidence detail");
    await page.keyboard.press("Enter");
    const detailText = await summary.evaluate((el) => el.parentElement.innerText);
    assert.match(detailText, /@[0-9a-f]{7}/, "Detail shows the pinned revision");
    console.log(`PASS evidence keyboard access (${language}): visible focus on 6 stops, Enter/Space disclosure, pinned revision shown`);

    // Filter and open detail survive a language switch
    await projectSelect.selectOption("geoimpact-ci");
    await page.getByRole("button", { name: "Change language" }).click();
    const other = language === "en" ? "es" : "en";
    assert.equal(await page.locator("html").getAttribute("lang"), other);
    assert.equal(await page.locator("#evProject").inputValue(), "geoimpact-ci", "Filter persists across language switch");
    assert.equal(await page.locator("#evCount").textContent(), copy[other].count(catalog.records.filter((r) => r.project === "geoimpact-ci").length));
    assert.ok((await page.locator(".ev:not([hidden]) details[open]").count()) >= 1, "Open disclosure persists across language switch");
    await page.getByRole("button", { name: copy[other].clear }).click();
    await page.getByRole("button", { name: "Change language" }).click();
    assert.equal(await page.locator("html").getAttribute("lang"), language);
    await page.locator("details[open]").evaluateAll((els) => els.forEach((el) => { el.open = false; }));
    console.log(`PASS evidence state across language switch (${language} -> ${other} -> ${language})`);
  }

  // Bilingual search continuity: the index covers both languages, display follows the UI language
  for (const [from, to, query, id] of [["en", "es", "negative control", "EV-GIC-002"], ["es", "en", "control negativo", "EV-GIC-002"], ["es", "en", "Crecida repentina", "EV-SAL-001"], ["en", "es", "flash flood", "EV-SAL-001"]]) {
    if ((await page.locator("html").getAttribute("lang")) !== from) await page.getByRole("button", { name: "Change language" }).click();
    await page.locator("#evQ").fill(query);
    const before = await page.locator(".ev:not([hidden])").evaluateAll((els) => els.map((el) => el.dataset.id));
    assert.ok(before.includes(id), `"${query}" must find ${id} in ${from}`);
    await page.locator(`.ev[data-id="${id}"] summary`).click();
    await page.getByRole("button", { name: "Change language" }).click();
    assert.equal(await page.locator("html").getAttribute("lang"), to);
    const after = await page.locator(".ev:not([hidden])").evaluateAll((els) => els.map((el) => el.dataset.id));
    assert.deepEqual(after, before, `Results for "${query}" must not change when switching ${from} -> ${to}`);
    assert.equal(new Set(after).size, after.length, "No duplicated results");
    assert.equal(await page.locator("#evQ").inputValue(), query, "Search text is preserved");
    assert.equal(await page.locator(`.ev[data-id="${id}"] details`).evaluate((el) => el.open), true, "Open detail is preserved");
    assert.equal(await page.locator(".ev").count(), total, "Records are rendered once");
    const expectedTitle = catalog.records.find((r) => r.id === id).title[to];
    assert.equal(await page.locator(`.ev[data-id="${id}"] h3`).textContent(), expectedTitle, "Display follows the UI language");
    await page.locator("#evClear").click();
    await page.locator("details[open]").evaluateAll((els) => els.forEach((el) => { el.open = false; }));
  }
  console.log("PASS bilingual search continuity: EN<->ES queries keep results, text and open details; display follows UI language");

  // Scientific-integrity rendering: synthetic stays distinguishable and HOLD states stay explicit
  await page.getByRole("button", { name: "Change language" }).click();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  const synthetic = page.locator('.ev[data-id="EV-LAB-002"]');
  assert.ok((await synthetic.locator(".tag").allTextContents()).some((text) => /synthetic data/i.test(text)));
  assert.match(await synthetic.locator(".evstatus").innerText(), /Synthetic data only/i);
  assert.match(await page.locator('.ev[data-id="EV-SAL-002"]').innerText(), /on hold/i);
  assert.match(await page.locator('.ev[data-id="EV-LAB-001"]').innerText(), /not admitted/i);
  assert.equal(await page.locator("#evidence").getByText(/AI-generated|chatbot/i).count(), 0);
  assert.equal(await page.locator("#ev-EV-SAL-002").count(), 1, "Records have stable deep-link anchors");
  console.log("PASS evidence integrity rendering: synthetic labelled, HOLD and not-admitted states visible, stable anchors");

  assert.deepEqual(pageErrors, [], `Browser errors: ${pageErrors.join("; ")}`);
  console.log("PASS keyboard skip link, bilingual switch, landmark label, title, cards, and project links");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
