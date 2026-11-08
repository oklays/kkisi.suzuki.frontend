"""Is the `foreach ($arr ...)` processing loop nested inside `foreach ($reader->getSheetIterator() ...)`? Read-only.

Usage: python3 -I nest_scan.py <modules_dir> <model.php::function> ...
"""
import os
import re
import sys

root = sys.argv[1]


def strip(src):
    src = re.sub(r"/\*.*?\*/", lambda m: " " * len(m.group(0)), src, flags=re.S)
    src = re.sub(r"//[^\n]*", lambda m: " " * len(m.group(0)), src)
    src = re.sub(r"'(?:\\.|[^'\\])*'", lambda m: "'" + "x" * (len(m.group(0)) - 2) + "'", src)
    src = re.sub(r'"(?:\\.|[^"\\])*"', lambda m: '"' + "x" * (len(m.group(0)) - 2) + '"', src)
    return src


def block_end(src, open_brace):
    d = 0
    for j in range(open_brace, len(src)):
        if src[j] == "{":
            d += 1
        elif src[j] == "}":
            d -= 1
            if d == 0:
                return j
    return len(src)


for spec in sys.argv[2:]:
    path, fn = spec.split("::")
    raw = open(os.path.join(root, path), encoding="utf-8", errors="replace").read()
    src = strip(raw)
    m = re.search(r"function\s+" + re.escape(fn) + r"\s*\(", src)
    fb = src.find("{", m.end())
    fe = block_end(src, fb)
    body_start = fb
    sm = re.compile(r"foreach\s*\(\s*\$reader->getSheetIterator\(\)").search(src, body_start, fe)
    am = re.compile(r"foreach\s*\(\s*\$arr\s+as").search(src, body_start, fe)
    if not sm or not am:
        print(f"{spec}: sheet-loop={bool(sm)} arr-loop={bool(am)}")
        continue
    se = block_end(src, src.find("{", sm.end()))
    nested = sm.start() < am.start() < se
    reset = re.search(r"\$arr\s*=\s*array\(\)", src[src.find('{', sm.end()):se]) is not None
    ln = lambda p: raw[:p].count("\n") + 1
    print(f"{spec}: processing loop @{ln(am.start())} {'INSIDE' if nested else 'outside'} sheet loop @{ln(sm.start())}-{ln(se)}; $arr reset per sheet: {reset}")
