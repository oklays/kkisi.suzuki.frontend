"""For each controller method feeding a DataTable (ajax_list*), summarise number_format signatures. Read-only.

Usage: python3 -I fmt_scan.py <modules_dir> <controller.php::method> ...
"""
import os
import re
import sys
from collections import Counter

root = sys.argv[1]
SIG = re.compile(r"number_format\(\s*[^,()]+(?:\([^()]*\))?[^,()]*,\s*(\d)\s*(?:,\s*(['\"][^'\"]*['\"])\s*,\s*(['\"][^'\"]*['\"]))?\s*\)")


def method_body(src, name):
    m = re.search(r"function\s+" + re.escape(name) + r"\s*\(", src)
    if not m:
        return None, None
    i = src.find("{", m.end())
    depth = 0
    for j in range(i, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                return src[i:j], src[: m.start()].count("\n") + 1
    return src[i:], None


for spec in sys.argv[2:]:
    path, meth = spec.split("::")
    src = open(os.path.join(root, path), encoding="utf-8", errors="replace").read()
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    src = "\n".join("" if l.lstrip().startswith("//") else l for l in src.split("\n"))
    body, line = method_body(src, meth)
    if body is None:
        print(f"{spec}: METHOD NOT FOUND")
        continue
    c = Counter()
    for m in SIG.finditer(body):
        dec, a, b = m.group(1), m.group(2) or "-", m.group(3) or "-"
        c[f"{dec},{a},{b}"] += 1
    print(f"{spec}@{line}: " + "  ".join(f"[{k}]x{v}" for k, v in sorted(c.items())) if c else f"{spec}@{line}: no number_format")
