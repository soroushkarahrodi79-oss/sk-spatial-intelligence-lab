# Hugging Face deployment

## Destination and sync behavior

- GitHub source: `soroushkarahrodi79-oss/sk-spatial-intelligence-lab`
- Hugging Face destination: `soroushkararodi/sk-spatial-intelligence-lab`
- Destination type: Space
- SDK: Static HTML (`space/README.md` retains `sdk: static` and `app_file: index.html`)
- Action: `huggingface/hub-sync` v0.3.0, pinned to the verified release commit
- CLI: `hf` 2.3.0 pinned by the workflow
- Trigger: `workflow_dispatch` only

The deploy workflow uploads only `README.md`, `index.html`, and `style.css` from `space/`. The action excludes `.gitattributes` by design. `delete_removed: false` prevents it deleting any destination file. The preflight downloads the current public destination, checks Static SDK metadata and file hashes, records additions/replacements/unchanged files and would-be mirror deletions, and fails on unexpected destination paths or `.gitattributes` drift. Changes are written to the workflow artifact before the protected deploy job.

The official action mirrors files and can delete destination files when `delete_removed` is enabled. Keep the deletion guard and allowlist in place. Review the [current baseline inventory](pre-deployment-inventory.md) and inspect each run's `space-deployment-plan` artifact.

## First deployment procedure

1. Create the fine-grained Hugging Face write token described in [security and credentials](security-and-credentials.md), then save it as the GitHub **repository secret** `HF_TOKEN`.
2. In the repository settings, create the `huggingface-production` environment and add the repository owner as a required reviewer. Do this before the first deploy; the workflow references this environment so GitHub can pause the deploy job for approval.
3. Run **Actions → Deploy Hugging Face Space → Run workflow** with mode `plan`. Download and review the `space-deployment-plan` artifact. It must show the expected path-level comparison and no unapproved deletion.
4. Start a new manual run with mode `deploy` and `approve_inventory` set to `true`. The preflight runs again. Review the plan job artifact and approve the pending `huggingface-production` deployment.
5. After sync, inspect the Space's Files and App views. Confirm its SDK is still Static, the bilingual switch works, project links open, and the policy/status text is accurate.

The `approve_inventory` input is an explicit dispatch acknowledgement; the protected GitHub environment adds a separate reviewer gate. If the first run should only create a preview, leave mode at `plan`. Pushes to GitHub never deploy to production.

## Change and deletion policy

The workflow is configured so the synchronization action cannot delete destination files. Preflight still reports the paths a mirroring configuration would remove. It accepts `.gitattributes` as a specifically preserved, unmanaged file only when its content matches the verified snapshot. Any other destination-only path stops the run until the inventory and safeguards are reviewed in a code change. Do not enable `delete_removed: true` as a routine setting.

## References

- [Hugging Face GitHub Actions guide](https://huggingface.co/docs/hub/repositories-github-actions)
- [hub-sync v0.3.0 release](https://github.com/huggingface/hub-sync/releases/tag/v0.3.0)
- [hub-sync v0.3.0 action inputs and deletion behavior](https://github.com/huggingface/hub-sync/blob/v0.3.0/action.yml)
- [Rollback and recovery](rollback.md)
