# Spatial Investigation Studio v0.1

Local, read-only web interface over [Madrid Evidence MCP](../mcp/madrid-evidence/README.md). No LLM, no database, no new analysis: it starts the real MCP server over stdio, verifies it, calls `ambito_snapshot_at_point`, `licences_in_lens` and `source_provenance` (only for `sourceId`s cited by an EVIDENCE result), and shows what they return.

```bash
MADRID_LENS_ROOT=/abs/path/to/lens-pinned npm run studio   # http://127.0.0.1:4317/ (STUDIO_PORT to change)
MADRID_LENS_ROOT=/abs/path/to/lens-pinned npm run test:studio
MADRID_LENS_ROOT=/abs/path/to/lens-pinned npm run test:studio-browser   # PLAYWRIGHT_CHROMIUM=/path/to/chrome optional
```

- **Traceability.** `public/evidence-view.mjs` maps each displayed value to a JSON pointer into the raw MCP record; the "Ver origen" inspector shows the pointer, the value there, the verified files behind the result and the full response. Interface notes carry no numbers.
- **Fail-closed.** Wrong server name, tools not read-only, a response declaring another Lens commit, a crash or a tool error: the affected section shows the error and no result.
- **Not shown on purpose.** No cross-family licence total; no ámbito geometry or licence points (the tools return neither); `registerComposition` only as register-wide context, never inside a family's count; nothing inferred from `NO_EVIDENCE_FOR_SCOPE`.
- **Pilot point.** Nuevos Ministerios station, Renfe 2019 record: lon −3.692207, lat 40.446612, provisional. The record labels them UTM although they are written as decimal degrees; they are used as WGS84 lon/lat provisionally and their CRS is not declared consistently by the source.
- **Map.** Leaflet 1.9.4 is vendored byte-identical in `public/vendor/leaflet` (see `VENDOR.json`) because `package-lock.json` is hash-locked by the MCP evaluation protocols. Basemap tiles come from OpenStreetMap; without network the map shows only the point and the query circle.
- Draft engineering prototype, not scientifically validated, not a legal or planning determination.

## v0.2: Question-Driven Evidence

A question field, four guided questions and an interpretation card sit above the v0.1 controls; the v0.1 "Investigación completa" flow (`/api/investigate`, button `#run`) is unchanged.

- **Router** (`question-router.mjs`): deterministic, Spanish only, no model. Guided questions send a structured intent validated by the server; free text goes through a small explicit lexicon. Anything it cannot assign with certainty (uninterpreted terms, numbers/dates/distances/codes in the text, total or rate or built-vs-granted requests, zoning, causes, types, comparisons, …) is an **abstention that runs no MCP call** and offers valid alternatives; nothing is answered partially unless the user clicks an alternative.
- **Plans**: ámbito → `ambito_snapshot_at_point` (ámbito section only); licences → `licences_in_lens`; editions → `ambito_snapshot_at_point` (identity + difference; the phases stay in the inspector's original response); provenance → `source_provenance` for an explicitly named source (`urban_licences`, `planning_ambito_geometry`, `planning_ambito_state`). Point, radius and window come only from the controls.
- **API**: `POST /api/ask` `{mode: "guided"|"text", guided?, sourceId?, question?, lon, lat, radiusM, window?}`, `GET /api/questions`.
- Tests: `npm run test:studio-question`, `npm run test:studio-question-browser`.
- Archived, not merged: the Claude claim-selector experiment (HOLD) on branch `claude/spatial-investigation-studio-v0.2-4tf7jg`.
