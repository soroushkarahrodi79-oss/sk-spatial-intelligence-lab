# Versioning and releases

The `VERSION` file is the repository's human-readable release version and follows Semantic Versioning. Keep it aligned with `package.json`.

- **Patch:** documentation, validation, or compatible maintenance changes.
- **Minor:** additive static pages or backward-compatible portfolio features.
- **Major:** material information architecture or public behavior changes that need migration or invalidate prior assumptions.

Before a release, run the full local checks, review all source and Space deployment diffs, update the version and changelog, and record a destination snapshot before any approved production sync. A GitHub commit or tag does not imply a production deployment. Keep the Hugging Face commit hash associated with each approved release so it can be restored or audited.
