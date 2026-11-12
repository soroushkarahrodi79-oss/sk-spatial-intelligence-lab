# Madrid Evidence MCP v0

A **read-only, local, stdio** [MCP](https://modelcontextprotocol.io) server with four tools over five query shapes that
[Madrid Urban Evidence Lens](https://github.com/soroushkarahrodi79-oss/madrid-tourism-intelligence-lens)
already resolves in `js/evidence-registry.js`. It has no LLM, network access, API key or write path, and it
does not reimplement Lens's spatial or provenance logic: it loads Lens's own modules and forwards to
`registry.query`.

| Tool | Lens shape | Input | Returns |
|---|---|---|---|
| `ambito_at_point` | `AMBITO_AT_POINT` | `lon`, `lat` (WGS84) | the official planning ámbito containing the point, or Lens's abstention |
| `ambito_snapshot_at_point` | `AMBITO_AT_POINT` → `AMBITO_PHASES` + `AMBITO_EDITION_DIFF` | `lon`, `lat` | the three Lens answers, separately and unmodified. The ámbito code from the first is the only code passed to the other two; if the point resolves no ámbito, `queriedCode` is `null` and nothing else is queried |
| `source_provenance` | `SOURCE_PROVENANCE` | `sourceId` | provenance, freshness and interpretation ceiling of a registered source, or Lens's abstention |
| `licences_in_lens` (v0.3) | `LICENCES_IN_LENS` | `lon`, `lat`, `radiusM` (> 0, ≤ 3000), optional `families`, `window` | Lens's per-family counts of **granted** licences located inside the circle, with window, coverage, ceiling and `applied`; `value.records` is omitted (`recordsOmitted: true`) |

**`licences_in_lens` — what it is and is not.** Counts are for the *circle* (address points), never for an ámbito, barrio or district. There is no cross-family total (the three families are never summed) and the server adds no count of its own: `perFamily` is Lens's. The register is granted-only, so there is no approval/rejection rate, and a granted licence is not evidence that anything was built. Only licences Lens could locate are counted; `coverage` reports the unlocated rows, which are not zeros. Without `window`, Lens applies the 12 months ending at the register's latest grant date (not at today's date) and discloses the exact dates.

*Who rejects what.* The MCP schema rejects (the call never reaches Lens): `radiusM` ≤ 0 or > 3000, a missing `radiusM`, an empty or unknown `families` entry, a `window` without both `from` and `to` or not shaped `YYYY-MM-DD`, and unknown fields. Lens returns an abstention for: a window that matches the shape but is not a real calendar date, e.g. `2025-02-30` (`AMBIGUOUS_SCOPE`), and a window entirely outside the register's coverage (`OUTSIDE_TEMPORAL_COVERAGE`). A window partly outside is clamped and reported with `clamped: true`. The MCP does no calendar logic of its own. **The 3000 m cap is a limit of this MCP tool**, not of the source or of Lens's algorithm (Lens accepts any radius > 0; its own interface offers 100–5000 m).

Licence files are verified through the additive `lens-pin-licences.json` (same Lens commit), so `lens-pin.json` and the sealed v0.1 benchmark are unchanged. The v0.3 agent cases are in `eval/cases-v0.3.json` (defined, not run).

`ambito_at_point` and `source_provenance` respond with `{ shape, input, result, reading }`; `ambito_snapshot_at_point` with `{ composition, input, queriedCode, ambitoAtPoint, ambitoPhases, ambitoEditionDiff, notQueried, reading }`. An edition difference classifies two published snapshots (here 2025-07-01 and 2026-01-01); it is not progress or a recommendation. `result` is Lens's evidence object or abstention
**verbatim** (explicit `null`s preserved).

`reading` keeps two lists apart, both with SHA-256 computed by SK Lab (Lens's `source_registry.json` itself declares a hash for only some sources):

- `reading.verifiedAtStartup.files`: the nine pinned files the server verified before it would start. The same list in every response; it says what was loaded, not what a result rests on.
- `reading.supports[<shape>]`: for each Lens result returned, only the files its resolver consults, each with the hash verified at startup. For example `AMBITO_AT_POINT` is backed by the geometry and the registry but not by the state artifact; `SOURCE_PROVENANCE` by the registry alone among the data files.

## Pinned Lens checkout

The server needs a local checkout of Lens at the commit in [`lens-pin.json`](lens-pin.json)
(`f67cd4709d1319f5685aaa184326330a5d535088`). It refuses to start if `git` reports another commit or if any of
the nine files it reads (six JS modules, `data/source_registry.json`, `data/planning/madrid_ambitos.geojson`, `data/planning/madrid_ambito_state.json`)
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

Starts the real server, calls each of the three tools through an MCP client and compares each result with a direct query of
Lens's registry (points with all three answers, with no ámbito, with phases and diff abstentions; known and unknown `sourceId`; hash checks; input rejection). Without `MADRID_LENS_ROOT` the command **fails** (it is never green by omission). It also checks that the server refuses to start with a missing checkout or a modified verified file. It is not part of `npm test`; the PR workflow (`validate.yml`) checks out Lens at the pinned commit and runs it as a step of the job (a failing step fails the workflow).

An exploratory 30-case evaluation of an agent using these tools, with its protocol, limits and sealed references, is in [`eval/`](eval/README.md). It is not part of the test above and is not scientific validation.

## Limits

- Draft engineering prototype; **not scientifically validated**. Answers are exactly as good as Lens's committed
  artifacts and carry Lens's interpretation ceiling (the geometry has no declared reference date and is not a
  legal or planning determination).
- At startup the pinned bytes are hashed, the JS modules are loaded from a private temporary copy of exactly those
  bytes (not from the checkout), re-hashed after loading, and the copy is deleted. A mismatch blocks startup. This
  shows the code and data match the pinned files; it does not prove Lens's results are correct, and a process
  running as the same OS user could still tamper with the temporary copy during the few milliseconds of loading.
- A `NO_EVIDENCE_FOR_SCOPE` abstention for a point is a known absence in the published ámbito layer. It does not say why no ámbito is there, which zoning or land class applies at the point, or which ámbito is nearest; the server has no proximity query. (Added after a six-question agent pilot in which the agent, given this abstention, explained it with an unsourced zoning claim stated as fact.)
- Only the four tools above (five Lens shapes); no other Lens shape, no GeoParquet/DuckDB, no hosted deployment.
