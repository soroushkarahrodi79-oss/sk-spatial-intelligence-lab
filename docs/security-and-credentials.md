# Security and credential setup

## Hugging Face token

The workflow needs a token that can write only to the existing Space. Create a **fine-grained user access token** from [Hugging Face Access Tokens](https://huggingface.co/settings/tokens):

1. Choose a descriptive name such as `sk-spatial-intelligence-lab-github-sync`.
2. Limit repository access to `soroushkararodi/sk-spatial-intelligence-lab`.
3. Grant write access to that repository's contents. Do not grant access to the three research repositories or unrelated models/spaces.
4. Store the token in a password manager. Do not paste it into chat, source code, a local `.env`, workflow YAML, or screenshots.

In GitHub repository settings, open **Secrets and variables → Actions → New repository secret**. Name it exactly `HF_TOKEN` and paste the value there. The workflow references it only in the sync action as `${{ secrets.HF_TOKEN }}`. Rotate or revoke it if exposure is suspected.

The official `hub-sync` v0.3.0 release is pinned by commit SHA, and the Hugging Face CLI version is pinned to 2.3.0. The release tag is not cryptographically signed, so review the action's upstream changes before updating either pin.

## Deployment approval

The repository's `huggingface-production` environment is configured with the repository owner as required reviewer, a `main`-only deployment branch rule, and administrator bypass disabled. The workflow also requires a manual `workflow_dispatch` run with `approve_inventory: true`; the preview plan and deployment use the same reviewed digest. Self-review is allowed because the owner is the only configured reviewer. For two-person approval later, add a second trusted reviewer and enable GitHub's prevent-self-review setting.

Grant GitHub Actions only `contents: read`; the deployment job does not need a GitHub write token. The HF credential is not passed to the preflight or validation jobs.

## Future private model credentials

The current Space is public static HTML and has no private server-side storage. Never add private API credentials to frontend HTML, JavaScript, source maps, public configuration, or commits. A future AI feature must send requests to an authenticated backend that keeps secrets server-side, validates input, limits tools, and records auditable results. GeoImpact-CI and spatial libraries remain authoritative for numerical and geometry claims.
