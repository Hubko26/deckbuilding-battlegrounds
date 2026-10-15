"""Dočasné medailóny trinketov: rám assets/frames/trinket-frame.png + emoji
v strede (Segoe UI Emoji). Použi pre trinkety bez vlastného artu, kým
nepríde ilustrácia. Spusti: python tools/trinket-placeholder.py [id ...]
(bez argumentov vyrobí všetky z EMOJI)."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FRAME = ROOT / "assets" / "frames" / "trinket-frame.png"
OUT = ROOT / "assets" / "trinkets"
FONT = "C:/Windows/Fonts/seguiemj.ttf"
SIZE = 512

# id trinketu -> emoji (rovnaké ako L.trinkets[id].e v src/i18n.js).
# Prázdne: všetky trinkety majú vlastný art (Gemini, 15. 10. 2026). Nový
# trinket bez artu sem dočasne pridaj – inak by skript prepísal hotový art.
EMOJI = {}


def render(emoji):
    frame = Image.open(FRAME).convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS)
    big = 4 * SIZE  # emoji kreslíme veľké a zmenšíme (ostrejšie hrany)
    font = ImageFont.truetype(FONT, 190 * 4)
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((big // 4, big // 4), emoji, font=font, embedded_color=True)
    # Vycentruj podľa skutočne nakreslených pixelov (emoji majú rôzne odsadenie).
    l, t, r, b = layer.getbbox()
    glyph = layer.crop((l, t, r, b))
    scale = min(1, 210 * 4 / max(r - l, b - t))
    glyph = glyph.resize((max(1, int((r - l) * scale / 4)), max(1, int((b - t) * scale / 4))), Image.LANCZOS)
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    layer.paste(glyph, ((SIZE - glyph.width) // 2, (SIZE - glyph.height) // 2), glyph)
    # Jemná žiara pod emoji, nech vystúpi z tmavomodrého pozadia.
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((146, 146, 366, 366), fill=(120, 170, 255, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    out = Image.alpha_composite(frame, glow)
    return Image.alpha_composite(out, layer)


if __name__ == "__main__":
    ids = sys.argv[1:] or list(EMOJI)
    for tid in ids:
        render(EMOJI[tid]).save(OUT / f"{tid}.webp", "WEBP", quality=90)
        print("ok", tid)
