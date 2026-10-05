#!/usr/bin/env python3
"""Makes the iPhone/iPad launch screens for the home-screen app (public/startup/*.png) and the list
the app's <head> uses (src/lib/startup-images.ts).

iOS shows a launch screen while the home-screen app starts, before the page has drawn anything;
without one it's a blank white screen. These match the first frame of the app's loading screen
(src/components/BootLoader.tsx): the pack's wolf on the cream background, in the same spot, so the
launch screen turns straight into the moving loading screen. iOS picks the image whose size
exactly matches the device, and saves it when the app is added to the home screen.

Run from the repo root after changing the badge or the loading screen's layout:
    python3 scripts/startup-images.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "startup"
TS = ROOT / "src" / "lib" / "startup-images.ts"

CANVAS = (0xFA, 0xF9, 0xF4)  # --color-canvas
GOLD = (0xFE, 0xBA, 0x38)  # --color-gold
BADGE = 120  # CSS px, as in globals.css (.boot-wolf img)
RING = 4

# Portrait screens in CSS px and pixel ratio (current and recent iPhones and iPads).
DEVICES = [
    (440, 956, 3),  # iPhone 16 Pro Max, 17 Pro Max
    (430, 932, 3),  # iPhone 14 Pro Max, 15 Plus / Pro Max, 16 Plus
    (420, 912, 3),  # iPhone Air
    (428, 926, 3),  # iPhone 12/13 Pro Max, 14 Plus
    (414, 896, 3),  # iPhone XS Max, 11 Pro Max
    (414, 896, 2),  # iPhone XR, 11
    (414, 736, 3),  # iPhone 6s/7/8 Plus
    (402, 874, 3),  # iPhone 16 Pro, 17, 17 Pro
    (393, 852, 3),  # iPhone 14 Pro, 15, 15 Pro, 16
    (390, 844, 3),  # iPhone 12, 13, 14, 12/13 Pro, 16e
    (375, 812, 3),  # iPhone X, XS, 11 Pro, 12/13 mini
    (375, 667, 2),  # iPhone 6s/7/8, SE (2nd and 3rd gen)
    (320, 568, 2),  # iPhone SE (1st gen)
    (1024, 1366, 2),  # iPad Pro 12.9"
    (1032, 1376, 2),  # iPad Pro 13" (M4)
    (834, 1194, 2),  # iPad Pro 11"
    (834, 1210, 2),  # iPad Pro 11" (M4)
    (820, 1180, 2),  # iPad Air 10.9", iPad 10th gen
    (810, 1080, 2),  # iPad 10.2"
    (768, 1024, 2),  # iPad mini 5, older iPads
    (744, 1133, 2),  # iPad mini 6
]


def badge_center_y(h: float) -> float:
    """Where the loading screen's wolf sits, in CSS px from the top. The loading screen centers its
    column (wolf 120, shadow 10+14, paws 14+48, name 18+28, line 2+24 = 278 px tall) with 8vh of
    padding under it."""
    column = 278
    top = (h - 0.08 * h - column) / 2
    return top + BADGE / 2


def make(w: int, h: int, r: int, badge: Image.Image) -> Path:
    W, H = w * r, h * r
    img = Image.new("RGB", (W, H), CANVAS)
    cx, cy = W / 2, badge_center_y(h) * r
    # Soft shadow under the badge, like the loading screen's.
    size = (BADGE + 2 * RING) * r
    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).ellipse((cx - size / 2, cy - size / 2 + 10 * r, cx + size / 2, cy + size / 2 + 10 * r), fill=40)
    shadow = shadow.filter(ImageFilter.GaussianBlur(12 * r))
    img.paste(Image.new("RGB", (W, H), (0x1B, 0x43, 0x32)), (0, 0), shadow)
    # Gold ring, then the wolf.
    d = ImageDraw.Draw(img)
    d.ellipse((cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2), fill=GOLD)
    inner = BADGE * r
    wolf = badge.resize((inner, inner), Image.LANCZOS)
    mask = Image.new("L", (inner * 4, inner * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, inner * 4 - 1, inner * 4 - 1), fill=255)
    mask = mask.resize((inner, inner), Image.LANCZOS)
    img.paste(wolf.convert("RGB"), (round(cx - inner / 2), round(cy - inner / 2)), mask)
    path = OUT / f"launch-{W}x{H}.png"
    img.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(path, optimize=True)
    return path


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("launch-*.png"):
        old.unlink()
    badge = Image.open(ROOT / "public" / "badge.png").convert("RGBA")
    rows = []
    for w, h, r in DEVICES:
        path = make(w, h, r, badge)
        media = f"(device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {r}) and (orientation: portrait)"
        rows.append(f'  {{ url: "/startup/{path.name}", media: "{media}" }},')
    TS.write_text(
        "// Made by scripts/startup-images.py: the home-screen app's launch screens on iPhone and iPad.\n"
        "export const STARTUP_IMAGES = [\n" + "\n".join(rows) + "\n];\n"
    )
    print(f"{len(rows)} launch screens in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
