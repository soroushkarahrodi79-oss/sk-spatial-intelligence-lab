import { derivedCountReference, jsonReference, jsonStringListReference, jsonStringReference, sourceReference, verifyAnswerEvidence } from "./evidence.mjs";
import { SEMANTIC_CONTRACT_VERSION, describeBindings, fieldSpan, measureSpan } from "./semantic.mjs";

const contractSource = "geoimpact-ci-readme-v1.2.0";
const architectureSource = "geoimpact-ci-architecture-v1";
const schemaSource = "copilot-report-schema-v4-v5";

// Set only by the skeleton-registry build script, which has to run before a registry exists.
let verifyOptions = {};

function createClaim(id, text, ...references) {
  return { id, text, references };
}

function finish(report, intent, claims, decision = "ANSWER", reason = null, options = {}) {
  for (const claim of claims) claim.bindings = describeBindings(claim, report);
  const answer = {
    decision,
    mode: "deterministic",
    semantic_contract: SEMANTIC_CONTRACT_VERSION,
    intent,
    report_version: report.report_version,
    report_version_reference: jsonReference(report, "#/report_version"),
    answer: claims.map((claim) => claim.text).join(" "),
    claims,
    reason,
    ...options
  };
  verifyAnswerEvidence(answer, report, verifyOptions);
  return answer;
}

function policyAnswer(report) {
  const policy = report.policy;
  const status = policy.status;
  const meaning = sourceReference(contractSource, status);
  const consequence = status === "BLOCK"
    ? "The analysis completed and the configured threshold was exceeded; BLOCK is not an operational failure."
    : "The configured relationship-regression policy was not exceeded; PASS is not a claim that source data are correct.";
  return [
    createClaim("policy-verdict", `Report verdict: ${status}.`, jsonReference(report, "#/verdict"), jsonReference(report, "#/policy/status")),
    createClaim("policy-comparison", `The configured rule ${measureSpan(report, "policy.observed_value")} against a ${measureSpan(report, "policy.threshold")}.`, jsonReference(report, "#/policy/rule"), jsonReference(report, "#/policy/observed_value"), jsonReference(report, "#/policy/threshold")),
    createClaim("policy-meaning", consequence, jsonReference(report, "#/policy/status"), meaning)
  ];
}

function relationshipAnswer(report) {
  const changed = report.relationship_regressions.map((record, index) => ({ record, index }));
  const countRef = derivedCountReference(report, "#/relationship_regressions", "count");
  const claims = [createClaim(
    "relationship-count",
    `The report ${measureSpan(report, "relationship_regressions.count")}.`,
    countRef
  )];
  if (changed.length === 0) {
    const primaryChanged = report.primary_change.changed_feature_ids.length > 0;
    claims.push(createClaim(
      "relationship-limits",
      primaryChanged
        ? "No changed dependent relationship rows are recorded in this report, although primary feature changes are present."
        : "No changed dependent relationship rows are recorded in this report.",
      jsonReference(report, "#/relationships"),
      jsonReference(report, "#/primary_change/changed_feature_ids"),
      sourceReference(contractSource, "limitations")
    ));
  } else {
    for (const { index } of changed) {
      const path = (field) => `#/relationship_regressions/${index}/${field}`;
      claims.push(createClaim(
        `relationship-${index}`,
        `${fieldSpan(report, path("dependent_dataset"))}; ${fieldSpan(report, path("dependent_id"))}: ${fieldSpan(report, path("before"))}; ${fieldSpan(report, path("after"))} (${fieldSpan(report, path("change_type"))}). ${fieldSpan(report, path("evidence_id"))} links the change to ${fieldSpan(report, path("primary_feature_ids"))}.`,
        jsonStringReference(report, path("dependent_dataset"), "identifier"),
        jsonStringReference(report, path("dependent_id"), "identifier"),
        jsonStringListReference(report, path("before")),
        jsonStringListReference(report, path("after")),
        jsonStringReference(report, path("change_type"), "identifier"),
        jsonStringReference(report, path("evidence_id"), "identifier"),
        jsonStringListReference(report, path("primary_feature_ids")),
        sourceReference(architectureSource, "relationships")
      ));
    }
    claims.push(createClaim(
      "relationship-limits",
      "These are declared geometric membership changes under the report's predicate; they do not establish legal, causal, access, service-use, or socioeconomic impact.",
      jsonReference(report, "#/analysis/dependencies"),
      sourceReference(contractSource, "limitations")
    ));
  }
  return claims;
}

function changeAnswer(report) {
  const change = report.primary_change;
  const list = (field) => fieldSpan(report, `#/primary_change/${field}`);
  return [
    createClaim(
      "primary-feature-changes",
      `${list("changed_feature_ids")}. ${list("added_feature_ids")}. ${list("removed_feature_ids")}. ${list("modified_feature_ids")}.`,
      jsonStringListReference(report, "#/primary_change/changed_feature_ids"),
      jsonStringListReference(report, "#/primary_change/added_feature_ids"),
      jsonStringListReference(report, "#/primary_change/removed_feature_ids"),
      jsonStringListReference(report, "#/primary_change/modified_feature_ids"),
      jsonReference(report, "#/primary_change/feature_geometry_status"),
      sourceReference(architectureSource, "changes")
    ),
    createClaim(
      "primary-change-metrics",
      `${measureSpan(report, "primary_change.changed_footprint_area_m2")}. ${measureSpan(report, "primary_change.max_boundary_displacement_m")}.`,
      jsonReference(report, "#/primary_change/changed_footprint_area_m2"),
      jsonReference(report, "#/primary_change/max_boundary_displacement_m"),
      sourceReference(architectureSource, "changes")
    ),
    createClaim(
      "metric-limits",
      "The displacement metric applies to modified shared IDs only; the report does not establish source positional accuracy.",
      jsonReference(report, "#/primary_change/modified_feature_ids"),
      jsonReference(report, "#/primary_change/max_boundary_displacement_m"),
      sourceReference(architectureSource, "displacement"),
      sourceReference(contractSource, "uncertainty")
    )
  ];
}

function provenanceAnswer(report) {
  const dependencyPaths = report.analysis.dependencies.map((_, index) => `#/analysis/dependencies/${index}/dataset`);
  const dependencyText = dependencyPaths.length
    ? dependencyPaths.map((path) => fieldSpan(report, path)).join("; ")
    : "no dependency datasets";
  const datasetClaims = [
    createClaim("provenance-datasets", `Logical datasets named: ${fieldSpan(report, "#/analysis/primary_dataset")}; ${dependencyText}.`,
      jsonStringReference(report, "#/analysis/primary_dataset", "identifier"),
      ...dependencyPaths.map((path) => jsonStringReference(report, path, "identifier")),
      jsonReference(report, "#/analysis/dependencies")),
    createClaim("provenance-source-limits", "These are logical dataset names; the report does not include source URLs or data-license rights.",
      jsonReference(report, "#/analysis/dependencies"), sourceReference(schemaSource, "source_locations"), sourceReference(schemaSource, "rights"))
  ];
  if (report.report_version === "4") {
    return [...datasetClaims,
      createClaim("provenance-absent-v4", `This V4 report has no provenance object. V5 adds input-byte SHA-256 identities and engine versions without changing the spatial semantics.`,
        jsonStringReference(report, "#/report_version", "report_version"), sourceReference(architectureSource, "v4_v5"))
    ];
  }
  const engineKeys = ["geoimpact_ci", "shapely", "geos", "pyproj", "proj"];
  const enginePaths = engineKeys.map((key) => `#/provenance/engine/${key}`);
  return [
    ...datasetClaims,
    createClaim("provenance-version", `${fieldSpan(report, "#/report_version")}; ${fieldSpan(report, "#/analysis/crs")}; ${fieldSpan(report, "#/provenance/hash_algorithm")}.`,
      jsonStringReference(report, "#/report_version", "report_version"),
      jsonStringReference(report, "#/analysis/crs", "identifier"),
      jsonStringReference(report, "#/provenance/hash_algorithm", "identifier")),
    createClaim("provenance-engine", `Engine values listed: ${enginePaths.map((path) => fieldSpan(report, path)).join("; ")}.`,
      jsonReference(report, "#/provenance/engine"), ...enginePaths.map((path) => jsonStringReference(report, path, "software_version"))),
    createClaim("provenance-limit", "Hashes identify the report's declared raw input bytes but do not identify who supplied them or establish their license rights.",
      jsonReference(report, "#/provenance/inputs"), sourceReference(contractSource, "provenance"), sourceReference(schemaSource, "rights"))
  ];
}

function uncertaintyAnswer(report) {
  return [createClaim(
    "uncertainty-missing",
    "ABSTAIN: this report schema has no calibrated uncertainty interval, confidence value, or source positional accuracy field, so this input cannot support a quantitative uncertainty claim.",
    sourceReference(schemaSource, "uncertainty"),
    jsonReference(report, "#/report_version")
  )];
}

function errorAnswer(report) {
  return [createClaim(
    "error-semantics",
    "ERROR means an operational, configuration, or input error prevented a policy verdict; no report verdict is produced. It is distinct from BLOCK, which is a completed policy outcome.",
    sourceReference(contractSource, "ERROR"),
    sourceReference(contractSource, "BLOCK")
  )];
}

function unsupportedAnswer(report) {
  return [createClaim(
    "unsupported-claim",
    "ABSTAIN: the report cannot establish a real-world cause, harm, legal effect, or service outcome. It records declared geometric relationships and a configured policy result.",
    sourceReference(contractSource, "limitations"),
    jsonReference(report, "#/relationships"),
    jsonReference(report, "#/policy/status")
  )];
}

function temporalGeographicAnswer(report) {
  return [createClaim(
    "unsupported-temporal-geographic",
    "ABSTAIN: the report has no timestamp, acquisition date, place name, or administrative geography field, so it cannot support a temporal or geographic interpretation. Coordinates are expressed only in the analysis CRS.",
    sourceReference(schemaSource, "temporal_geographic"),
    jsonReference(report, "#/analysis/crs")
  )];
}

function noMatchAnswer(report) {
  return [createClaim(
    "no-supported-intent",
    "ABSTAIN: this question does not match a supported deterministic report query. Ask about the verdict, policy threshold, relationship changes, primary feature changes, metrics, provenance, or evidence limits.",
    sourceReference(schemaSource, "scope")
  )];
}

const topicLabels = {
  provenance: "provenance",
  relationships: "relationship changes",
  primary_metrics: "primary metrics",
  primary_changes: "primary feature changes",
  policy: "policy verdict"
};

function ambiguousAnswer(report, topics) {
  return [createClaim(
    "ambiguous-question",
    `ABSTAIN: this question matches more than one supported report topic (${topics.map((topic) => topicLabels[topic]).join("; ")}). Ask about one topic at a time.`,
    sourceReference(schemaSource, "scope")
  )];
}

// Topic detectors for the answerable intents. A question that matches several is not
// answered with the first match: that would silently drop part of what was asked.
// "changed"/"change" alone is deliberately weak because it is a common verb inside
// questions about relationships and metrics.
const topicPatterns = [
  ["provenance", /\b(provenance|hash(?:es)?|engine versions?|sources?|datasets?|input bytes|crs|coordinate reference system)\b/],
  ["relationships", /\b(relationships?|assignments?|facilit(?:y|ies)|dependents?|regressions?|regressed|within)\b/],
  ["primary_metrics", /\b(area|footprint|displacement|distance|metric|square metres|square meters)\b/],
  ["primary_changes", /\b(features?|added|removed|modified|spatial)\b/],
  ["policy", /\b(verdict|status|pass|block|policy|threshold)\b/]
];

// Lexical guards, not a classifier: they route obvious time and place questions to an
// abstention instead of letting a shared word such as "change" select a feature answer.
const temporalPattern = /\b(when|during|date[sd]?|years?|timestamp|timeline|temporal|recently|happen(?:ed)?|survey|(?:19|20)\d\d)\b/;
const geographicPattern = /\b(where|located|location|latitude|longitude|city|country|region|neighbou?rhood|address|madrid|(?:northern|southern|eastern|western) (?:district|area|zone|region|part|side))\b/;

export function answerQuestion(report, question, options = {}) {
  verifyOptions = { registry: options.registry !== false };
  try {
    return route(report, question);
  } finally {
    verifyOptions = {};
  }
}

function route(report, question) {
  if (typeof question !== "string" || question.trim().length === 0) {
    return finish(report, "unsupported", [createClaim("empty-question", "ABSTAIN: provide a non-empty question.", sourceReference(schemaSource, "scope"))], "ABSTAIN", "empty_question");
  }
  const normalized = question.toLowerCase();

  if (/\berror\b/.test(normalized) && /\b(what|mean|means|semantics|when|difference|explain)\b/.test(normalized)) {
    return finish(report, "error_semantics", errorAnswer(report));
  }
  if (/\b(cause|caused|causal|harm|harmed|injur(?:y|ies|ed|ing)?|damage|real[- ]world|legal effect|resident|health outcome|service use)\b/.test(normalized)) {
    return finish(report, "unsupported_real_world_claim", unsupportedAnswer(report), "ABSTAIN", "unsupported_real_world_claim");
  }
  if (temporalPattern.test(normalized) || geographicPattern.test(normalized)) {
    return finish(report, "unsupported_temporal_or_geographic_claim", temporalGeographicAnswer(report), "ABSTAIN", "unsupported_temporal_or_geographic_claim");
  }
  if (/\b(uncertainty|confidence|accuracy|p[- ]?value|confidence interval|source positional)\b/.test(normalized)) {
    return finish(report, "uncertainty_or_missing_evidence", uncertaintyAnswer(report), "ABSTAIN", "field_not_supported_by_report_contract");
  }

  const topics = topicPatterns.filter(([, pattern]) => pattern.test(normalized)).map(([name]) => name);
  if (topics.length > 1) {
    return finish(report, "ambiguous", ambiguousAnswer(report, topics), "ABSTAIN", "ambiguous_question");
  }
  if (topics[0] === "provenance") return finish(report, "provenance", provenanceAnswer(report));
  if (topics[0] === "relationships") return finish(report, "relationships", relationshipAnswer(report));
  if (topics[0] === "primary_metrics") return finish(report, "primary_metrics", changeAnswer(report));
  if (topics[0] === "primary_changes") return finish(report, "primary_changes", changeAnswer(report));
  if (/\b(changed|change)\b/.test(normalized)) return finish(report, "primary_changes", changeAnswer(report));
  if (topics[0] === "policy") return finish(report, "policy", policyAnswer(report));
  return finish(report, "unsupported", noMatchAnswer(report), "ABSTAIN", "unsupported_question");
}
