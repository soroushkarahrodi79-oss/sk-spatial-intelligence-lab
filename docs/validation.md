# Validation record

Captured on 2026-10-24 against the imported source. No Hugging Face deployment was triggered.

## Results

- `npm ci` — passed; 19 packages installed, 0 reported vulnerabilities.
- `npm run validate` — passed. `html-validate` reported no diagnostics; CSS parsed in both the embedded stylesheet and preserved `style.css`; the inline JavaScript parsed; English/Spanish dictionaries had the same keys and all 36 used translation keys were present. The 0.1.0 release version matched `package.json`, and all baseline Space backup checksums matched the manifest. Landmark, accessible-name, keyboard-focus, internal-anchor, safe external-link, workflow YAML, deployment-target, manual-only, token-secret, and no-delete checks passed.
- `npm run check:links` — passed; all 5 unique external links returned HTTP 200.
- `npm run test:browser` — passed in Chromium 156.0.8078.4 through Playwright 1.64.1. At 390×844, 768×1024, and 1440×900 there was no horizontal overflow; the project grid used 1, 1, and 3 columns respectively. The test also exercised the first-focus skip link, ES/EN switching, translated navigation landmark name, three project cards, and the four project links.
- `npm test` — passed with all validation, link, and browser checks.
- `npm run plan:space -- --out-dir work/predeployment-plan` — passed read-only against Space main commit `da10c68fda4f83e88f249f9d7c415f5b570183eb`. Plan digest: `0AB57028623BDCA475E1CC6EF7A89C9B8CF65D1089219F15C77072223FF9D6DA`. The comparison found 0 additions, 2 replacements (`README.md`, `index.html`), 1 unchanged upload (`style.css`), 1 protected file outside the upload set (`.gitattributes`), and 0 actual deletions. With default mirroring, `.gitattributes` would be removed; the workflow explicitly disables deletion and preflight verifies that file matches the captured baseline.
- Repository credential-pattern scan — passed with no token-shaped strings found.
- GitHub Actions run [`Validate static lab` #1](https://github.com/soroushkarahrodi79-oss/sk-spatial-intelligence-lab/actions/runs/40124544175) on commit `824827c55379193106ef7c87346962da0651cdeb` — completed successfully. All eight job steps passed, including dependency install, static checks, external links, Chromium install, and responsive browser tests.

## Limits

HTTP checks confirm availability at test time, not the correctness of remote page content. The browser test covers representative viewport sizes and keyboard behavior, not a full screen-reader or color-contrast audit. The manual deployment workflow and the protected GitHub environment were not executed/configured here; no production write was made.
