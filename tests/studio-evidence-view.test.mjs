// Spatial Investigation Studio v0.1 — evidence integrity tests.
// Runs the REAL Madrid Evidence MCP (pinned Lens checkout) for every evidence case; the stub server in
// tests/fixtures is used only to simulate MCP failures. Without MADRID_LENS_ROOT the suite FAILS.
//
//   MADRID_LENS_ROOT=/path/to/lens npm run test:studio

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { McpSession, PINNED_LENS_COMMIT, citedSourceIds, investigate } from "../studio/mcp-session.mjs";
import { KIND, allItems, buildView, callRecord, getPointer } from "../studio/public/evidence-view.mjs";

const LENS_ROOT = process.env.MADRID_LENS_ROOT;
const STUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "studio-stub-mcp.mjs");
// Nuevos Ministerios. REFERENCE: Renfe station record (2019), labelled "UTM" there but written in decimal
// degrees, used as WGS84 provisionally. PREVIOUS: the earlier approximate point, kept because it is a real
// NO_EVIDENCE_FOR_SCOPE case in the pinned layer.
const REFERENCE = { lon: -3.692207, lat: 40.446612 };
const PREVIOUS = { lon: -3.692, lat: 40.446 };
// Real points: ring averages of ámbitos in the pinned geometry (same method as madrid-evidence-mcp.test.mjs).
const INSIDE_ALL_EVIDENCE = { lon: -3.5683435746723435, lat: 40.47202934128432 }; // AOE.00.02-RP
const INSIDE_PHASES_ABSTAIN = { lon: -3.6061900727272733, lat: 40.43671361818181 }; // AOE.00.08
const FAMILIES = ["BUILDING_URBANISTIC_LICENCE_FAMILY", "ACTIVITY_LICENCE_FAMILY", "TEMPORARY_ACTIVITY_FAMILY"];

const section = (view, id) => view.sections.find((s) => s.id === id);

// Traceability: every displayed value resolves, through its pointer, to exactly that value in the raw
// MCP record; interface notes carry no digits.
function assertTraceable(response, view) {
  for (const item of allItems(view)) {
    if (item.kind === KIND.NOTE) {
      assert.deepEqual(item.source, { origin: "interface" });
      assert.doesNotMatch(String(item.value), /\d/, `interface note carries a number: ${item.value}`);
      continue;
    }
    assert.ok(item.source?.call && typeof item.source.path === "string", `item without source: ${item.label}`);
    const record = callRecord(response, item.source.call);
    assert.ok(record, `unknown call ${item.source.call}`);
    assert.deepEqual(getPointer(record, item.source.path), item.value, `${item.label} @ ${item.source.path}`);
    if (typeof item.value === "number") assert.ok(item.kind !== KIND.ERROR);
  }
}

test("MADRID_LENS_ROOT is set to the pinned Lens checkout", () => {
  assert.ok(LENS_ROOT, "MADRID_LENS_ROOT is not set: these tests need the real MCP over the pinned Lens checkout");
});

test("studio over the real Madrid Evidence MCP", { skip: !LENS_ROOT && "no MADRID_LENS_ROOT (failure reported above)" }, async (t) => {
  const session = new McpSession({ lensRoot: LENS_ROOT });
  const st = await session.start();
  t.after(() => session.close());
  assert.equal(st.state, "READY", st.error);
  assert.equal(st.verification.pinnedLensCommit, PINNED_LENS_COMMIT);

  const pilot = await investigate(session, { ...PREVIOUS, radiusM: 500 });
  const pilotView = buildView(pilot);
  const direct = await session.client.callTool({ name: "licences_in_lens", arguments: { ...PREVIOUS, radiusM: 500 } });

  await t.test("valid query: every call OK, values identical to a direct MCP call", () => {
    assert.equal(pilot.calls.snapshot.status, "OK");
    assert.equal(pilot.calls.licences.status, "OK");
    assert.deepEqual(pilot.calls.licences.structuredContent, direct.structuredContent);
    const fam = section(pilotView, "licences").families;
    assert.deepEqual(fam.map((f) => f.family), FAMILIES);
    for (const f of fam) assert.equal(f.items[0].value, direct.structuredContent.result.value.perFamily[f.family]);
    assertTraceable(pilot, pilotView);
  });

  await t.test("no ámbito at the previous point: abstention shown, nothing inferred, nothing further queried", () => {
    const amb = section(pilotView, "ambito");
    assert.equal(amb.status, "ABSTENTION");
    assert.equal(amb.items.find((i) => i.kind === KIND.ABSTENTION).value, "NO_EVIDENCE_FOR_SCOPE");
    assert.equal(amb.items.filter((i) => i.kind === KIND.FACT).length, 0, "no fact may be shown for an abstention");
    assert.ok(amb.items.some((i) => i.kind === KIND.NOTE && /no indica/i.test(i.value)));
    for (const id of ["phases", "diff"]) assert.equal(section(pilotView, id).status, "NOT_QUERIED");
    // Provenance only for sources an EVIDENCE result cited: the abstention cites none.
    assert.deepEqual(pilot.calls.provenance.map((p) => p.arguments.sourceId), ["urban_licences"]);
    assert.ok(!pilot.calls.provenance.some((p) => p.arguments.sourceId === "planning_ambito_geometry"));
    assert.ok(amb.items.some((i) => i.kind === KIND.NOTE && /no permite concluir que no exista planeamiento/.test(i.value)));
  });

  await t.test("abstention: the ámbito layer is described as a consulted layer, never as evidence on the point", () => {
    const rec = pilot.calls.consultedLayer;
    assert.equal(rec.tool, "source_provenance");
    assert.deepEqual(rec.arguments, { sourceId: "planning_ambito_geometry" });
    assert.equal(rec.status, "OK");
    const layer = section(pilotView, "layer-planning_ambito_geometry");
    assert.equal(layer.status, "CONSULTED_LAYER");
    assert.equal(layer.items.filter((i) => i.kind === KIND.FACT).length, 0, "no layer item may be a fact");
    // The abstention reason is preserved next to the layer, read from the snapshot record.
    assert.deepEqual(layer.items[0].source, { call: "snapshot", path: "/structuredContent/ambitoAtPoint/reason" });
    assert.equal(layer.items[0].value, "NO_EVIDENCE_FOR_SCOPE");
    assert.equal(section(pilotView, "ambito").status, "ABSTENTION", "the ámbito section stays an abstention");
    // Explicit nulls of the layer survive.
    assert.equal(layer.items.find((i) => i.source?.path === "/structuredContent/result/freshness/reference_date").value, null);
    // Kept apart from cited provenance.
    assert.ok(!pilotView.sections.some((x) => x.id === "prov-planning_ambito_geometry"));
  });

  await t.test("consulted layer call failing: abstention reason kept, no layer metadata shown", () => {
    const failed = structuredClone(pilot);
    failed.calls.consultedLayer = { tool: "source_provenance", arguments: { sourceId: "planning_ambito_geometry" }, status: "TRANSPORT_ERROR", structuredContent: null, error: "simulated" };
    const view = buildView(failed);
    const layer = section(view, "layer-planning_ambito_geometry");
    assert.equal(layer.status, "ERROR");
    assert.equal(layer.items[0].value, "NO_EVIDENCE_FOR_SCOPE");
    assert.equal(layer.items.filter((i) => [KIND.FACT, KIND.CONTEXT].includes(i.kind)).length, 0);
    assertTraceable(failed, view);
  });

  await t.test("Renfe 2019 reference point: ámbito resolved, no consulted layer, origin markers not labelled as phases", async () => {
    for (const radiusM of [250, 500, 1000]) {
      const res = await investigate(session, { ...REFERENCE, radiusM });
      const view = buildView(res);
      assert.equal(section(view, "ambito").status, "EVIDENCE");
      assert.equal(res.calls.consultedLayer, null, "no consulted layer when the point resolves an ámbito");
      assert.ok(!view.sections.some((x) => x.status === "CONSULTED_LAYER"));
      const d = await session.client.callTool({ name: "licences_in_lens", arguments: { ...REFERENCE, radiusM } });
      assert.deepEqual(res.calls.licences.structuredContent, d.structuredContent);
      const fams = section(view, "licences").families;
      assert.deepEqual(fams.map((f) => f.family), FAMILIES);
      for (const f of fams) assert.equal(f.items[0].value, d.structuredContent.result.value.perFamily[f.family]);
      for (const it of section(view, "phases").items.filter((i) => i.lensKindPath)) {
        const kind = getPointer(res.calls.snapshot, it.lensKindPath);
        if (kind !== "PHASE_VALUE") assert.ok(!it.label.startsWith("Fase administrativa publicada"), `${kind} labelled as a phase: ${it.label}`);
        if (kind === "PLAN_ORIGIN_MARKER") assert.match(it.label, /no es estado de avance/);
      }
      assertTraceable(res, view);
    }
  });

  await t.test("ámbito with evidence: identity, phases, diff and only cited sources", async () => {
    const res = await investigate(session, { ...INSIDE_ALL_EVIDENCE, radiusM: 250 });
    const view = buildView(res);
    assert.equal(res.calls.consultedLayer, null);
    for (const id of ["ambito", "phases", "diff"]) assert.equal(section(view, id).status, "EVIDENCE", id);
    assert.equal(section(view, "ambito").items.find((i) => i.label === "Código de ámbito").value, "AOE.00.02-RP");
    assert.deepEqual(res.calls.provenance.map((p) => p.arguments.sourceId).sort(), citedSourceIds([res.calls.snapshot, res.calls.licences]).sort());
    assert.ok(res.calls.provenance.every((p) => p.status === "OK"));
    // Administrative phases are labelled as published administrative states, with a non-execution note.
    const phases = section(view, "phases");
    assert.ok(phases.items.some((i) => i.kind === KIND.FACT && i.label.startsWith("Fase administrativa publicada")));
    assert.ok(phases.items.some((i) => i.kind === KIND.NOTE && /no es ejecución física/.test(i.value)));
    assertTraceable(res, view);
  });

  await t.test("ámbito found but phases abstain: the phases abstention is preserved", async () => {
    const res = await investigate(session, { ...INSIDE_PHASES_ABSTAIN, radiusM: 250 });
    const view = buildView(res);
    assert.equal(section(view, "ambito").status, "EVIDENCE");
    const phases = section(view, "phases");
    assert.equal(phases.status, "ABSTENTION");
    assert.equal(phases.items.filter((i) => i.kind === KIND.FACT).length, 0);
    assertTraceable(res, view);
  });

  await t.test("temporal abstentions: outside coverage and non-calendar date", async () => {
    for (const [window, reason] of [
      [{ from: "1990-01-01", to: "1990-12-31" }, "OUTSIDE_TEMPORAL_COVERAGE"],
      [{ from: "2025-02-30", to: "2025-03-31" }, "AMBIGUOUS_SCOPE"],
    ]) {
      const res = await investigate(session, { ...PREVIOUS, radiusM: 500, window });
      const view = buildView(res);
      const lic = section(view, "licences");
      assert.equal(lic.status, "ABSTENTION");
      assert.equal(lic.items.find((i) => i.kind === KIND.ABSTENTION).value, reason);
      assert.equal(lic.families.length, 0, "no family count under an abstention");
      assert.equal(allItems(view).filter((i) => i.source?.call === "licences" && typeof i.value === "number").length, 0);
      assert.ok(!res.calls.provenance.some((p) => p.arguments.sourceId === "urban_licences"));
      assertTraceable(res, view);
    }
  });

  await t.test("window partly outside coverage: clamped flag shown as Lens reports it", async () => {
    const res = await investigate(session, { ...PREVIOUS, radiusM: 500, window: { from: "2000-01-01", to: "2026-12-31" } });
    const lic = section(buildView(res), "licences");
    assert.equal(lic.status, "EVIDENCE");
    const clamped = lic.items.find((i) => i.source?.path?.endsWith("/value/window/clamped"));
    assert.equal(clamped.value, true);
    assert.equal(clamped.kind, KIND.LIMITATION);
  });

  await t.test("partial coverage: unresolved rows reported per family and overall, never as zeros", () => {
    const lic = section(pilotView, "licences");
    const cov = pilot.calls.licences.structuredContent.result.value.coverage;
    assert.ok(cov.unresolved_rows > 0, "test setup: the pinned register has unlocated rows");
    assert.equal(lic.items.find((i) => i.source?.path?.endsWith("/coverage/unresolved_rows")).value, cov.unresolved_rows);
    assert.equal(lic.items.find((i) => i.source?.path?.endsWith("/coverage/coverage_statement")).kind, KIND.LIMITATION);
    for (const f of lic.families) {
      const u = f.items.find((i) => i.source.path.endsWith(`/per_family/${f.family}/unresolved`));
      assert.equal(u.value, cov.per_family[f.family].unresolved);
      assert.equal(u.kind, KIND.LIMITATION);
    }
  });

  await t.test("null fields are preserved as null, never dropped or replaced", () => {
    const nulls = allItems(pilotView).filter((i) => i.value === null);
    const paths = nulls.map((i) => i.source.path);
    assert.ok(paths.includes("/structuredContent/result/freshness/reference_date"));
    assert.ok(paths.includes("/structuredContent/result/freshness/published_at"));
    assert.ok(paths.includes("/structuredContent/ambitoAtPoint/prohibition"));
    for (const i of nulls) assert.equal(getPointer(callRecord(pilot, i.source.call), i.source.path), null);
  });

  await t.test("no cross-family aggregation, even if a total were present in the payload", () => {
    const counts = section(pilotView, "licences").families.map((f) => f.items[0]);
    assert.deepEqual(counts.map((c) => c.source.path.split("/").pop()), FAMILIES);
    const perFamily = pilot.calls.licences.structuredContent.result.value.perFamily;
    const sum = Object.values(perFamily).reduce((a, b) => a + b, 0);
    // Any item equal to the sum must be a different, traceable Lens field (none of the counts here).
    for (const i of allItems(pilotView).filter((x) => x.value === sum)) assert.ok(!/perFamily/.test(i.source.path) || FAMILIES.includes(i.source.path.split("/").pop()));
    // Inject an aggregate into a copy of the raw response: the view reads whitelisted paths only.
    const tampered = structuredClone(pilot);
    Object.assign(tampered.calls.licences.structuredContent.result.value, { total: sum, sum, allFamilies: sum });
    tampered.calls.licences.structuredContent.result.value.perFamily.TOTAL = sum;
    const view = buildView(tampered);
    for (const i of allItems(view)) assert.doesNotMatch(i.source?.path || "", /\/(total|sum|allFamilies|TOTAL)$/);
    assert.deepEqual(section(view, "licences").families.map((f) => f.family), FAMILIES, "familiesShown governs the tiles");
  });

  await t.test("registerComposition is context, never inside a family tile", () => {
    const lic = section(pilotView, "licences");
    for (const f of lic.families) assert.ok(f.items.every((i) => !i.source.path.includes("registerComposition")));
    const ctx = lic.items.filter((i) => i.source?.path?.includes("registerComposition"));
    assert.ok(ctx.length > 0);
    for (const i of ctx) assert.equal(i.kind, KIND.CONTEXT);
  });

  await t.test("schema rejection by the MCP is shown as a tool error, with no result", async () => {
    const rec = await session.call("licences_in_lens", { ...PREVIOUS, radiusM: 5000 });
    assert.equal(rec.status, "TOOL_ERROR");
    assert.equal(rec.structuredContent, null);
  });
});

test("MCP initialisation and verification failures block the studio", async (t) => {
  await t.test("no MADRID_LENS_ROOT", async () => {
    const s = new McpSession({ lensRoot: "" });
    assert.equal((await s.start()).state, "BLOCKED");
    const rec = await s.call("licences_in_lens", { ...PREVIOUS, radiusM: 500 });
    assert.equal(rec.status, "NOT_RUN");
    assert.equal(rec.structuredContent, null);
  });
  await t.test("Lens checkout missing: the real server refuses to start", async () => {
    const s = new McpSession({ lensRoot: "/nonexistent/lens-checkout" });
    const st = await s.start();
    assert.equal(st.state, "BLOCKED");
    assert.match(st.error, /no se inicializó/);
    await s.close();
  });
  for (const mode of ["wrong-name", "not-readonly"]) {
    await t.test(`handshake verification fails: ${mode}`, async () => {
      process.env.STUB_MODE = mode;
      const s = new McpSession({ serverPath: STUB, lensRoot: "/stub" });
      const st = await s.start();
      delete process.env.STUB_MODE;
      assert.equal(st.state, "BLOCKED");
      assert.match(st.error, /Verificación del MCP fallida/);
      assert.equal((await s.call("licences_in_lens", {})).status, "NOT_RUN");
      await s.close();
    });
  }
});

test("server failures never surface invented results", async (t) => {
  for (const [mode, status] of [["wrong-commit", "VERIFICATION_ERROR"], ["crash", "TRANSPORT_ERROR"], ["tool-error", "TOOL_ERROR"]]) {
    await t.test(mode, async () => {
      process.env.STUB_MODE = mode;
      const s = new McpSession({ serverPath: STUB, lensRoot: "/stub" });
      const st = await s.start();
      delete process.env.STUB_MODE;
      assert.equal(st.state, "READY");
      const res = await investigate(s, { ...PREVIOUS, radiusM: 500 });
      await s.close();
      assert.notEqual(res.calls.snapshot.status, "OK");
      assert.notEqual(res.calls.licences.status, "OK");
      if (mode !== "crash") assert.equal(res.calls.snapshot.status, status);
      assert.equal(res.calls.licences.structuredContent, null);
      assert.deepEqual(res.calls.provenance, []);
      assert.equal(res.calls.consultedLayer, null, "no layer is consulted without a verified abstention");
      const view = buildView(res);
      const lic = section(view, "licences");
      assert.ok(["ERROR", "NOT_RUN"].includes(lic.status));
      assert.equal(lic.families.length, 0);
      const items = allItems(view);
      assert.equal(items.filter((i) => i.kind === KIND.FACT).length, 0);
      assert.ok(!items.some((i) => i.value === 999), "the stub's fabricated count must not appear");
      assertTraceable(res, view);
    });
  }
});
