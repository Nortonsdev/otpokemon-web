#!/usr/bin/env python3
"""Gera os sprites reais de Pikachu e Mewtwo usados na cena de batalha do login.

Mesma fonte de pixel-art do restante do repositório (PokeAPI/sprites):
  - Frames animados de batalha (Gen V, front/back) empacotados em strips PNG
    + meta.json com contagem de frames e durações.
  - Sheet OTP 4×3 de 32px, idle_south e portrait (compatível com o pack
    OTP2072026 / build_kanto20_sprites.py).

Saída: client/public/login-battle/
"""
from __future__ import annotations

import io
import json
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "client/public/login-battle"
BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon"

SPECIES = [(25, "pikachu"), (150, "mewtwo")]
COLS, ROWS, FW, FH = 4, 3, 32, 32


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "otpokemon-web-login-battle"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def gif_frames(data: bytes) -> tuple[list[Image.Image], list[int]]:
    """Decodifica um GIF respeitando disposal, retornando frames RGBA completos."""
    im = Image.open(io.BytesIO(data))
    canvas = Image.new("RGBA", im.size, (0, 0, 0, 0))
    frames: list[Image.Image] = []
    durations: list[int] = []
    for frame in ImageSequence.Iterator(im):
        disposal = getattr(frame, "disposal_method", 2)
        fr = frame.convert("RGBA")
        prev = canvas.copy()
        canvas.paste(fr, (0, 0), fr)
        frames.append(canvas.copy())
        durations.append(int(frame.info.get("duration", 120)) or 120)
        if disposal == 2:
            canvas = Image.new("RGBA", im.size, (0, 0, 0, 0))
        elif disposal == 3:
            canvas = prev
    return frames, durations


def union_bbox(frames: list[Image.Image]) -> tuple[int, int, int, int]:
    l = t = 10**6
    r = b = -(10**6)
    for f in frames:
        bb = f.getbbox()
        if not bb:
            continue
        l, t = min(l, bb[0]), min(t, bb[1])
        r, b = max(r, bb[2]), max(b, bb[3])
    return (l, t, r, b)


MAX_TEX_W = 2048


def build_strip(num: int, name: str, view: str) -> dict:
    sub = "" if view == "front" else "back/"
    data = fetch(f"{BASE}/versions/generation-v/black-white/animated/{sub}{num}.gif")
    frames, durations = gif_frames(data)
    bb = union_bbox(frames)
    frames = [f.crop(bb) for f in frames]
    w, h = frames[0].size
    cols = max(1, min(len(frames), MAX_TEX_W // w))
    rows = -(-len(frames) // cols)
    grid = Image.new("RGBA", (w * cols, h * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        grid.paste(f, ((i % cols) * w, (i // cols) * h), f)
    fname = f"{name}_{view}.png"
    grid.save(OUT / fname)
    print("grid", fname, f"{len(frames)} frames {w}x{h} ({cols}x{rows})")
    return {
        "file": fname,
        "frames": len(frames),
        "w": w,
        "h": h,
        "cols": cols,
        "rows": rows,
        "durations": durations,
    }


def trim(im: Image.Image) -> Image.Image:
    bb = im.getbbox()
    return im.crop(bb) if bb else im


def fit32(im: Image.Image, dy: int = 0) -> Image.Image:
    im = trim(im)
    im.thumbnail((28, 28), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    x = (FW - im.width) // 2
    y = FH - im.height - 1 + dy
    canvas.paste(im, (x, max(0, y)), im)
    return canvas


def make_sheet(base: Image.Image) -> Image.Image:
    dirs = [base, base, base, ImageOps.mirror(base)]
    sheet = Image.new("RGBA", (FW * COLS, FH * ROWS), (0, 0, 0, 0))
    for row, yoff in enumerate((0, -1, 1)):
        for col, src in enumerate(dirs):
            frame = fit32(src, dy=yoff)
            sheet.paste(frame, (col * FW, row * FH), frame)
    return sheet


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    meta: dict = {}
    for num, name in SPECIES:
        meta[name] = {
            "front": build_strip(num, name, "front"),
            "back": build_strip(num, name, "back"),
        }
        static = Image.open(io.BytesIO(fetch(f"{BASE}/{num}.png"))).convert("RGBA")
        make_sheet(static).save(OUT / f"{name}_sheet.png")
        cell = fit32(static)
        cell.save(OUT / f"{name}_idle_south.png")
        cell.save(OUT / f"{name}_portrait.png")
        print("otp-pack", name)
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print("done ->", OUT)


if __name__ == "__main__":
    main()
