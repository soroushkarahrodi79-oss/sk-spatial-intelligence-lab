"""Compare Lens's published-state answers in references.json with the official
Ayuntamiento de Madrid XLS files (PGOUM 97, estado de desarrollo de los ámbitos).

Manual, maintainer-run check (needs pandas + xlrd; not part of CI):

    python -I -X utf8 mcp/madrid-evidence/eval/official-check.py S1_2026-01.xls S1_2025-07.xls

The files are downloaded by hand from datos.madrid.es; their SHA-256 must match the
`sha256` that Lens records for each edition (printed below from references.json).
This compares Lens with the publisher's own table. It does not validate the publisher's
table, nor the ámbito geometry.
"""
import json
import sys
import pandas as pd

HERE = __file__.rsplit("mcp", 1)[0]
refs = json.load(open(HERE + "mcp/madrid-evidence/eval/references.json", encoding="utf-8"))["cases"]
cur = pd.read_excel(sys.argv[1]).set_index("Ámbito")
prev = pd.read_excel(sys.argv[2]).set_index("Ámbito") if len(sys.argv) > 2 else None
PHASE_COLS = ["Estado de desarrollo. Planeamiento", "Estado de desarrollo. Gestión",
              "Estado de desarrollo.Urbanización. Proyecto", "Estado de desarrollo. Urbanización. Obras"]
norm = lambda v: "" if pd.isna(v) else str(v).strip()

checked = mismatches = 0
seen = set()
for cid, ref in refs.items():
    lens = ref["lens"]
    snaps = lens if isinstance(lens, list) else ([lens] if lens and "ambitoAtPoint" in lens else [])
    for s in snaps:
        at = s["ambitoAtPoint"]
        if at["kind"] != "EVIDENCE":
            continue
        code = at["value"]["ambitoCode"]
        if code in seen:
            continue
        seen.add(code)
        ph, diff = s.get("ambitoPhases"), s.get("ambitoEditionDiff")
        in_cur = code in cur.index
        line = [cid, code, "in-xls" if in_cur else "NOT-in-xls"]
        if ph and ph["kind"] == "EVIDENCE":
            v = ph["value"]
            row = cur.loc[code] if in_cur else None
            ok = row is not None
            if ok:
                ok = (norm(row["Distrito"]).upper() == v["district"]["name"].upper()
                      and norm(row["Uso Característico"]) == v["characteristicUse"]
                      and abs(float(row["Superficie (m²)"]) - v["surface"]["value"]) < 1e-6
                      and [norm(row[c]) for c in PHASE_COLS] == [p["sourceValue"] for p in v["phases"]])
            line.append("phases " + ("MATCH" if ok else "MISMATCH"))
            checked += 1
            mismatches += 0 if ok else 1
        elif ph:
            # Lens abstained on phases: the publisher's table should have no row for the code,
            # or a row with no phase values.
            blank = (not in_cur) or all(norm(cur.loc[code][c]) == "" for c in PHASE_COLS)
            line.append("phases-abstention " + (("consistent (code absent from the official table)" if not in_cur else "consistent (row has no phase values)") if blank else "CHECK: row has phase values"))
            checked += 1
            mismatches += 0 if blank else 1
        if diff and diff["kind"] == "EVIDENCE" and prev is not None and code in cur.index and code in prev.index:
            same_phases = [norm(cur.loc[code][c]) for c in PHASE_COLS] == [norm(prev.loc[code][c]) for c in PHASE_COLS]
            outcome = diff["value"]["state"]["S1"]["outcome"]
            ok = (outcome == "NO_CHANGE") == same_phases
            line.append(f"S1 outcome {outcome} vs phases {'equal' if same_phases else 'differ'} -> " + ("consistent" if ok else "CHECK"))
            checked += 1
            mismatches += 0 if ok else 1
        print(" | ".join(line))
print(f"\n{checked} comparisons on {len(seen)} distinct ámbitos; {mismatches} to inspect.")
