"""Scan legacy KOSIPA view JS files for DataTables instances with export buttons.

Read-only. Usage: python3 -I dt_scan.py <modules_dir>
"""
import os
import re
import sys

root = sys.argv[1]
EXP = re.compile(r"^\s*extend\s*:\s*['\"](excel|excelHtml5|csv|csvHtml5|copy|pdf|print)['\"]", re.M)


def strip_comments(src):
    # remove // line comments (not inside strings - best effort) and /* */ blocks
    src = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), src, flags=re.S)
    out = []
    for line in src.split("\n"):
        s = line.lstrip()
        if s.startswith("//"):
            out.append("")
        else:
            out.append(line)
    return "\n".join(out)


for dirpath, _, files in os.walk(root):
    for f in sorted(files):
        if not f.endswith(".php") or " copy" in f:
            continue
        p = os.path.join(dirpath, f)
        raw = open(p, encoding="utf-8", errors="replace").read()
        src = strip_comments(raw)
        for m in re.finditer(r"\$\(\s*['\"]#([\w-]+)['\"]\s*\)\s*\.DataTable\(\s*\{", src, re.I):
            start = m.start()
            # crude block end: next ".DataTable({" or +6000 chars
            nxt2 = re.search(r"\.DataTable\(\s*\{", src[m.end():], re.I); nxt = (m.end()+nxt2.start()) if nxt2 else -1
            block = src[start: nxt if nxt != -1 else start + 8000]
            kinds = EXP.findall(block)
            if not kinds or not any(k.startswith(("excel", "csv")) for k in kinds):
                continue
            line = src[:start].count("\n") + 1
            dom = re.search(r"dom\s*:\s*(['\"])(.*?)\1", block)
            ss = re.search(r"['\"]?serverSide['\"]?\s*:\s*(true|false)", block)
            lm = re.search(r"['\"]?lengthMenu['\"]?\s*:\s*\[\s*\[([^\]]*)\]", block)
            pl = re.search(r"['\"]?pageLength['\"]?\s*:\s*(-?\d+)", block)
            url = re.search(r"['\"]?url['\"]?\s*:\s*['\"]?([^,\n]*)", block)
            cols = re.findall(r"extend\s*:\s*['\"](excel|csv)['\"][^}]*?columns\s*:\s*(\[[^\]]*\]|['\"][^'\"]*['\"])", block, re.S)
            titles = re.findall(r"extend\s*:\s*['\"](excel|csv)['\"][^}]*?(?:title|filename)\s*:\s*([^,\n]*)", block, re.S)
            print("|".join([
                os.path.relpath(p, root), str(line), "#" + m.group(1),
                ",".join(sorted(set(k for k in kinds))),
                "B" if dom and "B" in dom.group(2) else ("noB" if dom else "nodom"),
                ss.group(1) if ss else "client",
                (lm.group(1).replace(" ", "") if lm else "-"),
                (pl.group(1) if pl else "-"),
                ";".join(f"{k}={c.replace(' ', '')}" for k, c in cols) or "allcols",
                ";".join(f"{k}:{t.strip()}" for k, t in titles) or "-",
                (url.group(1).strip()[:90] if url else "-"),
            ]))
