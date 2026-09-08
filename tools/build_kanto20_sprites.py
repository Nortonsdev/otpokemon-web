#!/usr/bin/env python3
"""Build 32×32 look + corpse sheets for the 20-species milestone.

Keeps the four Ruby.spr exports (Bulbasaur, Charmander, Squirtle, Caterpie).
Other looks are trimmed PokeAPI sprites stamped into a 4×3 walk sheet.
Dedicated fly/hide/ride frames are not in this repo — the client offsets those.
"""
from __future__ import annotations

import io
import urllib.request
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

ROOT = Path(__file__).resolve().parents[1] / "client/public/assets/pokemon"

SPECIES = [
    (1, "bulbasaur"),
    (2, "ivysaur"),
    (3, "venusaur"),
    (4, "charmander"),
    (5, "charmeleon"),
    (6, "charizard"),
    (7, "squirtle"),
    (8, "wartortle"),
    (9, "blastoise"),
    (10, "caterpie"),
    (11, "metapod"),
    (12, "butterfree"),
    (13, "weedle"),
    (14, "kakuna"),
    (15, "beedrill"),
    (16, "pidgey"),
    (17, "pidgeotto"),
    (18, "pidgeot"),
    (20, "raticate"),
    (78, "rapidash"),
]

RUBY_KEEP = {"bulbasaur", "charmander", "squirtle", "caterpie"}
COLS, ROWS, FW, FH = 4, 3, 32, 32


def fetch_pokeapi(num: int) -> Image.Image:
    url = f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{num}.png"
    req = urllib.request.Request(url, headers={"User-Agent": "otpokemon-web-sprite-build"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    return Image.open(io.BytesIO(data)).convert("RGBA")


def trim(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def fit32(im: Image.Image, dy: int = 0) -> Image.Image:
    im = trim(im)
    im.thumbnail((28, 28), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    x = (FW - im.width) // 2
    y = FH - im.height - 1 + dy
    canvas.paste(im, (x, max(0, y)), im)
    return canvas


def make_sheet(base: Image.Image) -> Image.Image:
    dirs = [
        base,
        base,
        base,
        ImageOps.mirror(base),
    ]
    sheet = Image.new("RGBA", (FW * COLS, FH * ROWS), (0, 0, 0, 0))
    for row, yoff in enumerate((0, -1, 1)):
        for col, src in enumerate(dirs):
            frame = fit32(src, dy=yoff) if yoff else src if src.size == (32, 32) else fit32(src)
            if src.size != (32, 32) or yoff:
                frame = fit32(src, dy=yoff)
            sheet.paste(frame, (col * FW, row * FH), frame)
    return sheet


def corpse_from(frame: Image.Image) -> Image.Image:
    fallen = frame.rotate(90, expand=False, resample=Image.Resampling.NEAREST)
    dark = ImageEnhance.Brightness(fallen).enhance(0.55)
    out = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    out.paste(dark, (0, 6), dark)
    return out


def idle_from_existing(name: str) -> Image.Image:
    path = ROOT / name / "idle_south.png"
    if path.exists():
        return Image.open(path).convert("RGBA")
    sheet = Image.open(ROOT / name / "sheet.png").convert("RGBA")
    return sheet.crop((2 * FW, 0, 3 * FW, FH))


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for num, name in SPECIES:
        dest = ROOT / name
        dest.mkdir(parents=True, exist_ok=True)
        if name in RUBY_KEEP:
            idle = idle_from_existing(name)
            corpse_from(idle).save(dest / "corpse.png")
            print("corpse", name)
            continue
        src = fetch_pokeapi(num)
        cell = fit32(src)
        make_sheet(src).save(dest / "sheet.png")
        cell.save(dest / "portrait.png")
        corpse_from(cell).save(dest / "corpse.png")
        print("built", name, num)
    print("done")


if __name__ == "__main__":
    main()
