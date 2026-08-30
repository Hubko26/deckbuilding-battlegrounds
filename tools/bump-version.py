"""Cache-busting: doplní ?v=<hash> ku všetkým lokálnym <script src> a <link href>
vo všetkých index.html. Hash = obsah daného súboru, takže sa mení len pri zmene.
Spúšťa sa automaticky z git pre-commit hooku (tools/install-hook.py) alebo ručne:
    python tools/bump-version.py
"""
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATTR = re.compile(r'((?:src|href)=")((?!https?:|//|data:|#)[^"?]+\.(?:js|css))(?:\?v=[0-9a-f]+)?(")')


def file_hash(path):
    with open(path, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]


def process(html_path):
    base = os.path.dirname(html_path)
    with open(html_path, encoding="utf-8") as f:
        src = f.read()

    def sub(m):
        rel = m.group(2)
        target = os.path.normpath(os.path.join(base, rel))
        if not os.path.isfile(target):
            return m.group(0)
        return f'{m.group(1)}{rel}?v={file_hash(target)}{m.group(3)}'

    out = ATTR.sub(sub, src)
    if out != src:
        with open(html_path, "w", encoding="utf-8", newline="") as f:
            f.write(out)
        return True
    return False


def main():
    changed = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in ("node_modules", "tools")]
        for fn in filenames:
            if fn.endswith(".html") and process(os.path.join(dirpath, fn)):
                changed.append(os.path.relpath(os.path.join(dirpath, fn), ROOT))
    for c in changed:
        print("bump:", c)
    return changed


if __name__ == "__main__":
    changed = main()
    if "--stage" in sys.argv and changed:
        os.system("git add " + " ".join(f'"{c}"' for c in changed))
