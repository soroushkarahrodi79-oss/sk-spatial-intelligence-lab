// Claim package for the Studio v0.2 selector experiment (alternative B).
//
// Deterministic. Turns one Studio investigation (the raw MCP call records) into an "authorized claim
// package": every claim a presentation may show, with a stable id, the traced original values it is made
// of, and the ordering constraints that keep limitations attached to the facts they limit.
//
// Nothing here computes, rounds, merges or rewrites a value. Items come from `buildView`
// (studio/public/evidence-view.mjs), which already binds each value to a JSON pointer into the raw MCP
// record; this module only groups them and fingerprints them. No model, no network, no file access.
//
// Vocabulary: an ITEM is one traced value (or a fixed interface note). A CLAIM is an indivisible
// presentation unit made of items; a model can only ever refer to claims, by id.

import { createHash } from "node:crypto";
import { buildView, callRecord, getPointer, KIND } from "../public/evidence-view.mjs";

export const PACKAGE_SCHEMA = "studio-claim-package/1";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// JSON with sorted keys: the same value always yields the same bytes.
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
    .join(",")}}`;
}

const valueDigest = (value) => sha256(canonicalJson(value));
// Ids depend on the slot (call + pointer, or section + note text), never on the value, so they are stable
// across investigations; value integrity is carried by `value_sha256` and the package digest.
// The section is part of the slot: the view may show the same pointer in two sections (e.g. `notQueried`).
const itemId = (item, sectionId) => `i-${sha256(item.source?.call ? `${sectionId}|${item.source.call}|${item.source.path}` : `${sectionId}|note|${item.value}`).slice(0, 12)}`;
const claimId = (key) => `c-${sha256(`claim|${key}`).slice(0, 12)}`;

function claimOf(key, section, role, title, items) {
  return {
    id: claimId(key),
    key,
    section: section.id,
    role,
    status: section.status ?? null,
    title,
    scope: section.scope,
    items: items.map((item) => ({
      id: itemId(item, section.id),
      kind: item.kind,
      label: item.label,
      value: item.value,
      value_sha256: valueDigest(item.value),
      source: item.source,
      ...(item.family ? { family: item.family } : {}),
    })),
    _viewItems: items, // original view objects; stripped from the serialisable package
  };
}

// Constraint types (checked by selection-contract.mjs):
//   BLOCK { fixed: [ids], free: [ids] }  contiguous; `fixed` first, in this order; `free` after, any order
//   TAIL  { ids }                        the last positions, in exactly this order
// Blocks may be placed in any order relative to each other. Every claim is in exactly one constraint.
function constraintsFor(claims) {
  const by = (pred) => claims.filter(pred).map((c) => c.id);
  const snapshot = by((c) => ["ambito", "phases", "diff"].includes(c.section) || c.section.startsWith("layer-"));
  const licences = by((c) => c.section === "licences" && c.role === "SECTION");
  const families = by((c) => c.section === "licences" && c.role === "FAMILY");
  const tail = by((c) => c.section.startsWith("prov-"));
  const constraints = [];
  if (snapshot.length) constraints.push({ type: "BLOCK", fixed: snapshot, free: [] });
  if (licences.length) constraints.push({ type: "BLOCK", fixed: licences, free: families });
  if (tail.length) constraints.push({ type: "TAIL", ids: tail });
  return constraints;
}

/**
 * @returns {{ pkg: object, claimsById: Map<string, object>, baselineOrder: string[], view: object }}
 *   `pkg` is plain JSON (what a provider may see). `claimsById` keeps the original view items for rendering.
 */
export function buildClaimPackage(response) {
  const view = buildView(response);
  const claims = [];
  for (const section of view.sections) {
    if (section.families?.length) {
      claims.push(claimOf(section.id, section, "SECTION", section.title, section.items));
      for (const fam of section.families) claims.push(claimOf(`${section.id}#family:${fam.family}`, section, "FAMILY", `${section.title} · ${fam.family}`, fam.items));
    } else claims.push(claimOf(section.id, section, "SECTION", section.title, section.items));
  }

  const ids = new Set();
  for (const c of claims) {
    if (ids.has(c.id)) throw new Error(`claim id collision: ${c.key}`);
    ids.add(c.id);
  }
  const itemIds = new Set();
  for (const it of claims.flatMap((c) => c.items)) {
    if (itemIds.has(it.id)) throw new Error(`item id collision: ${it.label}`);
    itemIds.add(it.id);
  }

  const constraints = constraintsFor(claims);
  const covered = constraints.flatMap((c) => (c.type === "BLOCK" ? [...c.fixed, ...c.free] : c.ids));
  if (covered.length !== claims.length || new Set(covered).size !== claims.length) throw new Error("constraints must cover every claim exactly once");

  const baselineOrder = claims.map((c) => c.id);
  const claimsById = new Map(claims.map((c) => [c.id, c]));
  const body = {
    schema: PACKAGE_SCHEMA,
    request: view.request,
    claims: claims.map(({ _viewItems, ...c }) => c),
    constraints,
    baseline_order: baselineOrder,
  };
  const pkg = { ...body, package_sha256: sha256(canonicalJson(body)) };
  return { pkg, claimsById, baselineOrder, view };
}

/**
 * Re-trace every sourced item of a package against the raw investigation response. Returns the list of
 * problems (empty = every value is exactly what its pointer resolves to, and its digest matches).
 */
export function verifyPackageTrace(pkg, response) {
  const problems = [];
  for (const claim of pkg.claims) {
    for (const item of claim.items) {
      if (item.kind === KIND.NOTE) {
        if (item.source?.origin !== "interface" || /\d/.test(String(item.value))) problems.push(`${item.id}: interface note with a source or a number`);
        continue;
      }
      const record = callRecord(response, item.source?.call ?? "");
      const actual = record ? getPointer(record, item.source.path) : undefined;
      if (canonicalJson(actual) !== canonicalJson(item.value)) problems.push(`${item.id}: ${item.label} does not match ${item.source?.call}${item.source?.path}`);
      if (item.value_sha256 !== valueDigest(item.value)) problems.push(`${item.id}: digest mismatch`);
    }
  }
  return problems;
}

export { sha256, valueDigest };
