// Claim-to-source traceability checks for data/evidence-catalog.json (GeoAI-2B).
//   node scripts/claim-trace.mjs --write-excerpts   fetch the cited lines at the pinned commits and write data/claim-excerpts.json
//   node scripts/claim-trace.mjs --online            compare data/claim-excerpts.json with the live pinned upstream files
// The offline check lives in checkTrace() and runs inside `npm run check:evidence`.
//
// A citation is accepted only if the cited line range, read from a verbatim excerpt of the pinned file,
// contains the claim's anchor terms and every number the claim states. A URL that merely responds proves nothing.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const excerptsPath = "data/claim-excerpts.json";
export const requiredTracedRecords = ["EV-GIC-001", "EV-GIC-002", "EV-SAL-002"];
export const statementKinds = ["claim", "method", "limitation"];
const maxRangeLines = 40;
const blobUrl = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([0-9a-f]{40})\/([^\s#?]+)$/;
const overclaimEn = /\b(validated|verified|certified|proven|proves|proof|ground[- ]truth|guarantee[sd]?|accurate|accuracy of|independently (validated|reviewed)|AI-generated)\b/i;
const overclaimEs = /\b(validad[oa]s?|verificad[oa]s?|certificad[oa]s?|demostrad[oa]s?|prueba que)\b/i;

export const squash = (text) => text.replace(/\s+/g, " ").trim();
// "2,112", "2.112" and "2112" compare equal; "27.63" and "27,63" too. Hyphens and colons separate numbers.
export const numbersIn = (text) => [...text.matchAll(/\d[\d.,]*\d|\d/g)].map((match) => match[0].replace(/[.,]/g, ""));

export function permalinkFor(source, [start, end]) {
  return `${source}#L${start}${end === start ? "" : `-L${end}`}`;
}

export function checkTrace(catalog, excerptFile) {
  assert.equal(excerptFile?.schemaVersion, 1, "claim-excerpts.json: unsupported schemaVersion");
  const excerpts = excerptFile.excerpts ?? {};
  const byId = new Map(catalog.records.map((record) => [record.id, record]));
  const claimIds = new Set();
  const claimTexts = new Set();
  let statements = 0;

  for (const id of requiredTracedRecords) {
    assert.ok(byId.get(id)?.claims?.length > 0, `${id}: record is in scope for claim tracing but has no traced claim (fail closed)`);
  }

  for (const record of catalog.records) {
    for (const claim of record.claims ?? []) {
      const where = `${record.id}/${claim.id}`;
      assert.ok(claim.id.startsWith(`CL-${record.id.slice(3)}-`), `${where}: claim ID must extend its record ID`);
      assert.ok(!claimIds.has(claim.id), `${where}: duplicate claim identifier`);
      claimIds.add(claim.id);
      const textKey = claim.statements.claim.text.en.trim().toLowerCase();
      assert.ok(!claimTexts.has(textKey), `${where}: duplicate claim text`);
      claimTexts.add(textKey);

      // Source: one of the record's own pinned sources, in the project's pinned repository at the project's pinned commit.
      const match = claim.source.match(blobUrl);
      assert.ok(match, `${where}: source must be a commit-pinned blob URL: ${claim.source}`);
      assert.ok(record.sources.some((source) => source.url === claim.source), `${where}: source is not one of ${record.id}'s listed sources`);
      const pin = catalog.pins[record.project];
      assert.equal(match[1], pin.repo, `${where}: source repository differs from the project's pinned repository`);
      assert.equal(match[2], pin.sha, `${where}: source commit differs from the project's pinned commit`);

      // No status upgrade: a claim can never be stronger than the record that carries it.
      for (const dimension of ["scientificValidation", "independentReview"]) {
        assert.equal(claim.status[dimension], record.status[dimension], `${where}: ${dimension} must equal the record's value (no status upgrade)`);
      }

      const claimExcerpts = excerpts[claim.id];
      assert.ok(claimExcerpts, `${where}: no verbatim excerpt of the cited lines in ${excerptsPath} (fail closed)`);
      for (const kind of statementKinds) {
        const statement = claim.statements[kind];
        const label = `${where}.${kind}`;
        const [start, end] = statement.lines;
        assert.ok(Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end >= start, `${label}: invalid line range ${start}-${end}`);
        assert.ok(end - start + 1 <= maxRangeLines, `${label}: range of ${end - start + 1} lines is too broad (max ${maxRangeLines})`);
        assert.equal(statement.permalink, permalinkFor(claim.source, statement.lines), `${label}: permalink does not match source and line range`);

        const lines = claimExcerpts[kind];
        assert.ok(Array.isArray(lines) && lines.every((line) => typeof line === "string"), `${label}: excerpt missing`);
        assert.equal(lines.length, end - start + 1, `${label}: excerpt has ${lines?.length} lines but the range spans ${end - start + 1}`);
        assert.ok(lines.some((line) => line.trim() !== ""), `${label}: cited lines are blank`);
        const cited = squash(lines.join(" "));

        for (const term of statement.terms) {
          assert.ok(cited.includes(squash(term)), `${label}: cited lines ${start}-${end} do not contain the anchor term: ${term}`);
        }
        const english = numbersIn(statement.text.en);
        const spanish = numbersIn(statement.text.es);
        assert.deepEqual([...english].sort(), [...spanish].sort(), `${label}: EN and ES texts state different numbers`);
        const available = new Set(numbersIn(cited));
        for (const number of english) assert.ok(available.has(number), `${label}: the statement says ${number}, which does not appear in cited lines ${start}-${end}`);

        if (kind !== "limitation") {
          assert.doesNotMatch(statement.text.en, overclaimEn, `${label}.en uses overclaiming language`);
          assert.doesNotMatch(statement.text.es, overclaimEs, `${label}.es uses overclaiming language`);
        }
        statements++;
      }
    }
  }
  for (const id of Object.keys(excerpts)) assert.ok(claimIds.has(id), `${excerptsPath}: excerpt for unknown claim ${id}`);
  return { claims: claimIds.size, statements };
}

export function rawUrl(source) {
  const [, repo, sha, path] = source.match(blobUrl);
  return `https://raw.githubusercontent.com/${repo}/${sha}/${path}`;
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "user-agent": "SK-Spatial-Intelligence-Lab-Trace-Check/0.1" } });
      if (response.ok) return (await response.text()).replace(/\r\n/g, "\n");
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${url}: ${lastError.message}`);
}

export async function upstreamSlices(catalog, load = fetchText) {
  const files = new Map();
  const result = {};
  for (const record of catalog.records) {
    for (const claim of record.claims ?? []) {
      if (!files.has(claim.source)) files.set(claim.source, (await load(rawUrl(claim.source))).split("\n"));
      const all = files.get(claim.source);
      result[claim.id] = {};
      for (const kind of statementKinds) {
        const [start, end] = claim.statements[kind].lines;
        assert.ok(end <= all.length, `${claim.id}.${kind}: line ${end} is beyond the end of the pinned file (${all.length} lines)`);
        result[claim.id][kind] = all.slice(start - 1, end);
      }
    }
  }
  return result;
}

export async function checkTraceOnline(catalog, excerptFile, load = fetchText) {
  const upstream = await upstreamSlices(catalog, load);
  for (const [id, kinds] of Object.entries(upstream)) {
    for (const kind of statementKinds) {
      assert.deepEqual(excerptFile.excerpts[id]?.[kind], kinds[kind], `${id}.${kind}: recorded excerpt differs from the pinned upstream file`);
    }
  }
  return Object.keys(upstream).length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const catalog = JSON.parse(await readFile("data/evidence-catalog.json", "utf8"));
  if (process.argv.includes("--write-excerpts")) {
    const excerpts = await upstreamSlices(catalog);
    const file = {
      schemaVersion: 1,
      note: "Verbatim lines copied mechanically from the pinned upstream files for the ranges cited by catalog claims. Used only to check that cited lines support each claim; verified against upstream by `npm run check:trace:online`.",
      excerpts,
    };
    await writeFile(excerptsPath, `${JSON.stringify(file, null, 2)}\n`);
    console.log(`Wrote ${Object.keys(excerpts).length} claim excerpts to ${excerptsPath}`);
  } else if (process.argv.includes("--online")) {
    const file = JSON.parse(await readFile(excerptsPath, "utf8"));
    const count = await checkTraceOnline(catalog, file);
    console.log(`PASS ${count} claims: recorded excerpts equal the pinned upstream lines`);
  } else {
    const result = checkTrace(catalog, JSON.parse(await readFile(excerptsPath, "utf8")));
    console.log(`PASS ${result.claims} claims / ${result.statements} cited line ranges support their statements`);
  }
}
