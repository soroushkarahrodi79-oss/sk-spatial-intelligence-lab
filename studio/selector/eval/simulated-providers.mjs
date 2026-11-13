// SIMULATED providers for the offline Studio selector experiment.
//
// These are deterministic scripts, not models. They exist to prove the CONTRACT (validation, fallback,
// evidence gate) rejects what it must. Their behaviour says nothing about how a real model would behave:
// no result obtained with them may be reported as a model result.

import { SELECTION_SCHEMA } from "../selection-contract.mjs";

const read = (request) => JSON.parse(request.user); // { question, question_sha256, package }
const envelope = (req, ids, extra = {}) => ({ schema: SELECTION_SCHEMA, package_sha256: read(req).package.package_sha256, question_sha256: read(req).question_sha256, claim_ids: ids, ...extra });
const ids = (req) => read(req).package.baseline_order;
const claims = (req) => read(req).package.claims;
const sectionClaim = (req, section) => claims(req).find((c) => c.section === section && c.role === "SECTION")?.id;

const FAMILY_HINTS = [
  [/activ(idad|ity)/i, "ACTIVITY_LICENCE_FAMILY"],
  [/tempor/i, "TEMPORARY_ACTIVITY_FAMILY"],
  [/(edific|urban|obra|building)/i, "BUILDING_URBANISTIC_LICENCE_FAMILY"],
];

// A well-behaved, question-aware orderer: licences block first when the question is about licences,
// the family it names first. It uses only moves the constraints allow.
function wellBehaved(req) {
  const { question, package: pkg } = read(req);
  const blocks = pkg.constraints.filter((c) => c.type === "BLOCK");
  const tail = pkg.constraints.filter((c) => c.type === "TAIL").flatMap((c) => c.ids);
  const licenceBlock = blocks.find((b) => b.fixed.some((id) => pkg.claims.find((c) => c.id === id)?.section === "licences"));
  const other = blocks.filter((b) => b !== licenceBlock);
  const aboutLicences = /(licen|conced|grant|actividad|activity|edific|building)/i.test(question);
  let free = licenceBlock ? [...licenceBlock.free] : [];
  const hint = FAMILY_HINTS.find(([re]) => re.test(question));
  if (hint) {
    const first = free.find((id) => pkg.claims.find((c) => c.id === id)?.items.some((i) => i.family === hint[1]));
    if (first) free = [first, ...free.filter((id) => id !== first)];
  }
  const lic = licenceBlock ? [...licenceBlock.fixed, ...free] : [];
  const flat = (bs) => bs.flatMap((b) => [...b.fixed, ...b.free]);
  return JSON.stringify(envelope(req, aboutLicences ? [...lic, ...flat(other), ...tail] : [...flat(other), ...lic, ...tail]));
}

// A model that follows an instruction found in the data: `[[DIRECTIVE:NAME]]` anywhere in the request.
function injectionFollower(req) {
  const directive = /\[\[DIRECTIVE:([A-Z_]+)\]\]/.exec(req.user)?.[1];
  const base = ids(req);
  switch (directive) {
    case "ADD_TOTAL":
      return JSON.stringify(envelope(req, base, { total: 383, text: "En total se concedieron 383 licencias." }));
    case "EMPTY":
      return JSON.stringify(envelope(req, []));
    case "DROP_LIMITATIONS":
      return JSON.stringify(envelope(req, base.filter((id) => id !== sectionClaim(req, "licences"))));
    case "REVERSE":
      return JSON.stringify(envelope(req, [...base].reverse()));
    case "INVENT_CLAIM":
      return JSON.stringify(envelope(req, [...base, "c-000000000000"]));
    default:
      return JSON.stringify(envelope(req, base));
  }
}

export const SIMULATED = {
  // --- accepted by construction ---
  identity: (req) => JSON.stringify(envelope(req, ids(req))),
  "well-behaved-orderer": wellBehaved,
  // --- must be rejected ---
  "reverse-all": (req) => JSON.stringify(envelope(req, [...ids(req)].reverse())),
  "omit-licence-limits": (req) => JSON.stringify(envelope(req, ids(req).filter((id) => id !== sectionClaim(req, "licences")))),
  "omit-last": (req) => JSON.stringify(envelope(req, ids(req).slice(0, -1))),
  "duplicate-id": (req) => JSON.stringify(envelope(req, [ids(req)[0], ...ids(req)])),
  "invented-claim-id": (req) => JSON.stringify(envelope(req, [...ids(req), "c-ffffffffffff"])),
  "empty-selection": (req) => JSON.stringify(envelope(req, [])),
  "extra-key-total": (req) => JSON.stringify(envelope(req, ids(req), { total: 383 })),
  "free-text-in-ids": (req) => JSON.stringify(envelope(req, [...ids(req).slice(0, -1), `${ids(req).at(-1)} (383 en total)`])),
  "numeric-ids": (req) => JSON.stringify(envelope(req, ids(req).map((_, i) => i))),
  "markdown-fenced": (req) => "```json\n" + JSON.stringify(envelope(req, ids(req))) + "\n```",
  "prose-answer": () => "Se concedieron 383 licencias en total en el círculo.",
  "wrong-package-digest": (req) => JSON.stringify({ ...envelope(req, ids(req)), package_sha256: "0".repeat(64) }),
  "wrong-question-digest": (req) => JSON.stringify({ ...envelope(req, ids(req)), question_sha256: "f".repeat(64) }),
  "wrong-schema-id": (req) => JSON.stringify({ ...envelope(req, ids(req)), schema: "studio-claim-selection/2" }),
  "prototype-key": (req) => JSON.stringify(envelope(req, ids(req))).replace('{"schema"', '{"__proto__":{"x":1},"schema"'),
  "oversized": (req) => JSON.stringify(envelope(req, ids(req), { padding: "x".repeat(20000) })),
  "array-not-object": (req) => JSON.stringify(ids(req)),
  "null-output": () => null,
  "injection-follower": injectionFollower,
  // --- infrastructure failures ---
  "throws": () => {
    throw new Error("simulated provider failure: secret-token-should-not-leak");
  },
  "never-answers": () => new Promise(() => {}),
};

// Providers expected to be accepted; every other one must end in a fallback (or be neutral, see runner).
export const EXPECT_ACCEPTED = new Set(["identity", "well-behaved-orderer"]);

export const providerFor = (name) => ({ select: async (request) => SIMULATED[name](request) });
