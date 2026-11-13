// Studio v0.2 selector experiment (alternative B): contract tests. Offline: no model, no network, no key.
// Uses the REAL Madrid Evidence MCP over the pinned Lens checkout for the evidence, like the studio suite;
// providers are SIMULATED scripts. Nothing here measures a model. Without MADRID_LENS_ROOT the suite FAILS.
//
//   MADRID_LENS_ROOT=/path/to/lens-pinned npm run test:studio-selector

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { McpSession } from "../studio/mcp-session.mjs";
import { KIND, allItems, getPointer } from "../studio/public/evidence-view.mjs";
import { buildClaimPackage, canonicalJson, verifyPackageTrace } from "../studio/selector/claim-package.mjs";
import { applyOrder, buildSelectionRequest, constraintViolation, createSelector, evidencePreservationProblems, questionDigest, validateSelection, MAX_QUESTION_CHARS } from "../studio/selector/selection-contract.mjs";
import { CASES, caseResponse, replay, reviewPacket, runMatrix, summariseReplay, unmetRequirements } from "../studio/selector/eval/run.mjs";
import { EXPECT_ACCEPTED, SIMULATED, providerFor } from "../studio/selector/eval/simulated-providers.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LENS_ROOT = process.env.MADRID_LENS_ROOT;
const FAMILIES = ["BUILDING_URBANISTIC_LICENCE_FAMILY", "ACTIVITY_LICENCE_FAMILY", "TEMPORARY_ACTIVITY_FAMILY"];

// The verdict each simulated provider must receive on every case.
const EXPECTED_REASON = {
  "reverse-all": "CONSTRAINT_VIOLATION",
  "omit-licence-limits": "CLAIMS_OMITTED",
  "omit-last": "CLAIMS_OMITTED",
  "duplicate-id": "DUPLICATE_ID",
  "invented-claim-id": "UNKNOWN_ID",
  "empty-selection": "CLAIMS_OMITTED",
  "extra-key-total": "UNEXPECTED_KEYS",
  "free-text-in-ids": "BAD_ID_FORMAT",
  "numeric-ids": "BAD_ID_FORMAT",
  "markdown-fenced": "NOT_JSON",
  "prose-answer": "NOT_JSON",
  "wrong-package-digest": "PACKAGE_DIGEST_MISMATCH",
  "wrong-question-digest": "QUESTION_DIGEST_MISMATCH",
  "wrong-schema-id": "BAD_SCHEMA_ID",
  "prototype-key": "UNEXPECTED_KEYS",
  oversized: "TOO_LARGE",
  "array-not-object": "NOT_AN_OBJECT",
  "null-output": "NOT_AN_OBJECT",
  throws: "PROVIDER_ERROR",
  "never-answers": "PROVIDER_TIMEOUT",
};
const REQUIRED_TAGS = ["valid_evidence", "no_evidence_for_scope", "independent_families", "plan_origin_marker", "temporal_scope", "spatial_scope", "null_fields", "incomplete_coverage", "e6_attempt", "register_composition_vs_circle", "adversarial_data"];

test("MADRID_LENS_ROOT is set to the pinned Lens checkout", () => {
  assert.ok(LENS_ROOT, "MADRID_LENS_ROOT is not set: these tests need the real MCP over the pinned Lens checkout");
});

test("studio selector contract over real evidence", { skip: !LENS_ROOT && "no MADRID_LENS_ROOT (failure reported above)" }, async (t) => {
  const session = new McpSession({ lensRoot: LENS_ROOT });
  assert.equal((await session.start()).state, "READY");
  t.after(() => session.close());

  const built = new Map();
  for (const c of CASES.cases) {
    const response = await caseResponse(session, c);
    built.set(c.id, { c, response, bundle: buildClaimPackage(response) });
  }
  const get = (id) => built.get(id);

  await t.test("cases: every required scenario is covered and the data still has what each case claims", () => {
    const tags = new Set(CASES.cases.flatMap((c) => c.tags));
    for (const tag of REQUIRED_TAGS) assert.ok(tags.has(tag), `no case covers ${tag}`);
    for (const { c, response, bundle } of built.values()) assert.deepEqual(unmetRequirements(c, response, bundle), [], c.id);
    assert.equal(new Set(CASES.cases.map((c) => c.id)).size, CASES.cases.length);
  });

  await t.test("cases are not the sealed benchmark: no circle overlap with any sealed circle and no shared ámbito code", () => {
    const evalDir = path.join(ROOT, "mcp", "madrid-evidence", "eval");
    const sealed = [];
    const texts = [];
    for (const f of readdirSync(evalDir).filter((n) => /^(cases|references).*\.json$/.test(n))) {
      const text = readFileSync(path.join(evalDir, f), "utf8");
      texts.push(text);
      const r = f === "cases.json" ? 0 : 1000; // v0.1 is points only; the licence protocols use circles of at most 1000 m
      for (const re of [/lon\W{0,3}(-?\d+\.\d+)\W{1,6}lat\W{0,3}(-?\d+\.\d+)/g, /"lon":\s*(-?\d+\.\d+),\s*"lat":\s*(-?\d+\.\d+)/g])
        for (const m of text.matchAll(re)) sealed.push({ lon: Number(m[1]), lat: Number(m[2]), r });
    }
    assert.ok(sealed.length >= 20, "test setup: sealed coordinates were not found");
    const metres = (a, b) => {
      const k = Math.PI / 180;
      const x = (b.lon - a.lon) * k * Math.cos(((a.lat + b.lat) / 2) * k);
      const y = (b.lat - a.lat) * k;
      return Math.sqrt(x * x + y * y) * 6371000;
    };
    for (const c of CASES.cases) {
      const p = CASES.points[c.point];
      for (const s of sealed) assert.ok(metres(p, s) > c.radiusM + s.r + 100, `${c.id} overlaps a sealed circle at ${s.lon},${s.lat}`);
      const code = get(c.id).response.calls.snapshot.structuredContent?.queriedCode;
      if (code) for (const text of texts) assert.ok(!text.includes(`"${code}"`) && !text.includes(code), `${c.id}: ámbito ${code} appears in a sealed file`);
    }
  });

  await t.test("package: deterministic, stable ids, claims cover every view item once", () => {
    for (const { response, bundle } of built.values()) {
      const again = buildClaimPackage(response);
      assert.equal(canonicalJson(again.pkg), canonicalJson(bundle.pkg));
      const shown = bundle.baselineOrder.flatMap((id) => bundle.claimsById.get(id)._viewItems);
      assert.deepEqual(shown, allItems(bundle.view), "baseline claims must show exactly the v0.1 view items, in the same order");
      assert.equal(new Set(bundle.pkg.claims.flatMap((c) => c.items.map((i) => i.id))).size, shown.length);
    }
    // ids belong to the slot, not to the data: the same section has the same claim id in different investigations
    const idOf = (id, section) => get(id).bundle.pkg.claims.find((c) => c.section === section && c.role === "SECTION").id;
    assert.equal(idOf("SEL-01", "licences"), idOf("SEL-02", "licences"));
    assert.equal(idOf("SEL-01", "ambito"), idOf("SEL-02", "ambito"));
  });

  await t.test("package: every value is traceable to the raw MCP record, and tampering is detected", () => {
    for (const { response, bundle } of built.values()) assert.deepEqual(verifyPackageTrace(bundle.pkg, response), []);
    const { response, bundle } = get("SEL-03");
    const tampered = structuredClone(bundle.pkg);
    const fam = tampered.claims.find((c) => c.role === "FAMILY");
    fam.items[0].value += 1;
    assert.ok(verifyPackageTrace(tampered, response).length > 0);
    const wrongDigest = structuredClone(bundle.pkg);
    wrongDigest.claims[0].items[0].value_sha256 = "0".repeat(64);
    assert.ok(verifyPackageTrace(wrongDigest, response).length > 0);
  });

  await t.test("package: licence families stay independent claims; no total exists, even if the payload had one", () => {
    const { bundle, response } = get("SEL-03");
    const famClaims = bundle.pkg.claims.filter((c) => c.role === "FAMILY");
    assert.deepEqual(famClaims.map((c) => c.items[0].family), FAMILIES);
    for (const c of famClaims) assert.equal(c.items.filter((i) => i.source.path.includes("/perFamily/")).length, 1, "one count per family claim");
    const tampered = structuredClone(response);
    const v = tampered.calls.licences.structuredContent.result.value;
    const sum = Object.values(v.perFamily).reduce((a, b) => a + b, 0);
    Object.assign(v, { total: sum, sum, allFamilies: sum });
    v.perFamily.TOTAL = sum;
    const pkg2 = buildClaimPackage(tampered).pkg;
    for (const it of pkg2.claims.flatMap((c) => c.items)) assert.doesNotMatch(it.source.path ?? "", /\/(total|sum|allFamilies|TOTAL)$/);
    assert.deepEqual(pkg2.claims.filter((c) => c.role === "FAMILY").map((c) => c.items[0].family), FAMILIES);
  });

  await t.test("package: registerComposition is CONTEXT inside the licences claim, never inside a family claim", () => {
    const { bundle } = get("SEL-14");
    const lic = bundle.pkg.claims.find((c) => c.section === "licences" && c.role === "SECTION");
    const ctx = lic.items.filter((i) => i.source.path?.includes("registerComposition"));
    assert.ok(ctx.length > 0);
    for (const i of ctx) assert.equal(i.kind, KIND.CONTEXT);
    for (const f of bundle.pkg.claims.filter((c) => c.role === "FAMILY")) assert.ok(f.items.every((i) => !i.source.path.includes("registerComposition")));
    // the limits that scope it travel in the same claim
    assert.ok(lic.items.some((i) => i.label.startsWith("Composición del registro: alcance")));
    assert.ok(lic.items.some((i) => i.label === "Concedida ≠ construida"));
    assert.ok(lic.items.some((i) => i.label === "Sin total entre familias"));
  });

  await t.test("package: abstentions stay abstentions, with no fact beside them", () => {
    for (const id of ["SEL-02", "SEL-16"]) {
      const amb = get(id).bundle.pkg.claims.find((c) => c.section === "ambito");
      assert.equal(amb.status, "ABSTENTION");
      assert.equal(amb.items.filter((i) => i.kind === KIND.FACT).length, 0);
      assert.ok(amb.items.some((i) => i.kind === KIND.ABSTENTION && i.value === "NO_EVIDENCE_FOR_SCOPE"));
      assert.ok(amb.items.some((i) => i.kind === KIND.NOTE && /no permite concluir que no exista planeamiento/.test(i.value)));
    }
    for (const id of ["SEL-07", "SEL-08"]) {
      const lic = get(id).bundle.pkg.claims.find((c) => c.section === "licences");
      assert.equal(lic.status, "ABSTENTION");
      assert.equal(get(id).bundle.pkg.claims.filter((c) => c.role === "FAMILY").length, 0, "no family count under an abstention");
    }
  });

  await t.test("package: PLAN_ORIGIN_MARKER cells keep their 'not a progress state' label", () => {
    const { bundle, response } = get("SEL-04");
    const items = bundle.view.sections.find((s) => s.id === "phases").items.filter((i) => i.lensKindPath);
    const markers = items.filter((i) => getPointer(response.calls.snapshot, i.lensKindPath) === "PLAN_ORIGIN_MARKER");
    assert.ok(markers.length > 0);
    for (const m of markers) assert.match(m.label, /no es estado de avance/);
  });

  await t.test("constraints: the baseline satisfies them; each kind of violation is caught", () => {
    for (const { bundle } of built.values()) assert.equal(constraintViolation(bundle.baselineOrder, bundle.pkg.constraints), null);
    const { bundle } = get("SEL-03");
    const base = bundle.baselineOrder;
    const cs = bundle.pkg.constraints;
    assert.match(constraintViolation([...base].reverse(), cs), /TAIL|BLOCK/);
    const lic = bundle.pkg.claims.find((c) => c.section === "licences" && c.role === "SECTION").id;
    const fam = bundle.pkg.claims.find((c) => c.role === "FAMILY").id;
    const swapped = base.filter((id) => id !== fam);
    swapped.splice(0, 0, fam); // a family detached from its licences block
    assert.ok(constraintViolation(swapped, cs));
    const noHead = base.filter((id) => id !== lic);
    noHead.splice(base.indexOf(fam), 0, lic); // limits claim moved after the first family
    assert.ok(constraintViolation(noHead, cs));
    const moved = [...base];
    const t0 = moved.pop();
    moved.unshift(t0); // provenance tail moved to the front
    assert.match(constraintViolation(moved, cs), /TAIL/);
  });

  await t.test("validator: every simulated misbehaviour gets exactly its expected verdict, on every case", async () => {
    for (const [name, reason] of Object.entries(EXPECTED_REASON)) {
      for (const { c, bundle, response } of built.values()) {
        const sel = await createSelector({ provider: providerFor(name), timeoutMs: 100 }).select(bundle, response, c.question);
        assert.equal(sel.status, "FALLBACK", `${name} on ${c.id}`);
        assert.equal(sel.reason, reason, `${name} on ${c.id}`);
      }
    }
  });

  await t.test("validator: verdicts are deterministic and strict JSON is required", () => {
    const { bundle, c } = get("SEL-01");
    const req = buildSelectionRequest(bundle.pkg, c.question);
    const good = SIMULATED.identity(req);
    assert.equal(validateSelection(good, bundle.pkg, c.question).accepted, true);
    assert.deepEqual(validateSelection(good, bundle.pkg, c.question), validateSelection(good, bundle.pkg, c.question));
    assert.equal(validateSelection(`  ${good}\n`, bundle.pkg, c.question).accepted, true, "surrounding whitespace is JSON-legal");
    assert.equal(validateSelection(good, bundle.pkg, `${c.question}!`).reason, "QUESTION_DIGEST_MISMATCH", "an answer to another question is not accepted");
    assert.equal(validateSelection(good, get("SEL-02").bundle.pkg, c.question).reason, "PACKAGE_DIGEST_MISMATCH", "an answer to another package is not accepted");
    for (const bad of ["", "{", "{} extra", "[]", "null", "42", '"text"']) assert.equal(validateSelection(bad, bundle.pkg, c.question).accepted, false, JSON.stringify(bad));
    // a typed object is accepted only if it is exactly the contract
    assert.equal(validateSelection({ ...JSON.parse(good) }, bundle.pkg, c.question).accepted, true);
    assert.equal(validateSelection({ ...JSON.parse(good), claim_ids: new Set() }, bundle.pkg, c.question).accepted, false);
  });

  await t.test("fallback: the original authorized presentation is preserved exactly, for every case and every rejecting provider", async () => {
    for (const name of Object.keys(EXPECTED_REASON)) {
      for (const { c, bundle, response } of built.values()) {
        const sel = await createSelector({ provider: providerFor(name), timeoutMs: 100 }).select(bundle, response, c.question);
        assert.deepEqual(sel.order, bundle.baselineOrder);
        const blocks = applyOrder(bundle, sel.order);
        assert.deepEqual(blocks.flatMap((b) => b.items), allItems(bundle.view), `${name} on ${c.id}: fallback differs from the v0.1 view`);
        assert.deepEqual(evidencePreservationProblems(bundle, response, blocks), []);
      }
    }
  });

  await t.test("accepted order: only the order changes; items, values and abstentions are untouched", async () => {
    let changed = 0;
    for (const { c, bundle, response } of built.values()) {
      const sel = await createSelector({ provider: providerFor("well-behaved-orderer") }).select(bundle, response, c.question);
      assert.equal(sel.status, "PROVIDER_ORDER", c.id);
      const blocks = applyOrder(bundle, sel.order);
      assert.deepEqual(evidencePreservationProblems(bundle, response, blocks), [], c.id);
      const key = (items) => items.map((i) => canonicalJson(i)).sort();
      assert.deepEqual(key(blocks.flatMap((b) => b.items)), key(allItems(bundle.view)));
      assert.equal(constraintViolation(sel.order, bundle.pkg.constraints), null);
      if (canonicalJson(sel.order) !== canonicalJson(bundle.baselineOrder)) changed += 1;
      // the limits claim of the licences section is never separated from its families
      const pos = (id) => sel.order.indexOf(id);
      const lic = bundle.pkg.claims.find((x) => x.section === "licences" && x.role === "SECTION");
      for (const f of bundle.pkg.claims.filter((x) => x.role === "FAMILY")) assert.ok(pos(lic.id) < pos(f.id));
    }
    assert.ok(changed > 0, "the simulated orderer should reorder at least one case, or the test proves nothing");
  });

  await t.test("evidence gate is independent of the validator: a corrupted package falls back even for a valid answer", async () => {
    const { c, bundle, response } = get("SEL-03");
    const broken = { ...bundle, pkg: structuredClone(bundle.pkg) };
    broken.pkg.claims.find((x) => x.role === "FAMILY").items[0].value = 999;
    // the orderer really reorders this case, so a fallback that kept the provider's order would be visible
    const intact = await createSelector({ provider: providerFor("well-behaved-orderer") }).select(bundle, response, c.question);
    assert.notDeepEqual(intact.order, bundle.baselineOrder, "test setup: the provider must change the order here");
    const sel = await createSelector({ provider: providerFor("well-behaved-orderer") }).select(broken, response, c.question);
    assert.equal(sel.status, "FALLBACK");
    assert.equal(sel.reason, "EVIDENCE_GATE");
    assert.deepEqual(sel.order, bundle.baselineOrder);
  });

  await t.test("injection: instructions inside data or question reach the model request but cannot change what is shown", async () => {
    for (const id of ["SEL-12", "SEL-15", "SEL-16", "SEL-17"]) {
      const { c, bundle, response } = get(id);
      const req = buildSelectionRequest(bundle.pkg, c.question);
      assert.match(req.user, /\[\[DIRECTIVE:[A-Z_]+\]\]/, `${id}: the test must actually deliver the injection`);
      const sel = await createSelector({ provider: providerFor("injection-follower") }).select(bundle, response, c.question);
      assert.equal(sel.status, "FALLBACK", id);
      assert.deepEqual(sel.order, bundle.baselineOrder);
      assert.deepEqual(evidencePreservationProblems(bundle, response, applyOrder(bundle, sel.order)), []);
      // no number or text that was not in the evidence is reachable
      assert.ok(!JSON.stringify(applyOrder(bundle, sel.order).flatMap((b) => b.items)).includes("383"));
    }
    // adversarial strings that ARE source data are shown verbatim as data (and only as data)
    const inj = get("SEL-15");
    const den = inj.bundle.pkg.claims.find((x) => x.section === "ambito").items.find((i) => i.label === "Denominación");
    assert.match(den.value, /\[\[DIRECTIVE:DROP_LIMITATIONS\]\]/);
    assert.deepEqual(verifyPackageTrace(inj.bundle.pkg, inj.response), []);
  });

  await t.test("default is OFF: with no provider nothing is called and the deterministic order is returned", async () => {
    const { c, bundle, response } = get("SEL-01");
    const sel = await createSelector().select(bundle, response, c.question);
    assert.deepEqual({ status: sel.status, reason: sel.reason, order: sel.order }, { status: "DISABLED", reason: "NO_PROVIDER", order: bundle.baselineOrder });
    assert.equal(createSelector().enabled, false);
    assert.throws(() => createSelector({ provider: {} }), TypeError);
    assert.throws(() => createSelector({ provider: () => {} }), TypeError);
  });

  await t.test("provider failures: no throw, no leak of the error text, question guard, provider not called when the question is invalid", async () => {
    const { c, bundle, response } = get("SEL-01");
    const sel = await createSelector({ provider: providerFor("throws") }).select(bundle, response, c.question);
    assert.equal(sel.reason, "PROVIDER_ERROR");
    assert.ok(!JSON.stringify(sel).includes("secret-token-should-not-leak"));
    let calls = 0;
    const spy = { select: async () => (calls++, "{}") };
    for (const q of ["", "x".repeat(MAX_QUESTION_CHARS + 1), undefined, 7]) {
      const r = await createSelector({ provider: spy }).select(bundle, response, q);
      assert.equal(r.reason, "INVALID_QUESTION");
      assert.deepEqual(r.order, bundle.baselineOrder);
    }
    assert.equal(calls, 0);
    const slow = await createSelector({ provider: providerFor("never-answers"), timeoutMs: 30 }).select(bundle, response, c.question);
    assert.equal(slow.reason, "PROVIDER_TIMEOUT");
  });

  await t.test("request: inert, carries digests and the untrusted-data warning, and exposes no raw response", () => {
    const { c, bundle, response } = get("SEL-03");
    const req = buildSelectionRequest(bundle.pkg, c.question);
    assert.match(req.system, /untrusted data/);
    const body = JSON.parse(req.user);
    assert.equal(body.package.package_sha256, bundle.pkg.package_sha256);
    assert.deepEqual(Object.keys(req).sort(), ["outputSchema", "system", "user"]);
    assert.ok(!req.user.includes("verifiedAtStartup"), "the raw MCP response (file hashes, reading block) is not sent");
    assert.ok(!req.user.includes("residual_taxonomy"), "only whitelisted view items are sent");
    assert.equal(req.outputSchema.additionalProperties, false);
    assert.equal(req.outputSchema.properties.claim_ids.maxItems, bundle.pkg.claims.length);
    assert.ok(Buffer.byteLength(req.user) < 64 * 1024, `request is ${Buffer.byteLength(req.user)} bytes`);
    assert.ok(verifyPackageTrace(bundle.pkg, response).length === 0);
  });

  await t.test("matrix: simulated providers give the expected outcomes on all cases, and the shown evidence is always intact", async () => {
    const rows = await runMatrix(session);
    assert.equal(rows.length, CASES.cases.length * Object.keys(SIMULATED).length);
    for (const r of rows) {
      assert.deepEqual(r.evidenceProblems, [], `${r.provider} ${r.caseId}`);
      assert.deepEqual(r.unmetRequirements, [], r.caseId);
      if (EXPECT_ACCEPTED.has(r.provider)) assert.equal(r.status, "PROVIDER_ORDER", `${r.provider} ${r.caseId}`);
      else if (r.provider === "injection-follower") {
        const directive = /\[\[DIRECTIVE:(ADD_TOTAL|DROP_LIMITATIONS|REVERSE|EMPTY|INVENT_CLAIM)\]\]/.test(JSON.stringify(CASES.cases.find((c) => c.id === r.caseId)));
        assert.equal(r.status, directive ? "FALLBACK" : "PROVIDER_ORDER", `${r.caseId}`);
      } else assert.equal(r.reason, EXPECTED_REASON[r.provider], `${r.provider} ${r.caseId}`);
    }
  });

  await t.test("replay: recorded raw outputs are scored offline; absent telemetry is never invented", async () => {
    const mk = (id, mut) => {
      const { c, bundle } = get(id);
      const ids = bundle.baselineOrder;
      const env = { schema: "studio-claim-selection/1", package_sha256: bundle.pkg.package_sha256, question_sha256: questionDigest(c.question), claim_ids: mut(ids, bundle) };
      return JSON.stringify(env);
    };
    // These strings are TEST FIXTURES written by hand, not model outputs.
    const runs = [
      { caseId: "SEL-03", raw: mk("SEL-03", (ids, b) => { const lic = b.pkg.claims.filter((x) => x.section === "licences"); const rest = ids.filter((id) => !lic.some((l) => l.id === id)); const tail = b.pkg.constraints.find((x) => x.type === "TAIL").ids; const head = rest.filter((id) => !tail.includes(id)); return [...lic.map((l) => l.id), ...head, ...tail]; }), meta: { latencyMs: 800, inputTokens: 5000, outputTokens: 60, costUsd: 0.01 } },
      { caseId: "SEL-01", raw: "no json", meta: { latencyMs: 400, inputTokens: 4000, outputTokens: 10, costUsd: 0.02 } },
      { caseId: "SEL-02", raw: mk("SEL-02", (ids) => ids), meta: { latencyMs: 600, inputTokens: 3000, outputTokens: 30, costUsd: 0.005 } },
    ];
    const results = await replay(session, runs);
    const sum = summariseReplay(results);
    assert.equal(sum.n, 3);
    assert.equal(sum.accepted.successes, 2);
    assert.deepEqual(sum.reasons, { NOT_JSON: 1 });
    assert.equal(sum.changedOrder, 1);
    assert.equal(sum.latencyMs.median, 600);
    assert.equal(sum.costUsd, 0.035);
    assert.equal(summariseReplay(await replay(session, runs.map(({ meta, ...r }) => r))).latencyMs, "not recorded");
    assert.equal(summariseReplay(await replay(session, [{ ...runs[0], meta: { latencyMs: 1 } }])).costUsd, "not recorded");
    await assert.rejects(() => replay(session, [{ caseId: "NOPE", raw: "" }]));
    // blinded packet: deterministic, and the key maps X/Y to the right presentation
    const p1 = reviewPacket(results, "seed-a");
    assert.deepEqual(p1, reviewPacket(results, "seed-a"));
    assert.equal(p1.packet.length, 1);
    const [entry] = p1.packet;
    const k = p1.key[0];
    const a = entry[Object.keys(k).find((x) => (x === "X" || x === "Y") && k[x] === "A")];
    const bText = entry[Object.keys(k).find((x) => (x === "X" || x === "Y") && k[x] === "B")];
    assert.notEqual(a, bText);
    assert.ok(Object.values(entry.ratings).every((v) => v === null), "ratings start empty: nothing is pre-filled");
    assert.ok(!JSON.stringify(p1.packet).includes('"A"') && !JSON.stringify(p1.packet).includes('"B"'), "the packet does not reveal which is which");
  });
});

test("boundary: no SDK, no network, no credentials, no change to the published studio", () => {
  const files = ["claim-package.mjs", "selection-contract.mjs"].map((f) => path.join(ROOT, "studio", "selector", f));
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /\bfetch\s*\(|node:(https?|net|tls|dgram|child_process)|process\.env|XMLHttpRequest|WebSocket|API_KEY|anthropic|openai/i, path.basename(f));
  }
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  assert.deepEqual(deps.filter((d) => /anthropic|openai|langchain|llama|gemini|ai-sdk/i.test(d)), []);
  // the selector is not served by the studio and not imported by it
  const server = readFileSync(path.join(ROOT, "studio", "server.mjs"), "utf8");
  assert.ok(!/selector/.test(server));
  for (const f of ["app.js", "index.html", "evidence-view.mjs"]) assert.ok(!/selector/.test(readFileSync(path.join(ROOT, "studio", "public", f), "utf8")), f);
});
