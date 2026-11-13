#!/usr/bin/env node
// Spatial Investigation Studio v0.1 — local web interface over the Madrid Evidence MCP.
// Binds to 127.0.0.1 only. No LLM, no database, no new analysis: the browser shows the MCP's own
// structuredContent through public/evidence-view.mjs.
//
//   MADRID_LENS_ROOT=/path/to/lens-pinned npm run studio

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpSession, ask, investigate, parseInvestigation } from "./mcp-session.mjs";
import { interpretation, questionCatalogue, routeGuided, routeText } from "./question-router.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEAFLET = path.join(HERE, "public", "vendor", "leaflet"); // vendored, see VENDOR.json
const STATIC = {
  "/": [path.join(HERE, "public", "index.html"), "text/html; charset=utf-8"],
  "/app.js": [path.join(HERE, "public", "app.js"), "text/javascript; charset=utf-8"],
  "/evidence-view.mjs": [path.join(HERE, "public", "evidence-view.mjs"), "text/javascript; charset=utf-8"],
  "/style.css": [path.join(HERE, "public", "style.css"), "text/css; charset=utf-8"],
  "/vendor/leaflet/leaflet.js": [path.join(LEAFLET, "leaflet.js"), "text/javascript; charset=utf-8"],
  "/vendor/leaflet/leaflet.css": [path.join(LEAFLET, "leaflet.css"), "text/css; charset=utf-8"],
};
const MAX_BODY = 4096;

const send = (res, status, body, type = "application/json; charset=utf-8") => {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(payload);
};

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("cuerpo demasiado grande"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("JSON no válido"), { status: 400 });
  }
}

// POST /api/ask: a question (free text or one of the guided ones) plus the spatial controls. The spatial
// part is validated exactly as for /api/investigate; the question can carry no spatial argument.
function parseAsk(body) {
  const errors = [];
  const allowed = ["mode", "question", "guided", "sourceId", "lon", "lat", "radiusM", "window"];
  const extra = Object.keys(body || {}).filter((k) => !allowed.includes(k));
  if (extra.length) errors.push(`campos no admitidos: ${extra.join(", ")}`);
  const { lon, lat, radiusM, window } = body || {};
  const spatial = parseInvestigation({ lon, lat, radiusM, ...(window !== undefined ? { window } : {}) });
  if (spatial.errors) errors.push(...spatial.errors);
  const mode = body?.mode;
  if (mode === "text") {
    if (typeof body.question !== "string") errors.push("question debe ser texto");
    if (body.guided !== undefined || body.sourceId !== undefined) errors.push("el modo text no admite guided ni sourceId");
  } else if (mode === "guided") {
    if (typeof body.guided !== "string") errors.push("guided debe ser el id de una pregunta guiada");
    if (body.question !== undefined) errors.push("el modo guided no admite question");
    if (body.sourceId !== undefined && typeof body.sourceId !== "string") errors.push("sourceId debe ser texto");
  } else errors.push('mode debe ser "text" o "guided"');
  return errors.length ? { errors } : { value: { mode, question: body.question, guided: body.guided, sourceId: body.sourceId, request: spatial.value } };
}

export async function createStudio({ lensRoot = process.env.MADRID_LENS_ROOT, serverPath } = {}) {
  const session = new McpSession({ lensRoot, ...(serverPath ? { serverPath } : {}) });
  await session.start();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    try {
      if (req.method === "GET" && url.pathname === "/api/status") return send(res, 200, session.status());
      if (req.method === "POST" && url.pathname === "/api/investigate") {
        const parsed = parseInvestigation(await readJson(req));
        if (parsed.errors) return send(res, 400, { error: "Solicitud no válida", details: parsed.errors });
        // A blocked MCP yields no results at all, only the reason.
        if (session.state !== "READY") return send(res, 503, { error: "MCP no disponible", mcp: session.status() });
        return send(res, 200, await investigate(session, parsed.value));
      }
      if (req.method === "GET" && url.pathname === "/api/questions") return send(res, 200, questionCatalogue());
      if (req.method === "POST" && url.pathname === "/api/ask") {
        const parsed = parseAsk(await readJson(req));
        if (parsed.errors) return send(res, 400, { error: "Solicitud no válida", details: parsed.errors });
        const { mode, question, guided, sourceId, request } = parsed.value;
        let routing;
        try {
          routing = mode === "text" ? routeText(question) : routeGuided({ guided, sourceId });
        } catch (error) {
          return send(res, 400, { error: "Solicitud no válida", details: [error.message] });
        }
        // A routing abstention executes nothing: no MCP call is made, whatever the MCP state.
        if (routing.status !== "ROUTED") return send(res, 200, { routing, interpretation: null, request, mcp: session.status(), calls: null, executed: false });
        if (session.state !== "READY") return send(res, 503, { error: "MCP no disponible", mcp: session.status() });
        const result = await ask(session, routing, request);
        return send(res, 200, { routing: { ...routing, executed: true }, interpretation: interpretation(routing, request), executed: true, ...result });
      }
      const entry = req.method === "GET" && STATIC[url.pathname];
      if (entry) return send(res, 200, await readFile(entry[0]), entry[1]);
      return send(res, 404, "Not found", "text/plain; charset=utf-8");
    } catch (error) {
      return send(res, error.status || 500, { error: error.status ? error.message : "Error interno del estudio" });
    }
  });

  return {
    session,
    server,
    listen: (port = 0) => new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server.address().port))),
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await session.close();
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const studio = await createStudio();
  const port = await studio.listen(Number(process.env.STUDIO_PORT) || 4317);
  const st = studio.session.status();
  console.log(`Spatial Investigation Studio: http://127.0.0.1:${port}/  (MCP ${st.state}${st.error ? `: ${st.error}` : ""})`);
  const stop = async () => {
    await studio.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
