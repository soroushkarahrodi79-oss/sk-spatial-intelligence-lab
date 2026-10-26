import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { checkTrace, checkTraceOnline, numbersIn, permalinkFor, rawUrl, requiredTracedRecords } from "../scripts/claim-trace.mjs";

const original = JSON.parse(await readFile("data/evidence-catalog.json", "utf8"));
const excerpts = JSON.parse(await readFile("data/claim-excerpts.json", "utf8"));
const schema = JSON.parse(await readFile("data/evidence-catalog.schema.json", "utf8"));
const clone = (value) => structuredClone(value);
const claimOf = (catalog, id) => catalog.records.find((record) => record.id === id).claims[0];
const rejects = (mutate, pattern, { excerptMutate } = {}) => {
  const catalog = clone(original);
  const file = clone(excerpts);
  mutate(catalog);
  excerptMutate?.(file);
  assert.throws(() => checkTrace(catalog, file), pattern);
};

test("the shipped catalog traces every required record", () => {
  const result = checkTrace(original, excerpts);
  assert.equal(result.claims, 3);
  assert.equal(result.statements, 9);
  assert.deepEqual(requiredTracedRecords.sort(), ["EV-GIC-001", "EV-GIC-002", "EV-SAL-002"]);
});

test("schema accepts the catalog and rejects malformed claims", () => {
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  assert.ok(validate(original), JSON.stringify(validate.errors));
  for (const mutate of [
    (c) => { claimOf(c, "EV-GIC-001").status.traceStatus = "validated"; },
    (c) => { claimOf(c, "EV-GIC-001").status.scientificValidation = "validated"; },
    (c) => { claimOf(c, "EV-GIC-001").source = "https://github.com/soroushkarahrodi79-oss/geoimpact-ci/blob/main/docs/GATE_5_REAL_WORLD_CASE.md"; },
    (c) => { claimOf(c, "EV-GIC-001").statements.claim.permalink = "https://github.com/soroushkarahrodi79-oss/geoimpact-ci/blob/main/docs/GATE_5_REAL_WORLD_CASE.md#L53-L61"; },
    (c) => { claimOf(c, "EV-GIC-001").statements.claim.lines = [53]; },
    (c) => { claimOf(c, "EV-GIC-001").statements.claim.lines = [0, 5]; },
    (c) => { delete claimOf(c, "EV-GIC-001").statements.limitation; },
    (c) => { claimOf(c, "EV-GIC-001").id = "CL-XXX-001-01"; },
    (c) => { claimOf(c, "EV-GIC-001").statements.claim.terms = []; },
  ]) {
    const catalog = clone(original);
    mutate(catalog);
    assert.equal(validate(catalog), false);
  }
});

test("fails closed when a required record has no traced claim", () => {
  rejects((c) => { delete c.records.find((r) => r.id === "EV-SAL-002").claims; }, /no traced claim/);
});

test("rejects a duplicate claim identifier and a duplicate claim text", () => {
  rejects((c) => { c.records.find((r) => r.id === "EV-GIC-001").claims.push(clone(claimOf(c, "EV-GIC-001"))); }, /duplicate claim identifier/);
  rejects((c) => {
    const copy = clone(claimOf(c, "EV-GIC-001"));
    copy.id = "CL-GIC-001-02";
    c.records.find((r) => r.id === "EV-GIC-001").claims.push(copy);
  }, /duplicate claim text/, { excerptMutate: (f) => { f.excerpts["CL-GIC-001-02"] = f.excerpts["CL-GIC-001-01"]; } });
});

test("rejects a claim ID that does not extend its record ID", () => {
  rejects((c) => { claimOf(c, "EV-GIC-001").id = "CL-GIC-002-09"; }, /extend its record ID/);
});

test("rejects sources that are not pinned to the project's commit or not listed on the record", () => {
  rejects((c) => { claimOf(c, "EV-GIC-001").source = claimOf(c, "EV-GIC-001").source.replace("c39733b61b60abe3b6e9e9c50f74f5c206022399", "0".repeat(40)); }, /project's pinned commit|not one of/);
  rejects((c) => { claimOf(c, "EV-GIC-001").source = "https://github.com/soroushkarahrodi79-oss/geoimpact-ci/blob/main/docs/GATE_5_REAL_WORLD_CASE.md"; }, /commit-pinned blob URL/);
  rejects((c) => { claimOf(c, "EV-GIC-001").source = claimOf(c, "EV-GIC-002").source; }, /not one of EV-GIC-001's listed sources/);
});

test("rejects invalid, reversed, oversized and mismatched line ranges", () => {
  rejects((c) => { claimOf(c, "EV-GIC-001").statements.claim.lines = [61, 53]; }, /invalid line range/);
  rejects((c) => { claimOf(c, "EV-GIC-001").statements.claim.lines = [0, 9]; }, /invalid line range/);
  rejects((c) => { claimOf(c, "EV-GIC-001").statements.claim.lines = [1, 200]; }, /too broad/);
  rejects((c) => { claimOf(c, "EV-GIC-001").statements.claim.lines = [54, 62]; }, /permalink does not match/);
  rejects((c) => { claimOf(c, "EV-GIC-001").statements.claim.permalink = claimOf(c, "EV-GIC-001").statements.claim.permalink.replace("L53", "L52"); }, /permalink does not match/);
});

test("rejects a cited range whose excerpt is missing, the wrong length or blank", () => {
  rejects(() => {}, /no verbatim excerpt/, { excerptMutate: (f) => { delete f.excerpts["CL-SAL-002-01"]; } });
  rejects(() => {}, /excerpt has/, { excerptMutate: (f) => { f.excerpts["CL-SAL-002-01"].claim.pop(); } });
  rejects(() => {}, /cited lines are blank/, { excerptMutate: (f) => { f.excerpts["CL-SAL-002-01"].method = f.excerpts["CL-SAL-002-01"].method.map(() => ""); } });
  rejects(() => {}, /unknown claim/, { excerptMutate: (f) => { f.excerpts["CL-SAL-009-01"] = {}; } });
});

test("does not accept a citation whose lines do not support the statement", () => {
  // Same file, wrong lines: the permalink is internally consistent but the text is not there.
  rejects((c) => {
    const statement = claimOf(c, "EV-GIC-001").statements.claim;
    statement.lines = [1, 9];
    statement.permalink = permalinkFor(claimOf(c, "EV-GIC-001").source, statement.lines);
  }, /do not contain the anchor term/, { excerptMutate: (f) => { f.excerpts["CL-GIC-001-01"].claim = f.excerpts["CL-GIC-001-01"].method.concat(["x"]).slice(0, 9); } });
  // Anchor terms present, but the statement states a number that the cited lines do not contain.
  rejects((c) => { const text = claimOf(c, "EV-GIC-001").statements.claim.text; text.en = text.en.replace("2,112", "3,000"); text.es = text.es.replace("2.112", "3.000"); }, /says 3000/);
  rejects((c) => { const text = claimOf(c, "EV-SAL-002").statements.claim.text; text.en = text.en.replace("27.63%", "17.63%"); text.es = text.es.replace("27,63", "17,63"); }, /says 1763/);
  // EN and ES must state the same figures.
  rejects((c) => { claimOf(c, "EV-GIC-002").statements.claim.text.es = claimOf(c, "EV-GIC-002").statements.claim.text.es.replace("52 registros", "53 registros"); }, /different numbers/);
  // An anchor term that is not in the cited lines.
  rejects((c) => { claimOf(c, "EV-GIC-002").statements.claim.terms.push("0 observed regressions against a one-metre threshold"); }, /anchor term/);
});

test("rejects status upgrades and overclaiming wording", () => {
  rejects((c) => { claimOf(c, "EV-SAL-002").status.scientificValidation = "none-claimed"; }, /no status upgrade/);
  rejects((c) => { claimOf(c, "EV-GIC-001").status.independentReview = "pending"; }, /no status upgrade/);
  rejects((c) => { claimOf(c, "EV-GIC-001").statements.method.text.en += " This is verified."; }, /overclaiming/);
  rejects((c) => { claimOf(c, "EV-GIC-001").statements.claim.text.es += " Resultado validado."; }, /overclaiming/);
});

test("number comparison is separator-insensitive across EN and ES", () => {
  assert.deepEqual(numbersIn("2,112 and 2.112 and 27.63% and 27,63 %"), ["2112", "2112", "2763", "2763"]);
  assert.deepEqual(numbersIn("2026-10-21T14:52:30Z"), ["2026", "10", "21", "14", "52", "30"]);
});

test("online comparison fails when the pinned upstream lines differ from the recorded excerpt", async () => {
  const lines = (kind, id) => excerpts.excerpts[id][kind];
  const upstreamFile = (source) => {
    // Rebuild a fake upstream file in which every cited range sits at its recorded line numbers.
    const out = [];
    for (const record of original.records) for (const claim of record.claims ?? []) {
      if (claim.source !== source) continue;
      for (const kind of ["claim", "method", "limitation"]) {
        const [start] = claim.statements[kind].lines;
        lines(kind, claim.id).forEach((line, index) => { out[start - 1 + index] = line; });
      }
    }
    return Array.from(out, (line) => line ?? "").join("\n");
  };
  const loadFaithful = async (url) => upstreamFile([...new Set(original.records.flatMap((r) => (r.claims ?? []).map((c) => c.source)))].find((source) => rawUrl(source) === url));
  assert.equal(await checkTraceOnline(original, excerpts, loadFaithful), 3);
  const loadChanged = async (url) => (await loadFaithful(url)).replace("52", "53");
  await assert.rejects(checkTraceOnline(original, excerpts, loadChanged), /differs from the pinned upstream/);
  const loadShort = async () => "only one line";
  await assert.rejects(checkTraceOnline(original, excerpts, loadShort), /beyond the end of the pinned file/);
});
