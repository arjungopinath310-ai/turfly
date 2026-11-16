"""
Generates Turfly's app icons (PWA + Android launcher + notification icon) from code, so they can be re-made any time.
  python scripts/make-icons.py [android_res_dir]
Writes public/icons/*.png and, if an Android res/ directory is given, the launcher mipmaps there.
"""
import math, os, sys
from PIL import Image, ImageDraw

GREEN_TOP = (50, 213, 131)   # brand-400
GREEN_BOT = (2, 122, 72)     # brand-700
INK = (7, 19, 13)
SS = 4  # supersampling for smooth edges


def gradient(size):
    im = Image.new("RGB", (size, size))
    px = im.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            px[x, y] = tuple(int(GREEN_TOP[i] + (GREEN_BOT[i] - GREEN_TOP[i]) * t) for i in range(3))
    return im


def pentagon(cx, cy, r, rot=-90):
    return [(cx + r * math.cos(math.radians(rot + i * 72)), cy + r * math.sin(math.radians(rot + i * 72))) for i in range(5)]


def ball(draw, cx, cy, r, ink=INK, fill=(255, 255, 255)):
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
    p = r * 0.36
    draw.polygon(pentagon(cx, cy, p), fill=ink)
    # seams from the centre pentagon to five edge patches
    for i in range(5):
        a = math.radians(-90 + i * 72)
        x1, y1 = cx + p * math.cos(a), cy + p * math.sin(a)
        x2, y2 = cx + r * 0.78 * math.cos(a), cy + r * 0.78 * math.sin(a)
        draw.line([(x1, y1), (x2, y2)], fill=ink, width=max(1, int(r * 0.07)))
        draw.polygon(pentagon(cx + r * 0.98 * math.cos(a), cy + r * 0.98 * math.sin(a), r * 0.26, rot=-90 + i * 72 + 36), fill=ink)
    # clip patches to the ball outline
    return


def make(size, ball_ratio, rounded=True, transparent_bg=False):
    big = size * SS
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    if not transparent_bg:
        bg = gradient(big).convert("RGBA")
        mask = Image.new("L", (big, big), 0)
        md = ImageDraw.Draw(mask)
        if rounded:
            md.rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.22), fill=255)
        else:
            md.rectangle([0, 0, big, big], fill=255)
        canvas.paste(bg, (0, 0), mask)
    # ball on its own layer, clipped to a circle
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r = big * ball_ratio / 2
    ball(d, big / 2, big / 2, r)
    clip = Image.new("L", (big, big), 0)
    ImageDraw.Draw(clip).ellipse([big / 2 - r, big / 2 - r, big / 2 + r, big / 2 + r], fill=255)
    canvas.paste(layer, (0, 0), Image.composite(layer.split()[3], Image.new("L", (big, big), 0), clip))
    return canvas.resize((size, size), Image.LANCZOS)


def notification_icon(size):
    """Android status-bar icon: white silhouette on transparent (Android tints it)."""
    big = size * SS
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = big * 0.46
    d.ellipse([big / 2 - r, big / 2 - r, big / 2 + r, big / 2 + r], fill=(255, 255, 255, 255))
    d.polygon(pentagon(big / 2, big / 2, r * 0.42), fill=(0, 0, 0, 0))
    return im.resize((size, size), Image.LANCZOS)


root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, "public", "icons")
os.makedirs(out, exist_ok=True)
make(192, 0.62).save(os.path.join(out, "icon-192.png"))
make(512, 0.62).save(os.path.join(out, "icon-512.png"))
make(512, 0.50, rounded=False).save(os.path.join(out, "maskable-512.png"))  # content inside the 80% safe zone
make(180, 0.62, rounded=False).save(os.path.join(out, "apple-touch-icon.png"))
make(1024, 0.62).save(os.path.join(out, "icon-1024.png"))
print("wrote", out)

if len(sys.argv) > 1:
    res = sys.argv[1]
    dens = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for name, k in dens.items():
        d = os.path.join(res, f"mipmap-{name}")
        os.makedirs(d, exist_ok=True)
        legacy = int(48 * k)
        make(legacy, 0.62).save(os.path.join(d, "ic_launcher.png"))
        round_icon = make(legacy, 0.62, rounded=False)
        m = Image.new("L", (legacy, legacy), 0)
        ImageDraw.Draw(m).ellipse([0, 0, legacy - 1, legacy - 1], fill=255)
        ri = Image.new("RGBA", (legacy, legacy), (0, 0, 0, 0)); ri.paste(round_icon, (0, 0), m)
        ri.save(os.path.join(d, "ic_launcher_round.png"))
        fg = int(108 * k)  # adaptive icon foreground: ball within the 66dp safe zone, transparent background
        make(fg, 0.46, transparent_bg=True).save(os.path.join(d, "ic_launcher_foreground.png"))
        nd = os.path.join(res, f"drawable-{name}")
        os.makedirs(nd, exist_ok=True)
        notification_icon(int(24 * k)).save(os.path.join(nd, "ic_stat_turfly.png"))
    print("wrote android icons to", res)
