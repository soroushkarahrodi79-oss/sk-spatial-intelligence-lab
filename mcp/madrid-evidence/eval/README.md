# Madrid Evidence MCP exploratory evaluation v0.1

**Exploratory. Measures consistency with the pinned Lens and tool-use behaviour of one model on 30 cases. It is not scientific validation of Lens's data and not a benchmark of the MCP.** No success rate may be quoted without n, the interval and this sentence.

## What is here

| File | Role |
|---|---|
| `cases.json` | 30 cases (A valid evidence 8, B missing evidence 5, C edition limits 5, D unsupported requests 6, E adversarial 6; 15 ES, 15 EN), the protocol (model, one system prompt for both arms), forbidden-claim rules and the error taxonomy E1–E10 |
| `references.json` | Lens results for each case, **verbatim**, produced by `eval.mjs references` with a wiring independent of the adapter, plus the values every correct answer must contain and the codes and numbers that may appear |
| `score.mjs` | Pure scoring rules. They produce candidate flags only |
| `seal.json` | SHA-256 of cases, references, scorer and Lens pin, written before any model run |
| `eval.mjs` | `references`, `seal`, `verify`, `spatial`, `run`, `score` |
| `verify-transcript.mjs` | v0.2. Pure verifier: labels a transcript `INFRA_FAILURE`, `BACKED`, `UNBACKED` or `NO_LENS_CLAIM` from the MCP `init` status and the tool results, not from the model's prose. It does not make the model call the tool, and `BACKED` is not proof that every statement in the answer is correct (it only says a successful Lens query exists and no cited ámbito code is missing from it). An `INFRA_FAILURE` is excluded from the model's n and rates. Offline test: `npm run test:madrid-verifier` |
| `results/` | Scored output and the hand adjudication of one pass; [`erratum-v0.2.es.md`](results/erratum-v0.2.es.md) corrects the reading of the MEV-10 repetition (server `failed`, zero tools) |

Reuses `wilson` from `geoimpact-copilot/evaluation/metrics.mjs` (n and a 95% interval on every rate; zero failures is reported as "none in n", not as 100%). Nothing else is shared with GeoImpact.

## Method

1. `references` re-reads Lens at the pinned commit (file hashes checked against `lens-pin.json`) and asserts that the behaviour each case declares (answer, partial, abstain) is what Lens returns.
2. `seal` fixes the cases, references and scorer. `run` and `score` refuse to work if the seal does not match.
3. `run` sends each case through `claude -p` twice with the same model and system prompt: **baseline** (no tools, no MCP) and **mcp** (the three tools only). Each call uses an empty working directory and project-only settings so no hook or memory is injected. One full pass first; only ambiguous, unstable or critical cases may be repeated, and repetitions are reported next to the first result.
4. `score` flags: required values missing, forbidden patterns, ámbito codes Lens never returned, numbers present in no reference and not in the prompt, and tool-use deviations (wrong or swapped coordinates, calls the case does not justify, rejected inputs, no call where one was required).
5. **Flags are not verdicts.** Every flagged answer and a sample of unflagged ones are read and adjudicated by hand (`results/adjudication.json`: verdict, error classes, abstention behaviour, note). The adjudicator is the author of the harness, not an independent rater.

## Distinctions that matter

- **Abstention** is a Lens `ABSTENTION` (`NO_EVIDENCE_FOR_SCOPE`, `OUTSIDE_SOURCE_UNIVERSE`). An explicit `null` inside an `EVIDENCE` result (for example `reference_date` of the licences register or of the ámbito geometry) is a legitimate missing field, not an abstention, and must not be filled with another date.
- `NO_EVIDENCE_FOR_SCOPE` for a point is the same for Madrid and for Barcelona. Lens does not say "outside Madrid"; that is the model's own knowledge and must not be attributed to Lens.
- **Consistency with Lens is not correctness.** `references.json` is Lens's own output. The independent checks are limited to `eval.mjs spatial` (point-in-polygon recomputed with a separate ray-casting implementation on the same geometry file: it checks the algorithm, not the geometry) and, only where it was performed, a comparison of a few published values with the official Ayuntamiento de Madrid files (see the report). The geometry declares no reference date, so its currency cannot be verified.

## Leakage controls

The six pilot questions, the two Valdecarros prompts, their points and their four ámbitos are excluded, as is the first ámbito of each class (used by the integration test). Points were chosen by a fixed quantile rule before any run (`cases.json` → `selection`). The tool descriptions were edited after the pilot; they are part of the system under test and contain no case answers. If a result drives a change to descriptions, code or cases, the affected cases are retired and replaced, as in ADR 0006. The author wrote the cases, the derivation rules and the forbidden patterns, so the set is procedurally held out, not independent.

## Limits

One model, one author, non-deterministic generation (the CLI exposes no temperature), n = 30 per arm, automatic flags with a permissive number check (a number that occurs anywhere in a case's reference is accepted), and no reviewer other than the author. Cost figures printed by the CLI are not what a subscription is charged.

Results of the first pass (Spanish): [`results/informe-v0.1.es.md`](results/informe-v0.1.es.md). Official-table comparison: `python -I -X utf8 mcp/madrid-evidence/eval/official-check.py S1_2026-01.xls S1_2025-07.xls` (manual, needs pandas and xlrd; files downloaded by hand from datos.madrid.es).

## Commands

```bash
export MADRID_LENS_ROOT=/path/to/lens-at-pinned-commit
node mcp/madrid-evidence/eval/eval.mjs references
node mcp/madrid-evidence/eval/eval.mjs seal
node mcp/madrid-evidence/eval/eval.mjs spatial
node mcp/madrid-evidence/eval/eval.mjs run --arm both        # uses the logged-in Claude CLI
node mcp/madrid-evidence/eval/eval.mjs score
```
