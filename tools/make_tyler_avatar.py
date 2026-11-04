"""Generates the pixel-art avatar for Tyler (half human, half robot face).

Run: python3 tools/make_tyler_avatar.py
Requires Pillow. The committed PNG is the output, so this is only needed to edit the art.
"""
from pathlib import Path
from PIL import Image

PALETTE = {
    ".": None,
    "k": (27, 27, 27),       # outline
    "h": (74, 44, 23),       # hair
    "s": (241, 194, 125),    # skin
    "S": (217, 160, 91),     # skin shadow
    "e": (255, 255, 255),    # eye white
    "p": (43, 43, 43),       # pupil
    "m": (160, 82, 45),      # mouth
    "g": (184, 196, 204),    # metal
    "G": (107, 122, 133),    # dark metal
    "b": (46, 230, 255),     # robot eye
    "r": (255, 77, 77),      # LED
    "c": (59, 110, 165),     # shirt
}


def wide(left, right):
    return ".." + "k" + left + right + "k" + ".."


def narrow(left, right):
    return "..." + "k" + left + right + "k" + "..."


ROWS = [
    "." * 11 + "r" + "." * 4,
    "...." + "k" * 8 + "....",
    narrow("hhhh", "gGgg"),
    wide("hhhhh", "ggGgg"),
    wide("hhsss", "ggggg"),
    wide("shhss", "ggGGg"),
    wide("sepss", "ggbbg"),
    wide("sepss", "ggbbg"),
    wide("ssssS", "Gggrg"),
    wide("ssssS", "Ggggg"),
    wide("smmmm", "GkGkg"),
    wide("sssss", "ggggg"),
    narrow("ssss", "gggg"),
    "...." + "k" * 8 + "....",
    "....." + "k" + "ss" + "gg" + "k" + ".....",
    wide("ccccc", "GGGGG"),
]

assert len(ROWS) == 16 and all(len(r) == 16 for r in ROWS), [len(r) for r in ROWS]

img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
for y, row in enumerate(ROWS):
    for x, ch in enumerate(row):
        rgb = PALETTE[ch]
        if rgb:
            img.putpixel((x, y), rgb + (255,))

out = Path(__file__).resolve().parent.parent / "frontend" / "assets" / "avatars" / "tyler.png"
out.parent.mkdir(parents=True, exist_ok=True)
img.resize((256, 256), Image.NEAREST).save(out)
print("wrote", out)
