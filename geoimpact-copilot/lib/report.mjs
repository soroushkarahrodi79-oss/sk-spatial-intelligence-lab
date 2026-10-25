import Ajv from "ajv";
import { readFile } from "node:fs/promises";
import { findUnsafeStrings } from "./unicode.mjs";

const schemaUrl = new URL("../schema/report-v4-v5.schema.json", import.meta.url);
const ajv = new Ajv({ allErrors: true, strict: true });
const validateSchema = ajv.compile(JSON.parse(await readFile(schemaUrl, "utf8")));
const maxReportBytes = 10 * 1024 * 1024;

export class ReportValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "ReportValidationError";
    this.issues = issues;
  }
}

function skipWhitespace(source, index) {
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

function readStringEnd(source, start) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === '"') return index + 1;
    index += 1;
  }
  throw new ReportValidationError("Malformed JSON string.");
}

// JSON.parse accepts duplicate object keys and silently keeps the last value.
// Scan valid JSON once first so ambiguous input is rejected deterministically.
function assertNoDuplicateObjectKeys(source) {
  function scanValue(start) {
    let index = skipWhitespace(source, start);
    const char = source[index];
    if (char === '"') return readStringEnd(source, index);
    if (char === "[") {
      index = skipWhitespace(source, index + 1);
      if (source[index] === "]") return index + 1;
      while (index < source.length) {
        index = scanValue(index);
        index = skipWhitespace(source, index);
        if (source[index] === "]") return index + 1;
        index = skipWhitespace(source, index + 1);
      }
      return index;
    }
    if (char === "{") {
      index = skipWhitespace(source, index + 1);
      if (source[index] === "}") return index + 1;
      const keys = new Set();
      while (index < source.length) {
        const keyStart = index;
        const keyEnd = readStringEnd(source, keyStart);
        const key = JSON.parse(source.slice(keyStart, keyEnd));
        if (keys.has(key)) {
          throw new ReportValidationError(`Duplicate JSON object key ${JSON.stringify(key)} is not allowed.`);
        }
        keys.add(key);
        index = skipWhitespace(source, keyEnd + 1); // skip the colon
        index = scanValue(index);
        index = skipWhitespace(source, index);
        if (source[index] === "}") return index + 1;
        index = skipWhitespace(source, index + 1); // skip the comma
      }
      return index;
    }
    while (index < source.length && !/[\s,\]}]/.test(source[index])) index += 1;
    return index;
  }

  scanValue(0);
}

function pointerValue(document, pointer) {
  if (pointer === "#") return document;
  if (!pointer.startsWith("#/")) throw new Error(`Unsupported JSON Pointer: ${pointer}`);
  return pointer.slice(2).split("/").map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, key) => value?.[key], document);
}

function findNonFiniteNumber(value, path = "") {
  if (typeof value === "number" && !Number.isFinite(value)) return path || "/";
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findNonFiniteNumber(value[index], `${path}/${index}`);
      if (found) return found;
    }
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const escapedKey = key.replaceAll("~", "~0").replaceAll("/", "~1");
      const found = findNonFiniteNumber(child, `${path}/${escapedKey}`);
      if (found) return found;
    }
  }
  return null;
}

function geometryIssues(report) {
  const issues = [];
  const visit = (value, path = "") => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${path}/${index}`));
      return;
    }
    if (!value || typeof value !== "object") return;
    if (["Polygon", "MultiPolygon"].includes(value.type) && Array.isArray(value.coordinates)) {
      const polygons = value.type === "Polygon" ? [value.coordinates] : value.coordinates;
      polygons.forEach((polygon, polygonIndex) => {
        if (!Array.isArray(polygon)) return;
        polygon.forEach((ring, ringIndex) => {
          if (Array.isArray(ring) && ring.length > 0 && JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))) {
            issues.push(`${path}/coordinates/${polygonIndex}/${ringIndex}: polygon rings must be closed.`);
          }
        });
      });
    }
    for (const [key, child] of Object.entries(value)) visit(child, `${path}/${key}`);
  };
  visit(report);
  return issues;
}

function semanticIssues(report) {
  const issues = [];
  const add = (path, message) => issues.push(`${path}: ${message}`);
  const regressions = report.relationship_regressions;
  const expectedEvidenceIds = regressions.map((item) => item.evidence_id).sort();
  const policyEvidenceIds = [...report.policy.evidence_ids].sort();

  if (report.verdict !== report.policy.status) add("/verdict", "must equal /policy/status.");
  if (report.policy.observed_value !== regressions.length) {
    add("/policy/observed_value", "must equal the number of /relationship_regressions records.");
  }
  if (JSON.stringify(policyEvidenceIds) !== JSON.stringify(expectedEvidenceIds)) {
    add("/policy/evidence_ids", "must match the relationship regression evidence_id values.");
  }
  const expectedVerdict = report.policy.observed_value <= report.policy.threshold ? "PASS" : "BLOCK";
  if (report.policy.status !== expectedVerdict) {
    add("/policy/status", "does not match the max_relationship_regressions threshold comparison.");
  }

  const duplicateEvidenceIds = expectedEvidenceIds.filter((id, index) => index > 0 && id === expectedEvidenceIds[index - 1]);
  if (duplicateEvidenceIds.length) add("/relationship_regressions", "evidence_id values must be unique.");

  const relationKeys = new Set();
  const regressionKeys = new Set();
  for (const [index, regression] of regressions.entries()) {
    const key = JSON.stringify([regression.dependent_dataset, regression.dependent_id]);
    if (regressionKeys.has(key)) add(`/relationship_regressions/${index}`, "dependent dataset/ID pairs must be unique.");
    regressionKeys.add(key);
  }
  for (const [index, relationship] of report.relationships.entries()) {
    const key = JSON.stringify([relationship.dependent_dataset, relationship.dependent_id]);
    if (relationKeys.has(key)) add(`/relationships/${index}`, "dependent dataset/ID pairs must be unique.");
    relationKeys.add(key);
    const same = JSON.stringify(relationship.before) === JSON.stringify(relationship.after);
    const expectedChange = same ? "unchanged" : relationship.before.length && relationship.after.length ? "assignment_changed" : relationship.before.length ? "assignment_lost" : "assignment_gained";
    if (relationship.change_type !== expectedChange) add(`/relationships/${index}/change_type`, "does not match the before/after assignment lists.");
    if ((relationship.change_type !== "unchanged") !== regressionKeys.has(key)) {
      add(`/relationships/${index}`, "changed relationship rows and regression evidence records must correspond one-to-one.");
    }
  }

  const firstRelationship = new Map();
  for (const item of report.relationships) {
    const key = JSON.stringify([item.dependent_dataset, item.dependent_id]);
    if (!firstRelationship.has(key)) firstRelationship.set(key, item);
  }
  for (const [index, regression] of regressions.entries()) {
    const match = firstRelationship.get(JSON.stringify([regression.dependent_dataset, regression.dependent_id]));
    if (!match) {
      add(`/relationship_regressions/${index}`, "must correspond to a relationship record.");
      continue;
    }
    for (const field of ["predicate", "before", "after", "change_type"]) {
      if (JSON.stringify(match[field]) !== JSON.stringify(regression[field])) {
        add(`/relationship_regressions/${index}/${field}`, `must match /relationships for the same dependent feature.`);
      }
    }
  }

  const change = report.primary_change;
  const sorted = (values) => [...values].sort();
  const changedFromStatus = Object.entries(change.feature_geometry_status)
    .filter(([, status]) => status !== "unchanged").map(([id]) => id);
  if (JSON.stringify(sorted(change.changed_feature_ids)) !== JSON.stringify(sorted(changedFromStatus))) {
    add("/primary_change/changed_feature_ids", "must match non-unchanged IDs in feature_geometry_status.");
  }
  for (const [field, status] of [["added_feature_ids", "added"], ["removed_feature_ids", "removed"], ["modified_feature_ids", "modified"]]) {
    const expected = Object.entries(change.feature_geometry_status).filter(([, value]) => value === status).map(([id]) => id);
    if (JSON.stringify(sorted(change[field])) !== JSON.stringify(sorted(expected))) {
      add(`/primary_change/${field}`, `must match ${status} IDs in feature_geometry_status.`);
    }
  }

  if (report.report_version === "5") {
    const inputs = report.provenance.inputs;
    if (inputs.primary.base.dataset !== report.analysis.primary_dataset || inputs.primary.candidate.dataset !== report.analysis.primary_dataset) {
      add("/provenance/inputs/primary", "dataset names must match /analysis/primary_dataset.");
    }
    const analysisDependencies = report.analysis.dependencies.map((item) => item.dataset).sort();
    const provenanceDependencies = inputs.dependencies.map((item) => item.dataset).sort();
    if (JSON.stringify(analysisDependencies) !== JSON.stringify(provenanceDependencies)) {
      add("/provenance/inputs/dependencies", "dataset names must match /analysis/dependencies.");
    }
  }
  return issues;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function validateReportObject(report) {
  const nonFinite = findNonFiniteNumber(report);
  if (nonFinite) throw new ReportValidationError(`Non-finite numeric value at ${nonFinite} is not accepted.`);
  if (!validateSchema(report)) {
    const issues = validateSchema.errors.map((error) => `${error.instancePath || "/"} ${error.message}`);
    throw new ReportValidationError("Report does not match the GeoImpact-CI V4/V5 input schema.", issues);
  }
  const issues = [...semanticIssues(report), ...geometryIssues(report), ...findUnsafeStrings(report)];
  if (issues.length) throw new ReportValidationError("Report failed GeoImpact-CI semantic consistency checks.", issues);
  return deepFreeze(report);
}

export function parseReportText(source) {
  if (typeof source !== "string") throw new TypeError("Report JSON must be supplied as UTF-8 text.");
  if (Buffer.byteLength(source, "utf8") > maxReportBytes) {
    throw new ReportValidationError(`Report exceeds the ${maxReportBytes}-byte local input limit.`);
  }
  if (source.charCodeAt(0) === 0xfeff) throw new ReportValidationError("UTF-8 BOM is not accepted in report JSON.");
  let report;
  try {
    report = JSON.parse(source);
  } catch (error) {
    throw new ReportValidationError(`Invalid JSON: ${error.message}`);
  }
  assertNoDuplicateObjectKeys(source);
  return validateReportObject(report);
}

export async function loadReportFile(path) {
  const bytes = await readFile(path);
  if (bytes.byteLength > maxReportBytes) throw new ReportValidationError(`Report exceeds the ${maxReportBytes}-byte local input limit.`);
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ReportValidationError("Report file is not valid UTF-8.");
  }
  return parseReportText(source);
}

export function resolveReportPointer(report, pointer) {
  return pointerValue(report, pointer);
}
