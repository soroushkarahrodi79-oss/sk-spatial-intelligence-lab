// Evidence view model for Spatial Investigation Studio. Shared by the browser and the tests.
//
// Turns the raw MCP call records of one investigation into display items. Rules:
// - every item that shows a value carries `source = { call, path }`, a JSON pointer into the raw call
//   record, and `value` is exactly what that pointer resolves to (no arithmetic, rounding or merging);
// - absent fields are skipped, explicit nulls are kept as null;
// - licence families are listed one by one; no item ever combines them;
// - items without a data source are interface notes (`kind: "NOTE"`, `source: { origin: "interface" }`)
//   and never carry a number.

export const KIND = Object.freeze({
  FACT: "FACT", // a value Lens returned as evidence
  LIMITATION: "LIMITATION", // coverage, ceilings, freshness, nulls, scope caveats returned by Lens/MCP
  ABSTENTION: "ABSTENTION", // Lens declined to answer
  CONTEXT: "CONTEXT", // returned by the MCP but outside the query scope (registerComposition)
  ERROR: "ERROR", // the call failed or was not run
  NOTE: "NOTE", // fixed interface text; no data, no numbers
});

export const FAMILY_LABEL = Object.freeze({
  BUILDING_URBANISTIC_LICENCE_FAMILY: "Licencias urbanísticas / de edificación",
  ACTIVITY_LICENCE_FAMILY: "Licencias de actividad",
  TEMPORARY_ACTIVITY_FAMILY: "Licencias de actividades temporales",
});

export function getPointer(obj, pointer) {
  if (pointer === "") return obj;
  let cur = obj;
  for (const raw of pointer.split("/").slice(1)) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (cur === null || typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, key)) return undefined;
    cur = cur[key];
  }
  return cur;
}
const esc = (k) => String(k).replace(/~/g, "~0").replace(/\//g, "~1");

const note = (text) => ({ kind: KIND.NOTE, label: "Nota de la interfaz", value: text, source: { origin: "interface" } });

// Builder bound to one call record. `item` returns null when the field is absent.
function binder(callKey, record) {
  return (kind, label, path, extra = {}) => {
    const value = getPointer(record, path);
    if (value === undefined) return null;
    return { kind, label, value, source: { call: callKey, path }, ...extra };
  };
}

function errorSection(id, title, scope, callKey, record) {
  const at = binder(callKey, record);
  return {
    id,
    title,
    scope,
    status: record.status === "NOT_RUN" ? "NOT_RUN" : "ERROR",
    callKey,
    families: [],
    items: [
      at(KIND.ERROR, "Estado de la llamada MCP", "/status"),
      at(KIND.ERROR, "Error", "/error"),
      note("No se muestra ningún resultado para esta consulta: la llamada no devolvió evidencia verificada."),
    ].filter(Boolean),
  };
}

function abstentionItems(at, base) {
  return [
    at(KIND.ABSTENTION, "Abstención de Lens", `${base}/reason`),
    at(KIND.ABSTENTION, "Mensaje de Lens", `${base}/message`),
    at(KIND.LIMITATION, "Alcance de la consulta", `${base}/scope`),
    at(KIND.LIMITATION, "Prohibición declarada", `${base}/prohibition`),
  ].filter(Boolean);
}

function freshnessItems(at, base) {
  return [
    at(KIND.LIMITATION, "Fecha de referencia", `${base}/freshness/reference_date`),
    at(KIND.LIMITATION, "Fecha de publicación", `${base}/freshness/published_at`),
    at(KIND.LIMITATION, "Fecha de descarga (retrieved_at)", `${base}/freshness/retrieved_at`),
    at(KIND.LIMITATION, "Frecuencia de actualización", `${base}/freshness/update_frequency`),
    at(KIND.LIMITATION, "Estado de la fuente", `${base}/freshness/source_state`),
  ].filter(Boolean);
}

const NO_EVIDENCE_NOTE =
  "NO_EVIDENCE_FOR_SCOPE es una ausencia conocida en la capa publicada de ámbitos. No indica por qué no hay ámbito, qué zonificación o clase de suelo rige en el punto, cuál es el ámbito más cercano, ni ausencia de actividad.";
const NO_PLANNING_INFERENCE_NOTE =
  "Limitación interpretativa: NO_EVIDENCE_FOR_SCOPE no permite concluir que no exista planeamiento urbanístico aplicable al punto. Puede haber instrumentos de planeamiento que esta capa no recoge; el MCP no lo comprueba.";
// Label of a published phase cell, taken from Lens's own `kind` for that cell. Only PHASE_VALUE is an
// administrative phase state; a PLAN_ORIGIN_MARKER (e.g. PGOUM-85) is not a progress state.
const PHASE_KIND_LABEL = {
  PHASE_VALUE: "Fase administrativa publicada",
  PLAN_ORIGIN_MARKER: "Marcador de plan de origen (no es estado de avance)",
};
const AMBITO_SCOPE = "Ámbito urbanístico completo que contiene el punto (no el círculo de consulta)";

function ambitoSections(record) {
  const callKey = "snapshot";
  const titles = ["Ámbito en el punto", "Estado publicado del ámbito (fases)", "Diferencia entre ediciones"];
  if (record.status !== "OK") return [errorSection("ambito", titles[0], AMBITO_SCOPE, callKey, record)];
  const at = binder(callKey, record);
  const S = "/structuredContent";
  const sections = [];

  const a = getPointer(record, `${S}/ambitoAtPoint`);
  const ambito = { id: "ambito", title: titles[0], scope: AMBITO_SCOPE, callKey, status: a?.kind, items: [], supports: `${S}/reading/supports/AMBITO_AT_POINT` };
  if (a?.kind === "EVIDENCE") {
    const b = `${S}/ambitoAtPoint`;
    ambito.items.push(
      ...[
        at(KIND.FACT, "Código de ámbito", `${b}/value/ambitoCode`),
        at(KIND.FACT, "Denominación", `${b}/value/denomination`),
        at(KIND.FACT, "Derivación", `${b}/derivation`),
        at(KIND.LIMITATION, "Fuente citada (sourceId)", `${b}/sourceId`),
        ...freshnessItems(at, b),
        at(KIND.LIMITATION, "Reparto a subáreas", `${b}/value/apportionment/statement`),
        at(KIND.LIMITATION, "Techo de interpretación", `${b}/ceiling`),
      ].filter(Boolean)
    );
  } else {
    ambito.items.push(...abstentionItems(at, `${S}/ambitoAtPoint`));
    if (a?.reason === "NO_EVIDENCE_FOR_SCOPE") ambito.items.push(note(NO_EVIDENCE_NOTE), note(NO_PLANNING_INFERENCE_NOTE));
  }
  sections.push(ambito);

  const notQueried = getPointer(record, `${S}/notQueried`);
  if (getPointer(record, `${S}/queriedCode`) === null) {
    for (const [id, title] of [["phases", titles[1]], ["diff", titles[2]]]) {
      sections.push({ id, title, scope: AMBITO_SCOPE, callKey, status: "NOT_QUERIED", items: [at(KIND.ABSTENTION, "No consultado", `${S}/notQueried`)].filter(Boolean) });
    }
    if (notQueried === undefined) sections.at(-1).items.push(note("La consulta no devolvió código de ámbito."));
    return sections;
  }

  const p = getPointer(record, `${S}/ambitoPhases`);
  const pb = `${S}/ambitoPhases`;
  const phases = { id: "phases", title: titles[1], scope: AMBITO_SCOPE, callKey, status: p?.kind, items: [], supports: `${S}/reading/supports/AMBITO_PHASES` };
  if (p?.kind === "EVIDENCE") {
    phases.items.push(
      ...[
        at(KIND.FACT, "Código consultado", `${pb}/value/ambitoCode`),
        at(KIND.FACT, "Disponibilidad", `${pb}/value/availability`),
        at(KIND.FACT, "Distrito", `${pb}/value/district/name`),
        at(KIND.FACT, "Uso característico", `${pb}/value/characteristicUse`),
      ].filter(Boolean)
    );
    (p.value?.phases || []).forEach((ph, i) => {
      const kindLabel = PHASE_KIND_LABEL[ph.kind] || `Valor publicado en celda de fase (${ph.kind ?? "sin tipo"})`;
      const it = at(KIND.FACT, `${kindLabel} · ${ph.sourceColumn ?? ph.key}`, `${pb}/value/phases/${i}/sourceValue`, { lensKindPath: `${pb}/value/phases/${i}/kind` });
      if (it) phases.items.push(it);
    });
    phases.items.push(
      ...[
        at(KIND.FACT, "Superficie publicada (ámbito completo)", `${pb}/value/surface/value`, { unitPath: `${pb}/value/surface/unit` }),
        at(KIND.LIMITATION, "Edición: fecha de referencia", `${pb}/value/edition/referenceDate`),
        at(KIND.LIMITATION, "Edición: publicada", `${pb}/value/edition/publishedAt`),
        at(KIND.LIMITATION, "Edición: título", `${pb}/value/edition/title`),
        at(KIND.LIMITATION, "Edición: estado de la fuente", `${pb}/value/edition/sourceState`),
        at(KIND.LIMITATION, "Fuente citada (sourceId)", `${pb}/sourceId`),
        ...freshnessItems(at, pb),
        at(KIND.LIMITATION, "Techo de interpretación", `${pb}/ceiling`),
      ].filter(Boolean),
      note("Una fase administrativa publicada no es ejecución física comprobada."),
    );
  } else phases.items.push(...abstentionItems(at, pb));
  sections.push(phases);

  const d = getPointer(record, `${S}/ambitoEditionDiff`);
  const db = `${S}/ambitoEditionDiff`;
  const diff = { id: "diff", title: titles[2], scope: AMBITO_SCOPE, callKey, status: d?.kind, items: [], supports: `${S}/reading/supports/AMBITO_EDITION_DIFF` };
  if (d?.kind === "EVIDENCE") {
    diff.items.push(
      ...[
        at(KIND.FACT, "Veredicto de comparabilidad", `${db}/value/comparabilityVerdict`),
        at(KIND.FACT, "Motivo", `${db}/value/reason`),
        at(KIND.FACT, "Edición anterior", `${db}/value/dates/previous`),
        at(KIND.FACT, "Edición actual", `${db}/value/dates/current`),
      ].filter(Boolean)
    );
    for (const fam of Object.keys(d.value?.state || {})) {
      diff.items.push(
        ...[
          at(KIND.FACT, `Familia ${fam}: resultado`, `${db}/value/state/${esc(fam)}/outcome`),
          at(KIND.LIMITATION, `Familia ${fam}: motivo`, `${db}/value/state/${esc(fam)}/reason`),
        ].filter(Boolean)
      );
    }
    diff.items.push(
      ...[
        at(KIND.FACT, "Edificabilidad: estado", `${db}/value/buildability/state`),
        at(KIND.LIMITATION, "Edificabilidad: motivo", `${db}/value/buildability/reason`),
        at(KIND.LIMITATION, "Fuente citada (sourceId)", `${db}/sourceId`),
        at(KIND.LIMITATION, "Techo de interpretación", `${db}/ceiling`),
      ].filter(Boolean),
      note("Una diferencia entre ediciones clasifica dos instantáneas publicadas; no es avance, ranking ni recomendación."),
    );
  } else diff.items.push(...abstentionItems(at, db));
  sections.push(diff);
  return sections;
}

function licenceSection(record, request) {
  const callKey = "licences";
  const scope = `Círculo de consulta de ${request?.radiusM} m alrededor del punto (direcciones localizadas). No es un ámbito, barrio ni distrito.`;
  const title = "Licencias concedidas en el círculo, por familia";
  if (record.status !== "OK") return [errorSection("licences", title, scope, callKey, record)];
  const at = binder(callKey, record);
  const R = "/structuredContent/result";
  const result = getPointer(record, R);
  const section = { id: "licences", title, scope, callKey, status: result?.kind, items: [], families: [], supports: "/structuredContent/reading/supports/LICENCES_IN_LENS" };
  if (result?.kind !== "EVIDENCE") {
    section.items.push(...abstentionItems(at, R));
    return [section];
  }
  // One entry per family, exactly as Lens lists them. Never combined.
  for (const fam of result.value?.familiesShown || Object.keys(result.value?.perFamily || {})) {
    const count = at(KIND.FACT, FAMILY_LABEL[fam] || fam, `${R}/value/perFamily/${esc(fam)}`, { family: fam });
    const unresolved = at(KIND.LIMITATION, "Filas no localizadas de esta familia en todo el registro (no son ceros)", `${R}/value/coverage/per_family/${esc(fam)}/unresolved`, { family: fam });
    section.families.push({ family: fam, items: [count, unresolved].filter(Boolean) });
  }
  // registerComposition is register-wide metadata. It is kept out of the family tiles so a listed type is
  // never shown next to (or read as part of) the circle's count.
  const contextTypes = Object.keys(getPointer(record, "/structuredContent/registerComposition/typesByFamily") || {}).map((fam) =>
    at(KIND.CONTEXT, `Tipos observados en TODO el registro localizado · ${FAMILY_LABEL[fam] || fam} (no indica presencia en el círculo)`, `/structuredContent/registerComposition/typesByFamily/${esc(fam)}`)
  );
  section.items.push(
    ...[
      at(KIND.FACT, "Ventana de concesión: desde", `${R}/value/window/from`),
      at(KIND.FACT, "Ventana de concesión: hasta", `${R}/value/window/to`),
      at(KIND.LIMITATION, "Ventana recortada a la cobertura (clamped)", `${R}/value/window/clamped`),
      at(KIND.FACT, "Radio aplicado por Lens (m)", `${R}/applied/radiusM`),
      at(KIND.FACT, "Centro aplicado: lon", `${R}/applied/centre/lon`),
      at(KIND.FACT, "Centro aplicado: lat", `${R}/applied/centre/lat`),
      at(KIND.FACT, "Derivación", `${R}/derivation`),
      at(KIND.LIMITATION, "Alcance", `${R}/scope`),
      at(KIND.LIMITATION, "Cobertura del registro", `${R}/value/coverage/coverage_statement`),
      at(KIND.LIMITATION, "Filas no localizadas en todo el registro", `${R}/value/coverage/unresolved_rows`),
      at(KIND.LIMITATION, "Tasa de localización de filas (row_match_rate)", `${R}/value/coverage/row_match_rate`),
      at(KIND.LIMITATION, "Concedida ≠ construida", `${R}/value/ceiling/grantIsNotBuilt`),
      at(KIND.LIMITATION, "Sin tasa de aprobación", `${R}/value/ceiling/noApprovalRate`),
      at(KIND.LIMITATION, "Sin total entre familias", `${R}/value/ceiling/noCrossFamilyTotal`),
      at(KIND.LIMITATION, "Fuente citada (sourceId)", `${R}/sourceId`),
      ...freshnessItems(at, R),
      at(KIND.LIMITATION, "Registros individuales omitidos por el MCP", "/structuredContent/recordsOmitted"),
      at(KIND.CONTEXT, "Composición del registro: alcance", "/structuredContent/registerComposition/scope"),
      at(KIND.CONTEXT, "Composición del registro: nota", "/structuredContent/registerComposition/note"),
      ...contextTypes,
    ].filter(Boolean),
    note("Las tres familias se muestran por separado y no se suman. Una licencia concedida es un acto administrativo, no un edificio construido ni una actividad en funcionamiento comprobada."),
  );
  return [section];
}

function provenanceSections(records, asked = false) {
  return records.map((record, i) => {
    const callKey = `provenance/${i}`;
    const sourceId = record.arguments?.sourceId;
    const title = `Procedencia · ${sourceId}`;
    const scope = asked
      ? "Metadatos de la fuente registrada en Lens que se ha pedido explícitamente (no está citada por ningún resultado de esta consulta)"
      : "Metadatos de la fuente registrada en Lens (citada por un resultado de esta investigación)";
    if (record.status !== "OK") return errorSection(`prov-${sourceId}`, title, scope, callKey, record);
    const at = binder(callKey, record);
    const R = "/structuredContent/result";
    const section = { id: `prov-${sourceId}`, title, scope, callKey, status: getPointer(record, R)?.kind, items: [], supports: "/structuredContent/reading/supports/SOURCE_PROVENANCE" };
    if (section.status !== "EVIDENCE") section.items.push(...abstentionItems(at, R));
    else
      section.items.push(
        ...[
          at(KIND.FACT, "Nombre", `${R}/value/displayName`),
          at(KIND.FACT, "Autoridad", `${R}/value/authority`),
          at(KIND.FACT, "Dataset", `${R}/value/datasetUrl`),
          at(KIND.FACT, "Artefacto", `${R}/value/artifact`),
          ...freshnessItems(at, R),
          at(KIND.LIMITATION, "Evidencia de frescura", `${R}/value/freshnessEvidence`),
          at(KIND.LIMITATION, "Semántica del periodo", `${R}/value/periodSemantics`),
          at(KIND.LIMITATION, "Techo de interpretación", `${R}/value/interpretationCeiling`),
        ].filter(Boolean)
      );
    return section;
  });
}

// The ámbito layer searched when AMBITO_AT_POINT abstained. Described as "capa consultada": metadata
// about the layer, never evidence about the point; no item is a FACT. The abstention reason is repeated
// from the snapshot record so it stays next to the layer description.
function consultedLayerSection(response) {
  const record = response.calls.consultedLayer;
  if (!record) return [];
  const callKey = "layer";
  const sourceId = record.arguments?.sourceId;
  const title = `Capa consultada · ${sourceId}`;
  const scope = "Capa de ámbitos en la que se buscó el punto. Describe la capa, no el punto: no es evidencia positiva sobre él.";
  const reason = binder("snapshot", response.calls.snapshot)(KIND.ABSTENTION, "Motivo de la abstención en el punto (se conserva)", "/structuredContent/ambitoAtPoint/reason");
  if (record.status !== "OK") {
    const sec = errorSection(`layer-${sourceId}`, title, scope, callKey, record);
    sec.items.unshift(...[reason].filter(Boolean));
    return [sec];
  }
  const at = binder(callKey, record);
  const R = "/structuredContent/result";
  const section = { id: `layer-${sourceId}`, title, scope, callKey, status: "CONSULTED_LAYER", lensStatus: getPointer(record, R)?.kind, items: [reason].filter(Boolean), supports: "/structuredContent/reading/supports/SOURCE_PROVENANCE" };
  if (section.lensStatus !== "EVIDENCE") section.items.push(...abstentionItems(at, R));
  else
    section.items.push(
      ...[
        at(KIND.CONTEXT, "Capa: nombre", `${R}/value/displayName`),
        at(KIND.CONTEXT, "Capa: autoridad", `${R}/value/authority`),
        at(KIND.CONTEXT, "Capa: dataset", `${R}/value/datasetUrl`),
        at(KIND.CONTEXT, "Capa: artefacto", `${R}/value/artifact`),
        ...freshnessItems(at, R),
        at(KIND.LIMITATION, "Semántica del periodo de la capa", `${R}/value/periodSemantics`),
        at(KIND.LIMITATION, "Techo de interpretación de la capa", `${R}/value/interpretationCeiling`),
      ].filter(Boolean),
    );
  section.items.push(note("Esta capa se consultó porque el punto no resolvió ningún ámbito. Sus metadatos no prueban nada sobre el punto ni sustituyen la abstención."));
  return [section];
}

// `include` (optional, v0.2 question-driven): section ids to keep, a trailing `*` meaning "starts with". Calls
// that were not made (null) produce no section. Without `include` the view is exactly the v0.1 one.
const matchesInclude = (id, include) => include.some((p) => (p.endsWith("*") ? id.startsWith(p.slice(0, -1)) : id === p));

export function buildView(response, { include } = {}) {
  const { request, calls, mcp } = response;
  const sections = [
    ...(calls.snapshot ? ambitoSections(calls.snapshot) : []),
    ...consultedLayerSection(response),
    ...(calls.licences ? licenceSection(calls.licences, request) : []),
    ...provenanceSections(calls.provenance || [], response.routing?.intent === "SOURCE_PROVENANCE"),
  ];
  if (!(calls.provenance || []).length)
    sections.push({
      id: "prov-none",
      title: "Procedencia",
      scope: "Fuentes citadas por resultados con evidencia",
      status: "NOT_QUERIED",
      items: [note("Ningún resultado con evidencia citó un sourceId; no se ha consultado procedencia de fuentes citadas. Las abstenciones no citan fuente.")],
    });
  return { request, mcp, sections: include ? sections.filter((x) => matchesInclude(x.id, include)) : sections };
}

// Every item of a view, including per-family items.
export function allItems(view) {
  return view.sections.flatMap((s) => [...s.items, ...(s.families || []).flatMap((f) => f.items)]);
}

export function callRecord(response, callKey) {
  if (callKey.startsWith("provenance/")) return response.calls.provenance?.[Number(callKey.split("/")[1])];
  if (callKey === "layer") return response.calls.consultedLayer;
  return response.calls[callKey];
}
