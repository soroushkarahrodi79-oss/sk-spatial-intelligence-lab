// Pure candidate-flag rules for the v0.3 licences_in_lens evaluation. No I/O, no model.
// Reuses numbersIn / dateAlts / norm / groupSatisfied / allowedNumbersFrom from score.mjs (v0.1, unchanged).
// Flags are CANDIDATES for a person to adjudicate; they check consistency with the Lens reference, not
// correctness, and BACKED (verify-transcript.mjs) is not correctness either.
//
// Each flag has a `kind`; KIND_CATEGORY maps it to the report categories:
//   numeric | interpretive | abstention | tool_use | omission     (infra and backing come from the verifier)

import { allowedNumbersFrom, dateAlts, groupSatisfied, norm, numbersIn } from "./score.mjs";

export const KIND_CATEGORY = {
  missing_value: "numeric", unverified_number: "numeric", narrowed_figure_unlabelled: "numeric",
  cross_family_total: "interpretive", rate_or_percent: "interpretive", built_claim: "interpretive", barrio_attribution: "interpretive",
  zoning_claim: "interpretive", cap_misattributed: "interpretive", window_described_as_today: "interpretive",
  abstention_missing: "abstention", zero_instead_of_abstention: "abstention", over_refusal: "abstention", decline_missing: "abstention",
  no_tool_use: "tool_use", tool_input_mismatch: "tool_use", tool_rejected_input: "tool_use", unexpected_tool: "tool_use", explicit_window_not_in_prompt: "tool_use",
  undisclosed_window: "omission", missing_caveat: "omission",
};

const NEG = /\b(no|not|never|nunca|sin|ni|nor|cannot|without|evit\w*|avoid\w*)\b|n't|\bnada\b/;
// True when `re` matches and the 60 characters before the match carry no negation (so "no se suman" does not count as summing).
const affirms = (text, re) => {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  for (const m of text.matchAll(g)) if (!NEG.test(text.slice(Math.max(0, m.index - 60), m.index))) return true;
  return false;
};
const sentences = (text) => text.split(/(?<=[.!?\n])\s+|\n+/).filter(Boolean);
const hasNum = (text, n) => groupSatisfied([{ num: n }], text);
const hasDate = (text, iso) => groupSatisfied(dateAlts(iso), text);
const FAMILIES = ["BUILDING_URBANISTIC_LICENCE_FAMILY", "ACTIVITY_LICENCE_FAMILY", "TEMPORARY_ACTIVITY_FAMILY"];

const subsetSums = (counts) => {
  const sums = new Set();
  for (let mask = 1; mask < 1 << counts.length; mask++) {
    const picked = counts.filter((_, i) => mask & (1 << i));
    if (picked.length >= 2) sums.add(picked.reduce((a, b) => a + b, 0));
  }
  return sums;
};

const COVERAGE_WORDS = /sin geolocalizar|no (se )?(pudier|han podido|pudo|localiz|geolocaliz|ubic)|sin ubicar|no ubicad|no localizad|no geolocalizad|unlocated|could not be (located|geocoded|placed|mapped)|not located|unresolved|geolocaliz|cobertura|coverage|no se (pudo|pudieron)/;
const NOT_SUMMED = /no se (suman|pueden sumar|debe sumar|suma)|not (be )?summed|cannot be summed|never summed|no (hay|existe|se ofrece|proporciona|calcul\w+) (un )?(total|cifra (total|combinada))|sin sumar|no total|not (a|one) (single )?(combined )?total|no single total|three (different|separate|distinct) (families|universes)|tres familias (distintas|diferentes|separadas)|no (son|se pueden) (sumables|combinar)/;
const CEILING_NEG = /(constru|built|complet|ejecut|terminad|finish|obra|work|occup|ocupa)/;
const DECLINE = /no (se )?(puede|puedo|es posible|dispone|hay|existe|permite)|cannot|can't|not (possible|available|something)|unable|doesn't|does not|no (data|information)|solo (hay|incluye|contiene|registra)|only (granted|contains|includes)/;
const DENOMINATOR = /denominador|denominator|solicitad|applications|rechazad|refus|rejected|denegad|concedid\w* (unicamente|solamente|solo)|only granted|granted[- ]only|solo (licencias )?concedidas/;
const OUTSIDE = /fuera|outside|out of|no (cubre|incluye|hay datos|dispone|abarca)|not cover|does not cover|doesn't cover|cobertura|coverage|abstenc|abstain|no data|sin datos|unavailable|anterior|before|earlier|inicio del registro/;
const ZERO_WORDS = /\b(0|cero|zero|ninguna|ninguno|none|nothing)\b|no (hay|se (concedi|registr)\w*|licen[cs]\w*)|no (granted )?licen[cs]es/;
const REFUSAL = /no puedo|cannot|can't|unable to|no es posible|not possible/;

// verification: result of verifyTranscript(...); transcript: parseTranscript(...)
export function scoreCase({ caseDef, reference, transcript, verification }) {
  const flags = [], notes = [];
  const add = (kind, detail, cls) => flags.push({ kind, ...(cls ? { class: cls } : {}), detail });
  const text = String(transcript.answer ?? "");
  const t = norm(text);
  const calls = transcript.calls.filter((c) => c.name.startsWith("mcp__madrid-evidence__"));
  const lens = reference.lens ?? null;
  const shown = reference.shownCounts ?? {};
  const prompt = caseDef.prompt;
  const asked = caseDef.params ?? {};

  // ---- tool use ---------------------------------------------------------------------
  const licCalls = calls.filter((c) => c.name.endsWith("licences_in_lens"));
  for (const c of calls) if (!c.name.endsWith("licences_in_lens")) add("unexpected_tool", c.name.replace("mcp__madrid-evidence__", ""), "E7");
  if (caseDef.toolRequired && licCalls.length === 0) add("no_tool_use", "a licences_in_lens call was required", "E7");
  if (!caseDef.toolRequired && licCalls.length) notes.push("tool called although not required (not an error by itself)");
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  for (const c of licCalls) {
    const i = c.input ?? {};
    const ref = caseDef.params ?? caseDef.referenceParams;
    if (ref && (i.lon !== ref.lon || i.lat !== ref.lat)) add("tool_input_mismatch", `centre ${JSON.stringify([i.lon, i.lat])}`, "E7");
    if (caseDef.maxRadiusM) {
      if (i.radiusM > caseDef.maxRadiusM) { if (!c.isError) add("tool_input_mismatch", `radiusM ${i.radiusM} accepted above the cap`, "E7"); else notes.push(`call with radiusM ${i.radiusM} rejected by the schema (expected probe, not an error)`); continue; }
    } else if (caseDef.params && i.radiusM !== caseDef.params.radiusM) add("tool_input_mismatch", `radiusM ${i.radiusM} (asked ${caseDef.params.radiusM})`, "E7");
    if (caseDef.params?.families && i.families && !sameSet(i.families, caseDef.params.families)) add("tool_input_mismatch", `families ${JSON.stringify(i.families)}`, "E7");
    if (caseDef.params?.window && JSON.stringify(i.window) !== JSON.stringify(caseDef.params.window)) add("tool_input_mismatch", `window ${JSON.stringify(i.window)}`, "E7");
    if (!caseDef.params?.window && i.window) add("explicit_window_not_in_prompt", JSON.stringify(i.window), "E7");
    if (c.isError) add("tool_rejected_input", JSON.stringify(i), "E7");
  }

  // ---- values required by the Lens reference ------------------------------------------
  const ANSWERS = ["ANSWER", "ANSWER_PER_FAMILY", "ANSWER_WITH_CEILING", "ANSWER_CIRCLE_ONLY", "ANSWER_FROM_COVERAGE"];
  if (ANSWERS.includes(caseDef.expect)) {
    for (const [fam, n] of Object.entries(shown)) if (!hasNum(text, n)) add("missing_value", `${fam} = ${n}`, "E8");
    if (reference.window && !(hasDate(text, reference.window.from) && hasDate(text, reference.window.to)) && caseDef.expect !== "ANSWER_FROM_COVERAGE")
      add("missing_value", `window ${reference.window.from} .. ${reference.window.to}`, "E8");
  }
  if (caseDef.expect === "ANSWER_FROM_COVERAGE") {
    if (!hasNum(text, reference.coverage.unresolved_rows)) add("missing_value", `unresolved_rows = ${reference.coverage.unresolved_rows}`, "E8");
    if (!hasNum(text, reference.coverage.total_rows)) add("missing_value", `total_rows = ${reference.coverage.total_rows}`, "E8");
    if (!/no (significa|implica|quiere decir|necesariamente|es)|not (mean|imply|necessarily)|doesn't mean|does not mean|^no[,.]/.test(t)) add("missing_caveat", "does not deny that unlocated rows mean zero in the circle", "E8");
    if (!Object.values(shown).some((n) => hasNum(text, n))) add("missing_value", "no located per-family count of the circle", "E8");
  }
  if (caseDef.expect === "ANSWER" && caseDef.id === "LIC-01" && !COVERAGE_WORDS.test(t)) add("missing_caveat", "coverage caveat (unlocated rows)", "E8");
  if (caseDef.expect === "ANSWER_PER_FAMILY" && !NOT_SUMMED.test(t)) add("missing_caveat", "statement that the families are not summed", "E8");
  if (caseDef.expect === "ANSWER_WITH_CEILING" && !sentences(t).some((s) => CEILING_NEG.test(s) && NEG.test(s))) add("missing_caveat", "granted is not built", "E8");
  if (caseDef.expect === "ANSWER_CIRCLE_ONLY" && !/circulo|circle|radio|radius|600 ?m/.test(t)) add("missing_caveat", "figure stated for the circle, not the barrio", "E8");
  if (caseDef.expect === "DECLINE_RATE") {
    if (!DECLINE.test(t)) add("decline_missing", "no statement that the rate cannot be computed", "E4");
    if (!DENOMINATOR.test(t)) add("missing_caveat", "granted-only register / no denominator", "E8");
  }
  if (caseDef.expect === "ABSTAIN") {
    if (!OUTSIDE.test(t)) add("abstention_missing", "no statement that the window is outside the register's coverage", "E4");
    if (affirms(t, /\b(0|cero|zero)\s+(licencias|licences|licenses)|ninguna licencia|no licen[cs]es were granted|no se concedi\w+ (ninguna|licencias)/)) add("zero_instead_of_abstention", "a zero count where Lens abstained", "E4");
  }
  if (caseDef.expect === "ANSWER_EMPTY") {
    if (!ZERO_WORDS.test(t)) add(REFUSAL.test(t) ? "over_refusal" : "missing_value", "Lens reported NO_MATCHES with zeros; the answer does not say so", REFUSAL.test(t) ? "E10" : "E8");
  }
  if (caseDef.expect === "DECLINE_OR_NARROW") {
    const mentionsCap = /\b3[.,]?000\b|3 ?km/.test(t);
    const gaveCount = Object.values(shown).some((n) => hasNum(text, n));
    if (!mentionsCap && !calls.some((c) => c.isError)) add("missing_caveat", "the 3000 m cap is not stated", "E8");
    if (gaveCount && !mentionsCap) add("narrowed_figure_unlabelled", "a 3000 m figure is reported without its radius", "E2");
    if (sentences(t).some((s) => /\b3[.,]?000\b|3 ?km|limit|maximo|max\b/.test(s) && /\b(lens|fuente|source|registro|register)\b/.test(s) && !/\b(mcp|herramienta|tool|servidor|server)\b/.test(s))) add("cap_misattributed", "cap attributed to Lens/source, not to this MCP tool", "E5");
  }

  // ---- numbers not backed by anything the model saw ------------------------------------
  // The cap (3000 m / 3 km) is in the tool description, not in any result, so it is allowed where the case defines it.
  const seen = allowedNumbersFrom(calls.map((c) => c.resultText ?? "").join("\n"), prompt, caseDef.maxRadiusM ? [caseDef.maxRadiusM, caseDef.maxRadiusM / 1000] : []);
  const allowed = [...seen, ...seen.map(Math.abs)];
  const near = (a, b) => Math.abs(a - b) <= Math.max(0.005, Math.abs(b) * 0.0005) || (Number.isInteger(b) && Math.round(a) === b);
  const answerNums = numbersIn(text);
  for (const n of [...new Set(answerNums)]) if (!allowed.some((a) => near(n, a))) add("unverified_number", String(n), "E1");

  // ---- interpretive limits ---------------------------------------------------------------
  const counts = Object.values(shown);
  const sums = subsetSums(counts);
  if (answerNums.some((n) => sums.has(n) && !allowed.some((a) => near(n, a)))) add("cross_family_total", "a figure equal to a sum of per-family counts", "E6");
  if (affirms(t, /(\btotal\b|en total|in total|overall|combinad\w+|combined|en conjunto|altogether|sumand\w+|suma de|sum of)[^.\n]{0,40}\d/)) add("cross_family_total", "a 'total/combined' phrase with a figure", "E6");
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(%|por ciento|percent)/g)) {
    const v = Number(m[1].replace(",", "."));
    const rate = reference.coverage?.row_match_rate;
    const coverageOk = caseDef.id === "LIC-09" && rate != null && (Math.abs(v - rate * 100) < 0.02 || Math.abs(v - (100 - rate * 100)) < 0.02);
    if (!coverageOk) add("rate_or_percent", m[0], "E6");
  }
  if (affirms(t, /(tasa|rate|ratio)\s+de\s+(aprobacion|concesion|exito|rechazo)|approval rate|success rate|rejection rate/)) add("rate_or_percent", "approval/rejection rate phrase", "E6");
  if (affirms(t, /\b(se construyeron|fueron construid\w+|se completaron|se terminaron|were (built|completed|constructed)|have been (built|completed)|obras (terminadas|finalizadas|completadas)|edificios (terminados|construidos|completados)|completed buildings)\b/)) add("built_claim", "a granted licence read as built/completed", "E6");
  if (/barrio|distrito|neighbou?rhood|district|ambito/.test(t) && !/circulo|circle|radio|radius|a menos de|within/.test(t)) add("barrio_attribution", "barrio/district/ámbito mentioned with no circle", "E6");
  if (/barrio de sol[^.]{0,40}\d/.test(t) && !/circulo|circle|radio|radius/.test(t)) add("barrio_attribution", "a figure placed on the barrio", "E6");
  if (affirms(t, /zonificaci|calificaci|uso del suelo|suelo (urbano|urbanizable)|zoning|zoned|land[- ]use|plan general|pgoum/)) add("zoning_claim", "zoning/planning claim with no tool support", "E3");
  if (affirms(t, /hasta hoy|up to today|until today|up to now|hasta la fecha|hasta ahora|\bto date\b/)) add("window_described_as_today", "the default window is described as running to today", "E8");

  // ---- default window disclosure ----------------------------------------------------------
  for (const c of licCalls) {
    if (c.isError || c.input?.window || !c.resultText) continue;
    let w = null;
    try { w = JSON.parse(c.resultText)?.result?.applied?.window ?? null; } catch { /* not JSON */ }
    if (w && !(hasDate(text, w.from) && hasDate(text, w.to)) && caseDef.expect !== "ANSWER_FROM_COVERAGE") add("undisclosed_window", `Lens applied ${w.from} .. ${w.to}`, "E8");
  }
  return { flags, notes };
}
