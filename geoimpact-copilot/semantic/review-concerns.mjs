// Concerns the AUTHOR of the vocabulary could not resolve alone. They are prompts for an
// independent reviewer, not findings and not decisions. Nothing here approves, rejects or
// scores an entry. Keys are normalised claim IDs (see normalizeClaimId); a test fails if a key
// no longer names a claim in the vocabulary, so stale concerns cannot linger silently.

export const globalConcerns = [
  { id: "G1", text: "Every sentence, the gate that enforces it, the generator that exercises it and the labels that test it were written by one author. Nothing here has been checked by anyone else." },
  { id: "G2", text: "Example renderings in this packet come from invented, schema-valid reports. They show what a sentence looks like; they are not evidence that it is true of any real GeoImpact-CI output." },
  { id: "G3", text: "The geographic / temporal / causal / legal / scientific flags are keyword hints. A missing flag does not make a sentence safe." },
  { id: "G4", text: "The contract text quoted as source evidence was inspected on 2026-10-24 against GeoImpact-CI v1.2.0. A reviewer must compare it with the upstream file at that tag; this packet cannot do that for you and the upstream repository was not modified or re-read to build it." },
  { id: "G5", text: "No genuine, rights-cleared GeoImpact-CI V4/V5 report has been evaluated. See docs/geoimpact-v0.2.1-evidence-intake.md." }
];

// severity: "high" moves an entry to the front of its tier.
export const claimConcerns = {
  "policy-comparison": [
    { severity: "high", text: "\"against a threshold of N\" does not state the comparison. Confirm from the GeoImpact-CI policy contract that exceeding means observed strictly greater than the threshold (the PASS fixture has observed = threshold = 0), and that a reader cannot take it as a ratio or percentage." }
  ],
  "policy-meaning": [
    { severity: "high", text: "BLOCK variant: asserts that the analysis completed and the threshold was exceeded. Both come from contract text rather than from the report's own numbers. Confirm a report with BLOCK and observed <= threshold cannot pass schema validation." },
    { severity: "high", text: "PASS variant: \"was not exceeded\" is true at observed = threshold only if exceeding is strictly greater-than. Same contract question as policy-comparison." }
  ],
  "metric-limits": [
    { severity: "high", text: "Affirmative scientific claim: the displacement metric \"applies to modified shared IDs only\". Compare with ARCHITECTURE_V1 (displacement). Also decide whether \"does not establish source positional accuracy\" could be misread as implying the metric is otherwise accurate." }
  ],
  "primary-change-metrics": [
    { severity: "high", text: "The unit is always rendered as m² and m. That is correct only if the analysis CRS is metric. Confirm what the GeoImpact-CI contract guarantees about the CRS, or whether the answer should name the CRS beside these numbers." }
  ],
  "provenance-absent-v*": [
    { severity: "high", text: "Affirmative claim about what V5 adds, including \"without changing the spatial semantics\". The source record says \"scientific semantics\". Confirm the paraphrase is faithful." }
  ],
  "provenance-limit": [
    { severity: "high", text: "Legal / rights disclaimer. \"identify the report's declared raw input bytes\" could be read as meaning the hashes were verified against files. Confirm that matches the report's input_hashes semantics." }
  ],
  "provenance-source-limits": [
    { severity: "high", text: "Absent-field claim (no source URLs or data-license rights). True only while the report schema forbids such fields; confirm against report-v4-v5.schema.json at the pinned commit." }
  ],
  "unsupported-temporal-geographic": [
    { severity: "high", text: "Contains an affirmative geographic sentence inside an abstention: \"Coordinates are expressed only in the analysis CRS.\" Confirm it against the schema, and that it does not suggest the CRS identifies a place." }
  ],
  "unsupported-claim": [
    { severity: "high", text: "Contains an affirmative sentence inside an abstention: \"It records declared geometric relationships and a configured policy result.\" Confirm \"declared geometric relationships\" is accurate for the report fields." }
  ],
  "relationship-*": [
    { severity: "high", text: "\"links the change to\" joins an evidence ID to primary feature IDs. Decide whether \"links\" could be read as causation or as an access/service relationship rather than a recorded association." }
  ],
  "relationship-limits": [
    { severity: "normal", text: "\"although primary feature changes are present\" sets up a contrast that implies an expectation. Decide whether that wording is a neutral statement of fact." },
    { severity: "normal", text: "The has_regressions sentence is a disclaimer listing what is not established (legal, causal, access, service-use, socioeconomic). Confirm the list matches the upstream limitations text." }
  ],
  "provenance-engine": [
    { severity: "normal", text: "Engine values can be placeholders (see block-v5.json). The sentence only lists them; confirm it never implies they are verified versions." }
  ],
  "no-supported-intent": [
    { severity: "normal", text: "Names the topics the copilot can answer. Confirm each named topic is actually answerable, and that none is missing." }
  ],
  "error-semantics": [
    { severity: "normal", text: "Confirm the distinction between ERROR and BLOCK matches the upstream README and that a V4/V5 report can never carry an ERROR verdict." }
  ],
  "uncertainty-missing": [
    { severity: "normal", text: "The upstream 1e-6 m grids are computational choices, not accuracy. Confirm this sentence does not read as claiming the data are certain." }
  ],
  "ambiguous-question": [
    { severity: "normal", text: "Variants differ only in the topic list. Confirm every topic name is one the copilot supports and the list is not misleading when two topics are named." }
  ]
};

// Plain-language meaning of each condition that gates an entry. A test requires this to cover
// exactly the predicates the gate implements.
export const conditionMeaning = {
  no_regressions: "the report lists zero changed dependent relationship records",
  has_regressions: "the report lists at least one changed dependent relationship record",
  primary_changed: "at least one primary feature ID is recorded as changed",
  no_primary_changed: "no primary feature ID is recorded as changed",
  has_dependencies: "the analysis names at least one dependency dataset",
  no_dependencies: "the analysis names no dependency dataset"
};
