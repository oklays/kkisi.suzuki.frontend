"""List named fields inside import forms (forms containing a file input). Read-only.

Usage: python3 -I form_fields.py <modules_dir>
"""
import os
import re
import sys

root = sys.argv[1]
for d, _, fs in os.walk(root):
    if "/views" not in d or "/js" in d:
        continue
    for f in sorted(fs):
        if not f.endswith(".php") or " copy" in f:
            continue
        p = os.path.join(d, f)
        raw = open(p, encoding="utf-8", errors="replace").read()
        live = re.sub(r"<!--.*?-->", "", raw, flags=re.S)
        for m in re.finditer(r"<form\b([^>]*)>(.*?)</form>", live, flags=re.S | re.I):
            body = m.group(2)
            if 'type="file"' not in body and "type='file'" not in body:
                continue
            fid = re.search(r'id\s*=\s*["\']([^"\']+)', m.group(1))
            names = re.findall(r'<(?:input|select|textarea)\b[^>]*\bname\s*=\s*["\']([^"\']+)', body, flags=re.I)
            print(f"{os.path.relpath(p, root)} form#{fid.group(1) if fid else '?'}: {names}")
