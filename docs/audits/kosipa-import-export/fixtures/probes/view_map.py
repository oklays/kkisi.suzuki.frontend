"""Map JS view names to the controller methods that load them. Read-only.

Usage: python3 -I view_map.py <modules_dir> <name> [<name> ...]
"""
import os
import re
import sys

root = sys.argv[1]
names = sys.argv[2:]
ctrls = []
for d, _, fs in os.walk(root):
    if "/controllers" not in d:
        continue
    for f in fs:
        if f.endswith(".php") and " copy" not in f:
            ctrls.append(os.path.join(d, f))

for name in names:
    pat = re.compile(r"js/" + re.escape(name) + r"['\"]")
    hits = []
    for c in sorted(ctrls):
        fn = "?"
        for i, line in enumerate(open(c, encoding="utf-8", errors="replace"), 1):
            m = re.search(r"function\s+(\w+)\s*\(", line)
            if m:
                fn = m.group(1)
            if pat.search(line) and not line.strip().startswith("//"):
                hits.append(f"{os.path.relpath(c, root)}::{fn}:{i}")
    print(f"{name} <- {' '.join(hits) or 'NONE'}")
