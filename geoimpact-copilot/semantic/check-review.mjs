#!/usr/bin/env node
// Fails (exit 1) when the review record is malformed or claims an approval that no longer
// matches the current vocabulary. An honest "unreviewed" record passes. Read-only.
import { readFile } from "node:fs/promises";
import { evaluateReview, vocabularyDigest } from "../lib/review.mjs";

const read = async (name) => JSON.parse(await readFile(new URL(`./${name}`, import.meta.url), "utf8"));
const registry = await read("approved-skeletons.json");
const record = await read("review-record.json");
const result = evaluateReview(record, registry);
process.stdout.write(`${JSON.stringify({ state: result.state, current_content_digest: vocabularyDigest(registry), problems: result.problems }, null, 2)}\n`);
process.exitCode = result.state === "invalid" ? 1 : 0;
