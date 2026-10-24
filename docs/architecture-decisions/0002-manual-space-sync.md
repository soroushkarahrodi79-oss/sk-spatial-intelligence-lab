# ADR 0002: Manual, non-deleting Space synchronization

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

The official Hugging Face sync action mirrors a source directory and may delete destination files when deletion is enabled. The existing Space contains `.gitattributes` that the action's built-in filter excludes.

## Decision

Use `huggingface/hub-sync` v0.3.0, pinned to its release commit, through a `workflow_dispatch`-only workflow. Deploy from `space/` with an explicit three-file allowlist, `repo_type: space`, `space_sdk: static`, and `delete_removed: false`. Keep the HF token in the GitHub repository secret `HF_TOKEN`, pass it only to the deployment action, and gate deployment with a reviewed plan and protected environment. Preflight verifies metadata and destination/source content hashes.

## Consequences

Pushes and pull requests cannot deploy. Destination-only files cannot be deleted by the workflow. The existing `.gitattributes` is deliberately retained in place and monitored for drift. Removing or replacing a destination-only file requires a separately reviewed change to the inventory and safeguards.
