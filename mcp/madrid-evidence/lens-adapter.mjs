// Minimal adapter between SK Lab's MCP server and the Madrid Urban Evidence Lens
// evidence registry (js/evidence-registry.js).
//
// It contains NO spatial or provenance logic. It (1) verifies that a local Lens
// checkout is the pinned one, (2) wires the real Lens modules the way Lens's own
// tests do, and (3) forwards registered shapes to `registry.query`. Lens's
// result is returned verbatim, so nulls and abstentions are preserved.
//
// Only the files listed in lens-pin.json are ever read. No client input is used
// to build a path, a query string or code.
//
// Verified code is what runs: the pinned bytes are hashed once, written to a
// private temporary directory, imported from THERE (never from the Lens checkout,
// so the checkout cannot change between hash and import), re-hashed after the
// import, and the directory is deleted. Any mismatch aborts startup.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PIN = JSON.parse(readFileSync(path.join(HERE, "lens-pin.json"), "utf8"));
// Additive pin for licences_in_lens (v0.3). Kept in its own file so lens-pin.json, and with it the
// sealed v0.1 benchmark, is unchanged.
export const LICENCE_PIN = JSON.parse(readFileSync(path.join(HERE, "lens-pin-licences.json"), "utf8"));

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function verifyCommit(root) {
  let head;
  try {
    head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return false; // not a git checkout (e.g. an exported tree): file hashes still gate startup
  }
  if (head !== PIN.commit) {
    throw new Error(`Lens checkout is at ${head}, expected pinned commit ${PIN.commit}`);
  }
  return true;
}

export async function loadLens(lensRoot) {
  if (typeof lensRoot !== "string" || lensRoot.length === 0) {
    throw new Error("MADRID_LENS_ROOT must point to a local checkout of madrid-tourism-intelligence-lens");
  }
  const root = realpathSync(path.resolve(lensRoot));
  if (!statSync(root).isDirectory()) throw new Error(`MADRID_LENS_ROOT is not a directory: ${root}`);

  const commitVerifiedByGit = verifyCommit(root);

  const files = new Map();
  for (const entry of PIN.files) {
    const bytes = readFileSync(path.join(root, ...entry.path.split("/")));
    const actual = sha256(bytes);
    if (actual !== entry.sha256) {
      throw new Error(`${entry.path} does not match the pinned Lens commit ${PIN.commit} (sha256 ${actual})`);
    }
    files.set(entry.path, { path: entry.path, role: entry.role, sha256: actual, bytes: bytes.length, content: bytes });
  }
  // The additive licence pin is verified after the main pin, the same way, and only for the same commit.
  if (LICENCE_PIN.commit !== PIN.commit) throw new Error("lens-pin-licences.json names a different Lens commit than lens-pin.json");
  for (const entry of LICENCE_PIN.files) {
    const bytes = readFileSync(path.join(root, ...entry.path.split("/")));
    const actual = sha256(bytes);
    if (actual !== entry.sha256) {
      throw new Error(`${entry.path} does not match the pinned Lens commit ${PIN.commit} (sha256 ${actual})`);
    }
    files.set(entry.path, { path: entry.path, role: entry.role, sha256: actual, bytes: bytes.length, content: bytes });
  }
  const ALL_PINNED = [...PIN.files, ...LICENCE_PIN.files];
  // Data is parsed from the very bytes that were hashed above.
  const json = (rel) => JSON.parse(files.get(rel).content.toString("utf8"));

  // Load the verified bytes from a private copy, not from the checkout.
  const sandbox = mkdtempSync(path.join(tmpdir(), "madrid-evidence-lens-"));
  let registryApi;
  let planning;
  let change;
  let comparisonAdapter;
  let licenceModule;
  try {
    const codeFiles = ALL_PINNED.filter((f) => f.role === "code");
    for (const { path: rel } of codeFiles) {
      const target = path.join(sandbox, ...rel.split("/"));
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, files.get(rel).content, { mode: 0o444 });
    }
    registryApi = createRequire(path.join(sandbox, "package.json"))("./js/evidence-registry.js");
    const fromSandbox = (rel) => import(pathToFileURL(path.join(sandbox, ...rel.split("/"))).href);
    planning = await fromSandbox("js/planning-ambito.js");
    change = await fromSandbox("js/ambito-change.js");
    comparisonAdapter = await fromSandbox("js/ambito-comparison-adapter.js");
    licenceModule = await fromSandbox("js/urban-licences.js");
    // Everything Node loaded came from these files; confirm they still hold the verified bytes.
    for (const { path: rel, sha256: expected } of codeFiles) {
      const after = sha256(readFileSync(path.join(sandbox, ...rel.split("/"))));
      if (after !== expected) throw new Error(`${rel} changed while it was being loaded`);
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }

  const stateArtifact = json("data/planning/madrid_ambito_state.json");
  const planningIndex = planning.createPlanningIndex({
    geometry: json("data/planning/madrid_ambitos.geojson"),
    state: stateArtifact,
  });
  if (!planningIndex) throw new Error("Lens planning ámbito geometry is unusable");

  // Wired exactly as Lens's own tests wire AMBITO_EDITION_DIFF (tests/evidence_registry.test.mjs):
  // the two editions come from the state artifact's change_detection block.
  // Wired exactly as Lens's own tests wire it (tests/evidence_registry.test.mjs): the index built by
  // Lens's own createLicenceIndex from the committed artifact.
  const licenceIndex = licenceModule.createLicenceIndex(json("data/planning/madrid_urban_licences.json"));
  if (!licenceIndex) throw new Error("Lens urban-licences artifact is unusable");
  const cd = stateArtifact.change_detection;
  const edition = (side) => ({ reference_date: side.reference_date, families: side.families });
  const registry = registryApi.createEvidenceRegistry({
    registry: json("data/source_registry.json"),
    planningIndex,
    planningModule: { AMBITO_STATE: planning.AMBITO_STATE, AVAILABILITY: planning.AVAILABILITY },
    licenceIndex,
    ambitoEditionDiff: (code) =>
      change.buildAmbitoComparison({ previous: edition(cd.previous), current: edition(cd.current), exactCode: code }),
    ambitoEditionCodeKnown: (code) => comparisonAdapter.ambitoEditionContainsCode(code, stateArtifact),
  });

  const REGISTRY = "data/source_registry.json";
  const GEOMETRY = "data/planning/madrid_ambitos.geojson";
  const STATE = "data/planning/madrid_ambito_state.json";
  const RESOLVER = ["js/evidence-registry.js", "js/evidence-scope.js"];
  const PLANNING = ["js/planning-ambito.js", "js/geography.js"];
  // Files that support each Lens query: what its resolver actually consults.
  const SUPPORT = {
    AMBITO_AT_POINT: [GEOMETRY, REGISTRY, ...RESOLVER, ...PLANNING],
    SOURCE_PROVENANCE: [REGISTRY, ...RESOLVER, ...PLANNING],
    AMBITO_PHASES: [STATE, GEOMETRY, REGISTRY, ...RESOLVER, ...PLANNING],
    AMBITO_EDITION_DIFF: [STATE, REGISTRY, ...RESOLVER, "js/ambito-change.js", "js/ambito-comparison-adapter.js"],
    LICENCES_IN_LENS: ["data/planning/madrid_urban_licences.json", REGISTRY, ...RESOLVER, "js/urban-licences.js"],
  };
  // Every pinned file, in pin order, with the SHA-256 verified at startup. This is
  // the same list for every call: it says what the server loaded, not what a given
  // result rests on.
  const verifiedAtStartup = ALL_PINNED.map((f) => {
    const { path: filePath, role, sha256: hash, bytes } = files.get(f.path);
    return { path: filePath, role, sha256: hash, bytes };
  });
  const supportFor = (shape) => SUPPORT[shape].map((p) => ({ path: p, sha256: files.get(p).sha256 }));
  const reading = (shapes) => ({
    lensRepository: PIN.repository,
    lensCommit: PIN.commit,
    commitVerifiedByGit,
    verifiedAtStartup: {
      note: `All ${verifiedAtStartup.length} files the server ever reads, hashed and matched against lens-pin.json before startup (the server does not start otherwise). The same list for every call; not every file backs every result.`,
      files: verifiedAtStartup,
    },
    // For each Lens result returned, the verified files its resolver consults, with
    // the hash verified at startup. A file verified at startup but absent here was
    // loaded but not consulted for that result.
    supports: Object.fromEntries(shapes.map((s) => [s, supportFor(s)])),
    sha256Note:
      "SHA-256 computed by SK Lab over the bytes it read from the Lens checkout and matched against lens-pin.json before use. Data was parsed from those bytes; code was loaded from a private copy of them and re-hashed after loading. This shows the code and data match the pinned files; it does not show the Lens results are correct. Lens's source_registry.json declares a sha256 for only some sources, so these are not registry-declared hashes.",
  });

  return {
    // LICENCES_IN_LENS, forwarded to the Lens registry unchanged. The only difference from Lens's
    // evidence object is a declared presentation filter: `value.records` (the individual licence
    // records, which carry barrio, zoning and protection fields) is removed, and the response says
    // so with the boolean `recordsOmitted`. No count is computed here: `perFamily` is Lens's own and
    // no cross-family sum, matched count or omitted count is added.
    licencesInLens({ lon, lat, radiusM, families, window }) {
      const params = { lon, lat, radiusM };
      if (families !== undefined) params.families = families;
      if (window !== undefined) params.window = window;
      const lensResult = registry.query("LICENCES_IN_LENS", params);
      const result = JSON.parse(JSON.stringify(lensResult));
      if (result.kind === "EVIDENCE" && result.value && typeof result.value === "object") delete result.value.records;
      return {
        shape: "LICENCES_IN_LENS",
        input: params,
        result,
        recordsOmitted: true,
        presentationNote:
          "Individual licence records are not returned by this tool. `result` is Lens's evidence object with only `value.records` removed; `perFamily`, `window`, `coverage`, `ceiling`, `scope` and `applied` are Lens's own. Counts are per family and are never summed. Not a count by ámbito or barrio.",
        reading: reading(["LICENCES_IN_LENS"]),
      };
    },
    ambitoAtPoint({ lon, lat }) {
      return {
        shape: "AMBITO_AT_POINT",
        input: { lon, lat },
        result: registry.query("AMBITO_AT_POINT", { lon, lat }),
        reading: reading(["AMBITO_AT_POINT"]),
      };
    },
    sourceProvenance({ sourceId }) {
      return {
        shape: "SOURCE_PROVENANCE",
        input: { sourceId },
        result: registry.query("SOURCE_PROVENANCE", { sourceId }),
        reading: reading(["SOURCE_PROVENANCE"]),
      };
    },
    // Composition of three existing Lens queries. The ámbito code passed to the
    // second and third is exactly the one AMBITO_AT_POINT returned; when the point
    // resolves no ámbito nothing further is queried (no code is invented, no
    // neighbouring ámbito is consulted). Each Lens answer is returned unmodified.
    ambitoSnapshotAtPoint({ lon, lat }) {
      const ambitoAtPoint = registry.query("AMBITO_AT_POINT", { lon, lat });
      const code =
        ambitoAtPoint.kind === "EVIDENCE" && typeof ambitoAtPoint.value?.ambitoCode === "string"
          ? ambitoAtPoint.value.ambitoCode
          : null;
      const ran = code === null ? ["AMBITO_AT_POINT"] : ["AMBITO_AT_POINT", "AMBITO_PHASES", "AMBITO_EDITION_DIFF"];
      return {
        composition: ["AMBITO_AT_POINT", "AMBITO_PHASES", "AMBITO_EDITION_DIFF"],
        input: { lon, lat },
        queriedCode: code,
        ambitoAtPoint,
        ambitoPhases: code === null ? null : registry.query("AMBITO_PHASES", { code }),
        ambitoEditionDiff: code === null ? null : registry.query("AMBITO_EDITION_DIFF", { code }),
        notQueried:
          code === null
            ? "AMBITO_AT_POINT returned no ámbito code, so AMBITO_PHASES and AMBITO_EDITION_DIFF were not queried."
            : null,
        reading: reading(ran),
      };
    },
  };
}
