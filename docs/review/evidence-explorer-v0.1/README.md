# Evidence Explorer V0.1 — visual and accessibility review artifacts

Captured 2026-10-26 by `scripts/evidence-review-capture.mjs` (Chromium via Playwright). Each viewport (360x800, 390x844, 768x1024, 1024x768, 1440x900) in EN and ES has a `-controls` image (search/filter toolbar) and a `-disclosure` image (first record with its detail open).

`axe-results.json` is axe-core 4.10.2 run on `#evidence` (tags wcag2a, wcag2aa, wcag21a/aa, wcag22aa, best-practice) in each of the 10 states, with a disclosure open. It includes the color-contrast rule. Result: 0 violations in 9 of 10 states; 1 `target-size` finding (ES 1024x768) because a source link was partly under the sticky header at the scroll position used for that capture. This is a capture-position artifact; links are 44px tall in the browser test.

axe-core is not a repository dependency (run from a temporary install). Automated checks catch only part of WCAG; no manual screen-reader testing was performed.
