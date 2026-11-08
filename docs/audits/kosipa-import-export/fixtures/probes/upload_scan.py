"""Summarise legacy KOSIPA upload model functions. Read-only static analysis.

Usage: python3 -I upload_scan.py <modules_dir> <model.php::function> ...
"""
import os
import re
import sys

root = sys.argv[1]


def strip(src):
    src = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), src, flags=re.S)
    return "\n".join("" if l.lstrip().startswith("//") else re.sub(r"\s//.*$", "", l) for l in src.split("\n"))


def body(src, name):
    m = re.search(r"function\s+" + re.escape(name) + r"\s*\(", src)
    if not m:
        return None, None, None
    i = src.find("{", m.end())
    d = 0
    for j in range(i, len(src)):
        if src[j] == "{":
            d += 1
        elif src[j] == "}":
            d -= 1
            if d == 0:
                return src[i:j], src[: m.start()].count("\n") + 1, src[:j].count("\n") + 1
    return None, None, None


for spec in sys.argv[2:]:
    path, fn = spec.split("::")
    raw = open(os.path.join(root, path), encoding="utf-8", errors="replace").read()
    src = strip(raw)
    b, l0, l1 = body(src, fn)
    if b is None:
        print(f"## {spec}: NOT FOUND\n")
        continue
    base = l0

    def ln(pos):
        return base + b[:pos].count("\n")

    print(f"## {spec}  lines {l0}-{l1}")
    tr = [(m.group(1), ln(m.start())) for m in re.finditer(r"->trans_(start|complete|begin|commit|rollback|status)\(", b)]
    print("  trans:", tr or "none")
    exts = re.findall(r"\$ext\s*(!==|!=|==)\s*'([^']*)'", b)
    print("  ext checks:", exts, "| allowed_types:", re.findall(r"allowed_types'\]\s*=\s*'([^']*)'", b),
          "| size<:", re.findall(r"\$size\[0\]\s*<\s*(\d+)", b), "| max_size:", re.findall(r"max_size'\]\s*=\s*(\d+)", b))
    print("  numRow start:", re.findall(r"\$numRow\s*=\s*(\d+)", b), "cond:", re.findall(r"if\s*\(\s*\$numRow\s*([<>=!]+)\s*(\d+)", b),
          "limit:", re.findall(r"\$numRow\s*>\s*(\d{3,})", b))
    cols = re.findall(r"'(\w+)'\s*=>\s*\$rowData\[(\d+)\]", b)
    print("  columns:", ", ".join(f"{i}:{k}" for k, i in cols) or re.findall(r"\$rowData\[(\d+)\]", b)[:30])
    writes = []
    for m in re.finditer(r"\$this->db->(insert|update|delete|replace|insert_batch|update_batch)\(\s*['\"]?([\w$>-]+)", b):
        writes.append(f"{m.group(1)}:{m.group(2)}@{ln(m.start())}")
    for m in re.finditer(r"(INSERT\s+INTO|UPDATE|DELETE\s+FROM|CALL)\s+`?(\w+)", b, re.I):
        writes.append(f"sql-{m.group(1).split()[0].upper()}:{m.group(2)}@{ln(m.start())}")
    print("  writes:", writes or "none")
    calls = sorted(set(re.findall(r"\$this->(\w+)\(", b)) - {"db"})
    hcalls = sorted(set(m for m in re.findall(r"(?<![>$\w])([a-z_]+)\(", b) if m not in {
        "array", "explode", "end", "substr", "md5", "time", "count", "date", "strtotime", "if", "foreach", "isset",
        "empty", "unlink", "str_replace", "json_encode", "trim", "round", "number_format", "is_numeric", "floatval",
        "intval", "elseif", "for", "while", "print_r", "exit", "return", "strtoupper", "strtolower", "implode",
        "in_array", "is_null", "abs", "max", "min", "sprintf", "ceil", "floor", "pow", "mktime", "switch"}))
    print("  helper calls:", hcalls, "| model calls:", calls)
    sel = re.findall(r"(?:FROM|from|JOIN|join)\s+(\w+)", b)
    print("  reads:", sorted(set(sel)))
    print("  status msgs:", sorted(set(re.findall(r"\['mess'\]\s*=\s*'([^']{0,70})", b)))[:12])
    print()
