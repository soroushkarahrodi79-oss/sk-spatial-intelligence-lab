// Minimal adapter between SK Lab's MCP server and the Madrid Urban Evidence Lens
// evidence registry (js/evidence-registry.js).
//
// It contains NO spatial or provenance logic. It (1) verifies that a local Lens
// checkout is the pinned one, (2) wires the real Lens modules the way Lens's own
// tests do, and (3) forwards two registered shapes to `registry.query`. Lens's
// result is returned verbatim, so nulls and abstentions are preserved.
//
// Only the files listed in lens-pin.json are ever read. No client input is used
// to build a path, a query string or code.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PIN = JSON.parse(readFileSync(path.join(HERE, "lens-pin.json"), "utf8"));

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
  // Data is parsed from the very bytes that were hashed above.
  const json = (rel) => JSON.parse(files.get(rel).content.toString("utf8"));

  const requireFromLens = createRequire(path.join(root, "package.json"));
  const registryApi = requireFromLens("./js/evidence-registry.js");
  const planning = await import(pathToFileURL(path.join(root, "js", "planning-ambito.js")).href);

  const planningIndex = planning.createPlanningIndex({ geometry: json("data/planning/madrid_ambitos.geojson") });
  if (!planningIndex) throw new Error("Lens planning ámbito geometry is unusable");

  const registry = registryApi.createEvidenceRegistry({
    registry: json("data/source_registry.json"),
    planningIndex,
    planningModule: { AMBITO_STATE: planning.AMBITO_STATE, AVAILABILITY: planning.AVAILABILITY },
  });

  const CODE = PIN.files.filter((f) => f.role === "code").map((f) => f.path);
  const reading = (dataPaths) => ({
    lensRepository: PIN.repository,
    lensCommit: PIN.commit,
    commitVerifiedByGit,
    sha256Note:
      "Computed by SK Lab over the exact bytes it read. Lens's source_registry.json declares a sha256 for only some sources, so these are not registry-declared hashes.",
    files: [...dataPaths, ...CODE].map((p) => {
      const { path: filePath, role, sha256: hash, bytes } = files.get(p);
      return { path: filePath, role, sha256: hash, bytes };
    }),
  });

  return {
    ambitoAtPoint({ lon, lat }) {
      return {
        shape: "AMBITO_AT_POINT",
        input: { lon, lat },
        result: registry.query("AMBITO_AT_POINT", { lon, lat }),
        reading: reading(["data/planning/madrid_ambitos.geojson", "data/source_registry.json"]),
      };
    },
    sourceProvenance({ sourceId }) {
      return {
        shape: "SOURCE_PROVENANCE",
        input: { sourceId },
        result: registry.query("SOURCE_PROVENANCE", { sourceId }),
        reading: reading(["data/source_registry.json"]),
      };
    },
  };
}
