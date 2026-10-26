# Evidence Explorer V0.1 — visual and accessibility review artifacts

Captured 2026-10-26 by `scripts/evidence-review-capture.mjs` (Chromium via Playwright). Each viewport (360x800, 390x844, 768x1024, 1024x768, 1440x900) in EN and ES has a `-controls` image (search/filter toolbar) and a `-disclosure` image (first record with its detail open). `contact-sheet-en.png` and `contact-sheet-es.png` show all 20 together.

## axe-core

`axe-results.json`: axe-core 4.10.2 on `#evidence` (tags wcag2a, wcag2aa, wcag21a/aa, wcag22aa, best-practice, including color-contrast) in 10 states, with the first record's detail open, at the normal reading position (record scrolled to the top under the sticky header). **Result: 0 violations in all 10 states.**

## Correction: the earlier target-size finding

The earlier run reported one **serious** `target-size` violation (ES 1024x768, first record's source link). It was a **capture-position artifact (A)**, not a defect:

- Reproduced: the first capture centred the opened detail, which left the link's box at y=37–81px while the sticky header ends at 77px, so the header covered most of it at that scroll position only.
- Not a real obstruction: Tab and Shift+Tab through every evidence control (140 stops at 1024x768, ES) never leave a focused control under the header or unreachable by hit-test, and every source link is hit-testable once scrolled into view. These are now enforced by `scripts/browser-check.mjs` ("sticky header never covers focused evidence controls").
- With the capture scrolled to the normal reading position, axe reports 0 violations.

## Visual review

All 20 images were checked via the contact sheets, with individual inspection of suspicious layouts. Corrections made from this review: a clipped ES "all evidence types" select label (shortened to "Todos los tipos" / "All types" and toolbar columns rebalanced), a mid-word link label wrap at 360px, and cards stretching when a detail opens.

axe-core is not a repository dependency (run from a temporary install). Automated checks cover only part of WCAG; no manual screen-reader testing was performed.
