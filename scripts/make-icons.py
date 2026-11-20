"""
Generates Turfly's app icons (PWA + Android launcher + notification icon) from code, so they can be re-made any time.
  python scripts/make-icons.py [android_res_dir]
Writes public/icons/*.png and, if an Android res/ directory is given, the launcher mipmaps there.
"""
import math, os, sys
from PIL import Image, ImageDraw

INK = (15, 26, 19)       # ink
VOLT = (215, 247, 74)    # volt
SS = 4  # supersampling for smooth edges

# The mark (src/components/Logo.tsx), in its 36 x 24 drawing units: a slanted pitch with its markings
PITCH = [(6, 1), (35, 1), (30, 23), (1, 23)]
LINES = [[(20.5, 1), (15.5, 23)], [(4.4, 7.5), (8.6, 7.5), (6.7, 16.5), (2.5, 16.5)], [(33.5, 7.5), (29.3, 7.5), (27.4, 16.5), (31.6, 16.5)]]
CIRCLE = (18, 12, 4.4, 4.2)


def mark(draw, cx, cy, width, fill=VOLT, ink=INK):
    k = width / 36
    ox, oy = cx - 18 * k, cy - 12 * k
    pt = lambda x, y: (ox + x * k, oy + y * k)
    draw.polygon([pt(*p) for p in PITCH], fill=fill)
    w = max(1, round(1.8 * k))
    for line in LINES:
        draw.line([pt(*p) for p in line], fill=ink, width=w, joint="curve")
    x, y, rx, ry = CIRCLE
    draw.ellipse([ox + (x - rx) * k, oy + (y - ry) * k, ox + (x + rx) * k, oy + (y + ry) * k], outline=ink, width=w)


def make(size, mark_ratio, rounded=True, transparent_bg=False):
    """The volt pitch on ink; mark_ratio is the mark's width as a share of the icon."""
    big = size * SS
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    if not transparent_bg:
        if rounded:
            d.rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.22), fill=INK)
        else:
            d.rectangle([0, 0, big, big], fill=INK)
    mark(d, big / 2, big / 2, big * mark_ratio, ink=INK if not transparent_bg else (0, 0, 0, 0))
    return canvas.resize((size, size), Image.LANCZOS)


def notification_icon(size):
    """Android status-bar icon: white silhouette on transparent (Android tints it)."""
    big = size * SS
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    mark(ImageDraw.Draw(im), big / 2, big / 2, big * 0.92, fill=(255, 255, 255, 255), ink=(0, 0, 0, 0))
    return im.resize((size, size), Image.LANCZOS)


root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, "public", "icons")
os.makedirs(out, exist_ok=True)
make(192, 0.70).save(os.path.join(out, "icon-192.png"))
make(512, 0.70).save(os.path.join(out, "icon-512.png"))
make(512, 0.56, rounded=False).save(os.path.join(out, "maskable-512.png"))  # content inside the 80% safe zone
make(180, 0.70, rounded=False).save(os.path.join(out, "apple-touch-icon.png"))
make(1024, 0.70).save(os.path.join(out, "icon-1024.png"))
print("wrote", out)

if len(sys.argv) > 1:
    res = sys.argv[1]
    dens = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for name, k in dens.items():
        d = os.path.join(res, f"mipmap-{name}")
        os.makedirs(d, exist_ok=True)
        legacy = int(48 * k)
        make(legacy, 0.70).save(os.path.join(d, "ic_launcher.png"))
        round_icon = make(legacy, 0.62, rounded=False)
        m = Image.new("L", (legacy, legacy), 0)
        ImageDraw.Draw(m).ellipse([0, 0, legacy - 1, legacy - 1], fill=255)
        ri = Image.new("RGBA", (legacy, legacy), (0, 0, 0, 0)); ri.paste(round_icon, (0, 0), m)
        ri.save(os.path.join(d, "ic_launcher_round.png"))
        fg = int(108 * k)  # adaptive icon foreground: the mark within the 66dp safe zone (background: ink, ic_launcher_background)
        make(fg, 0.56, transparent_bg=True).save(os.path.join(d, "ic_launcher_foreground.png"))
        nd = os.path.join(res, f"drawable-{name}")
        os.makedirs(nd, exist_ok=True)
        notification_icon(int(24 * k)).save(os.path.join(nd, "ic_stat_turfly.png"))
    print("wrote android icons to", res)
