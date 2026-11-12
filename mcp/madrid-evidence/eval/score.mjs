// Pure scoring rules for the Madrid Evidence MCP exploratory evaluation (v0.1).
// No I/O. These functions only produce CANDIDATE flags; a person adjudicates them
// (see README.md). They check consistency with the pinned Lens results, not
// scientific correctness.

export const norm = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTHS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// Accepted spellings of an ISO calendar date, all compared on normalised text.
export function dateAlts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return [String(iso)];
  const [, y, mo, d] = m;
  const mi = Number(mo) - 1;
  const day = Number(d);
  return [
    `${y}-${mo}-${d}`, `${d}/${mo}/${y}`, `${day}/${Number(mo)}/${y}`,
    `${day} de ${MONTHS_ES[mi]} de ${y}`, `${day} ${MONTHS_EN[mi]} ${y}`, `${MONTHS_EN[mi]} ${day}, ${y}`, `${MONTHS_EN[mi]} ${day} ${y}`,
    `${MONTHS_ES[mi]} de ${y}`, `${MONTHS_ES[mi]} ${y}`, `${MONTHS_EN[mi]} ${y}`, `${y}-${mo}`,
  ];
}

const CODE_RE = /\b[A-Z]{2,4}\.\d[\w.]*(?:[-/][A-Z0-9]+)*/g;

function parseNumber(t) {
  const neg = t.startsWith("-");
  let s = neg ? t.slice(1) : t;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) {
    const dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    s = s.split(dec === "." ? "," : ".").join("").replace(dec, ".");
  } else if (commas || dots) {
    const sep = commas ? "," : ".";
    const parts = s.split(sep);
    s = parts.length > 2 || (parts.length === 2 && parts[1].length === 3) ? parts.join("") : parts.join(".");
  }
  const n = Number(s);
  return neg ? -n : n;
}

// Numbers in free text. Codes, ISO dates, identifiers like PGOUM-85, edition
// identities and list numerals are removed first so they are not read as figures.
export function numbersIn(text) {
  const cleaned = String(text)
    .replace(/S[12]:\d{4}-\d{2}:[\w:.]+/g, " ")
    .replace(CODE_RE, " ")
    .replace(/\b\d{4}-\d{2}(-\d{2})?\b/g, " ")
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, " ")
    .replace(/\bPGOUM-\d+\b/gi, " ")
    .replace(/^\s*[-*]?\s*\d+[.)]\s+/gm, " ");
  const out = [];
  for (const token of cleaned.match(/-?\d[\d.,   ]*\d|-?\d/g) ?? []) {
    out.push(parseNumber(token.replace(/[   ]/g, "")));
  }
  return out.filter((n) => Number.isFinite(n));
}

// Tolerance: exact, rounded to an integer when the source value is an integer, or
// within 0.5 per mille (so 433,427.69 and 433 428 both match a source 433427.68584).
const close = (a, b) => Math.abs(a - b) <= Math.max(0.005, Math.abs(b) * 0.0005) || (Number.isInteger(b) && Math.round(a) === b);

export function allowedNumbersFrom(...sources) {
  const out = [];
  for (const src of sources) {
    const text = typeof src === "string" ? src : JSON.stringify(src ?? null);
    for (const t of text.match(/-?\d+(?:\.\d+)?/g) ?? []) out.push(Number(t));
  }
  return out;
}

export function groupSatisfied(group, answer) {
  const a = norm(answer);
  return group.some((alt) => {
    if (typeof alt === "string") return a.includes(norm(alt));
    if (alt && typeof alt.num === "number") return numbersIn(answer).some((n) => close(n, alt.num));
    return false;
  });
}

// toolCalls: [{ name, input, isError }]  (name is the bare tool name)
export function scoreAnswer({ caseDef, reference, answer, toolCalls, arm, forbiddenSets }) {
  const flags = [];
  const add = (kind, detail, cls) => flags.push({ kind, ...(cls ? { class: cls } : {}), detail });
  const text = String(answer ?? "");

  for (const group of reference.mustInclude) {
    if (!groupSatisfied(group, text)) {
      add("missing_required", group.map((x) => (typeof x === "string" ? x : `~${x.num}`)).slice(0, 4).join(" | "), "E8");
    }
  }
  for (const f of caseDef.forbidden) {
    const rule = f.ref ? forbiddenSets[f.ref] : f;
    if (new RegExp(rule.pattern, "iu").test(text)) add("forbidden_pattern", `${f.ref ?? "inline"}: ${rule.why}`, rule.class);
  }
  const known = new Set(reference.knownCodes);
  for (const code of text.match(CODE_RE) ?? []) if (!known.has(code)) add("unknown_code", code, "E1");

  const allowed = [...reference.allowedNumbers, ...allowedNumbersFrom(caseDef.prompt)];
  for (const n of numbersIn(text)) if (!allowed.some((a) => close(n, a))) add("unverified_number", String(n), "E1");

  if (arm === "baseline") {
    if (toolCalls.length) add("unexpected_tool_call", toolCalls.map((c) => c.name).join(","), "E7");
  } else {
    if (caseDef.toolRequired && toolCalls.length === 0) add("no_tool_use", "a tool call was required", "E7");
    for (const call of toolCalls) {
      const i = call.input ?? {};
      if (call.name === "source_provenance") {
        if (!caseDef.sourceIds.includes(i.sourceId)) add("tool_input_mismatch", `source_provenance ${JSON.stringify(i)}`, "E7");
      } else if (call.name === "ambito_at_point" || call.name === "ambito_snapshot_at_point") {
        if (!caseDef.points.some((p) => p.lon === i.lon && p.lat === i.lat)) add("tool_input_mismatch", `${call.name} ${JSON.stringify(i)}`, "E7");
      } else add("unknown_tool", String(call.name), "E7");
      if (call.isError) add("tool_rejected_input", `${call.name} ${JSON.stringify(i)}`, "E7");
    }
  }
  return flags;
}
