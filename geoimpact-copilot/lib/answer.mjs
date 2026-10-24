import { derivedCountReference, jsonReference, jsonStringListReference, jsonStringReference, sourceReference, verifyAnswerEvidence } from "./evidence.mjs";

const contractSource = "geoimpact-ci-readme-v1.2.0";
const architectureSource = "geoimpact-ci-architecture-v1";
const schemaSource = "copilot-report-schema-v4-v5";

function quoted(value) {
  return JSON.stringify(value);
}

function quotedList(values) {
  return values.length ? values.map(quoted).join(", ") : "none";
}

function createClaim(id, text, ...references) {
  return { id, text, references };
}

function finish(report, intent, claims, decision = "ANSWER", reason = null) {
  const answer = {
    decision,
    mode: "deterministic",
    intent,
    report_version: report.report_version,
    report_version_reference: jsonReference(report, "#/report_version"),
    answer: claims.map((claim) => claim.text).join(" "),
    claims,
    reason
  };
  verifyAnswerEvidence(answer, report);
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
    createClaim("policy-comparison", `The configured rule observed ${policy.observed_value} relationship regressions against a threshold of ${policy.threshold}.`, jsonReference(report, "#/policy/rule"), jsonReference(report, "#/policy/observed_value"), jsonReference(report, "#/policy/threshold")),
    createClaim("policy-meaning", consequence, meaning)
  ];
}

function relationshipAnswer(report) {
  const changed = report.relationship_regressions.map((record, index) => ({ record, index }));
  const countRef = derivedCountReference(report, "#/relationship_regressions", "count");
  const claims = [createClaim(
    "relationship-count",
    `The report lists ${countRef.value} changed dependent relationship record${countRef.value === 1 ? "" : "s"}.`,
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
    for (const { record, index } of changed) {
      claims.push(createClaim(
        `relationship-${index}`,
        `${quoted(record.dependent_dataset)} / ${quoted(record.dependent_id)}: before ${quotedList(record.before)}; after ${quotedList(record.after)} (${record.change_type}). Evidence ID ${quoted(record.evidence_id)} links the change to primary feature IDs ${quotedList(record.primary_feature_ids)}.`,
        jsonStringReference(report, `#/relationship_regressions/${index}/dependent_dataset`, "identifier"),
        jsonStringReference(report, `#/relationship_regressions/${index}/dependent_id`, "identifier"),
        jsonStringListReference(report, `#/relationship_regressions/${index}/before`),
        jsonStringListReference(report, `#/relationship_regressions/${index}/after`),
        jsonStringReference(report, `#/relationship_regressions/${index}/change_type`, "identifier"),
        jsonStringReference(report, `#/relationship_regressions/${index}/evidence_id`, "identifier"),
        jsonStringListReference(report, `#/relationship_regressions/${index}/primary_feature_ids`),
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
  return [
    createClaim(
      "primary-feature-changes",
      `Changed feature IDs: ${quotedList(change.changed_feature_ids)}. Added: ${quotedList(change.added_feature_ids)}. Removed: ${quotedList(change.removed_feature_ids)}. Modified: ${quotedList(change.modified_feature_ids)}.`,
      jsonStringListReference(report, "#/primary_change/changed_feature_ids"),
      jsonStringListReference(report, "#/primary_change/added_feature_ids"),
      jsonStringListReference(report, "#/primary_change/removed_feature_ids"),
      jsonStringListReference(report, "#/primary_change/modified_feature_ids"),
      jsonReference(report, "#/primary_change/feature_geometry_status"),
      sourceReference(architectureSource, "changes")
    ),
    createClaim(
      "primary-change-metrics",
      `Changed footprint area: ${change.changed_footprint_area_m2} m². Maximum boundary displacement: ${change.max_boundary_displacement_m} m.`,
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
  const dependencyDatasetReferences = report.analysis.dependencies.map((_, index) =>
    jsonStringReference(report, `#/analysis/dependencies/${index}/dataset`, "identifier"));
  const datasetClaims = [
    createClaim("provenance-datasets", `Logical datasets named: primary ${quoted(report.analysis.primary_dataset)}; dependencies ${quotedList(report.analysis.dependencies.map((dependency) => dependency.dataset))}.`,
      jsonStringReference(report, "#/analysis/primary_dataset", "identifier"), ...dependencyDatasetReferences,
      jsonReference(report, "#/analysis/dependencies")),
    createClaim("provenance-source-limits", "These are logical dataset names; the report does not include source URLs or data-license rights.",
      jsonReference(report, "#/analysis/dependencies"), sourceReference(schemaSource, "source_locations"), sourceReference(schemaSource, "rights"))
  ];
  if (report.report_version === "4") {
    return [...datasetClaims,
      createClaim("provenance-absent-v4", "This V4 report has no provenance object. V5 adds input-byte SHA-256 identities and engine versions without changing the spatial semantics.",
        jsonStringReference(report, "#/report_version", "report_version"), sourceReference(architectureSource, "v4_v5"))
    ];
  }
  const engine = report.provenance.engine;
  const engineReferences = Object.keys(engine).map((key) =>
    jsonStringReference(report, `#/provenance/engine/${key}`, "software_version"));
  return [
    ...datasetClaims,
    createClaim("provenance-version", `Report version V${report.report_version}; analysis CRS ${report.analysis.crs}; hash algorithm ${report.provenance.hash_algorithm}.`,
      jsonStringReference(report, "#/report_version", "report_version"),
      jsonStringReference(report, "#/analysis/crs", "identifier"),
      jsonStringReference(report, "#/provenance/hash_algorithm", "identifier")),
    createClaim("provenance-engine", `Engine values listed: GeoImpact-CI ${engine.geoimpact_ci}; Shapely ${engine.shapely}; GEOS ${engine.geos}; PyProj ${engine.pyproj}; PROJ ${engine.proj}.`,
      jsonReference(report, "#/provenance/engine"), ...engineReferences),
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

function noMatchAnswer(report) {
  return [createClaim(
    "no-supported-intent",
    "ABSTAIN: this question does not match a supported deterministic report query. Ask about the verdict, policy threshold, relationship changes, primary feature changes, metrics, provenance, or evidence limits.",
    sourceReference(schemaSource, "scope")
  )];
}

export function answerQuestion(report, question) {
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
  if (/\b(uncertainty|confidence|accuracy|p[- ]?value|confidence interval|source positional)\b/.test(normalized)) {
    return finish(report, "uncertainty_or_missing_evidence", uncertaintyAnswer(report), "ABSTAIN", "field_not_supported_by_report_contract");
  }
  if (/\b(provenance|hash|engine version|sources?|dataset|input bytes|crs|coordinate reference system)\b/.test(normalized)) {
    return finish(report, "provenance", provenanceAnswer(report));
  }
  if (/\b(relationship|assignment|facility|dependent|regression|regressed|within)\b/.test(normalized)) {
    return finish(report, "relationships", relationshipAnswer(report));
  }
  if (/\b(area|footprint|displacement|distance|metric|square metres|square meters)\b/.test(normalized)) {
    return finish(report, "primary_metrics", changeAnswer(report));
  }
  if (/\b(changed|change|feature|added|removed|modified|spatial)\b/.test(normalized)) {
    return finish(report, "primary_changes", changeAnswer(report));
  }
  if (/\b(verdict|status|pass|block|policy|threshold)\b/.test(normalized)) {
    return finish(report, "policy", policyAnswer(report));
  }
  return finish(report, "unsupported", noMatchAnswer(report), "ABSTAIN", "unsupported_question");
}
