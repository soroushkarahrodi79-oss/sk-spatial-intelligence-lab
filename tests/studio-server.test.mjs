// Spatial Investigation Studio v0.1 — local HTTP server tests (real MCP; stub only for failures).
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createStudio } from "../studio/server.mjs";

const LENS_ROOT = process.env.MADRID_LENS_ROOT;
const STUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "studio-stub-mcp.mjs");
const PILOT = { lon: -3.692, lat: 40.446 };

async function boot(options) {
  const studio = await createStudio(options);
  const port = await studio.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const post = (body) => fetch(`${base}/api/investigate`, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { studio, base, post };
}

test("MADRID_LENS_ROOT is set", () => assert.ok(LENS_ROOT, "MADRID_LENS_ROOT is not set"));

test("HTTP API over the real MCP", { skip: !LENS_ROOT && "no MADRID_LENS_ROOT" }, async (t) => {
  const { studio, base, post } = await boot({ lensRoot: LENS_ROOT });
  t.after(() => studio.close());

  await t.test("status reports a verified MCP at the pinned commit", async () => {
    const st = await (await fetch(`${base}/api/status`)).json();
    assert.equal(st.state, "READY");
    assert.equal(st.verification.serverInfo.name, "madrid-evidence");
  });

  await t.test("pilot investigation returns the MCP records unchanged", async () => {
    const res = await post({ ...PILOT, radiusM: 1000 });
    assert.equal(res.status, 200);
    const body = await res.json();
    const direct = await studio.session.client.callTool({ name: "licences_in_lens", arguments: { ...PILOT, radiusM: 1000 } });
    assert.deepEqual(body.calls.licences.structuredContent, direct.structuredContent);
    assert.equal(body.calls.licences.structuredContent.result.applied.radiusM, 1000);
  });

  await t.test("invalid requests are rejected before reaching the MCP", async () => {
    for (const body of [{ ...PILOT, radiusM: 300 }, { ...PILOT, radiusM: "500" }, { lon: 999, lat: 40, radiusM: 500 }, { ...PILOT, radiusM: 500, extra: 1 }, { ...PILOT, radiusM: 500, window: { from: "2025" } }]) {
      const res = await post(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal((await res.json()).calls, undefined);
    }
    assert.equal((await post("{not json")).status, 400);
  });

  await t.test("serves the interface and the vendored map library, nothing else", async () => {
    for (const p of ["/", "/app.js", "/evidence-view.mjs", "/style.css", "/vendor/leaflet/leaflet.js"]) assert.equal((await fetch(base + p)).status, 200, p);
    for (const p of ["/../package.json", "/studio/server.mjs", "/vendor/leaflet/VENDOR.json", "/mcp/madrid-evidence/lens-pin.json"]) assert.equal((await fetch(base + p)).status, 404, p);
  });
});

test("vendored Leaflet is byte-identical to the recorded npm release files", async () => {
  const { createHash } = await import("node:crypto");
  const { readFileSync } = await import("node:fs");
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "studio", "public", "vendor", "leaflet");
  const vendor = JSON.parse(readFileSync(path.join(dir, "VENDOR.json"), "utf8"));
  for (const [file, sha] of Object.entries(vendor.sha256)) assert.equal(createHash("sha256").update(readFileSync(path.join(dir, file))).digest("hex"), sha, file);
});

test("blocked MCP: 503 and no results at all", async (t) => {
  const { studio, base, post } = await boot({ lensRoot: "/nonexistent/lens-checkout" });
  t.after(() => studio.close());
  assert.equal((await (await fetch(`${base}/api/status`)).json()).state, "BLOCKED");
  const res = await post({ ...PILOT, radiusM: 500 });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.calls, undefined);
  assert.equal(body.mcp.state, "BLOCKED");
});

test("MCP crashing mid-investigation: errors only, then blocked", async (t) => {
  process.env.STUB_MODE = "crash";
  const { studio, base, post } = await boot({ lensRoot: "/stub", serverPath: STUB });
  delete process.env.STUB_MODE;
  t.after(() => studio.close());
  const body = await (await post({ ...PILOT, radiusM: 500 })).json();
  assert.equal(body.calls.snapshot.structuredContent, null);
  assert.equal(body.calls.licences.structuredContent, null);
  assert.equal((await (await fetch(`${base}/api/status`)).json()).state, "BLOCKED");
  assert.equal((await post({ ...PILOT, radiusM: 500 })).status, 503);
});
