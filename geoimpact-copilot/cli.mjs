#!/usr/bin/env node
import { answerQuestion } from "./lib/answer.mjs";
import { loadReportFile } from "./lib/report.mjs";

function usage() {
  return [
    "GeoImpact Evidence Copilot V0.1 — deterministic local prototype",
    "",
    "Usage:",
    "  node geoimpact-copilot/cli.mjs --report PATH --question TEXT [--json]",
    "",
    "Example:",
    "  node geoimpact-copilot/cli.mjs --report geoimpact-copilot/fixtures/block-v5.json --question \"Why did this report BLOCK?\""
  ].join("\n");
}

function parseArgs(args) {
  const result = { json: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--help" || flag === "-h") return { help: true };
    if (flag === "--json") {
      result.json = true;
      continue;
    }
    if (!["--report", "--question"].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing value for ${flag}`);
    result[flag.slice(2)] = args[index + 1];
    index += 1;
  }
  if (!result.report || !result.question) throw new Error("Both --report and --question are required.");
  return result;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    process.exitCode = 0;
  } else {
    const report = await loadReportFile(args.report);
    const answer = answerQuestion(report, args.question);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
    } else {
      process.stdout.write(`${answer.answer}\n\nEvidence references:\n`);
      for (const claim of answer.claims) {
        process.stdout.write(`- ${claim.id}\n`);
        for (const reference of claim.references) {
          if (reference.type === "json_pointer") process.stdout.write(`  ${reference.path}\n`);
          else if (reference.type === "json_string_literal") process.stdout.write(`  ${reference.path} = ${JSON.stringify(reference.value)} [exact ${reference.role}]\n`);
          else if (reference.type === "json_string_list_literal") process.stdout.write(`  ${reference.path} = ${JSON.stringify(reference.value)} [exact identifiers]\n`);
          else if (reference.type === "derived") process.stdout.write(`  ${reference.operation}(${reference.source_path}) = ${reference.value}\n`);
          else process.stdout.write(`  source:${reference.source_id}#${reference.fact_key} (${reference.url})\n`);
        }
      }
      process.stdout.write(`\nMode: deterministic${answer.decision === "ABSTAIN" ? `; ${answer.reason}` : ""}\n`);
    }
    process.exitCode = answer.decision === "ABSTAIN" ? 3 : 0;
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  if (error.issues?.length) for (const issue of error.issues) process.stderr.write(`- ${issue}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 2;
}
