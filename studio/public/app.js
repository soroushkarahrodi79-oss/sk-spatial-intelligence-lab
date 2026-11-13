// Browser side of Spatial Investigation Studio. Renders the MCP's structuredContent through the
// shared view model; all data reaches the DOM through textContent.
import { buildView, callRecord, getPointer, KIND } from "./evidence-view.mjs";

// Pilot reference point: Renfe station record (2019), lon -3.692207, lat 40.446612. The record labels
// them "UTM" although they are written as decimal degrees; they are used as WGS84 lon/lat provisionally.
const PILOT = Object.freeze({ lon: -3.692207, lat: 40.446612 });
const KIND_LABEL = { FACT: "Hecho", LIMITATION: "Limitación", ABSTENTION: "Abstención", CONTEXT: "Contexto", ERROR: "Error", NOTE: "Nota" };
const STATUS_LABEL = { CONSULTED_LAYER: "Capa consultada", EVIDENCE: "Evidencia", ABSTENTION: "Abstención", NOT_QUERIED: "No consultado", NOT_RUN: "No ejecutado", ERROR: "Error" };

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

let lastResponse = null;

// ---- Map --------------------------------------------------------------------------------------
let map = null;
let marker = null;
let circle = null;
function initMap() {
  if (!window.L) {
    $("tiles-note").hidden = false;
    $("tiles-note").textContent = "No se pudo cargar la librería del mapa.";
    return;
  }
  map = L.map("map", { zoomControl: true, attributionControl: true }).setView([PILOT.lat, PILOT.lon], 15);
  let tileLoaded = false;
  let tileErrors = 0;
  const tilesDown = () => ($("tiles-note").hidden = false);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© colaboradores de OpenStreetMap",
  })
    .on("tileload", () => {
      tileLoaded = true;
      $("tiles-note").hidden = true;
    })
    .on("tileerror", () => {
      if (++tileErrors >= 4 && !tileLoaded) tilesDown();
    })
    .addTo(map);
  // Tile requests can hang rather than fail (offline or behind a proxy).
  setTimeout(() => !tileLoaded && tilesDown(), 8000);
  map.on("click", (e) => {
    $("lon").value = e.latlng.lng.toFixed(6);
    $("lat").value = e.latlng.lat.toFixed(6);
    drawQuery();
  });
}
function drawQuery() {
  if (!map) return;
  const lon = Number($("lon").value);
  const lat = Number($("lat").value);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
  const radius = Number(document.querySelector("input[name=radius]:checked").value);
  marker?.remove();
  circle?.remove();
  circle = L.circle([lat, lon], { radius, color: "#2563eb", weight: 2, dashArray: "6 6", fillOpacity: 0.06 }).addTo(map);
  marker = L.circleMarker([lat, lon], { radius: 6, color: "#fff", weight: 2, fillColor: "#0f172a", fillOpacity: 1 }).addTo(map);
  circle.bindTooltip(`Círculo de consulta · ${radius} m (no es un ámbito)`);
  map.fitBounds(circle.getBounds(), { padding: [16, 16], maxZoom: 17 });
}

// ---- MCP status -------------------------------------------------------------------------------
function showStatus(st) {
  const box = $("mcp-status");
  box.dataset.state = st.state;
  const commit = st.pinnedLensCommit ? st.pinnedLensCommit.slice(0, 7) : "?";
  box.querySelector(".txt").textContent =
    st.state === "READY" ? `MCP verificado · Lens ${commit}` : `MCP ${st.state}${st.error ? ` — ${st.error}` : ""}`;
  $("run").disabled = st.state !== "READY";
}
async function loadStatus() {
  try {
    const res = await fetch("/api/status");
    showStatus(await res.json());
  } catch {
    showStatus({ state: "BLOCKED", error: "No hay conexión con el servidor local del estudio." });
  }
}

// ---- Rendering --------------------------------------------------------------------------------
function formatValue(value) {
  if (value === null) return { text: "null", cls: "v-null", hint: "valor nulo en la fuente: desconocido, no cero" };
  if (typeof value === "boolean") return { text: String(value), cls: "v-bool" };
  if (Array.isArray(value)) return { text: value.join(" · "), cls: "v-list" };
  if (typeof value === "object") return { text: JSON.stringify(value), cls: "v-obj" };
  return { text: String(value), cls: typeof value === "number" ? "v-num" : String(value).length > 90 ? "v-long" : "v-text" };
}

function renderItem(item, response, section) {
  const li = el("li", `item k-${item.kind}`);
  const head = el("div", "item-head");
  head.append(el("span", "badge", KIND_LABEL[item.kind]), el("span", "item-label", item.label));
  li.append(head);
  const f = formatValue(item.value);
  const val = el(f.cls === "v-long" ? "p" : "span", `item-value ${f.cls}`, f.text);
  if (item.unitPath) {
    const unit = getPointer(callRecord(response, item.source.call), item.unitPath);
    if (unit !== undefined) val.append(el("span", "unit", ` ${unit}`));
  }
  li.append(val);
  if (f.hint) li.append(el("span", "null-hint", f.hint));
  if (item.source?.call) {
    const btn = el("button", "trace", "Ver origen");
    btn.type = "button";
    btn.setAttribute("aria-label", `Ver origen de: ${item.label}`);
    btn.addEventListener("click", () => openInspector(item, section, response));
    li.append(btn);
  }
  return li;
}

function renderSection(section, response) {
  const card = el("article", `card st-${section.status}`);
  card.id = `sec-${section.id}`;
  const head = el("header", "card-head");
  const titles = el("div");
  titles.append(el("h2", null, section.title), el("p", "scope", section.scope));
  head.append(titles, el("span", `status s-${section.status}`, STATUS_LABEL[section.status] || section.status));
  card.append(head);

  if (section.families?.length) {
    const grid = el("div", "families");
    grid.setAttribute("aria-label", "Familias de licencias, cada una por separado");
    for (const fam of section.families) {
      const tile = el("section", "family");
      const [count, ...rest] = fam.items;
      if (count && count.kind === KIND.FACT) {
        tile.append(el("p", "fam-name", count.label), el("p", "fam-key", fam.family));
        const big = el("p", "fam-count", String(count.value));
        tile.append(big, el("p", "fam-caption", "licencias concedidas localizadas en el círculo"));
        const btn = el("button", "trace", "Ver origen");
        btn.type = "button";
        btn.addEventListener("click", () => openInspector(count, section, response));
        tile.append(btn);
      }
      const ul = el("ul", "items compact");
      for (const it of count?.kind === KIND.FACT ? rest : fam.items) ul.append(renderItem(it, response, section));
      tile.append(ul);
      grid.append(tile);
    }
    card.append(grid, el("p", "no-sum", "Familias distintas: no se suman ni se ofrece un total conjunto."));
  }

  const groups = [
    ["Hechos", [KIND.FACT]],
    ["Abstenciones y errores", [KIND.ABSTENTION, KIND.ERROR]],
    ["Limitaciones, cobertura y fechas", [KIND.LIMITATION]],
    ["Contexto fuera del alcance de la consulta", [KIND.CONTEXT]],
    ["Notas de interpretación", [KIND.NOTE]],
  ];
  for (const [label, kinds] of groups) {
    const items = section.items.filter((i) => kinds.includes(i.kind));
    if (!items.length) continue;
    const g = el("div", "group");
    g.append(el("h3", null, label));
    const ul = el("ul", "items");
    items.forEach((i) => ul.append(renderItem(i, response, section)));
    g.append(ul);
    card.append(g);
  }
  return card;
}

function render(response) {
  lastResponse = response;
  const view = buildView(response);
  const r = response.request;
  $("query-line").textContent = `lon ${r.lon} · lat ${r.lat} · radio ${r.radiusM} m${r.window ? ` · ventana ${r.window.from} → ${r.window.to}` : " · ventana por defecto de Lens"}`;
  const summary = $("summary");
  summary.replaceChildren();
  for (const s of view.sections) {
    const li = el("li", `s-${s.status}`);
    const a = el("a", null, s.title);
    a.href = `#sec-${s.id}`;
    li.append(a, el("span", "status-chip", STATUS_LABEL[s.status] || s.status));
    summary.append(li);
  }
  const container = $("sections");
  container.replaceChildren(...view.sections.map((s) => renderSection(s, response)));
  $("empty").hidden = true;
  $("results").hidden = false;
}

function renderFailure(title, message, details) {
  lastResponse = null;
  $("empty").hidden = true;
  $("results").hidden = false;
  $("query-line").textContent = "—";
  $("summary").replaceChildren();
  const card = el("article", "card st-ERROR");
  const head = el("header", "card-head");
  head.append(el("h2", null, title), el("span", "status s-ERROR", "Error"));
  card.append(head, el("p", "fail-msg", message));
  if (details?.length) {
    const ul = el("ul", "fail-list");
    details.forEach((d) => ul.append(el("li", null, d)));
    card.append(ul);
  }
  card.append(el("p", "scope", "No se muestra ningún resultado: no hay evidencia verificada para esta consulta."));
  $("sections").replaceChildren(card);
}

// ---- Inspector --------------------------------------------------------------------------------
function openInspector(item, section, response) {
  const record = callRecord(response, item.source.call);
  const meta = $("insp-meta");
  meta.replaceChildren();
  const row = (k, v) => meta.append(el("dt", null, k), el("dd", null, v));
  row("Afirmación", item.label);
  row("Tipo", KIND_LABEL[item.kind]);
  row("Herramienta MCP", record.tool);
  row("Argumentos", JSON.stringify(record.arguments));
  row("Estado de la llamada", record.status);
  row("Puntero JSON", item.source.path);
  row("Valor en ese puntero", JSON.stringify(getPointer(record, item.source.path)));
  row("Alcance", section.scope);
  row("Commit de Lens declarado", String(getPointer(record, "/structuredContent/reading/lensCommit") ?? "—"));
  const sup = $("insp-supports");
  sup.replaceChildren();
  const files = section.supports ? getPointer(record, section.supports) : undefined;
  if (Array.isArray(files)) files.forEach((f) => sup.append(el("li", null, `${f.path} · sha256 ${f.sha256}`)));
  else sup.append(el("li", null, "Sin archivos de respaldo: la llamada no devolvió evidencia."));
  $("insp-raw").textContent = JSON.stringify(record, null, 2);
  $("inspector").showModal();
}

// ---- Form -------------------------------------------------------------------------------------
function setPilot() {
  $("lon").value = PILOT.lon.toFixed(6);
  $("lat").value = PILOT.lat.toFixed(6);
  drawQuery();
}

async function submit(e) {
  e.preventDefault();
  const err = $("form-error");
  err.hidden = true;
  const lon = Number($("lon").value);
  const lat = Number($("lat").value);
  const radiusM = Number(document.querySelector("input[name=radius]:checked").value);
  const from = $("win-from").value;
  const to = $("win-to").value;
  if ($("lon").value === "" || $("lat").value === "" || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    err.textContent = "Introduce una longitud y una latitud numéricas.";
    err.hidden = false;
    return;
  }
  if ((from && !to) || (!from && to)) {
    err.textContent = "La ventana necesita ambas fechas, o ninguna.";
    err.hidden = false;
    return;
  }
  const body = { lon, lat, radiusM, ...(from && to ? { window: { from, to } } : {}) };
  drawQuery();
  const btn = $("run");
  btn.disabled = true;
  btn.textContent = "Consultando MCP…";
  try {
    const res = await fetch("/api/investigate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) render(data);
    else {
      renderFailure(data.error || "Error", data.mcp?.error || "La consulta no se ejecutó.", data.details);
      if (data.mcp) showStatus(data.mcp);
    }
  } catch (error) {
    renderFailure("Servidor local no disponible", error.message);
  } finally {
    btn.textContent = "Investigar";
    await loadStatus();
  }
}

initMap();
setPilot();
$("reset-pilot").addEventListener("click", setPilot);
$("query").addEventListener("submit", submit);
for (const r of document.querySelectorAll("input[name=radius]")) r.addEventListener("change", drawQuery);
for (const id of ["lon", "lat"]) $(id).addEventListener("change", drawQuery);
loadStatus();
window.__studio = { last: () => lastResponse };
