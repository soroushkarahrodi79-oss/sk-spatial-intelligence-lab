import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const target = "soroushkararodi/sk-spatial-intelligence-lab";
const sourceRoot = path.resolve("space");
const uploadAllowlist = ["README.md", "index.html", "style.css"];
const protectedPreservePath = ".gitattributes";
const args = process.argv.slice(2);
function option(name, fallback = undefined) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}
const outputDir = path.resolve(option("--out-dir", "work/space-plan"));
const expectedDigest = option("--expected-digest");

function hash(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

async function walk(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await walk(path.join(directory, entry.name), relative));
    else if (entry.isFile()) result.push(relative.replaceAll("\\", "/"));
  }
  return result.sort();
}

async function fetchChecked(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "user-agent": "SK-Spatial-Intelligence-Lab-ReadOnly-Preflight/0.1" } });
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}`);
  return response;
}

const sourcePaths = await walk(sourceRoot);
const expectedSourcePaths = [...uploadAllowlist, protectedPreservePath].sort();
assert.deepEqual(sourcePaths, expectedSourcePaths, `Unexpected Space source paths. Expected ${expectedSourcePaths.join(", ")}; found ${sourcePaths.join(", ")}`);

const sourceFiles = new Map();
for (const file of expectedSourcePaths) {
  const bytes = await readFile(path.join(sourceRoot, file));
  sourceFiles.set(file, { bytes, sha256: hash(bytes) });
}

const spaceReadme = sourceFiles.get("README.md").bytes.toString("utf8");
const frontmatter = spaceReadme.match(/^---\r?\n([\s\S]*?)\r?\n---/);
assert.ok(frontmatter && /^sdk:\s*static\s*$/m.test(frontmatter[1]) && /^app_file:\s*index\.html\s*$/m.test(frontmatter[1]), "Source Space README must preserve sdk: static and app_file: index.html");

const api = await (await fetchChecked(`https://huggingface.co/api/spaces/${target}`)).json();
assert.equal(api.id, target, `Unexpected destination identity: ${api.id}`);
assert.equal(api.sdk, "static", `Destination SDK drifted: ${api.sdk}`);
assert.equal(api.cardData?.sdk, "static", "Destination card metadata must remain Static HTML");
assert.equal(api.cardData?.app_file, "index.html", "Destination entry file metadata must remain index.html");
const destinationPaths = api.siblings.map((item) => item.rfilename).sort();
const unexpectedDestinationPaths = destinationPaths.filter((file) => !expectedSourcePaths.includes(file));
const missingProtectedPath = !destinationPaths.includes(protectedPreservePath);
assert.deepEqual(unexpectedDestinationPaths, [], `Unexpected destination-only paths; review before any sync: ${unexpectedDestinationPaths.join(", ")}`);
assert.ok(!missingProtectedPath, `Expected protected path ${protectedPreservePath} is missing at destination`);

const destinationFiles = new Map();
for (const file of destinationPaths) {
  const rawUrl = `https://huggingface.co/spaces/${target}/resolve/${api.sha}/${file.split("/").map(encodeURIComponent).join("/")}`;
  const bytes = Buffer.from(await (await fetchChecked(rawUrl)).arrayBuffer());
  destinationFiles.set(file, { sha256: hash(bytes) });
}
assert.equal(sourceFiles.get(protectedPreservePath).sha256, destinationFiles.get(protectedPreservePath).sha256, "Protected .gitattributes differs from the live destination; deployment is blocked");

const additions = uploadAllowlist.filter((file) => !destinationFiles.has(file));
const replacements = uploadAllowlist.filter((file) => destinationFiles.has(file) && sourceFiles.get(file).sha256 !== destinationFiles.get(file).sha256);
const unchanged = uploadAllowlist.filter((file) => destinationFiles.has(file) && sourceFiles.get(file).sha256 === destinationFiles.get(file).sha256);
const excludedFromUpload = destinationPaths.filter((file) => !uploadAllowlist.includes(file));
const wouldDeleteWithDefaultMirror = excludedFromUpload;
const actualDeletions = [];

const planCore = {
  target,
  destinationCommit: api.sha,
  destinationLastModified: api.lastModified,
  sdk: api.sdk,
  appFile: api.cardData.app_file,
  uploadAllowlist,
  additions: additions.map((file) => ({ path: file, sourceSha256: sourceFiles.get(file).sha256 })),
  replacements: replacements.map((file) => ({ path: file, sourceSha256: sourceFiles.get(file).sha256, destinationSha256: destinationFiles.get(file).sha256 })),
  unchanged: unchanged.map((file) => ({ path: file, sha256: sourceFiles.get(file).sha256 })),
  preservedOutsideUpload: excludedFromUpload.map((file) => ({ path: file, destinationSha256: destinationFiles.get(file).sha256 })),
  wouldDeleteWithDefaultMirror,
  actualDeletions,
  deletionEnabled: false,
};
const digest = hash(JSON.stringify(planCore));
const plan = { ...planCore, planDigest: digest, status: "ready-for-human-review" };
if (expectedDigest && expectedDigest !== digest) throw new Error(`Destination/source inventory changed after plan review (expected ${expectedDigest}, current ${digest}); create and review a fresh plan`);

const rows = [
  ["Path", "Destination SHA-256", "Source SHA-256", "Plan"],
  ...destinationPaths.map((file) => [
    file,
    destinationFiles.get(file).sha256,
    sourceFiles.get(file)?.sha256 ?? "—",
    uploadAllowlist.includes(file) ? (unchanged.includes(file) ? "unchanged" : "replacement") : "preserved (excluded from upload)",
  ]),
  ...additions.map((file) => [file, "—", sourceFiles.get(file).sha256, "addition"]),
];
const markdown = [
  `# Deployment plan for ${target}`,
  "",
  `- Destination revision: \`${api.sha}\` (branch main at preflight time)`,
  `- Destination SDK: \`${api.sdk}\`; app file: \`${api.cardData.app_file}\``,
  `- Plan digest: \`${digest}\``,
  "- Deletion enabled: **no**. Actual deletions: **none**.",
  `- Would-be deletions if default mirroring were enabled: ${wouldDeleteWithDefaultMirror.map((file) => `\`${file}\``).join(", ") || "none"}.`,
  "",
  "| Path | Destination SHA-256 | Source SHA-256 | Plan |",
  "| --- | --- | --- | --- |",
  ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`),
  "",
  `Additions: ${additions.length}; replacements: ${replacements.length}; unchanged uploads: ${unchanged.length}; preserved outside upload: ${excludedFromUpload.length}.`,
  "",
  "This read-only plan requires a separate owner approval. The plan job did not modify the Hugging Face Space.",
].join("\n");

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
await writeFile(path.join(outputDir, "plan.md"), `${markdown}\n`, "utf8");
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `digest=${digest}\n`, "utf8");
console.log(markdown);
console.log(`PASS read-only deployment preflight (digest ${digest})`);
