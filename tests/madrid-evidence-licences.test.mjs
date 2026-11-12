// Deterministic test for the licences_in_lens tool of the Madrid Evidence MCP (v0.3).
// No model, no network. Starts the real stdio server and compares each result with a direct query of
// the Lens evidence registry, wired here independently of the adapter. Requires the pinned Lens checkout:
//
//   MADRID_LENS_ROOT=/path/to/lens npm run test:madrid-licences
//
// Without MADRID_LENS_ROOT the suite FAILS; it is never green by omission.

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
const LICENCE_PIN = JSON.parse(readFileSync(new URL("../mcp/madrid-evidence/lens-pin-licences.json", import.meta.url), "utf8"));
const SOL = { lon: -3.7038, lat: 40.4168 };
const FAMILIES = ["BUILDING_URBANISTIC_LICENCE_FAMILY", "ACTIVITY_LICENCE_FAMILY", "TEMPORARY_ACTIVITY_FAMILY"];

test("MADRID_LENS_ROOT is set to the pinned Lens checkout", () => {
  assert.ok(LENS_ROOT, "MADRID_LENS_ROOT is not set: this test needs a Lens checkout at the commit in mcp/madrid-evidence/lens-pin.json");
});

test("the additive licence pin names the same Lens commit and lens-pin.json lists no licence file", () => {
  assert.equal(LICENCE_PIN.commit, PIN.commit);
  const base = new Set(PIN.files.map((f) => f.path));
  for (const f of LICENCE_PIN.files) assert.ok(!base.has(f.path), `${f.path} must not be in lens-pin.json (it would change the sealed v0.1 pin)`);
});

// Every key name anywhere in a payload (names, not text: methodological notes may say "total").
const keysOf = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) (out.add(k), keysOf(v, out));
  return out;
};
const AGGREGATE_KEY = /^(total|totals|all|overall|sum|grandTotal|count|matched|recordsMatched|recordsCount|recordsOmittedCount|omitted)$/i;

test("licences_in_lens against the pinned Lens registry", { skip: !LENS_ROOT && "no MADRID_LENS_ROOT (failure reported above)" }, async (t) => {
  const lensFile = (rel) => path.join(LENS_ROOT, ...rel.split("/"));
  const readJson = (rel) => JSON.parse(readFileSync(lensFile(rel), "utf8"));
  const lensRequire = createRequire(lensFile("package.json"));
  const R = lensRequire("./js/evidence-registry.js");
  const planning = await import(pathToFileURL(lensFile("js/planning-ambito.js")).href);
  const licenceModule = await import(pathToFileURL(lensFile("js/urban-licences.js")).href);
  const STATE = readJson("data/planning/madrid_ambito_state.json");
  const licenceIndex = licenceModule.createLicenceIndex(readJson("data/planning/madrid_urban_licences.json"));
  const direct = R.createEvidenceRegistry({
    registry: readJson("data/source_registry.json"),
    planningIndex: planning.createPlanningIndex({ geometry: readJson("data/planning/madrid_ambitos.geojson"), state: STATE }),
    planningModule: { AMBITO_STATE: planning.AMBITO_STATE, AVAILABILITY: planning.AVAILABILITY },
    licenceIndex,
  });
  const wire = (v) => JSON.parse(JSON.stringify(v));
  // The only permitted difference between Lens's evidence and the public result.
  const publicForm = (lensResult) => {
    const r = wire(lensResult);
    if (r.kind === "EVIDENCE") delete r.value.records;
    return r;
  };

  const client = new Client({ name: "madrid-licences-test", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { ...process.env, MADRID_LENS_ROOT: LENS_ROOT }, stderr: "pipe" }));
  t.after(() => client.close());
  const call = (args) => client.callTool({ name: "licences_in_lens", arguments: args });
  const sha = (rel) => createHash("sha256").update(readFileSync(lensFile(rel))).digest("hex");
  const query = (p) => direct.query("LICENCES_IN_LENS", p);

  await t.test("equivalence: result is Lens's evidence with only value.records removed", async () => {
    for (const radiusM of [500, 1000, 3000]) {
      const res = await call({ ...SOL, radiusM });
      assert.ok(!res.isError, JSON.stringify(res.content));
      const expected = query({ ...SOL, radiusM });
      assert.equal(expected.kind, "EVIDENCE");
      assert.ok(expected.value.records.length > 0, "test setup: Lens itself returns records here, so the omission is real");
      assert.deepEqual(res.structuredContent.result, publicForm(expected));
      assert.deepEqual(res.structuredContent.result.value.perFamily, wire(expected.value.perFamily));
      assert.deepEqual(JSON.parse(res.content[0].text), res.structuredContent);
    }
  });

  await t.test("records are omitted, declared with a boolean, and no aggregate field is added", async () => {
    const res = await call({ ...SOL, radiusM: 1000 });
    const out = res.structuredContent;
    assert.equal(out.recordsOmitted, true);
    assert.equal("records" in out.result.value, false);
    assert.deepEqual(Object.keys(out.result.value.perFamily).sort(), [...FAMILIES].sort());
    const lensKeys = keysOf(wire(query({ ...SOL, radiusM: 1000 })));
    const declared = new Set(["shape", "input", "recordsOmitted", "presentationNote", "reading", "result", "registerComposition", "scope", "basis", "note", "typesByFamily"]);
    const inReading = keysOf(out.reading);
    const added = [...keysOf(out)].filter((k) => !lensKeys.has(k) && !declared.has(k) && !inReading.has(k));
    assert.deepEqual(added, [], "the public payload introduces no field beyond Lens's, the reading and the declared presentation metadata");
    assert.deepEqual([...keysOf(out)].filter((k) => AGGREGATE_KEY.test(k)), [], "no aggregate or count field (names, not prose)");
    for (const v of Object.values(out.result.value.perFamily)) assert.equal(typeof v, "number");
  });

  await t.test("registerComposition (v0.4): derived only from the pinned (family, tipo) pairs, all located records, no counts, outside result", async () => {
    const expected = {};
    for (const r of readJson("data/planning/madrid_urban_licences.json").records) (expected[r.family] ??= new Set()).add(r.tipo);
    const expectedTypes = Object.fromEntries(Object.keys(expected).sort().map((f) => [f, [...expected[f]].sort()]));
    const res = await call({ ...SOL, radiusM: 1000 });
    const rc = res.structuredContent.registerComposition;
    // equivalence with the artifact, and top-level (not inside Lens's evidence)
    assert.deepEqual(rc.typesByFamily, expectedTypes);
    assert.deepEqual(Object.keys(rc.typesByFamily), [...FAMILIES].sort());
    assert.equal("registerComposition" in res.structuredContent.result, false);
    assert.equal("registerComposition" in res.structuredContent.result.value, false);
    // content: the type that matters for "granted is not built" is named, under its own family only
    assert.ok(rc.typesByFamily.BUILDING_URBANISTIC_LICENCE_FAMILY.includes("Licencia de 1ª ocupación y funcionamiento"));
    assert.ok(!rc.typesByFamily.ACTIVITY_LICENCE_FAMILY.includes("Licencia de 1ª ocupación y funcionamiento"));
    // declared scope: whole register, not locatable evidence for a query
    assert.equal(rc.scope, "ALL_LOCATED_RECORDS");
    assert.match(rc.basis, /located records of the pinned licence artifact/);
    assert.match(rc.basis, /Unlocated rows are not part of this composition/);
    assert.match(rc.basis, /all dates and all families present in that artifact, independently of the query/);
    assert.match(rc.note, /presence of a type here does not show that it appears in the requested circle or window/);
    assert.match(rc.note, /absence of a type here does not show that it is absent from the complete source register/);
    // no aggregation: exact key set; only strings, arrays of strings and the family map; no numbers anywhere
    assert.deepEqual(Object.keys(rc).sort(), ["basis", "note", "scope", "typesByFamily"]);
    for (const list of Object.values(rc.typesByFamily)) {
      assert.ok(Array.isArray(list) && list.length > 0 && list.every((x) => typeof x === "string"));
      assert.equal(new Set(list).size, list.length, "distinct names");
    }
    const walk = (v) => (Array.isArray(v) ? v.flatMap(walk) : v && typeof v === "object" ? Object.values(v).flatMap(walk) : [typeof v]);
    assert.deepEqual([...new Set(walk(rc))], ["string"], "no number, boolean or null anywhere in registerComposition");
    assert.deepEqual([...keysOf(rc)].filter((k) => AGGREGATE_KEY.test(k) || /count|share|percent|pct|rate/i.test(k)), []);
    assert.ok(!("records" in rc) && !JSON.stringify(rc).includes("k9-0"), "no individual record");
  });

  await t.test("registerComposition is identical for any circle, window or family filter (not query-dependent)", async () => {
    const base = (await call({ ...SOL, radiusM: 1000 })).structuredContent.registerComposition;
    const variants = [
      { ...SOL, radiusM: 500 },
      { lon: -3.5, lat: 40.7, radiusM: 3000, families: ["ACTIVITY_LICENCE_FAMILY"] },
      { ...SOL, radiusM: 700, window: { from: "2025-01-01", to: "2025-12-31" } },
      { lon: 0, lat: 0, radiusM: 100 },
      { ...SOL, radiusM: 1000, window: { from: "1990-01-01", to: "1990-12-31" } },
    ];
    for (const v of variants) {
      const out = await call(v);
      assert.ok(!out.isError, JSON.stringify(out.content));
      assert.deepEqual(out.structuredContent.registerComposition, base, JSON.stringify(v));
    }
  });

  await t.test("the consumer-directed no-summing instruction is in the tool description", async () => {
    const tool = (await client.listTools()).tools.find((x) => x.name === "licences_in_lens");
    assert.ok(tool.description.includes("Do not calculate, present, or offer a cross-family total, even as your own arithmetic, an approximation, or when explicitly requested by the user."));
    assert.ok(!tool.description.includes("No presentes ni ofrezcas"));
  });

  await t.test("provenance: Lens's applied record, ceiling, coverage and scope are present and the reading hashes are real", async () => {
    const res = await call({ ...SOL, radiusM: 1000 });
    const { result, reading } = res.structuredContent;
    assert.equal(result.derivation, "IN_CIRCLE_FILTER");
    assert.deepEqual(result.applied, wire(query({ ...SOL, radiusM: 1000 })).applied);
    assert.deepEqual(result.applied.centre, SOL);
    assert.equal(result.applied.radiusM, 1000);
    assert.deepEqual(result.applied.families, FAMILIES);
    assert.equal(result.applied.window.clamped, false);
    assert.equal(result.value.scope, "ADDRESS_POINT");
    assert.equal(result.value.ceiling.grantedOnly, true);
    assert.ok(result.value.coverage && result.value.coverage.unresolved_rows > 0, "unlocated rows are reported, not hidden");
    assert.equal(reading.lensCommit, PIN.commit);
    assert.deepEqual(Object.keys(reading.supports), ["LICENCES_IN_LENS"]);
    for (const f of reading.supports.LICENCES_IN_LENS) assert.equal(f.sha256, sha(f.path), f.path);
    const supported = new Set(reading.supports.LICENCES_IN_LENS.map((f) => f.path));
    for (const f of LICENCE_PIN.files) assert.ok(supported.has(f.path), f.path);
    assert.ok(!supported.has("data/planning/madrid_ambitos.geojson"), "ámbito geometry is not consulted");
    // the source record itself: no reference date published, kept null.
    const prov = direct.query("SOURCE_PROVENANCE", { sourceId: "urban_licences" });
    assert.equal(prov.kind, "EVIDENCE");
    assert.equal(prov.value.freshness.reference_date, null);
  });

  await t.test("default window is the 12 months ending at the register's latest grant date, disclosed", async () => {
    const res = await call({ ...SOL, radiusM: 1000 });
    const { window } = res.structuredContent.result.value;
    const expected = licenceIndex.defaultWindow();
    assert.deepEqual({ from: window.from, to: window.to, clamped: window.clamped }, { from: expected.from, to: expected.to, clamped: false });
    assert.equal(window.to, licenceIndex.dateExtent.max);
  });

  await t.test("temporal coverage: partly outside is clamped and says so; wholly outside is Lens's abstention", async () => {
    const wide = { from: "2020-01-01", to: "2026-12-31" };
    const partly = await call({ ...SOL, radiusM: 1000, window: wide });
    assert.deepEqual(partly.structuredContent.result, publicForm(query({ ...SOL, radiusM: 1000, window: wide })));
    assert.deepEqual(partly.structuredContent.result.value.window, { from: licenceIndex.dateExtent.min, to: licenceIndex.dateExtent.max, clamped: true });
    assert.equal(partly.structuredContent.result.applied.window.clamped, true);
    const gone = { from: "1990-01-01", to: "1990-12-31" };
    const outside = await call({ ...SOL, radiusM: 1000, window: gone });
    assert.deepEqual(outside.structuredContent.result, publicForm(query({ ...SOL, radiusM: 1000, window: gone })));
    assert.equal(outside.structuredContent.result.kind, "ABSTENTION");
    assert.equal(outside.structuredContent.result.reason, "OUTSIDE_TEMPORAL_COVERAGE");
    assert.equal(outside.structuredContent.recordsOmitted, true);
  });

  await t.test("Lens abstains AMBIGUOUS_SCOPE for a window that passes the MCP schema but is not a real date", async () => {
    const window = { from: "2025-02-30", to: "2025-03-31" };
    const res = await call({ ...SOL, radiusM: 1000, window });
    assert.ok(!res.isError, "the MCP schema checks shape only");
    assert.deepEqual(res.structuredContent.result, publicForm(query({ ...SOL, radiusM: 1000, window })));
    assert.equal(res.structuredContent.result.kind, "ABSTENTION");
    assert.equal(res.structuredContent.result.reason, "AMBIGUOUS_SCOPE");
  });

  await t.test("family filter: only the requested family is counted, still per family", async () => {
    const families = ["ACTIVITY_LICENCE_FAMILY"];
    const res = await call({ ...SOL, radiusM: 1000, families });
    assert.deepEqual(res.structuredContent.result, publicForm(query({ ...SOL, radiusM: 1000, families })));
    assert.deepEqual(res.structuredContent.result.applied.families, families);
    assert.equal(res.structuredContent.result.value.perFamily.BUILDING_URBANISTIC_LICENCE_FAMILY, 0);
  });

  await t.test("an empty circle is Lens's NO_MATCHES, not an error and not an abstention", async () => {
    const far = { lon: -3.5, lat: 40.9, radiusM: 100 };
    const res = await call(far);
    assert.deepEqual(res.structuredContent.result, publicForm(query(far)));
    assert.equal(res.structuredContent.result.kind, "EVIDENCE");
    assert.equal(res.structuredContent.result.value.state, "NO_MATCHES");
  });

  await t.test("the MCP schema rejects bad input before Lens; the 3000 m cap is the MCP's own", async () => {
    const bad = [
      { ...SOL, radiusM: 0 },
      { ...SOL, radiusM: -5 },
      { ...SOL, radiusM: 3001 },
      { ...SOL },
      { ...SOL, radiusM: 500, families: [] },
      { ...SOL, radiusM: 500, families: ["ALL"] },
      { ...SOL, radiusM: 500, window: { from: "2025-01-01" } },
      { ...SOL, radiusM: 500, window: { from: "20250101", to: "20251231" } },
      { ...SOL, radiusM: 500, window: { from: "2025-01-01", to: "2025-12-31", extra: 1 } },
      { ...SOL, radiusM: 500, path: "../../etc/passwd" },
      { lon: 999, lat: SOL.lat, radiusM: 500 },
    ];
    for (const args of bad) {
      let rejected = false;
      try {
        rejected = (await call(args)).isError === true;
      } catch {
        rejected = true;
      }
      assert.ok(rejected, `must be rejected: ${JSON.stringify(args)}`);
    }
    assert.equal(query({ ...SOL, radiusM: 4000 }).kind, "EVIDENCE", "Lens itself accepts a larger radius");
    assert.equal((await call({ ...SOL, radiusM: 3000 })).structuredContent.result.kind, "EVIDENCE");
  });
});
