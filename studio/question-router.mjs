// Deterministic question router for Spatial Investigation Studio v0.2 (Question-Driven Evidence).
//
// Maps a question to ONE of four intents that correspond one-to-one to existing Madrid Evidence MCP tools,
// or abstains. No model, no network, no geocoding, no spatial computation. Spanish only.
//
// Two entry points:
//   routeGuided({ guided, sourceId })  structured intent chosen from the closed list; validated, never matched on text.
//   routeText(text)                    small explicit Spanish lexicon; abstains on anything it cannot assign.
//
// The router never reads coordinates, radius, dates or ámbito codes from text. Spatial arguments come from the
// interface controls and are attached later by `planCalls`. Abstention always carries a reason, a message and
// alternatives; nothing is executed on an abstention. Partial answers are only ever OFFERED as an alternative.

export const ROUTER_VERSION = "question-router/1";
export const MAX_QUESTION_CHARS = 200;

export const INTENT = Object.freeze({
  AMBITO_AT_POINT: "AMBITO_AT_POINT",
  LICENCES_IN_CIRCLE: "LICENCES_IN_CIRCLE",
  EDITION_CHANGE: "EDITION_CHANGE",
  SOURCE_PROVENANCE: "SOURCE_PROVENANCE",
});

// Closed table of sources a provenance question may name (ids from Lens's source registry).
export const SOURCES = Object.freeze({
  urban_licences: { label: "las licencias urbanísticas", short: "Licencias urbanísticas", subjects: ["licencia", "licencias"] },
  planning_ambito_geometry: { label: "la geometría de los ámbitos", short: "Geometría de los ámbitos", subjects: ["geometria", "geometrias", "poligono", "poligonos"] },
  planning_ambito_state: { label: "el estado y las ediciones de los ámbitos", short: "Estado y ediciones de los ámbitos", subjects: ["estado", "fases", "fase", "ediciones", "edicion"] },
});

// Sections of the evidence view each intent shows (`*` = prefix). The rest stays in the raw response (inspector).
export const INTENTS = Object.freeze({
  AMBITO_AT_POINT: { label: "Identificar el ámbito urbanístico del punto", tool: "ambito_snapshot_at_point", show: ["ambito", "layer-*", "prov-*"], usesPoint: true, usesRadius: false, usesWindow: false },
  LICENCES_IN_CIRCLE: { label: "Consultar las licencias concedidas en el círculo, por familia", tool: "licences_in_lens", show: ["licences", "prov-*"], usesPoint: true, usesRadius: true, usesWindow: true },
  EDITION_CHANGE: { label: "Consultar los cambios entre ediciones del ámbito del punto", tool: "ambito_snapshot_at_point", show: ["ambito", "diff", "layer-*", "prov-*"], usesPoint: true, usesRadius: false, usesWindow: false },
  SOURCE_PROVENANCE: { label: "Consultar la procedencia y las limitaciones de una fuente", tool: "source_provenance", show: ["prov-*"], usesPoint: false, usesRadius: false, usesWindow: false },
});

// The four guided questions. Their text is shown to the user; routing never depends on it.
export const GUIDED = Object.freeze([
  { id: "ambito", intent: INTENT.AMBITO_AT_POINT, text: "¿En qué ámbito urbanístico está el punto?" },
  { id: "licencias", intent: INTENT.LICENCES_IN_CIRCLE, text: "¿Qué licencias se concedieron en el círculo?" },
  { id: "ediciones", intent: INTENT.EDITION_CHANGE, text: "¿Qué cambió entre ediciones en el ámbito del punto?" },
  { id: "procedencia", intent: INTENT.SOURCE_PROVENANCE, needsSource: true, text: (sourceId) => `¿De dónde proceden los datos de ${SOURCES[sourceId].label} y qué límites tienen?` },
]);
const guidedById = new Map(GUIDED.map((g) => [g.id, g]));
const guidedText = (g, sourceId) => (typeof g.text === "function" ? g.text(sourceId) : g.text);

// Public, serialisable description for the interface.
export function questionCatalogue() {
  return {
    routerVersion: ROUTER_VERSION,
    maxQuestionChars: MAX_QUESTION_CHARS,
    guided: GUIDED.map((g) => ({ id: g.id, intent: g.intent, needsSource: Boolean(g.needsSource), text: g.needsSource ? null : g.text })),
    sources: Object.entries(SOURCES).map(([id, s]) => ({ id, label: s.short, question: GUIDED[3].text(id) })),
  };
}

// ----- text normalisation -----
export function normalise(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/(?<![a-z0-9])\.|\.(?![a-z0-9])/g, " ") // keep dots only inside codes such as AOE.00.02
    .replace(/\s+/g, " ")
    .trim();
}

// ----- the lexicon (small and explicit; extend only with a reviewed reason) -----
const WORDS = (s) => new Set(s.split(/\s+/));
const NEUTRAL = WORDS("a al de del la las el los lo un una unos unas en es esta estan este estos que cual cuales cuantas cuantos hay existen existe se y o u para con sobre punto circulo radio aqui alli ahi cerca alrededor dentro entorno entre donde dime dame muestrame muestra mostrar consultar consulta ver quiero saber puedes favor por datos tienen tiene urbanistico urbanistica urbanisticos urbanisticas");
const LIC = WORDS("licencia licencias");
const CONCEDED = WORDS("concedida concedidas concedido concedidos concedieron concedio conceden");
const FAMILY_WORDS = WORDS("familia familias actividad actividades temporal temporales edificacion obra obras");
const AMB = WORDS("ambito ambitos");
const EDITION_MARK = WORDS("edicion ediciones cambio cambios cambio cambiado cambiaron cambia diferencia diferencias difiere modificacion modificaciones modificado");
const PROVENANCE_MARK = WORDS("procedencia proceden procede fuente fuentes origen frescura limites limite limitaciones limitacion");
const ALL_SUBJECT_WORDS = new Set(Object.values(SOURCES).flatMap((s) => s.subjects));

// Things the MCP cannot answer. Evaluated on the normalised text, in this order, before any intent.
const OUT_OF_CAPABILITY = [
  ["CROSS_FAMILY_TOTAL", /\b(total|totales|suma|sumar|sumas|sumando|sumalas|sumalos|conjunto|combinad[oa]s?|agregad[oa]s?|globales?|todas juntas)\b/],
  ["RATE_OR_PERCENTAGE", /\b(tasa|tasas|porcentaje|porcentajes|ratio|proporcion|aprobacion|aprobadas?|rechazo|rechazadas?|denegadas?|exito)\b/],
  ["BUILT_OR_COMPLETED", /\b(construid[oa]s?|terminad[oa]s?|finalizad[oa]s?|completad[oa]s?|ejecutad[oa]s?|edificios?|viviendas?|pisos?|casas?|ocupad[oa]s?|habitad[oa]s?|funcionando|obra nueva)\b/],
  ["BARRIO_OR_DISTRICT", /\b(barrios?|distritos?|vecindarios?|municipios?)\b/],
  ["ZONING_OR_LANDUSE", /\b(zonificacion|calificacion|clasificacion|suelo|edificabilidad|planeamiento|normativa|pgoum|que se puede)\b/],
  ["CAUSE_OR_EXPLANATION", /\b(por que|porque|causa|causas|razon|razones|explica|explicame|explicar)\b/],
  ["NEAREST_AMBITO", /\b(mas cercan[oa]s?|mas proxim[oa]s?|vecin[oa]s?)\b/],
  ["LICENCE_TYPES", /\b(tipos?|primera ocupacion|demolicion|cambio de uso|declaracion responsable|obra mayor|obra menor)\b/],
  ["COMPARISON_OR_RANKING", /\b(compar\w*|ranking|mejor|peor|mas que|menos que|recomend\w*|conviene|deberia)\b/],
  ["TREND_OR_PREDICTION", /\b(tendencia|tendencias|evolucion|crecimiento|aumento|disminucion|predic\w*|futuro)\b/],
  ["LEGAL_DETERMINATION", /\b(legal|legales|ilegal|permitid[oa]s?|licit[oa]s?|cumple|cumplen)\b/],
];
const AMBITO_CODE = /\b[a-z]{3}\.\d{1,3}(\.\d{1,3})?/;
// Anything that would carry a point, radius, window or ámbito code. Those come ONLY from the controls.
const PARAMETER_WORDS = /\b(metros?|kilometros?|km|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|anos?|meses|mes|semanas?|trimestres?|hoy|ayer|recientes?|ultim[oa]s?|pasad[oa]s?|desde|hasta)\b/;

export const REASON_MESSAGE = Object.freeze({
  EMPTY: "La pregunta está vacía.",
  TOO_LONG: `La pregunta supera ${MAX_QUESTION_CHARS} caracteres.`,
  AMBITO_BY_CODE: "Ninguna herramienta del MCP consulta un ámbito por su código; solo se identifica el ámbito que contiene el punto de los controles.",
  PARAMETERS_IN_TEXT: "El punto, el radio y la ventana se toman únicamente de los controles. El texto no puede modificarlos: usa los controles y repite la pregunta sin cifras, fechas ni distancias.",
  CROSS_FAMILY_TOTAL: "Las licencias se cuentan por familia y nunca se suman: no existe un total entre familias, tampoco como cálculo aproximado.",
  RATE_OR_PERCENTAGE: "El registro contiene solo licencias concedidas: no hay solicitudes ni denegaciones, así que no existe tasa de aprobación, de rechazo ni porcentaje.",
  BUILT_OR_COMPLETED: "Una licencia concedida es un acto administrativo, no una obra construida ni una actividad en funcionamiento: el MCP no puede contar edificios, viviendas ni obras terminadas.",
  BARRIO_OR_DISTRICT: "Los recuentos son del círculo de consulta, no de un barrio ni de un distrito.",
  ZONING_OR_LANDUSE: "El MCP no devuelve zonificación, clase de suelo, edificabilidad ni qué se puede construir. Una ausencia de ámbito no permite concluir nada sobre el planeamiento aplicable.",
  CAUSE_OR_EXPLANATION: "Ninguna herramienta del MCP devuelve causas ni explicaciones.",
  NEAREST_AMBITO: "El MCP no tiene consulta de proximidad: no puede decir cuál es el ámbito más cercano.",
  LICENCE_TYPES: "El MCP devuelve recuentos por familia; no desglosa licencias por tipo dentro de un círculo.",
  COMPARISON_OR_RANKING: "El MCP no compara, ordena ni recomienda.",
  TREND_OR_PREDICTION: "El MCP no calcula tendencias ni predicciones.",
  LEGAL_DETERMINATION: "Los resultados no son una determinación legal ni urbanística.",
  UNINTERPRETED_TERMS: "La pregunta contiene términos que el enrutador no puede asignar a ninguna capacidad del MCP. No se ignoran: se rechaza la pregunta.",
  NO_INTENT: "No se reconoce ninguna de las cuatro preguntas admitidas.",
  AMBIGUOUS_INTENT: "La pregunta encaja con más de una capacidad del MCP (o mezcla ámbito y licencias, cuyos recuentos son del círculo, no del ámbito). Elige una.",
  SOURCE_NOT_NAMED: "Las preguntas de procedencia exigen nombrar la fuente. Elige una de las fuentes disponibles.",
  AMBIGUOUS_SOURCE: "La pregunta nombra más de una fuente. Elige una.",
  UNKNOWN_SOURCE: "Esa fuente no está entre las admitidas.",
});

// Alternatives are suggestions the user must click; they are never executed automatically.
const alt = (guided, sourceId, why, partial = false) => ({ guided, ...(sourceId ? { sourceId } : {}), text: guidedText(guidedById.get(guided), sourceId), why, answersOnlyPart: partial });
const ALL_ALTERNATIVES = () => [alt("ambito"), alt("licencias"), alt("ediciones"), ...Object.keys(SOURCES).map((s) => alt("procedencia", s))].map((a) => ({ ...a, why: a.why ?? "Pregunta admitida" }));
const SUGGEST = {
  CROSS_FAMILY_TOTAL: () => [alt("licencias", undefined, "Recuento por familia, sin total", true)],
  RATE_OR_PERCENTAGE: () => [alt("licencias", undefined, "Recuentos de licencias concedidas, sin tasas", true), alt("procedencia", "urban_licences", "Qué contiene el registro")],
  BUILT_OR_COMPLETED: () => [alt("licencias", undefined, "Licencias concedidas (no obras construidas)", true), alt("procedencia", "urban_licences", "Qué contiene el registro")],
  BARRIO_OR_DISTRICT: () => [alt("licencias", undefined, "Recuento en el círculo, no en el barrio", true)],
  ZONING_OR_LANDUSE: () => [alt("ambito", undefined, "Ámbito que contiene el punto, sin zonificación", true), alt("procedencia", "planning_ambito_geometry", "Qué dice y qué no dice la capa de ámbitos")],
  NEAREST_AMBITO: () => [alt("ambito", undefined, "Solo el ámbito que contiene el punto", true)],
  LICENCE_TYPES: () => [alt("licencias", undefined, "Recuento por familia, sin tipos", true), alt("procedencia", "urban_licences", "Qué contiene el registro")],
  AMBITO_BY_CODE: () => [alt("ambito", undefined, "El ámbito del punto de los controles")],
};

const base = (via, question) => ({ routerVersion: ROUTER_VERSION, via, question, executed: false });
const abstain = (via, question, reason, extra = {}) => ({
  ...base(via, question),
  status: "ABSTAIN",
  reason,
  message: REASON_MESSAGE[reason],
  recognized: [],
  alternatives: (SUGGEST[reason]?.() ?? ALL_ALTERNATIVES()),
  ...extra,
});
const routed = (via, question, intent, sourceId, recognized, notes = []) => ({
  ...base(via, question),
  status: "ROUTED",
  intent,
  intentLabel: INTENTS[intent].label,
  tool: INTENTS[intent].tool,
  ...(sourceId ? { sourceId } : {}),
  show: INTENTS[intent].show,
  recognized,
  notes,
  alternatives: [],
});

const NOTES = {
  [INTENT.AMBITO_AT_POINT]: ["Se identifica el ámbito urbanístico que contiene el punto de los controles (consulta de la capa publicada de ámbitos)."],
  [INTENT.LICENCES_IN_CIRCLE]: ["El MCP devuelve las tres familias de licencias por separado; no se filtra por familia ni se suman.", "El recuento corresponde al círculo de consulta, no a un ámbito, barrio ni distrito."],
  [INTENT.EDITION_CHANGE]: ["Se muestra la identidad del ámbito del punto y la diferencia entre ediciones. La misma llamada devuelve también las fases publicadas: no se muestran como sección y están en la respuesta original (Ver origen → Respuesta MCP original)."],
  [INTENT.SOURCE_PROVENANCE]: ["Se consulta solo la procedencia y los límites de la fuente indicada; no se usa el punto de los controles."],
};

export function routeGuided({ guided, sourceId } = {}) {
  const g = guidedById.get(guided);
  if (!g) throw new RangeError(`unknown guided question: ${JSON.stringify(guided)}`);
  if (g.needsSource) {
    if (sourceId === undefined || sourceId === null || sourceId === "") return abstain("guided", "Pregunta guiada de procedencia", "SOURCE_NOT_NAMED", { alternatives: Object.keys(SOURCES).map((s) => alt("procedencia", s)) });
    if (!Object.hasOwn(SOURCES, sourceId)) return abstain("guided", "Pregunta guiada de procedencia", "UNKNOWN_SOURCE", { alternatives: Object.keys(SOURCES).map((s) => alt("procedencia", s)) });
  } else if (sourceId !== undefined) throw new RangeError("sourceId is only valid for the provenance question");
  const question = guidedText(g, sourceId);
  return routed("guided", question, g.intent, g.needsSource ? sourceId : undefined, [`pregunta guiada: ${g.id}`], NOTES[g.intent]);
}

export function routeText(text) {
  const question = typeof text === "string" ? text : "";
  const via = "text";
  if (typeof text !== "string" || question.trim() === "") return abstain(via, question, "EMPTY");
  if (question.length > MAX_QUESTION_CHARS) return abstain(via, question.slice(0, MAX_QUESTION_CHARS), "TOO_LONG");
  const n = normalise(question);

  if (AMBITO_CODE.test(n)) return abstain(via, question, "AMBITO_BY_CODE");
  if (/\d/.test(n) || PARAMETER_WORDS.test(n)) return abstain(via, question, "PARAMETERS_IN_TEXT");
  for (const [reason, re] of OUT_OF_CAPABILITY) {
    if (!re.test(n)) continue;
    return abstain(via, question, reason);
  }

  const tokens = n.split(" ").filter(Boolean);
  const has = (set) => tokens.filter((t) => set.has(t));
  const lic = has(LIC), amb = has(AMB), ed = has(EDITION_MARK), prov = has(PROVENANCE_MARK), conc = has(CONCEDED), fam = has(FAMILY_WORDS);
  const subjects = Object.entries(SOURCES).filter(([, s]) => tokens.some((t) => s.subjects.includes(t))).map(([id]) => id);
  const known = new Set([...NEUTRAL, ...LIC, ...CONCEDED, ...FAMILY_WORDS, ...AMB, ...EDITION_MARK, ...PROVENANCE_MARK, ...ALL_SUBJECT_WORDS]);
  const residual = [...new Set(tokens.filter((t) => !known.has(t)))];
  if (residual.length) return abstain(via, question, "UNINTERPRETED_TERMS", { residual, message: `${REASON_MESSAGE.UNINTERPRETED_TERMS} Sin interpretar: ${residual.join(", ")}.` });

  const recognized = [...new Set([...lic, ...conc, ...fam, ...amb, ...ed, ...prov])];
  if (prov.length) {
    if (subjects.length === 0) return abstain(via, question, "SOURCE_NOT_NAMED", { alternatives: Object.keys(SOURCES).map((s) => alt("procedencia", s)) });
    if (subjects.length > 1) return abstain(via, question, "AMBIGUOUS_SOURCE", { alternatives: Object.keys(SOURCES).map((s) => alt("procedencia", s)) });
    return routed(via, question, INTENT.SOURCE_PROVENANCE, subjects[0], [...recognized, ...tokens.filter((t) => SOURCES[subjects[0]].subjects.includes(t))].filter((v, i, a) => a.indexOf(v) === i), NOTES[INTENT.SOURCE_PROVENANCE]);
  }
  if (ed.length) {
    if (lic.length) return abstain(via, question, "AMBIGUOUS_INTENT");
    if (!amb.length) return abstain(via, question, "NO_INTENT");
    return routed(via, question, INTENT.EDITION_CHANGE, undefined, recognized, NOTES[INTENT.EDITION_CHANGE]);
  }
  if (lic.length) {
    if (amb.length) return abstain(via, question, "AMBIGUOUS_INTENT");
    return routed(via, question, INTENT.LICENCES_IN_CIRCLE, undefined, recognized, NOTES[INTENT.LICENCES_IN_CIRCLE]);
  }
  if (amb.length) return routed(via, question, INTENT.AMBITO_AT_POINT, undefined, recognized, NOTES[INTENT.AMBITO_AT_POINT]);
  return abstain(via, question, "NO_INTENT");
}

// Calls to run for a routed question. The ONLY place tools and arguments are assembled. Spatial arguments
// come from `request` (the validated controls); nothing is read from the question.
export function planCalls(route, request) {
  if (route.status !== "ROUTED") return [];
  const { lon, lat, radiusM, window } = request;
  switch (route.intent) {
    case INTENT.AMBITO_AT_POINT:
    case INTENT.EDITION_CHANGE:
      return [{ tool: "ambito_snapshot_at_point", arguments: { lon, lat } }];
    case INTENT.LICENCES_IN_CIRCLE:
      return [{ tool: "licences_in_lens", arguments: { lon, lat, radiusM, ...(window ? { window } : {}) } }];
    case INTENT.SOURCE_PROVENANCE:
      return [{ tool: "source_provenance", arguments: { sourceId: route.sourceId } }];
    default:
      throw new Error(`no plan for ${route.intent}`);
  }
}

// What the interpretation card shows: the question, the intent, the tool and the arguments with their origin.
export function interpretation(route, request) {
  if (route.status !== "ROUTED") return null;
  const spec = INTENTS[route.intent];
  const args = planCalls(route, request)[0].arguments;
  const origin = {};
  for (const k of Object.keys(args)) origin[k] = k === "sourceId" ? "fuente elegida" : "controles de la interfaz";
  return { question: route.question, intent: route.intent, intentLabel: spec.label, tool: spec.tool, arguments: args, argumentOrigin: origin, recognized: route.recognized, notes: route.notes, via: route.via, routerVersion: route.routerVersion };
}
