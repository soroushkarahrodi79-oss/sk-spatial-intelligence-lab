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
- **Pilot point.** Nuevos Ministerios at lon −3.6920, lat 40.4460 is provisional and approximate.
- **Map.** Leaflet 1.9.4 is vendored byte-identical in `public/vendor/leaflet` (see `VENDOR.json`) because `package-lock.json` is hash-locked by the MCP evaluation protocols. Basemap tiles come from OpenStreetMap; without network the map shows only the point and the query circle.
- Draft engineering prototype, not scientifically validated, not a legal or planning determination.
