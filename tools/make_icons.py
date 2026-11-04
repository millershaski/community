"""Generates the PWA / app icons. Run: python3 tools/make_icons.py (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "frontend" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
CORAL = (240, 106, 106, 255)
WHITE = (255, 255, 255, 255)
S = 1024


def symbol(scale):
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c, r, w = S / 2, 300 * scale, int(64 * scale)
    d.ellipse([c - r, c - r, c + r, c + r], outline=WHITE, width=w)
    pts = [(c - 130 * scale, c + 5 * scale), (c - 30 * scale, c + 110 * scale), (c + 150 * scale, c - 105 * scale)]
    d.line(pts, fill=WHITE, width=int(72 * scale), joint="curve")
    for x, y in (pts[0], pts[-1]):
        rr = 36 * scale
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=WHITE)
    return layer


def rounded(size, radius):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=CORAL)
    return img


def save(img, name, size):
    img.resize((size, size), Image.LANCZOS).save(OUT / name)


plain = rounded(S, 220)
plain.alpha_composite(symbol(1.0))
save(plain, "icon-512.png", 512)
save(plain, "icon-192.png", 192)

apple = Image.new("RGBA", (S, S), CORAL)  # iOS applies its own rounding
apple.alpha_composite(symbol(1.0))
save(apple, "apple-touch-icon.png", 180)

maskable = Image.new("RGBA", (S, S), CORAL)  # full bleed, symbol kept inside the safe zone
maskable.alpha_composite(symbol(0.78))
save(maskable, "icon-maskable-512.png", 512)
print("wrote icons to", OUT)
