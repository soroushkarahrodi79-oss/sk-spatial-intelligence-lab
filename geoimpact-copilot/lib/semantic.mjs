import { readFile } from "node:fs/promises";
import { resolveReportPointer } from "./report.mjs";
import { unicodeNotes } from "./unicode.mjs";

// Semantic claim binding (V0.2). The V0.1 evidence gate proves that every number and
// literal in a claim exists somewhere in its cited evidence. It cannot tell whether the
// right value is attached to the right field: observed=1/threshold=0 and
// observed=0/threshold=1 use the same set of valid numbers. This module closes that gap.
//
// Contract: every measurement and exact identifier is rendered as one *span* made of the
// field's registered label, the value and (for measurements) the unit. A claim is accepted
// only if (1) each span's value equals the value at the field's report path, (2) every cited
// exact-string field appears under its own label, (3) the text left after removing all spans
// matches a reviewed, closed set of narrative skeletons, and (4) verdict words agree with the
// report. Citation presence alone never satisfies any of these.

export const SEMANTIC_CONTRACT_VERSION = "geoimpact-claim-binding/1";

const quote = (value) => JSON.stringify(value);
const quoteList = (values) => (values.length ? values.map(quote).join(", ") : "none");
const safeRaw = /^[A-Za-z0-9._:+/-]+$/;
const raw = (value) => (safeRaw.test(value) ? value : quote(value));
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const numberToken = String.raw`(?:[-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|[-−]?\.\d+)(?:[eE][-+]?\d+)?`;

export const numericContracts = [
  { id: "policy.observed_value", type: "json_pointer", path: "#/policy/observed_value", unit: "relationship regressions", lead: "observed ", trail: () => " relationship regressions", trailPattern: " relationship regressions", read: (report) => report.policy.observed_value },
  { id: "policy.threshold", type: "json_pointer", path: "#/policy/threshold", unit: "relationship regressions", lead: "threshold of ", trail: () => "", trailPattern: "", read: (report) => report.policy.threshold },
  { id: "relationship_regressions.count", type: "derived", operation: "count", source_path: "#/relationship_regressions", unit: "changed dependent relationship records", lead: "lists ", trail: (n) => ` changed dependent relationship record${n === 1 ? "" : "s"}`, trailPattern: " changed dependent relationship records?", read: (report) => report.relationship_regressions.length },
  // The derived count_non_unchanged(#/relationships) operation is intentionally unbound: it has no
  // distinct rendering, so a claim that uses it is rejected until a labelled phrase is registered.
  { id: "primary_change.changed_footprint_area_m2", type: "json_pointer", path: "#/primary_change/changed_footprint_area_m2", unit: "m²", lead: "Changed footprint area: ", trail: () => " m²", trailPattern: " m²", read: (report) => report.primary_change.changed_footprint_area_m2 },
  { id: "primary_change.max_boundary_displacement_m", type: "json_pointer", path: "#/primary_change/max_boundary_displacement_m", unit: "m", lead: "Maximum boundary displacement: ", trail: () => " m", trailPattern: " m", read: (report) => report.primary_change.max_boundary_displacement_m }
];

const one = (id, test, label, render, extra = {}) => ({ id, test, label, render, list: false, ...extra });
const many = (id, test, label) => ({ id, test, label, render: quoteList, list: true });

export const stringContracts = [
  one("analysis.primary_dataset", /^#\/analysis\/primary_dataset$/, "primary dataset", quote),
  one("analysis.dependency_dataset", /^#\/analysis\/dependencies\/\d+\/dataset$/, "dependency dataset", quote),
  one("analysis.crs", /^#\/analysis\/crs$/, "analysis CRS", raw),
  one("provenance.hash_algorithm", /^#\/provenance\/hash_algorithm$/, "hash algorithm", raw),
  one("provenance.engine.geoimpact_ci", /^#\/provenance\/engine\/geoimpact_ci$/, "GeoImpact-CI", raw, { role: "software_version" }),
  one("provenance.engine.shapely", /^#\/provenance\/engine\/shapely$/, "Shapely", raw, { role: "software_version" }),
  one("provenance.engine.geos", /^#\/provenance\/engine\/geos$/, "GEOS", raw, { role: "software_version" }),
  one("provenance.engine.pyproj", /^#\/provenance\/engine\/pyproj$/, "PyProj", raw, { role: "software_version" }),
  one("provenance.engine.proj", /^#\/provenance\/engine\/proj$/, "PROJ", raw, { role: "software_version" }),
  one("relationship.dependent_dataset", /^#\/relationship_regressions\/\d+\/dependent_dataset$/, "Dependent dataset", quote),
  one("relationship.dependent_id", /^#\/relationship_regressions\/\d+\/dependent_id$/, "dependent ID", quote),
  many("relationship.before", /^#\/relationship_regressions\/\d+\/before$/, "before"),
  many("relationship.after", /^#\/relationship_regressions\/\d+\/after$/, "after"),
  one("relationship.change_type", /^#\/relationship_regressions\/\d+\/change_type$/, "change type", raw),
  one("relationship.evidence_id", /^#\/relationship_regressions\/\d+\/evidence_id$/, "Evidence ID", quote),
  many("relationship.primary_feature_ids", /^#\/relationship_regressions\/\d+\/primary_feature_ids$/, "primary feature IDs"),
  many("primary_change.changed_feature_ids", /^#\/primary_change\/changed_feature_ids$/, "Changed feature IDs:"),
  many("primary_change.added_feature_ids", /^#\/primary_change\/added_feature_ids$/, "Added:"),
  many("primary_change.removed_feature_ids", /^#\/primary_change\/removed_feature_ids$/, "Removed:"),
  many("primary_change.modified_feature_ids", /^#\/primary_change\/modified_feature_ids$/, "Modified:"),
  {
    id: "report_version",
    test: /^#\/report_version$/,
    label: "report version",
    list: false,
    render: (value) => `V${value}`,
    spans: (value) => [`Report version V${value}`, `This V${value} report`]
  }
];

function stringContractFor(path) {
  return stringContracts.find((contract) => contract.test.test(path)) ?? null;
}

function expectedSpans(contract, value) {
  return contract.spans ? contract.spans(value) : [`${contract.label} ${contract.render(value)}`];
}

/** The exact span a deterministic renderer must emit for an exact-string or string-list field. */
export function fieldSpan(report, path) {
  const contract = stringContractFor(path);
  if (!contract) throw new Error(`No semantic contract for exact string evidence at ${path}.`);
  return expectedSpans(contract, resolveReportPointer(report, path))[0];
}

/** The exact span a deterministic renderer must emit for a registered measurement. */
export function measureSpan(report, id) {
  const contract = numericContracts.find((candidate) => candidate.id === id);
  if (!contract) throw new Error(`No numeric contract ${id}.`);
  const value = contract.read(report);
  return `${contract.lead}${value}${contract.trail(value)}`;
}

function parseNumber(token) {
  return Number(token.replaceAll(",", "").replaceAll("−", "-"));
}

function referenceMatches(contract, reference) {
  if (contract.type === "json_pointer") return reference.type === "json_pointer" && reference.path === contract.path;
  return reference.type === "derived" && reference.operation === contract.operation && reference.source_path === contract.source_path;
}

const wordBoundaryBefore = /[\p{L}\p{N}_]/u;
function boundaryOk(text, start, end) {
  if (start > 0 && wordBoundaryBefore.test(text[start - 1])) return false;
  const next = text[end];
  if (next === undefined) return true;
  if (wordBoundaryBefore.test(next)) return false;
  return !((next === "." || next === "-") && text[end + 1] !== undefined && wordBoundaryBefore.test(text[end + 1]));
}

function occurrences(text, span) {
  const found = [];
  let from = 0;
  while (from <= text.length - span.length) {
    const index = text.indexOf(span, from);
    if (index === -1) break;
    if (boundaryOk(text, index, index + span.length)) found.push(index);
    from = index + 1;
  }
  return found;
}

const statusWord = /(?<![\p{L}\p{N}_])(PASS|BLOCK|ERROR)(?![\p{L}\p{N}_])/gu;

const predicates = {
  no_regressions: (report) => report.relationship_regressions.length === 0,
  has_regressions: (report) => report.relationship_regressions.length > 0,
  primary_changed: (report) => report.primary_change.changed_feature_ids.length > 0,
  no_primary_changed: (report) => report.primary_change.changed_feature_ids.length === 0,
  has_dependencies: (report) => report.analysis.dependencies.length > 0,
  no_dependencies: (report) => report.analysis.dependencies.length === 0
};

export const narrativePredicates = Object.keys(predicates);

const registryUrl = new URL("../semantic/approved-skeletons.json", import.meta.url);
let approved = null;
try {
  approved = JSON.parse(await readFile(registryUrl, "utf8"));
} catch {
  approved = null; // The build script runs before the first registry exists.
}

export function normalizeClaimId(id) {
  return String(id).replace(/\d+/g, "*");
}

function collapse(skeleton) {
  return skeleton.replace(/(\{\{([^}]+)\}\})(?:; \{\{\2\}\})+/g, "$1");
}

/**
 * Independently re-derive, from the claim text and the parsed report only, which spans bind
 * which fields. Returns the spans, a narrative skeleton, and the list of violations.
 */
export function analyzeClaim(claim, report) {
  const errors = [];
  const spans = [];
  const text = claim.text;
  const references = claim.references ?? [];

  if (/[\p{Cc}\p{Cf}]/u.test(text)) errors.push("claim text contains control or format characters");

  for (const contract of numericContracts) {
    const cited = references.some((reference) => referenceMatches(contract, reference));
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(contract.lead)}(${numberToken})${contract.trailPattern}(?![\\p{L}\\p{N}_])`, "gu");
    const expected = contract.read(report);
    for (const match of text.matchAll(pattern)) {
      const value = parseNumber(match[1]);
      const span = { start: match.index, end: match.index + match[0].length, contract, kind: "number", value: expected, rendered: match[0] };
      spans.push(span);
      if (!cited) {
        errors.push(`field ${contract.id} is stated (${JSON.stringify(match[0])}) without citing ${contract.path ?? contract.source_path}`);
      } else if (value !== expected) {
        const other = numericContracts.find((candidate) => candidate.id !== contract.id && candidate.read(report) === value);
        errors.push(`field binding mismatch: ${contract.id} is ${expected} ${contract.unit} in the report but the claim states ${JSON.stringify(match[1])}${other ? ` (the value of ${other.id})` : ""}`);
      }
    }
  }

  for (const reference of references) {
    if (reference.type !== "json_string_literal" && reference.type !== "json_string_list_literal") continue;
    const contract = stringContractFor(reference.path);
    if (!contract) {
      errors.push(`no semantic contract for exact string evidence at ${reference.path}`);
      continue;
    }
    const value = resolveReportPointer(report, reference.path);
    const options = expectedSpans(contract, value);
    let bound = false;
    for (const option of options) {
      for (const start of occurrences(text, option)) {
        bound = true;
        spans.push({ start, end: start + option.length, contract, kind: "string", path: reference.path, value, rendered: option });
      }
    }
    if (!bound) {
      const bareLiterals = (Array.isArray(value) ? value : [value]).filter((literal) => text.includes(literal));
      errors.push(`field binding mismatch: ${reference.path} must appear as ${JSON.stringify(options[0])}${bareLiterals.length ? " (the value is present but not under its field label)" : ""}`);
    }
  }

  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const span of spans) {
    const previous = kept.at(-1);
    if (previous && span.start < previous.end) {
      if (span.end <= previous.end) continue;
      errors.push(`overlapping field spans at ${span.contract.id} and ${previous.contract.id}`);
      continue;
    }
    kept.push(span);
  }

  let skeleton = "";
  let cursor = 0;
  for (const span of kept) {
    skeleton += `${text.slice(cursor, span.start)}{{${span.contract.id}}}`;
    cursor = span.end;
  }
  skeleton = collapse(skeleton + text.slice(cursor));
  return { errors, spans: kept, skeleton };
}

export function describeBindings(claim, report, analysis = analyzeClaim(claim, report)) {
  const { spans } = analysis;
  return spans.map((span) => {
    const path = span.contract.path ?? span.path ?? span.contract.source_path;
    const reference = (claim.references ?? []).find((candidate) => candidate.path === path || candidate.source_path === path);
    const binding = {
      field: span.contract.id,
      path,
      reference_id: reference?.id ?? null,
      label: span.contract.label ?? span.contract.lead.trim(),
      unit: span.kind === "number" ? span.contract.unit : null,
      value: span.value,
      span: span.rendered
    };
    const notes = span.kind === "string" ? unicodeNotes(Array.isArray(span.value) ? span.value.join("") : span.value) : null;
    if (notes) binding.unicode = notes;
    return binding;
  });
}

function approvedFor(claim, skeleton, report) {
  const entries = approved?.claims?.[normalizeClaimId(claim.id)];
  if (!entries) return false;
  return entries.some((entry) => entry.skeleton === skeleton && (entry.when ?? []).every((name) => predicates[name]?.(report) === true));
}

function narrativeDiagnostic(skeleton) {
  const reasons = [];
  if (/\p{N}/u.test(skeleton)) reasons.push("unbound numeric or digit character");
  if (skeleton.includes('"')) reasons.push("unbound quoted string");
  return reasons.length ? reasons.join("; ") : "narrative text outside the reviewed claim vocabulary";
}

export function verifySemanticBindings(answer, report, { registry = true, analyses = null } = {}) {
  for (const [index, claim] of answer.claims.entries()) {
    // `analyses` is computed from this same claim object earlier in the same verification call.
    const analysis = analyses?.[index] ?? analyzeClaim(claim, report);
    const { errors, skeleton } = analysis;
    const references = claim.references ?? [];
    const sourceKeys = new Set(references.filter((reference) => reference.type === "source_record").map((reference) => reference.fact_key));
    const citesVerdict = references.some((reference) => reference.type === "json_pointer" && reference.path === "#/verdict");
    const citesStatus = citesVerdict || references.some((reference) => reference.type === "json_pointer" && reference.path === "#/policy/status");

    if (citesVerdict && !claim.text.includes(`Report verdict: ${report.verdict}`)) {
      errors.push(`verdict binding mismatch: the claim must state "Report verdict: ${report.verdict}"`);
    }
    for (const match of skeleton.matchAll(statusWord)) {
      if (citesStatus) {
        if (match[1] !== report.policy.status) errors.push(`verdict word ${match[1]} contradicts the report status ${report.policy.status}`);
      } else if (!sourceKeys.has(match[1])) {
        errors.push(`verdict word ${match[1]} is not backed by a cited contract definition`);
      }
    }
    if (registry && !approved) {
      errors.push("approved skeleton registry is missing");
    } else if (registry && !approvedFor(claim, skeleton, report)) {
      errors.push(`${narrativeDiagnostic(skeleton)} (skeleton ${JSON.stringify(skeleton)})`);
    }
    if (claim.bindings !== undefined) {
      // The rendered span is descriptive (an equivalent number format may differ); the field, path, label, unit and value are not.
      const strip = (list) => JSON.stringify(list.map(({ span, ...rest }) => rest));
      if (!Array.isArray(claim.bindings) || strip(claim.bindings) !== strip(describeBindings(claim, report, analysis))) errors.push("claim bindings do not match the bindings re-derived from the report");
    }
    if (errors.length) throw new Error(`Claim ${claim.id} failed semantic claim binding: ${errors[0]}.`);
  }
  return true;
}
