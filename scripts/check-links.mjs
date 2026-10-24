import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile("space/index.html", "utf8");
const links = [...html.matchAll(/<a\b[^>]*\bhref="(https?:\/\/[^"#]+)(?:#[^"]*)?"[^>]*>/gi)].map((match) => match[1]);
const uniqueLinks = [...new Set(links)];
assert.ok(uniqueLinks.length > 0, "No external project links were found");

const failures = [];
await Promise.all(uniqueLinks.map(async (url) => {
  const timeout = AbortSignal.timeout(15000);
  let response;
  try {
    response = await fetch(url, { method: "HEAD", redirect: "follow", signal: timeout, headers: { "user-agent": "SK-Spatial-Intelligence-Lab-Link-Check/0.1" } });
    if ([403, 405, 501].includes(response.status)) {
      response = await fetch(url, { method: "GET", redirect: "follow", signal: timeout, headers: { "user-agent": "SK-Spatial-Intelligence-Lab-Link-Check/0.1", range: "bytes=0-0" } });
    }
    if (!response.ok) failures.push(`${url}: HTTP ${response.status}`);
    else console.log(`PASS ${response.status} ${url}`);
  } catch (error) {
    failures.push(`${url}: ${error.message}`);
  }
}));

assert.equal(failures.length, 0, failures.join("\n"));
console.log(`PASS all ${uniqueLinks.length} unique external links responded successfully`);
