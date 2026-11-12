#!/usr/bin/env node
// Madrid Evidence MCP — read-only stdio server exposing four tools over five deterministic Lens
// registry query shapes (AMBITO_AT_POINT, AMBITO_PHASES, AMBITO_EDITION_DIFF,
// SOURCE_PROVENANCE, LICENCES_IN_LENS). No LLM, no network, no
// writes. Set MADRID_LENS_ROOT to a checkout of the pinned Lens commit.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadLens, PIN } from "./lens-adapter.mjs";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

let lens;
try {
  lens = await loadLens(process.env.MADRID_LENS_ROOT);
} catch (error) {
  console.error(`madrid-evidence: ${error.message}`);
  process.exit(1);
}

const server = new McpServer({ name: "madrid-evidence", version: "0.1.0" });

const respond = (payload) => ({
  content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  structuredContent: payload,
});

server.registerTool(
  "ambito_at_point",
  {
    title: "Official planning ámbito at a point",
    description:
      "Lens shape AMBITO_AT_POINT. Given WGS84 lon/lat, returns the official Madrid planning ámbito that contains the point (point-in-polygon), or Lens's own abstention (e.g. NO_EVIDENCE_FOR_SCOPE when none contains it). An abstention is a known absence in the published ámbito layer: it says nothing about why no ámbito is there, which zoning or land class applies, or which ámbito is nearest. Deterministic; `result` is Lens's evidence object verbatim. `reading.verifiedAtStartup` lists every pinned file the server verified (same for every call); `reading.supports` lists, with hashes, only the files behind this result. Not a legal or planning determination.",
    inputSchema: z.strictObject({
      lon: z.number().min(-180).max(180).describe("Longitude, WGS84 decimal degrees"),
      lat: z.number().min(-90).max(90).describe("Latitude, WGS84 decimal degrees"),
    }),
    annotations: READ_ONLY,
  },
  async ({ lon, lat }) => respond(lens.ambitoAtPoint({ lon, lat }))
);

server.registerTool(
  "source_provenance",
  {
    title: "Provenance and limits of a registered source",
    description:
      "Lens shape SOURCE_PROVENANCE. Given a registered sourceId (e.g. planning_ambito_geometry), returns its provenance, freshness (explicit nulls preserved) and interpretation ceiling, or Lens's abstention (OUTSIDE_SOURCE_UNIVERSE for an unknown id). `result` is Lens's evidence object verbatim; `reading.supports` names the verified files behind it, `reading.verifiedAtStartup` all files the server verified.",
    inputSchema: z.strictObject({
      sourceId: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9_.-]+$/, "sourceId may only contain letters, digits, '_', '.', '-'")
        .describe("A source id from Lens's source_registry.json"),
    }),
    annotations: READ_ONLY,
  },
  async ({ sourceId }) => respond(lens.sourceProvenance({ sourceId }))
);

const lensResult = z.looseObject({ kind: z.enum(["EVIDENCE", "ABSTENTION"]) });

server.registerTool(
  "ambito_snapshot_at_point",
  {
    title: "Planning ámbito at a point: identity, published state, edition difference",
    description:
      "Composes three existing Lens queries for one WGS84 point: AMBITO_AT_POINT, then AMBITO_PHASES and AMBITO_EDITION_DIFF using exactly the ámbito code that the first returned. The three Lens answers are returned separately and unmodified (evidence or abstention, explicit nulls preserved). If the point resolves no ámbito, the later queries are not run and queriedCode is null; that abstention is a known absence in the published ámbito layer and says nothing about why, which zoning or land class applies, or which ámbito is nearest. An edition difference is a classification of two published snapshots; it is not progress, a ranking or a recommendation. `reading.supports` lists, with hashes, the verified files behind each Lens result returned; `reading.verifiedAtStartup` lists every file the server verified. Not a legal or planning determination.",
    inputSchema: z.strictObject({
      lon: z.number().min(-180).max(180).describe("Longitude, WGS84 decimal degrees"),
      lat: z.number().min(-90).max(90).describe("Latitude, WGS84 decimal degrees"),
    }),
    outputSchema: z.looseObject({
      composition: z.tuple([z.literal("AMBITO_AT_POINT"), z.literal("AMBITO_PHASES"), z.literal("AMBITO_EDITION_DIFF")]),
      input: z.strictObject({ lon: z.number(), lat: z.number() }),
      queriedCode: z.string().nullable(),
      ambitoAtPoint: lensResult,
      ambitoPhases: lensResult.nullable(),
      ambitoEditionDiff: lensResult.nullable(),
      notQueried: z.string().nullable(),
      reading: z.looseObject({
        lensCommit: z.string(),
        verifiedAtStartup: z.looseObject({
          files: z.array(z.looseObject({ path: z.string(), role: z.string(), sha256: z.string() })),
        }),
        supports: z.record(z.string(), z.array(z.looseObject({ path: z.string(), sha256: z.string() }))),
      }),
    }),
    annotations: READ_ONLY,
  },
  async ({ lon, lat }) => respond(lens.ambitoSnapshotAtPoint({ lon, lat }))
);

const FAMILIES = ["BUILDING_URBANISTIC_LICENCE_FAMILY", "ACTIVITY_LICENCE_FAMILY", "TEMPORARY_ACTIVITY_FAMILY"];
// Shape only. Whether a string is a real calendar date (2025-02-30 is not) is decided by Lens, which
// answers AMBIGUOUS_SCOPE; no calendar logic is duplicated here.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must look like YYYY-MM-DD");
// MCP interface limit, not a limit of the source or of Lens's algorithm (Lens accepts any radius > 0;
// its own interface offers 100-5000 m). Kept at 3000 m for this tool.
const MAX_LICENCE_RADIUS_M = 3000;

server.registerTool(
  "licences_in_lens",
  {
    title: "Granted urban licences inside a circle, by family",
    description:
      "Lens shape LICENCES_IN_LENS. Given a centre (WGS84 lon/lat) and a radius in metres (> 0 and <= 3000: a limit of this MCP tool, not of the source or of Lens), returns Lens's own per-family counts of GRANTED administrative urban licences whose located address point falls inside the circle (boundary inclusive), in a grant-date window. `result.value.perFamily` has one count per family and there is no cross-family total: the three families are never summed. No presentes ni ofrezcas una suma entre familias, tampoco como cálculo propio, aproximación ni aunque el usuario la solicite. Counts are for the circle, not for a planning ámbito, barrio or district. The register is granted-only: there is no application or refusal denominator, so no approval, rejection or success rate exists, and a granted licence is not evidence that anything was built or opened. Only records Lens could place are counted; `result.value.coverage` reports the rows that could not be located, which are not zeros. Without `window`, Lens applies the 12 months ending at the register's latest grant date (not at today's date) and reports it in `result.value.window`; a window partly outside the register is clamped and reported with clamped=true. Input rejected by this tool's schema (never reaches Lens): radius <= 0 or > 3000, a family not in the enum or an empty families list, a window lacking `from` or `to` or not shaped YYYY-MM-DD, unknown fields. Returned by Lens as an abstention: a window that is not made of real calendar dates (AMBIGUOUS_SCOPE) and a window entirely outside the register's coverage (OUTSIDE_TEMPORAL_COVERAGE). Individual licence records are not returned (`recordsOmitted: true`). `result.applied` records the effective inputs Lens used. Not a legal or planning determination.",
    inputSchema: z.strictObject({
      lon: z.number().min(-180).max(180).describe("Circle centre longitude, WGS84 decimal degrees"),
      lat: z.number().min(-90).max(90).describe("Circle centre latitude, WGS84 decimal degrees"),
      radiusM: z.number().gt(0).max(MAX_LICENCE_RADIUS_M).describe("Circle radius in metres, > 0 and <= 3000 (MCP tool limit)"),
      families: z.array(z.enum(FAMILIES)).min(1).max(FAMILIES.length).optional().describe("Optional subset of the three licence families; omit for all three, each still counted separately"),
      window: z.strictObject({ from: isoDate, to: isoDate }).optional().describe("Optional grant-date window, both bounds YYYY-MM-DD; omit for Lens's default window"),
    }),
    annotations: READ_ONLY,
  },
  async (args) => respond(lens.licencesInLens(args))
);

await server.connect(new StdioServerTransport());
console.error(`madrid-evidence MCP ready (Lens ${PIN.commit.slice(0, 7)})`);
