// MCP session for Spatial Investigation Studio.
//
// Spawns the real Madrid Evidence MCP server (mcp/madrid-evidence/server.mjs) over stdio, verifies
// the handshake and the tool contract, and forwards calls. It computes nothing: every value the
// studio shows is taken from the server's structuredContent. Fail-closed: any verification failure
// leaves the session in state BLOCKED and no call is attempted.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { planCalls } from "./question-router.mjs";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SERVER = path.join(HERE, "..", "mcp", "madrid-evidence", "server.mjs");
const PIN = JSON.parse(readFileSync(path.join(HERE, "..", "mcp", "madrid-evidence", "lens-pin.json"), "utf8"));
export const PINNED_LENS_COMMIT = PIN.commit;

export const EXPECTED_SERVER_NAME = "madrid-evidence";
export const REQUIRED_TOOLS = ["ambito_snapshot_at_point", "licences_in_lens", "source_provenance"];
const CALL_TIMEOUT_MS = 20_000;

export class McpSession {
  constructor({ serverPath = DEFAULT_SERVER, lensRoot = process.env.MADRID_LENS_ROOT } = {}) {
    this.serverPath = serverPath;
    this.lensRoot = lensRoot;
    this.state = "STARTING";
    this.error = null;
    this.verification = null;
    this.stderr = "";
    this.client = null;
  }

  status() {
    return { state: this.state, error: this.error, verification: this.verification, pinnedLensCommit: PINNED_LENS_COMMIT };
  }

  block(message) {
    this.state = "BLOCKED";
    this.error = message;
  }

  async start() {
    if (!this.lensRoot) {
      this.block("MADRID_LENS_ROOT no está definido: el servidor MCP no puede verificar el checkout fijado de Lens.");
      return this.status();
    }
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [this.serverPath],
      env: { ...process.env, MADRID_LENS_ROOT: this.lensRoot },
      stderr: "pipe",
    });
    transport.stderr?.on("data", (chunk) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-4000);
    });
    const client = new Client({ name: "spatial-investigation-studio", version: "0.1.0" });
    client.onclose = () => {
      if (this.state === "READY") this.block("La conexión con el servidor MCP se cerró.");
    };
    try {
      await client.connect(transport, { timeout: CALL_TIMEOUT_MS });
    } catch (error) {
      const detail = this.stderr.trim().split("\n").filter(Boolean).pop();
      this.block(`El servidor MCP no se inicializó: ${detail || error.message}`);
      await client.close().catch(() => {});
      return this.status();
    }
    this.client = client;
    try {
      this.verification = await this.verify();
      this.state = "READY";
    } catch (error) {
      this.block(`Verificación del MCP fallida: ${error.message}`);
      await client.close().catch(() => {});
      this.client = null;
    }
    return this.status();
  }

  async verify() {
    const info = this.client.getServerVersion();
    if (info?.name !== EXPECTED_SERVER_NAME) throw new Error(`servidor inesperado: ${JSON.stringify(info?.name)}`);
    const { tools } = await this.client.listTools(undefined, { timeout: CALL_TIMEOUT_MS });
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const name of REQUIRED_TOOLS) {
      const tool = byName.get(name);
      if (!tool) throw new Error(`falta la herramienta ${name}`);
      if (tool.annotations?.readOnlyHint !== true) throw new Error(`${name} no se declara de solo lectura`);
    }
    return { serverInfo: info, tools: tools.map((t) => t.name).sort(), pinnedLensCommit: PINNED_LENS_COMMIT };
  }

  // One tool call. Never throws: the outcome is a record the interface shows as is.
  async call(tool, args) {
    const record = { tool, arguments: args, status: null, structuredContent: null, error: null };
    if (this.state !== "READY") {
      record.status = "NOT_RUN";
      record.error = this.error || "El servidor MCP no está disponible.";
      return record;
    }
    try {
      const res = await this.client.callTool({ name: tool, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS });
      if (res.isError) {
        record.status = "TOOL_ERROR";
        record.error = (res.content || []).map((c) => c.text).filter(Boolean).join("\n") || "Error sin mensaje";
        return record;
      }
      const sc = res.structuredContent;
      if (!sc || typeof sc !== "object") throw new Error("respuesta sin structuredContent");
      // Each response must declare the pinned Lens commit; otherwise its values are not shown.
      if (sc.reading?.lensCommit !== PINNED_LENS_COMMIT) {
        record.status = "VERIFICATION_ERROR";
        record.error = `La respuesta declara el commit de Lens ${JSON.stringify(sc.reading?.lensCommit)}, no el fijado ${PINNED_LENS_COMMIT}.`;
        return record;
      }
      record.status = "OK";
      record.structuredContent = sc;
    } catch (error) {
      record.status = "TRANSPORT_ERROR";
      record.error = error.message;
    }
    return record;
  }

  async close() {
    if (this.client) await this.client.close().catch(() => {});
    this.client = null;
    if (this.state === "READY") this.state = "CLOSED";
  }
}

export const RADII_M = [250, 500, 1000];
// The ámbito layer AMBITO_AT_POINT searches (Lens's sourceId for the planning-ámbito geometry).
export const CONSULTED_AMBITO_LAYER = "planning_ambito_geometry";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Validates the request from the interface. Coordinates must be finite WGS84; the radius one of the
// three offered values; the window optional and only shape-checked (calendar validity is Lens's call).
export function parseInvestigation(body) {
  const errors = [];
  const lon = body?.lon;
  const lat = body?.lat;
  const radiusM = body?.radiusM;
  if (typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180) errors.push("lon debe ser un número entre -180 y 180");
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) errors.push("lat debe ser un número entre -90 y 90");
  if (!RADII_M.includes(radiusM)) errors.push(`radiusM debe ser uno de ${RADII_M.join(", ")}`);
  let window;
  if (body?.window !== undefined && body?.window !== null) {
    const { from, to } = body.window;
    if (typeof from !== "string" || typeof to !== "string" || !DATE.test(from) || !DATE.test(to)) errors.push("window necesita from y to con forma AAAA-MM-DD");
    else window = { from, to };
  }
  const extra = Object.keys(body || {}).filter((k) => !["lon", "lat", "radiusM", "window"].includes(k));
  if (extra.length) errors.push(`campos no admitidos: ${extra.join(", ")}`);
  return errors.length ? { errors } : { value: { lon, lat, radiusM, ...(window ? { window } : {}) } };
}

// Sources a result actually cites: the top-level `sourceId` of each Lens EVIDENCE object returned.
// Abstentions cite none, so no provenance is queried on their behalf.
export function citedSourceIds(records) {
  const ids = [];
  const take = (lensResult) => {
    if (lensResult?.kind === "EVIDENCE" && typeof lensResult.sourceId === "string" && !ids.includes(lensResult.sourceId)) ids.push(lensResult.sourceId);
  };
  for (const r of records) {
    const sc = r.status === "OK" ? r.structuredContent : null;
    if (!sc) continue;
    if (r.tool === "ambito_snapshot_at_point") [sc.ambitoAtPoint, sc.ambitoPhases, sc.ambitoEditionDiff].forEach(take);
    if (r.tool === "licences_in_lens") take(sc.result);
  }
  return ids;
}

export async function investigate(session, request) {
  const { lon, lat, radiusM, window } = request;
  const snapshot = await session.call("ambito_snapshot_at_point", { lon, lat });
  const licences = await session.call("licences_in_lens", { lon, lat, radiusM, ...(window ? { window } : {}) });
  const provenance = [];
  for (const sourceId of citedSourceIds([snapshot, licences])) provenance.push(await session.call("source_provenance", { sourceId }));
  // When the point resolves no ámbito, the layer that was searched is described separately as the
  // "consulted layer". It is metadata about the layer, never evidence about the point, and it is kept
  // apart from `provenance` (sources cited by EVIDENCE results).
  const abstained = snapshot.status === "OK" && snapshot.structuredContent?.ambitoAtPoint?.kind === "ABSTENTION";
  const consultedLayer = abstained ? await session.call("source_provenance", { sourceId: CONSULTED_AMBITO_LAYER }) : null;
  return { request, mcp: session.status(), calls: { snapshot, licences, provenance, consultedLayer } };
}

// ---- v0.2 question-driven investigation ----------------------------------------------------------
// Runs the calls a ROUTED question needs (planCalls) and nothing else. A routing abstention never reaches
// here: the caller must not invoke it (and this refuses). Only the ámbito identity and, for edition
// questions, the edition difference cite sources that are looked up; the phases result is not displayed, so
// its source is not queried.
function citedFrom(sc, keys) {
  const ids = [];
  for (const k of keys) {
    const r = k === "result" ? sc?.result : sc?.[k];
    if (r?.kind === "EVIDENCE" && typeof r.sourceId === "string" && !ids.includes(r.sourceId)) ids.push(r.sourceId);
  }
  return ids;
}

export async function ask(session, route, request) {
  if (route.status !== "ROUTED") throw new Error("a routing abstention must not execute MCP calls");
  const calls = { snapshot: null, licences: null, provenance: [], consultedLayer: null };
  const [step] = planCalls(route, request);
  const record = await session.call(step.tool, step.arguments);
  if (step.tool === "ambito_snapshot_at_point") {
    calls.snapshot = record;
    const sc = record.status === "OK" ? record.structuredContent : null;
    const keys = route.intent === "EDITION_CHANGE" ? ["ambitoAtPoint", "ambitoEditionDiff"] : ["ambitoAtPoint"];
    for (const sourceId of citedFrom(sc, keys)) calls.provenance.push(await session.call("source_provenance", { sourceId }));
    if (sc?.ambitoAtPoint?.kind === "ABSTENTION") calls.consultedLayer = await session.call("source_provenance", { sourceId: CONSULTED_AMBITO_LAYER });
  } else if (step.tool === "licences_in_lens") {
    calls.licences = record;
    const sc = record.status === "OK" ? record.structuredContent : null;
    for (const sourceId of citedFrom(sc, ["result"])) calls.provenance.push(await session.call("source_provenance", { sourceId }));
  } else calls.provenance.push(record);
  return { request, mcp: session.status(), calls };
}
