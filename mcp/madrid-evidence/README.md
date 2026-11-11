# Madrid Evidence MCP v0

A **read-only, local, stdio** [MCP](https://modelcontextprotocol.io) server over two queries that
[Madrid Urban Evidence Lens](https://github.com/soroushkarahrodi79-oss/madrid-tourism-intelligence-lens)
already resolves in `js/evidence-registry.js`. It has no LLM, network access, API key or write path, and it
does not reimplement Lens's spatial or provenance logic: it loads Lens's own modules and forwards to
`registry.query`.

| Tool | Lens shape | Input | Returns |
|---|---|---|---|
| `ambito_at_point` | `AMBITO_AT_POINT` | `lon`, `lat` (WGS84) | the official planning ámbito containing the point, or Lens's abstention |
| `source_provenance` | `SOURCE_PROVENANCE` | `sourceId` | provenance, freshness and interpretation ceiling of a registered source, or Lens's abstention |

Each response is `{ shape, input, result, reading }`. `result` is Lens's evidence object or abstention
**verbatim** (explicit `null`s preserved). `reading` gives the Lens commit and the SHA-256 of every file the
server read, computed by SK Lab; Lens's `source_registry.json` itself declares a hash for only some sources.

## Pinned Lens checkout

The server needs a local checkout of Lens at the commit in [`lens-pin.json`](lens-pin.json)
(`f67cd4709d1319f5685aaa184326330a5d535088`). It refuses to start if `git` reports another commit or if any of
the six files it reads (four JS modules, `data/source_registry.json`, `data/planning/madrid_ambitos.geojson`)
differs from the pinned SHA-256. Only those fixed paths are read; clients cannot supply paths, SQL or code.
Inputs are strictly validated (finite coordinates in range, `sourceId` of `[A-Za-z0-9_.-]`, no extra fields).

```bash
git clone https://github.com/soroushkarahrodi79-oss/madrid-tourism-intelligence-lens ../lens-pinned
git -C ../lens-pinned checkout --detach f67cd4709d1319f5685aaa184326330a5d535088
npm ci
```

## Run and connect

```bash
MADRID_LENS_ROOT=../lens-pinned npm run mcp:madrid-evidence
```

Register it in an MCP client (Claude Code example):

```bash
claude mcp add madrid-evidence --env MADRID_LENS_ROOT=/abs/path/to/lens-pinned -- node /abs/path/to/sk-spatial-intelligence-lab/mcp/madrid-evidence/server.mjs
```

Or in any client's JSON config: `{"command": "node", "args": ["/abs/path/.../mcp/madrid-evidence/server.mjs"], "env": {"MADRID_LENS_ROOT": "/abs/path/to/lens-pinned"}}`.

## Test

```bash
MADRID_LENS_ROOT=../lens-pinned npm run test:madrid-mcp
```

Starts the real server, calls both tools through an MCP client and compares each result with a direct query of
Lens's registry (a point inside an ámbito, a point with none, a known and an unknown `sourceId`, hash checks,
input rejection). Without `MADRID_LENS_ROOT` the test is skipped and says so; it is not part of `npm test`.

## Limits

- Draft engineering prototype; **not scientifically validated**. Answers are exactly as good as Lens's committed
  artifacts and carry Lens's interpretation ceiling (the geometry has no declared reference date and is not a
  legal or planning determination).
- Content hashes are checked at startup; Node later loads Lens's JS modules from disk, so a file changed after
  startup is not detected.
- Only the two shapes above; no other Lens shape, no GeoParquet/DuckDB, no hosted deployment.
