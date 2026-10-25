// Seeded, dependency-free generator of schema-valid GeoImpact-CI V4/V5-shaped reports.
//
// Every report is invented. The spec that produced it is returned alongside, so the
// evaluation oracle can state expected facts from the spec itself and never from the code
// under test. Re-running with the same seed and options reproduces the same bytes; the
// frozen SHA-256 values in manifest.json detect any drift.

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const measurementStyles = [
  (rand) => Math.floor(rand() * 5000),
  (rand) => Math.round(rand() * 1e6) / 100,
  (rand) => rand() * 100000,
  (rand) => 1e-7 * (1 + Math.floor(rand() * 9)),
  (rand) => 1.5e21,
  () => 0
];

const versionSets = [
  { geoimpact_ci: "1.2.0", shapely: "2.1.2", geos: "3.13.1", pyproj: "3.7.2", proj: "9.5.1" },
  { geoimpact_ci: "1.2.0", shapely: "2.0.7", geos: "3.12.2-CAPI-1.18.2", pyproj: "3.6.1", proj: "9.4.0" },
  { geoimpact_ci: "1.2.0+local.7", shapely: "2.1.2", geos: "3.13.1", pyproj: "3.7.2rc1", proj: "9.5.1" }
];

const sha = (rand) => Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(rand() * 16)]).join("");

export function makeSpec(seed, overrides = {}) {
  const rand = mulberry32(seed);
  const pick = (items) => items[Math.floor(rand() * items.length)];
  const version = overrides.report_version ?? (rand() < 0.35 ? "4" : "5");
  const dependencyCount = overrides.dependency_count ?? 1 + Math.floor(rand() * 3);
  const regressionCount = overrides.regression_count ?? pick([0, 0, 1, 1, 2, 3, 5]);
  const threshold = overrides.threshold ?? pick([0, 0, 1, 2, 4]);
  const primaryChanged = overrides.primary_changed ?? (regressionCount > 0 || rand() < 0.5);
  const featureCount = Math.max(4, overrides.feature_count ?? 4 + Math.floor(rand() * 6));
  const tag = `${seed.toString(36)}`;
  const featureIds = Array.from({ length: featureCount }, (_, index) => `zone-${tag}-${index + 1}`);
  const statuses = Object.fromEntries(featureIds.map((id) => [id, "unchanged"]));
  if (primaryChanged) {
    const modified = featureIds[0];
    statuses[modified] = "modified";
    if (rand() < 0.5) statuses[featureIds[1]] = "added";
    if (rand() < 0.4) statuses[featureIds[2]] = "removed";
  }
  const style = pick(measurementStyles);
  const area = primaryChanged ? style(rand) : 0;
  const displacement = primaryChanged ? pick(measurementStyles)(rand) : 0;
  return {
    seed,
    report_version: version,
    dependency_datasets: Array.from({ length: dependencyCount }, (_, index) => `synthetic-dependents-${tag}-${String.fromCharCode(97 + index)}`),
    primary_dataset: `synthetic-districts-${tag}`,
    regression_count: regressionCount,
    unchanged_relationship_count: overrides.unchanged_relationship_count ?? Math.floor(rand() * 3),
    threshold,
    feature_statuses: statuses,
    area,
    displacement,
    engine: pick(versionSets),
    hash_seed: Math.floor(rand() * 2 ** 31)
  };
}

function regressionFor(spec, rand, index) {
  const tag = spec.seed.toString(36);
  const kind = ["assignment_lost", "assignment_gained", "assignment_changed"][index % 3];
  const featureIds = Object.keys(spec.feature_statuses);
  const before = kind === "assignment_gained" ? [] : [featureIds[2]];
  const after = kind === "assignment_lost" ? [] : kind === "assignment_gained" ? [featureIds[2]] : [featureIds[3]];
  const dataset = spec.dependency_datasets[index % spec.dependency_datasets.length];
  return {
    evidence_id: `regression-${tag}-${String(index).padStart(4, "0")}`,
    primary_dataset: spec.primary_dataset,
    primary_feature_ids: [featureIds[0]],
    dependent_dataset: dataset,
    dependent_id: `facility-${tag}-${String(index).padStart(4, "0")}`,
    predicate: "within",
    before,
    after,
    change_type: kind,
    evidence_geometry_crs: "EPSG:25830",
    evidence_geometry: { type: "Point", coordinates: [500000 + Math.floor(rand() * 1000), 4500000 + Math.floor(rand() * 1000)] }
  };
}

export function buildReport(spec) {
  const rand = mulberry32(spec.hash_seed ^ 0x9e3779b9);
  const regressions = Array.from({ length: spec.regression_count }, (_, index) => regressionFor(spec, rand, index));
  const unchanged = Array.from({ length: spec.unchanged_relationship_count }, (_, index) => ({
    dependent_dataset: spec.dependency_datasets[0],
    dependent_id: `stable-${spec.seed.toString(36)}-${index}`,
    predicate: "within",
    before: [Object.keys(spec.feature_statuses)[3]],
    after: [Object.keys(spec.feature_statuses)[3]],
    change_type: "unchanged"
  }));
  const relationships = [
    ...regressions.map(({ dependent_dataset, dependent_id, predicate, before, after, change_type }) => ({ dependent_dataset, dependent_id, predicate, before, after, change_type })),
    ...unchanged
  ];
  const ids = Object.entries(spec.feature_statuses);
  const idsWith = (status) => ids.filter(([, value]) => value === status).map(([id]) => id);
  const report = {
    report_version: spec.report_version,
    analysis: {
      crs: "EPSG:25830",
      dependencies: spec.dependency_datasets.map((dataset) => ({ dataset, id_field: "facility_id", predicate: "within" })),
      primary_dataset: spec.primary_dataset,
      primary_id_field: "district_id"
    },
    boundary_ambiguities: [],
    policy: {
      evidence_ids: regressions.map((item) => item.evidence_id),
      observed_value: regressions.length,
      rule: "max_relationship_regressions",
      status: regressions.length <= spec.threshold ? "PASS" : "BLOCK",
      threshold: spec.threshold
    },
    primary_change: {
      added_feature_ids: idsWith("added"),
      changed_feature_ids: ids.filter(([, value]) => value !== "unchanged").map(([id]) => id),
      changed_footprint_area_m2: spec.area,
      changed_footprint_geometry: null,
      feature_geometry_status: spec.feature_statuses,
      max_boundary_displacement_m: spec.displacement,
      modified_feature_ids: idsWith("modified"),
      removed_feature_ids: idsWith("removed")
    },
    relationship_regressions: regressions,
    relationships,
    verdict: regressions.length <= spec.threshold ? "PASS" : "BLOCK"
  };
  if (spec.report_version === "5") {
    const identity = (dataset) => ({ dataset, sha256: sha(rand), size_bytes: 100 + Math.floor(rand() * 5000) });
    report.provenance = {
      engine: spec.engine,
      hash_algorithm: "sha256",
      inputs: {
        config: { sha256: sha(rand), size_bytes: 200 + Math.floor(rand() * 400) },
        dependencies: spec.dependency_datasets.map(identity),
        primary: { base: identity(spec.primary_dataset), candidate: identity(spec.primary_dataset) }
      }
    };
  }
  return report;
}

export function generateReports(seeds, overrides = {}) {
  return seeds.map((seed) => {
    const spec = makeSpec(seed, typeof overrides === "function" ? overrides(seed) : overrides);
    return { seed, spec, report: buildReport(spec) };
  });
}

export function range(first, count) {
  return Array.from({ length: count }, (_, index) => first + index);
}
