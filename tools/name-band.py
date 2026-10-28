"""Poloha pásky s menom na arte kariet → src/name-band.js.

Páska (svetlý pergamenový pás nad lištou s kryštálmi) nie je na všetkých
artoch v rovnakej výške – Ogri, niektoré zlaté Draky/Víly a bronzoví Psíci
ju majú o 1–5 % nižšie. Skript zmeria jej stred na každom obrázku
assets/cards/*.webp (3 zvislé pásy – vľavo, v strede, vpravo; kresba
niekedy zasahuje do stredu pásky – medián) a zapíše odchýlky od bežnej
výšky. game.js (cardEl) o ne posunie meno na páske.
Spusti po pridaní / zmene artu kariet (treba Pillow):
    python tools/name-band.py
"""
import json
import os
from statistics import median

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "assets", "cards")
OUT = os.path.join(ROOT, "src", "name-band.js")
BASE = 54.6   # bežný stred pásky v % výšky karty (= poloha mena v style.css)
MIN_DY = 0.4  # menšie odchýlky nezapisuj (oko ich nevidí)


def band(im, xa, xb):
    """Stred najdlhšieho súvislého svetlého pásu v stĺpcoch xa–xb (% výšky)."""
    W, H = im.size
    x0, x1 = int(W * xa), int(W * xb)
    best = cur = None
    for y in range(int(H * .45), int(H * .64)):
        n = light = 0
        for x in range(x0, x1, 2):
            r, g, b = im.getpixel((x, y))
            n += 1
            if max(r, g, b) > 165 and max(r, g, b) - min(r, g, b) < 95:
                light += 1
        if light / n > .8:
            cur = (cur[0], y) if cur else (y, y)
            if not best or cur[1] - cur[0] > best[1] - best[0]:
                best = cur
        else:
            cur = None
    if not best or best[1] - best[0] < H * .025:
        return None
    return (best[0] + best[1]) / 2 / H * 100


def main():
    dy = {}
    for f in sorted(os.listdir(CARDS)):
        if not f.endswith(".webp"):
            continue
        im = Image.open(os.path.join(CARDS, f)).convert("RGB")
        cs = [c for c in (band(im, .22, .32), band(im, .42, .58), band(im, .68, .78)) if c is not None]
        if not cs:
            print("páska nenájdená:", f)
            continue
        d = round(median(cs) - BASE, 1)
        if abs(d) >= MIN_DY:
            dy[f[:-5]] = d
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("// Generované: python tools/name-band.py – NEUPRAVUJ ručne.\n")
        fh.write("// Posun pásky s menom na arte karty oproti bežnej výške (% výšky karty),\n")
        fh.write("// kľúč = súbor v assets/cards bez prípony. game.js o to posunie .nm.\n")
        fh.write("const NAME_BAND = " + json.dumps(dy, separators=(",", ":")) + ";\n")
    print(f"{len(dy)} artov s posunom -> {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
