import { readFile } from "node:fs/promises";
import { resolveReportPointer } from "./report.mjs";

const sourceRecordsUrl = new URL("../source-records.json", import.meta.url);
export const sourceRegistry = JSON.parse(await readFile(sourceRecordsUrl, "utf8"));
const recordsById = new Map(sourceRegistry.records.map((record) => [record.id, record]));

export function jsonReference(report, path) {
  const value = resolveReportPointer(report, path);
  if (value === undefined) throw new Error(`JSON evidence path does not exist: ${path}`);
  return { id: `json:${path}`, type: "json_pointer", path, value };
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
  return Number(token.replaceAll(",", ""));
}

export function numericTokens(text) {
  // Numeric claims are expected as stand-alone quantities. This intentionally
  // ignores digits embedded in feature IDs such as facility-01 or report V5.
  const tokens = [];
  const pattern = /(?:^|\s)(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(?=$|[\s,.;%m²])/g;
  for (const match of text.matchAll(pattern)) tokens.push(normalizeNumericToken(match[1]));
  return tokens;
}

function referenceNumbers(reference) {
  const values = [];
  if (typeof reference.value === "number" && Number.isFinite(reference.value)) values.push(reference.value);
  if (typeof reference.value === "string" && /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(reference.value)) {
    values.push(Number(reference.value));
  }
  if (reference.type === "source_record") values.push(...numericTokens(reference.value));
  return values;
}

export function verifyAnswerEvidence(answer, report) {
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
  for (const claim of answer.claims) {
    if (!claim.text || !Array.isArray(claim.references) || claim.references.length === 0) {
      throw new Error(`Claim ${claim.id ?? "(unnamed)"} must have text and at least one evidence reference.`);
    }
    const allowedNumbers = [];
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
      } else {
        throw new Error(`Claim ${claim.id} has an unsupported reference type.`);
      }
      allowedNumbers.push(...referenceNumbers(reference));
    }
    for (const token of numericTokens(claim.text)) {
      if (!allowedNumbers.some((value) => Object.is(value, token) || value === token)) {
        throw new Error(`Claim ${claim.id} includes unsupported numeric value ${token}.`);
      }
    }
  }
  return true;
}
