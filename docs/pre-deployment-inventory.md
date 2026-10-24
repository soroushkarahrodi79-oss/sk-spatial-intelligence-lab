# Pre-deployment inventory

Snapshot captured read-only on **2026-10-24**. The live target was `soroushkararodi/sk-spatial-intelligence-lab`, `main`, commit `da10c68fda4f83e88f249f9d7c415f5b570183eb` (`Upload 2 files`), authored by Soroush Karahrodi at `2026-10-24T18:41:58Z`. The public Space API reported `sdk: static`, `app_file: index.html`, `pinned: true`, and four files.

The deployment source is the `space/` subdirectory. The action has an explicit allowlist for `README.md`, `index.html`, and `style.css`; root `.gitattributes` is automatically excluded by hub-sync. The workflow sets `delete_removed: false`.

| Path | Current destination SHA-256 | Planned source SHA-256 | Result | Action |
| --- | --- | --- | --- | --- |
| `.gitattributes` | `11AD7EFA24975EE4B0C3C3A38ED18737F0658A5F75A0A96787B576A78A023361` | `11AD7EFA24975EE4B0C3C3A38ED18737F0658A5F75A0A96787B576A78A023361` | Unchanged; outside upload allowlist | Preserved in place; preflight fails if it drifts |
| `README.md` | `06A541592535B4B21567A9C12471F0CDBDD1C054C5D4933813E17B7C9CEFF5B9` | `98CB0DFA8F82218AE25B36CF1B9B593A67CCCBD84EB542CD244A33D03884E610` | Intentional replacement: deployment and source guidance | Upload only after explicit owner approval |
| `index.html` | `017F3DF3C95D31E920607A68979C63D9311CA99CADF86617713FB78BB31B12F8` | `D736A1806D103EC69556B9BC39473085D23C176A1E308C4CA8E838F46127EA1F` | Intentional replacement: skip link and semantic navigation landmark; project links, content, ES/EN behavior and styling retained | Upload only after explicit owner approval |
| `style.css` | `789BFD541C9F06658AC410D968E9C39FA8C63A48A08643B36071B984C699A9F4` | `789BFD541C9F06658AC410D968E9C39FA8C63A48A08643B36071B984C699A9F4` | Unchanged; retained even though current page uses embedded CSS | Upload only after explicit owner approval |

**Additions:** none planned. **Replacements:** `README.md`, `index.html`. **Deletions by configured workflow:** none (`delete_removed: false`). **Would-be deletion under default mirroring:** `.gitattributes`, because hub-sync excludes it. That path is explicitly protected and retained. The preview workflow calculates current content hashes and exact path changes immediately before each deployment; the run artifact is the authoritative approval inventory. Unexpected destination-only files cause preflight to fail.

Other repository files (`docs/`, workflows, scripts, backups, package files) are not part of the `space/` upload source and cannot reach the Space through this workflow.
