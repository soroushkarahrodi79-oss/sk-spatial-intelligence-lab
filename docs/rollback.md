# Rollback and recovery

## Baseline backup

The exact four-file public Space snapshot is committed at [`backups/huggingface-space/da10c68f/`](../backups/huggingface-space/da10c68f/). It records the original main revision `da10c68fda4f83e88f249f9d7c415f5b570183eb`, Space SDK metadata, author, timestamp, and SHA-256 checksums. The Hugging Face repository also retains commit history.

## Restore the initial Space files

The deployment workflow does not delete files. To restore the initial four files after an approved deployment, install the current Hugging Face CLI, authenticate locally with a write token kept outside the repository, and run from the source repository root:

```sh
hf upload soroushkararodi/sk-spatial-intelligence-lab backups/huggingface-space/da10c68f . --repo-type space --include .gitattributes --include README.md --include index.html --include style.css --commit-message "Restore verified pre-migration Space snapshot da10c68f"
```

This uploads those four exact baseline files as a new Space commit and does not request deletion. Verify the resulting file contents against `manifest.json` and check the Space's Static SDK and App view. Keep the backup directory unchanged.

For any future release, first preserve its exact Space commit and files in `backups/`, record checksums, and only then approve deployment. Do not use a force push or a delete-enabled mirror as the routine rollback method.
