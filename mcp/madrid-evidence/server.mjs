#!/usr/bin/env node
// Madrid Evidence MCP — read-only stdio server exposing two deterministic Lens
// registry queries: AMBITO_AT_POINT and SOURCE_PROVENANCE. No LLM, no network, no
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
      "Lens shape AMBITO_AT_POINT. Given WGS84 lon/lat, returns the official Madrid planning ámbito that contains the point (point-in-polygon), or Lens's own abstention (e.g. NO_EVIDENCE_FOR_SCOPE when none contains it). Deterministic; `result` is Lens's evidence object verbatim. Not a legal or planning determination.",
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
      "Lens shape SOURCE_PROVENANCE. Given a registered sourceId (e.g. planning_ambito_geometry), returns its provenance, freshness (explicit nulls preserved) and interpretation ceiling, or Lens's abstention (OUTSIDE_SOURCE_UNIVERSE for an unknown id). `result` is Lens's evidence object verbatim.",
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

await server.connect(new StdioServerTransport());
console.error(`madrid-evidence MCP ready (Lens ${PIN.commit.slice(0, 7)})`);
