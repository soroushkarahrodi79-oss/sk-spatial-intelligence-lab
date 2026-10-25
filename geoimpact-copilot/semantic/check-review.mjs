#!/usr/bin/env node
// Fails (exit 1) when the review record is malformed or claims an approval that no longer
// matches the current vocabulary. An honest "unreviewed" record passes, and so does a complete,
// current approval by a named person. Read-only: this script never writes the record.
import { readFile } from "node:fs/promises";
import { committedRecordProblems, evaluateReview, vocabularyDigest } from "../lib/review.mjs";

const read = async (name) => JSON.parse(await readFile(new URL(`./${name}`, import.meta.url), "utf8"));
const registry = await read("approved-skeletons.json");
const record = await read("review-record.json");
const result = evaluateReview(record, registry);
const problems = [...result.problems, ...(result.state === "reviewed" ? committedRecordProblems(record) : [])];
const state = problems.length && result.state !== "unreviewed" ? "invalid" : result.state;
process.stdout.write(`${JSON.stringify({ state, current_content_digest: vocabularyDigest(registry), problems }, null, 2)}\n`);
process.exitCode = state === "invalid" ? 1 : 0;
