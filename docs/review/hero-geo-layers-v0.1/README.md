# Hero geo-layers illustration V0.1 — review artifacts

Captured 2026-10-26 with `scripts/hero-review-capture.mjs` (Chromium via Playwright, EN and ES). `before-*` come from `origin/main` (e696958), `after-*` from this branch. Viewports: 390x844, 768x1024, 1024x768, 1440x900; `-visual` images scroll the illustration into view on the stacked (<=850px) layouts.

## axe-core

`axe-results.json`: axe-core 4.10.2 on `.hero` (wcag2a/aa, wcag21a/aa, wcag22aa, best-practice, including color-contrast) in 10 states (EN/ES x 360, 390, 768, 1024, 1440px). **0 violations.** axe-core is not a repository dependency; `scripts/hero-axe.mjs` takes its path as an argument. Automated checks cover only part of WCAG; no manual screen-reader testing was performed.

## Scope and limits

- Static inline SVG + CSS. No script, canvas, image, font or library added; no animation (a perpetual decorative animation would need a pause control under WCAG 2.2.2, which is not justified here).
- All geometry is invented to look like GIS layers. It depicts no place and carries no data; the SVG has no text, so the visible note, legend and accessible name stay translatable.
- The site is dark-only (`color-scheme: dark`); there is no light theme to test.
- Size: `space/index.html` 102,852 -> 108,813 bytes (+5,961 raw, +1,530 gzip -9).
