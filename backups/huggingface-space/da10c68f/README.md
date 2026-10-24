---
title: SK Spatial Intelligence Lab
emoji: 🌍
colorFrom: blue
colorTo: gray
sdk: static
app_file: index.html
pinned: true
---

# SK Spatial Intelligence Lab

Independent, reproducible geospatial research and spatial evidence systems.

## Current release

**Static showcase only. No LLM, agent, Earth observation inference pipeline, or hosted model is deployed.**

- Madrid Urban Evidence Lens: link to a live, separate Web GIS application.
- GeoImpact-CI: link to the official deterministic spatial validation engine and its reproducible artifacts.
- Salmas Flood Spatial Forensics: research source and limitations; satellite-derived flood extent is **ON HOLD**.

No source projects were altered or copied to create this showcase. All cards link to their original GitHub repos.

## Deployment (browser, no terminal)

1. Open https://huggingface.co/new-space and sign in.
2. Owner: your personal Hugging Face account. Space name: `sk-spatial-intelligence-lab` (or an available name).
3. Choose **Static HTML**, set visibility to **Public** only after confirming that the information is suitable for public release, and create the Space.
4. In the Space's **Files** tab, add or upload the two root files from this unzipped package: `index.html` and `README.md` (replace the starter README if Hugging Face already created one). Commit the changes.
5. Optional: upload the `docs/` directory for publication policy and future development planning.
6. Open **App** to check the deployment. Test English/Spanish, project links, mobile layout, and the research-limit disclaimers.

Static Spaces are served without a running backend. **Never put a token or private key in HTML, browser JavaScript, or public config.**

## Evolution principles

- Do not mirror entire GitHub repos unless there's a specific deployment need.
- Keep GitHub as canonical project source; keep Hugging Face as public demos, datasets, models and research documentation.
- Add a separate backend only when needed for RAG, GIS tool calls, or model inference.
- A language model may describe or dispatch computations, but deterministic GIS software must produce numerical/spatial facts.
- Require source/version/time/geographic scope/uncertainty/interpretation limits on analytical outputs.
- Do not publicly upload raw satellite rasters, third-party datasets, sensitive information, or other copyrighted material without verifying licensing and publication rights.
- Salmas original repo is strictly read-only unless the owner separately authorizes writes.

See `docs/ARCHITECTURE.md` and `docs/EVALUATION_GATES.md`.
