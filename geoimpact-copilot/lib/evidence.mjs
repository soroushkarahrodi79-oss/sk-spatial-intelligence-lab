import { readFile } from "node:fs/promises";
import { resolveReportPointer } from "./report.mjs";
import { analyzeClaim, verifySemanticBindings } from "./semantic.mjs";

const sourceRecordsUrl = new URL("../source-records.json", import.meta.url);
export const sourceRegistry = JSON.parse(await readFile(sourceRecordsUrl, "utf8"));
const recordsById = new Map(sourceRegistry.records.map((record) => [record.id, record]));

function supportsExactStringRole(path, role, list = false) {
  if (role === "software_version" && !list) {
    return /^#\/provenance\/engine\/(geoimpact_ci|shapely|geos|pyproj|proj)$/.test(path);
  }
  if (role === "report_version" && !list) return path === "#/report_version";
  if (role !== "identifier") return false;
  if (list) {
    return /^#\/primary_change\/(changed|added|removed|modified)_feature_ids$/.test(path) ||
      /^#\/relationship_regressions\/\d+\/(before|after|primary_feature_ids)$/.test(path);
  }
  return path === "#/analysis/primary_dataset" || path === "#/analysis/crs" || path === "#/provenance/hash_algorithm" ||
    /^#\/analysis\/dependencies\/\d+\/dataset$/.test(path) ||
    /^#\/relationship_regressions\/\d+\/(dependent_dataset|dependent_id|change_type|evidence_id)$/.test(path);
}

export function jsonReference(report, path) {
  const value = resolveReportPointer(report, path);
  if (value === undefined) throw new Error(`JSON evidence path does not exist: ${path}`);
  return { id: `json:${path}`, type: "json_pointer", path, value };
}

export function jsonStringReference(report, path, role) {
  const value = resolveReportPointer(report, path);
  if (typeof value !== "string") throw new Error(`Exact string evidence must resolve to a string: ${path}`);
  if (!supportsExactStringRole(path, role)) {
    throw new Error(`Unsupported exact string evidence role: ${role}`);
  }
  return { id: `literal:${path}`, type: "json_string_literal", role, path, value };
}

export function jsonStringListReference(report, path, role = "identifier") {
  const value = resolveReportPointer(report, path);
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Exact string-list evidence must resolve to a string array: ${path}`);
  }
  if (!supportsExactStringRole(path, role, true)) throw new Error(`Unsupported exact string-list evidence role: ${role}`);
  return { id: `literals:${path}`, type: "json_string_list_literal", role, path, value };
}

export function derivedCountReference(report, path, operation = "count") {
  const sourceValue = resolveReportPointer(report, path);
  if (!Array.isArray(sourceValue)) throw new Error(`Derived count source must be an array: ${path}`);
  let value;
  if (operation === "count") value = sourceValue.length;
  else if (operation === "count_non_unchanged") value = sourceValue.filter((item) => item.change_type !== "unchanged").length;
  else throw new Error(`Unsupported deterministic evidence operation: ${operation}`);
  return { id: `derived:${operation}:${path}`, type: "derived", operation, source_path: path, value };
}

export function sourceReference(sourceId, factKey) {
  const record = recordsById.get(sourceId);
  if (!record || !Object.hasOwn(record.facts, factKey)) throw new Error(`Unknown evidence source record ${sourceId}/${factKey}.`);
  return {
    id: `source:${sourceId}:${factKey}`,
    type: "source_record",
    source_id: sourceId,
    label: record.label,
    url: record.url,
    section: record.sections.join("; "),
    fact_key: factKey,
    value: record.facts[factKey]
  };
}

function normalizeNumericToken(token) {
  return Number(token.replaceAll(",", "").replaceAll("−", "-"));
}

// A digit-bearing label is not a measured quantity. Keep its source spelling
// separate so the evidence gate can require an exact cited identifier/version.
const digitBearingLiteralPattern = /(?<![\p{L}\p{N}_])(?:v?\d+(?:\.\d+){2,}(?:(?:[-+][\p{L}\p{N}.-]+)|(?:[._]?[A-Za-z][\p{L}\p{N}.-]*))*|[\p{L}_][\p{L}\p{N}_:/+-]*(?:\.[\p{L}\p{N}_:/+-]+)*\d[\p{L}\p{N}_:/+-]*(?:\.[\p{L}\p{N}_:/+-]+)*)(?![\p{L}\p{N}_])/gu;

function digitBearingLiterals(text) {
  return [...text.matchAll(digitBearingLiteralPattern)].map((match) => match[0]);
}

export function numericTokens(text) {
  // Mask exact-version/identifier-like tokens before quantity extraction. The
  // verifier separately requires these literals to match cited source strings.
  const withoutLiterals = text.replace(digitBearingLiteralPattern, (literal) => " ".repeat(literal.length));
  if (/(?<![\p{L}\p{N}_])[-−]?\d+,\s+\d+(?![\p{L}\p{N}_])/u.test(withoutLiterals)) {
    throw new Error("Ambiguous comma-separated numeric text is not accepted.");
  }
  const commaNumbers = /(?<![\p{L}\p{N}_])[-−]?\d+(?:,\d+)+(?:\.\d*)?(?:[eE][-+]?\d+)?(?![\p{L}\p{N}_])/gu;
  for (const match of withoutLiterals.matchAll(commaNumbers)) {
    const integerPart = match[0].replaceAll("−", "-").replace(/^[+-]?/, "").split(/[.eE]/, 1)[0];
    const groups = integerPart.split(",");
    if (groups[0].length > 3 || groups.some((group, index) => index > 0 && group.length !== 3)) {
      throw new Error(`Ambiguous comma-grouped numeric token ${JSON.stringify(match[0])} is not accepted.`);
    }
  }
  const tokens = [];
  const pattern = /(?<![\p{L}\p{N}_])([-−]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)(?![\p{L}\p{N}_])/gu;
  for (const match of withoutLiterals.matchAll(pattern)) tokens.push(normalizeNumericToken(match[1]));
  return tokens;
}

function referenceNumbers(reference) {
  // Contract/source records can explain semantics, but cannot authorize a
  // measurement value. Numbers in answer claims must come from the parsed
  // report's typed metrics/policy fields or an allowed derived count.
  const values = [];
  if (reference.type === "json_pointer" && typeof reference.value === "number" && Number.isFinite(reference.value)) {
    const measuredPaths = new Set([
      "#/primary_change/changed_footprint_area_m2",
      "#/primary_change/max_boundary_displacement_m",
      "#/policy/observed_value",
      "#/policy/threshold"
    ]);
    if (measuredPaths.has(reference.path)) values.push(reference.value);
  }
  if (reference.type === "derived") {
    const supportedCount = (reference.operation === "count" && reference.source_path === "#/relationship_regressions") ||
      (reference.operation === "count_non_unchanged" && reference.source_path === "#/relationships");
    if (supportedCount && Number.isSafeInteger(reference.value) && reference.value >= 0) values.push(reference.value);
  }
  return values;
}

function exactStringsFromReference(reference) {
  if (reference.type === "json_string_literal") return [reference.value];
  if (reference.type === "json_string_list_literal") return reference.value;
  if (reference.type === "source_record" && typeof reference.value === "string") return [reference.value];
  return [];
}

function literalSupportsToken(reference, token) {
  const sourceStrings = exactStringsFromReference(reference);
  return sourceStrings.some((source) => source.includes(token)) ||
    (reference.type === "json_string_literal" && reference.role === "report_version" && token === `V${reference.value}`);
}

// Claims render identifiers JSON-quoted, so a value containing a quote or backslash appears escaped.
function containsLiteral(text, value) {
  return text.includes(value) || text.includes(JSON.stringify(value).slice(1, -1));
}

function withoutBoundStrings(claim, spans) {
  let masked = "";
  let cursor = 0;
  for (const span of spans) {
    if (span.kind !== "string") continue;
    masked += claim.text.slice(cursor, span.start) + " ".repeat(span.end - span.start);
    cursor = span.end;
  }
  return masked + claim.text.slice(cursor);
}

export function verifyAnswerEvidence(answer, report, options = {}) {
  if (!Array.isArray(answer.claims)) throw new Error("Answer must contain a claims array.");
  if (answer.answer !== answer.claims.map((claim) => claim.text).join(" ")) {
    throw new Error("Rendered answer text must be composed only of its evidence-checked claims.");
  }
  if (answer.report_version !== report.report_version || answer.report_version_reference?.type !== "json_pointer" || answer.report_version_reference?.id !== "json:#/report_version" || answer.report_version_reference?.path !== "#/report_version" || answer.report_version_reference?.value !== report.report_version || resolveReportPointer(report, "#/report_version") !== report.report_version) {
    throw new Error("Answer report version must be traced to the parsed report.");
  }
  if (new Set(answer.claims.map((claim) => claim.id)).size !== answer.claims.length) {
    throw new Error("Answer claim IDs must be unique.");
  }
  const analyses = [];
  for (const claim of answer.claims) {
    if (!claim.text || !Array.isArray(claim.references) || claim.references.length === 0) {
      throw new Error(`Claim ${claim.id ?? "(unnamed)"} must have text and at least one evidence reference.`);
    }
    const allowedNumbers = [];
    const exactStringReferences = [];
    for (const reference of claim.references) {
      if (reference.type === "json_pointer") {
        const actual = resolveReportPointer(report, reference.path);
        if (actual === undefined || JSON.stringify(actual) !== JSON.stringify(reference.value)) {
          throw new Error(`Claim ${claim.id} contains a missing or altered JSON reference: ${reference.path}`);
        }
      } else if (reference.type === "derived") {
        const actual = derivedCountReference(report, reference.source_path, reference.operation);
        if (actual.value !== reference.value || actual.id !== reference.id) {
          throw new Error(`Claim ${claim.id} contains an invalid derived reference: ${reference.id}`);
        }
      } else if (reference.type === "source_record") {
        const actual = sourceReference(reference.source_id, reference.fact_key);
        if (actual.value !== reference.value || actual.url !== reference.url) {
          throw new Error(`Claim ${claim.id} contains an altered source record: ${reference.source_id}`);
        }
      } else if (reference.type === "json_string_literal") {
        const actual = resolveReportPointer(report, reference.path);
        if (actual !== reference.value || typeof actual !== "string" || reference.id !== `literal:${reference.path}` || !supportsExactStringRole(reference.path, reference.role)) {
          throw new Error(`Claim ${claim.id} contains an altered exact string reference: ${reference.path}`);
        }
        if (!containsLiteral(claim.text, reference.value)) {
          throw new Error(`Claim ${claim.id} omits or alters the exact source string at ${reference.path}.`);
        }
      } else if (reference.type === "json_string_list_literal") {
        const actual = resolveReportPointer(report, reference.path);
        if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(reference.value) || actual.some((item) => typeof item !== "string") || reference.id !== `literals:${reference.path}` || !supportsExactStringRole(reference.path, reference.role, true)) {
          throw new Error(`Claim ${claim.id} contains an altered exact string-list reference: ${reference.path}`);
        }
        for (const literal of reference.value) {
          if (!containsLiteral(claim.text, literal)) throw new Error(`Claim ${claim.id} omits or alters an exact source identifier at ${reference.path}.`);
        }
      } else {
        throw new Error(`Claim ${claim.id} has an unsupported reference type.`);
      }
      allowedNumbers.push(...referenceNumbers(reference));
      exactStringReferences.push(reference);
    }
    // Digits inside a labelled identifier span (for example "Zone 12") are data, not quantities.
    const analysis = analyzeClaim(claim, report);
    analyses.push(analysis);
    const unboundText = withoutBoundStrings(claim, analysis.spans);
    for (const token of digitBearingLiterals(unboundText)) {
      if (!exactStringReferences.some((reference) => literalSupportsToken(reference, token))) {
        throw new Error(`Claim ${claim.id} includes unsupported identifier or version literal ${JSON.stringify(token)}.`);
      }
    }
    for (const token of numericTokens(unboundText)) {
      if (!allowedNumbers.some((value) => Object.is(value, token) || value === token)) {
        throw new Error(`Claim ${claim.id} includes unsupported numeric value ${token}.`);
      }
    }
  }
  // V0.2: values must also be bound to the right field, label and unit. Citation
  // presence and value membership above are necessary, never sufficient.
  if (options.semantic !== false) verifySemanticBindings(answer, report, { ...options, analyses });
  return true;
}
