import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parse as parseCss } from "css-tree";
import { parseDocument } from "yaml";

const page = await readFile("space/index.html", "utf8");
const spaceReadme = await readFile("space/README.md", "utf8");
const externalCss = await readFile("space/style.css", "utf8");
const backupManifest = JSON.parse(await readFile("backups/huggingface-space/da10c68f/manifest.json", "utf8"));
const packageManifest = JSON.parse(await readFile("package.json", "utf8"));
const releaseVersion = (await readFile("VERSION", "utf8")).trim();

function report(label) {
  console.log(`PASS ${label}`);
}

assert.equal(releaseVersion, packageManifest.version, "VERSION and package.json must match");
report(`release version ${releaseVersion}`);

const frontmatter = spaceReadme.match(/^---\r?\n([\s\S]*?)\r?\n---/);
assert.ok(frontmatter, "Space README must start with YAML metadata");
assert.match(frontmatter[1], /^sdk:\s*static\s*$/m, "Space SDK must remain Static HTML");
assert.match(frontmatter[1], /^app_file:\s*index\.html\s*$/m, "Space entry file must remain index.html");
report("Hugging Face Static SDK metadata");

assert.equal(backupManifest.revision, "da10c68fda4f83e88f249f9d7c415f5b570183eb");
for (const [file, expectedHash] of Object.entries(backupManifest.files)) {
  const bytes = await readFile(`backups/huggingface-space/da10c68f/${file}`);
  const actualHash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  assert.equal(actualHash, expectedHash, `Backup checksum mismatch for ${file}`);
}
report("baseline Space backup checksums");

const styleBlocks = [...page.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
assert.ok(styleBlocks.length > 0, "The page must contain its existing inline stylesheet");
for (const [index, css] of [...styleBlocks, externalCss].entries()) {
  parseCss(css, { positions: true });
  report(index < styleBlocks.length ? `inline CSS block ${index + 1}` : "preserved style.css");
}

const scripts = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
assert.ok(scripts.length > 0, "The page must contain the bilingual language switch script");
for (const [index, source] of scripts.entries()) {
  new vm.Script(source, { filename: `inline-script-${index + 1}.js` });
  report(`JavaScript syntax block ${index + 1}`);
}

const translationsMatch = page.match(/const translations\s*=\s*(\{[\s\S]*?\});\s*function setLanguage/);
assert.ok(translationsMatch, "Could not read the page's translation dictionary");
const translations = vm.runInNewContext(`(${translationsMatch[1]})`, Object.create(null), { timeout: 1000 });
assert.deepEqual(Object.keys(translations.en).sort(), Object.keys(translations.es).sort(), "English and Spanish translation keys must match");
const usedKeys = new Set();
for (const match of page.matchAll(/\bdata-i18n(?:-html|-aria-label)?="([^"]+)"/g)) usedKeys.add(match[1]);
for (const key of usedKeys) {
  assert.ok(Object.hasOwn(translations.en, key), `Missing English translation: ${key}`);
  assert.ok(Object.hasOwn(translations.es, key), `Missing Spanish translation: ${key}`);
}
report(`bilingual translation keys (${usedKeys.size} used keys)`);

assert.match(page, /<html\b[^>]*\blang="en"/i, "Document language must be declared");
assert.match(page, /<main\b/i, "A main landmark is required");
assert.match(page, /<nav\b[^>]*aria-label=/i, "Primary navigation must have an accessible landmark name");
assert.match(page, /<h1\b/i, "A page-level heading is required");
assert.match(page, /:focus-visible\s*\{/i, "Keyboard focus must be visible");
assert.match(page, /class="skip-link"/i, "A keyboard skip link is required");
assert.match(page, /role="img"[^>]*aria-label=/i, "The conceptual illustration must have an accessible name");
report("landmarks, language, skip link, and focus-visible checks");

const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(ids.length, new Set(ids).size, "HTML id attributes must be unique");
const idSet = new Set(ids);
for (const match of page.matchAll(/\bhref="#([^"#]+)"/g)) {
  assert.ok(idSet.has(match[1]), `Broken in-page link: #${match[1]}`);
}
for (const match of page.matchAll(/<a\b([^>]*)>/gi)) {
  const attrs = match[1];
  const targetBlank = /\btarget="_blank"/i.test(attrs);
  const rel = attrs.match(/\brel="([^"]+)"/i)?.[1]?.toLowerCase().split(/\s+/) ?? [];
  if (targetBlank) {
    assert.ok(rel.includes("noopener") && rel.includes("noreferrer"), "New-tab links require rel=noopener noreferrer");
  }
}
report("unique IDs, local anchors, and safe new-tab links");

for (const path of [".github/workflows/validate.yml", ".github/workflows/deploy-space.yml"]) {
  const source = await readFile(path, "utf8");
  const doc = parseDocument(source);
  assert.equal(doc.errors.length, 0, `${path} YAML parse errors: ${doc.errors.map((error) => error.message).join("; ")}`);
  report(`workflow YAML syntax (${path})`);
}

const deployWorkflow = await readFile(".github/workflows/deploy-space.yml", "utf8");
assert.match(deployWorkflow, /^on:\s*\r?\n\s+workflow_dispatch:/m, "Production sync must be manual-only");
assert.doesNotMatch(deployWorkflow, /^\s+(push|pull_request|schedule):/m, "Production sync must not have an automatic trigger");
assert.match(deployWorkflow, /huggingface_repo_id:\s*soroushkararodi\/sk-spatial-intelligence-lab/);
assert.match(deployWorkflow, /repo_type:\s*space\b/);
assert.match(deployWorkflow, /space_sdk:\s*static\b/);
assert.match(deployWorkflow, /hf_token:\s*\$\{\{\s*secrets\.HF_TOKEN\s*\}\}/);
assert.match(deployWorkflow, /delete_removed:\s*false\b/);
assert.match(deployWorkflow, /environment:\s*\r?\n\s+name:\s*huggingface-production/);
assert.match(deployWorkflow, /subdirectory:\s*space\b/);
assert.match(deployWorkflow, /include:\s*\|[\s\S]*README\.md[\s\S]*index\.html[\s\S]*style\.css/);
assert.match(deployWorkflow, /huggingface\/hub-sync@fdffea8e04104d0bd4e3181c5feb3025f0433ff5\s+# v0\.3\.0/);
assert.match(deployWorkflow, /hf_version:\s*2\.3\.0\b/);
report("manual-only, target, SDK, secret, allowlist, environment, and no-delete deployment policy");

assert.doesNotMatch(`${page}\n${spaceReadme}\n${deployWorkflow}`, /hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}/, "No API token may appear in public source");
report("public source contains no token-shaped credentials");
