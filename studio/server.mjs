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
import { McpSession, investigate, parseInvestigation } from "./mcp-session.mjs";

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
