// Integration test for the Madrid Evidence MCP server (mcp/madrid-evidence).
//
// Starts the real stdio server, calls both tools through an MCP client and compares
// each result with a direct query of the Lens evidence registry, wired here
// independently of the adapter. Requires a Lens checkout at the pinned commit:
//
//   MADRID_LENS_ROOT=/path/to/lens npm run test:madrid-mcp
//
// Without MADRID_LENS_ROOT the suite is skipped and says so.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const LENS_ROOT = process.env.MADRID_LENS_ROOT;
const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "mcp", "madrid-evidence", "server.mjs");
const PIN = JSON.parse(readFileSync(new URL("../mcp/madrid-evidence/lens-pin.json", import.meta.url), "utf8"));

const skip = LENS_ROOT ? false : "MADRID_LENS_ROOT is not set; skipping Madrid Evidence MCP integration tests";

test("Madrid Evidence MCP against the pinned Lens registry", { skip }, async (t) => {
  // --- direct Lens registry, wired the way Lens's own tests wire it ----------------
  const lensFile = (rel) => path.join(LENS_ROOT, ...rel.split("/"));
  const readJson = (rel) => JSON.parse(readFileSync(lensFile(rel), "utf8"));
  const lensRequire = createRequire(lensFile("package.json"));
  const R = lensRequire("./js/evidence-registry.js");
  const planning = await import(pathToFileURL(lensFile("js/planning-ambito.js")).href);
  const planningIndex = planning.createPlanningIndex({ geometry: readJson("data/planning/madrid_ambitos.geojson") });
  const direct = R.createEvidenceRegistry({
    registry: readJson("data/source_registry.json"),
    planningIndex,
    planningModule: { AMBITO_STATE: planning.AMBITO_STATE, AVAILABILITY: planning.AVAILABILITY },
  });
  // Same normalisation MCP applies on the wire (JSON round trip: frozen objects, undefined).
  const wire = (value) => JSON.parse(JSON.stringify(value));

  // A point that really falls inside an ámbito: first vertex of the first polygon,
  // found by scanning with the direct registry (as Lens's tests do).
  let inside = null;
  for (const entry of planningIndex.entries) {
    let c = (entry.geometry || entry.feature.geometry).coordinates;
    while (Array.isArray(c[0])) c = c[0];
    const [lon, lat] = c;
    if (R.isEvidence(direct.query("AMBITO_AT_POINT", { lon, lat }))) {
      inside = { lon, lat };
      break;
    }
  }
  assert.ok(inside, "test setup: found a point inside some ámbito");
  const OUTSIDE = { lon: -3.7038, lat: 40.4168 }; // Puerta del Sol: no planning ámbito here

  // --- MCP client over stdio -------------------------------------------------------
  const client = new Client({ name: "madrid-evidence-test", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, MADRID_LENS_ROOT: LENS_ROOT },
    stderr: "pipe",
  });
  await client.connect(transport);
  t.after(() => client.close());
  const call = (name, args) => client.callTool({ name, arguments: args });
  const sha = (rel) => createHash("sha256").update(readFileSync(lensFile(rel))).digest("hex");

  await t.test("lists exactly the two read-only tools", async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), ["ambito_at_point", "source_provenance"]);
    for (const tool of tools) assert.equal(tool.annotations.readOnlyHint, true);
  });

  await t.test("ambito_at_point matches the direct registry for a point inside an ámbito", async () => {
    const res = await call("ambito_at_point", inside);
    assert.ok(!res.isError);
    const expected = direct.query("AMBITO_AT_POINT", inside);
    assert.equal(expected.kind, "EVIDENCE");
    assert.deepEqual(res.structuredContent.result, wire(expected));
    assert.equal(res.structuredContent.result.derivation, "POINT_IN_POLYGON");
    assert.deepEqual(JSON.parse(res.content[0].text), res.structuredContent);
  });

  await t.test("ambito_at_point returns Lens's abstention for a point with no ámbito", async () => {
    const res = await call("ambito_at_point", OUTSIDE);
    const expected = direct.query("AMBITO_AT_POINT", OUTSIDE);
    assert.equal(expected.kind, "ABSTENTION");
    assert.deepEqual(res.structuredContent.result, wire(expected));
    assert.equal(res.structuredContent.result.reason, "NO_EVIDENCE_FOR_SCOPE");
  });

  await t.test("source_provenance matches the direct registry and preserves explicit nulls", async () => {
    const sourceId = "planning_ambito_geometry";
    const res = await call("source_provenance", { sourceId });
    const expected = direct.query("SOURCE_PROVENANCE", { sourceId });
    assert.equal(expected.kind, "EVIDENCE");
    assert.deepEqual(res.structuredContent.result, wire(expected));
    const { freshness } = res.structuredContent.result.value;
    assert.equal(freshness.reference_date, null);
    assert.equal(freshness.published_at, null);
  });

  await t.test("source_provenance returns Lens's abstention for an unknown sourceId", async () => {
    const res = await call("source_provenance", { sourceId: "no_such_source" });
    const expected = direct.query("SOURCE_PROVENANCE", { sourceId: "no_such_source" });
    assert.equal(expected.kind, "ABSTENTION");
    assert.deepEqual(res.structuredContent.result, wire(expected));
    assert.equal(res.structuredContent.result.reason, "OUTSIDE_SOURCE_UNIVERSE");
  });

  await t.test("reports commit and SHA-256 of the files actually read", async () => {
    const res = await call("ambito_at_point", inside);
    const { reading } = res.structuredContent;
    assert.equal(reading.lensCommit, PIN.commit);
    const byPath = new Map(reading.files.map((f) => [f.path, f]));
    assert.ok(byPath.has("data/planning/madrid_ambitos.geojson"));
    assert.ok(byPath.has("data/source_registry.json"));
    for (const file of reading.files) assert.equal(file.sha256, sha(file.path), file.path);

    const prov = await call("source_provenance", { sourceId: "planning_ambito_geometry" });
    assert.deepEqual(
      prov.structuredContent.reading.files.filter((f) => f.role === "data").map((f) => f.path),
      ["data/source_registry.json"]
    );
  });

  await t.test("rejects invalid inputs, including paths, SQL, code and extra fields", async () => {
    const bad = [
      ["ambito_at_point", { lon: 200, lat: 40 }],
      ["ambito_at_point", { lon: "-3.7", lat: 40.4 }],
      ["ambito_at_point", { lon: null, lat: 40.4 }],
      ["ambito_at_point", { lon: -3.7 }],
      ["ambito_at_point", { ...inside, path: "../../etc/passwd" }],
      ["source_provenance", { sourceId: "../data/source_registry.json" }],
      ["source_provenance", { sourceId: "x'; DROP TABLE sources;--" }],
      ["source_provenance", { sourceId: "planning_ambito_geometry", sql: "SELECT 1", code: "1+1" }],
      ["source_provenance", { sourceId: "" }],
    ];
    for (const [name, args] of bad) {
      let rejected = false;
      try {
        const res = await call(name, args);
        rejected = res.isError === true;
      } catch {
        rejected = true;
      }
      assert.ok(rejected, `${name} ${JSON.stringify(args)} must be rejected`);
    }
  });
});
