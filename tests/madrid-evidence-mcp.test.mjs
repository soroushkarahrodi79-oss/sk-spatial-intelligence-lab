// Integration test for the Madrid Evidence MCP server (mcp/madrid-evidence).
//
// Starts the real stdio server, calls each of the three tools through an MCP client and compares
// each result with a direct query of the Lens evidence registry, wired here
// independently of the adapter. Requires a Lens checkout at the pinned commit:
//
//   MADRID_LENS_ROOT=/path/to/lens npm run test:madrid-mcp
//
// Without MADRID_LENS_ROOT the suite FAILS; it is never green by omission.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const LENS_ROOT = process.env.MADRID_LENS_ROOT;
const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "mcp", "madrid-evidence", "server.mjs");
const PIN = JSON.parse(readFileSync(new URL("../mcp/madrid-evidence/lens-pin.json", import.meta.url), "utf8"));

const startServer = (lensRoot) =>
  spawnSync(process.execPath, [SERVER], {
    input: "",
    encoding: "utf8",
    timeout: 30000,
    env: lensRoot === undefined ? { ...process.env, MADRID_LENS_ROOT: "" } : { ...process.env, MADRID_LENS_ROOT: lensRoot },
  });

test("server refuses to start without a Lens checkout", () => {
  for (const missing of [undefined, path.join(tmpdir(), "madrid-evidence-no-such-lens")]) {
    const run = startServer(missing);
    assert.notEqual(run.status, 0, "must exit non-zero");
    assert.equal(run.stdout, "", "must not speak MCP");
    assert.match(run.stderr, /madrid-evidence: /);
  }
});

test("server refuses to start when a verified file is modified", { skip: !LENS_ROOT && "needs MADRID_LENS_ROOT (reported by the test below)" }, (t) => {
  for (const rel of ["data/source_registry.json", "js/planning-ambito.js"]) {
    const copy = mkdtempSync(path.join(tmpdir(), "madrid-evidence-tampered-"));
    t.after(() => rmSync(copy, { recursive: true, force: true }));
    for (const { path: p } of PIN.files) {
      mkdirSync(path.dirname(path.join(copy, p)), { recursive: true });
      cpSync(path.join(LENS_ROOT, ...p.split("/")), path.join(copy, ...p.split("/")));
    }
    const target = path.join(copy, ...rel.split("/"));
    writeFileSync(target, readFileSync(target, "utf8") + "\n");
    const run = startServer(copy);
    assert.notEqual(run.status, 0, rel);
    assert.equal(run.stdout, "");
    assert.ok(run.stderr.includes(`${rel} does not match the pinned Lens commit`), run.stderr);
  }
});

test("MADRID_LENS_ROOT is set to the pinned Lens checkout", () => {
  assert.ok(LENS_ROOT, "MADRID_LENS_ROOT is not set: the Madrid Evidence MCP integration test needs a Lens checkout at the commit in mcp/madrid-evidence/lens-pin.json");
});

test("Madrid Evidence MCP against the pinned Lens registry", { skip: !LENS_ROOT && "no MADRID_LENS_ROOT (failure reported above)" }, async (t) => {
  // --- direct Lens registry, wired the way Lens's own tests wire it ----------------
  const lensFile = (rel) => path.join(LENS_ROOT, ...rel.split("/"));
  const readJson = (rel) => JSON.parse(readFileSync(lensFile(rel), "utf8"));
  const lensRequire = createRequire(lensFile("package.json"));
  const R = lensRequire("./js/evidence-registry.js");
  const planning = await import(pathToFileURL(lensFile("js/planning-ambito.js")).href);
  const change = await import(pathToFileURL(lensFile("js/ambito-change.js")).href);
  const adapter = await import(pathToFileURL(lensFile("js/ambito-comparison-adapter.js")).href);
  const STATE = readJson("data/planning/madrid_ambito_state.json");
  const CD = STATE.change_detection;
  const planningIndex = planning.createPlanningIndex({ geometry: readJson("data/planning/madrid_ambitos.geojson"), state: STATE });
  const direct = R.createEvidenceRegistry({
    registry: readJson("data/source_registry.json"),
    planningIndex,
    planningModule: { AMBITO_STATE: planning.AMBITO_STATE, AVAILABILITY: planning.AVAILABILITY },
    ambitoEditionDiff: (code) =>
      change.buildAmbitoComparison({
        previous: { reference_date: CD.previous.reference_date, families: CD.previous.families },
        current: { reference_date: CD.current.reference_date, families: CD.current.families },
        exactCode: code,
      }),
    ambitoEditionCodeKnown: (code) => adapter.ambitoEditionContainsCode(code, STATE),
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

  // Real points (ring average of an ámbito) for each outcome combination in the pinned artifacts.
  const cases = {};
  for (const entry of planningIndex.entries) {
    let ring = entry.geometry.coordinates;
    while (Array.isArray(ring[0][0])) ring = ring[0];
    const lon = ring.reduce((a, p) => a + p[0], 0) / ring.length;
    const lat = ring.reduce((a, p) => a + p[1], 0) / ring.length;
    const at = direct.query("AMBITO_AT_POINT", { lon, lat });
    if (at.kind !== "EVIDENCE") continue;
    const code = at.value.ambitoCode;
    const key = [direct.query("AMBITO_PHASES", { code }), direct.query("AMBITO_EDITION_DIFF", { code })]
      .map((r) => r.reason || r.kind)
      .join("|");
    cases[key] ??= { lon, lat, code };
  }
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

  await t.test("lists exactly the three read-only tools", async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), ["ambito_at_point", "ambito_snapshot_at_point", "source_provenance"]);
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

  const snapshot = async (point) => {
    const res = await call("ambito_snapshot_at_point", { lon: point.lon, lat: point.lat });
    assert.ok(!res.isError, JSON.stringify(res.content));
    assert.deepEqual(JSON.parse(res.content[0].text), res.structuredContent);
    return res.structuredContent;
  };

  await t.test("ambito_snapshot_at_point: all three Lens answers for a point with an ámbito", async () => {
    const point = cases["EVIDENCE|EVIDENCE"];
    assert.ok(point, "test setup: an ámbito with published state and an edition diff exists");
    const out = await snapshot(point);
    const at = direct.query("AMBITO_AT_POINT", point);
    assert.equal(out.queriedCode, at.value.ambitoCode);
    assert.deepEqual(out.ambitoAtPoint, wire(at));
    assert.deepEqual(out.ambitoPhases, wire(direct.query("AMBITO_PHASES", { code: at.value.ambitoCode })));
    assert.deepEqual(out.ambitoEditionDiff, wire(direct.query("AMBITO_EDITION_DIFF", { code: at.value.ambitoCode })));
    assert.equal(out.ambitoPhases.kind, "EVIDENCE");
    assert.equal(out.ambitoEditionDiff.derivation, "EDITION_DIFF");
    assert.equal(out.notQueried, null);
    // reading names, with real hashes, the verified files that back each result.
    assert.deepEqual(Object.keys(out.reading.supports), ["AMBITO_AT_POINT", "AMBITO_PHASES", "AMBITO_EDITION_DIFF"]);
    const verified = new Set(out.reading.verifiedAtStartup.files.map((f) => f.path));
    for (const entries of Object.values(out.reading.supports)) {
      for (const { path: p, sha256 } of entries) {
        assert.ok(verified.has(p), p);
        assert.equal(sha256, sha(p), p);
      }
    }
    const paths = (shape) => out.reading.supports[shape].map((f) => f.path);
    assert.ok(paths("AMBITO_PHASES").includes("data/planning/madrid_ambito_state.json"));
    assert.ok(paths("AMBITO_EDITION_DIFF").includes("js/ambito-change.js"));
    assert.ok(!paths("AMBITO_AT_POINT").includes("data/planning/madrid_ambito_state.json"));
  });

  await t.test("ambito_snapshot_at_point: a point with no ámbito keeps its abstention and queries nothing else", async () => {
    const out = await snapshot(OUTSIDE);
    assert.deepEqual(out.ambitoAtPoint, wire(direct.query("AMBITO_AT_POINT", OUTSIDE)));
    assert.equal(out.ambitoAtPoint.reason, "NO_EVIDENCE_FOR_SCOPE");
    assert.equal(out.queriedCode, null);
    assert.equal(out.ambitoPhases, null);
    assert.equal(out.ambitoEditionDiff, null);
    assert.match(out.notQueried, /not queried/);
    assert.deepEqual(Object.keys(out.reading.supports), ["AMBITO_AT_POINT"]);
  });

  await t.test("ambito_snapshot_at_point: Lens abstentions from the later queries are preserved", async () => {
    // Both abstain: known ámbito, no published state, code absent from both editions.
    const both = cases["NO_EVIDENCE_FOR_SCOPE|OUTSIDE_SOURCE_UNIVERSE"];
    assert.ok(both, "test setup: such an ámbito exists in the pinned artifacts");
    const a = await snapshot(both);
    assert.equal(a.ambitoAtPoint.kind, "EVIDENCE");
    assert.deepEqual(a.ambitoPhases, wire(direct.query("AMBITO_PHASES", { code: both.code })));
    assert.deepEqual(a.ambitoEditionDiff, wire(direct.query("AMBITO_EDITION_DIFF", { code: both.code })));
    assert.equal(a.ambitoPhases.reason, "NO_EVIDENCE_FOR_SCOPE");
    assert.equal(a.ambitoEditionDiff.reason, "OUTSIDE_SOURCE_UNIVERSE");

    // Mixed: no published state, but an edition diff exists.
    const mixed = cases["NO_EVIDENCE_FOR_SCOPE|EVIDENCE"];
    assert.ok(mixed, "test setup: such an ámbito exists in the pinned artifacts");
    const b = await snapshot(mixed);
    assert.equal(b.ambitoPhases.kind, "ABSTENTION");
    assert.equal(b.ambitoEditionDiff.kind, "EVIDENCE");
    assert.deepEqual(b.ambitoEditionDiff, wire(direct.query("AMBITO_EDITION_DIFF", { code: mixed.code })));
  });

  await t.test("ambito_snapshot_at_point rejects extra fields such as a code", async () => {
    for (const args of [{ ...inside, code: "AOE.00.08" }, { lon: 999, lat: 40 }, { lon: -3.7 }]) {
      let rejected = false;
      try {
        rejected = (await call("ambito_snapshot_at_point", args)).isError === true;
      } catch {
        rejected = true;
      }
      assert.ok(rejected, JSON.stringify(args));
    }
  });

  await t.test("reading separates the files verified at startup from the files behind each result", async () => {
    const res = await call("ambito_at_point", inside);
    const { reading } = res.structuredContent;
    assert.equal(reading.lensCommit, PIN.commit);
    // verifiedAtStartup: every pinned file, in pin order, with its real hash (same for every call).
    assert.deepEqual(
      reading.verifiedAtStartup.files.map((f) => ({ path: f.path, role: f.role, sha256: f.sha256 })),
      PIN.files.map((f) => ({ path: f.path, role: f.role, sha256: sha(f.path) }))
    );
    assert.match(reading.verifiedAtStartup.note, new RegExp(`All ${PIN.files.length} files`));
    // supports: only the files behind this result, each with the hash verified at startup.
    assert.deepEqual(Object.keys(reading.supports), ["AMBITO_AT_POINT"]);
    const support = new Map(reading.supports.AMBITO_AT_POINT.map((f) => [f.path, f.sha256]));
    assert.ok(support.has("data/planning/madrid_ambitos.geojson"));
    assert.ok(support.has("data/source_registry.json"));
    assert.ok(!support.has("data/planning/madrid_ambito_state.json"), "state is not consulted for AMBITO_AT_POINT");
    for (const [p, hash] of support) assert.equal(hash, sha(p), p);
    assert.ok(support.size < reading.verifiedAtStartup.files.length, "the two lists must differ");

    const prov = await call("source_provenance", { sourceId: "planning_ambito_geometry" });
    const provReading = prov.structuredContent.reading;
    assert.deepEqual(provReading.verifiedAtStartup.files.map((f) => f.path), PIN.files.map((f) => f.path));
    const provRole = new Map(provReading.verifiedAtStartup.files.map((f) => [f.path, f.role]));
    assert.deepEqual(
      provReading.supports.SOURCE_PROVENANCE.filter((f) => provRole.get(f.path) === "data").map((f) => f.path),
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
