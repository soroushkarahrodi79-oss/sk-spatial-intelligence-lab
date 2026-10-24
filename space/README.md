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

- Madrid Urban Evidence Lens: a live, separate Web GIS application.
- GeoImpact-CI: the official deterministic spatial validation engine and its reproducible artifacts.
- Salmas Flood Spatial Forensics: research source and limitations; satellite-derived flood extent is **ON HOLD**.

All project cards link to their original repositories. The showcase does not copy or modify those projects.

## Source and deployment

The canonical source is the [`sk-spatial-intelligence-lab` GitHub repository](https://github.com/soroushkarahrodi79-oss/sk-spatial-intelligence-lab). Production sync is manual and approval-gated; no push-to-production deployment is enabled. The source repository documents the change inventory, safe sync settings, credentials, and recovery procedure.

Static Spaces do not provide a private backend. Never put a token or private key in HTML, browser JavaScript, or public configuration. Future model calls and private credentials require an authenticated backend.

## Evolution principles

- Keep the existing research projects as separate canonical repositories.
- A language model may explain or request computations; deterministic GIS software must produce numerical and spatial facts.
- Require source/version/time/geographic scope/uncertainty/interpretation limits on analytical outputs.
- Do not publicly upload raw satellite rasters, third-party datasets, sensitive information, or copyrighted material without verifying rights.
- Salmas Flood Spatial Forensics remains strictly read-only unless its owner separately authorizes writes.

The [technical roadmap](https://github.com/soroushkarahrodi79-oss/sk-spatial-intelligence-lab/blob/main/docs/architecture-roadmap.md) is planning only.
