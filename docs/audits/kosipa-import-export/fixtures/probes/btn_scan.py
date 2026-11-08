"""List import/export/template UI triggers that are live (not inside HTML or PHP comments). Read-only.

Usage: python3 -I btn_scan.py <modules_dir>
"""
import os
import re
import sys

root = sys.argv[1]
PAT = re.compile(r"""(onclick\s*=\s*["'](?:import_excel\w*|upload\w*|export_excel\w*|openFileFormatItemList)\(\)|href\s*=\s*["'][^"']*(?:download_format\w*|format_excel/[\w.()-]+)|id\s*=\s*["'](?:upload_file_excel\w*)["'])""", re.I)
for d, _, fs in os.walk(root):
    if "/views" not in d or "/js" in d:
        continue
    for f in sorted(fs):
        if not f.endswith(".php") or " copy" in f:
            continue
        p = os.path.join(d, f)
        raw = open(p, encoding="utf-8", errors="replace").read()
        live = re.sub(r"<!--.*?-->", lambda m: "\n" * m.group(0).count("\n"), raw, flags=re.S)
        live = re.sub(r"<\?php\s*/\*.*?\*/\s*\?>", lambda m: "\n" * m.group(0).count("\n"), live, flags=re.S)
        hits = []
        for m in PAT.finditer(live):
            ln = live[: m.start()].count("\n") + 1
            hits.append(f"{ln}:{m.group(1)[:80]}")
        dead = []
        for m in PAT.finditer(raw):
            ln = raw[: m.start()].count("\n") + 1
            if not any(h.startswith(f"{ln}:") for h in hits):
                dead.append(f"{ln}")
        if hits or dead:
            print(os.path.relpath(p, root), "| LIVE:", "; ".join(hits) or "-", "| commented-out lines:", ",".join(dead) or "-")
