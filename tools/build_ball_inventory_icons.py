#!/usr/bin/env python3
"""Gera ícones de inventário (32×32, nearest) a partir dos masters *_otp.png.

Masters: premier_otp.png, ultra_otp.png, master_otp.png (ex.: 2560×2560 OTP).
Saída (servida no HTML): premierball.png, ultraball.png, masterball.png.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ITEMS = ROOT / "client/public/assets/items"
INV_SIZE = 32

PAIRS = (
    ("premier_otp.png", "premierball.png"),
    ("ultra_otp.png", "ultraball.png"),
    ("master_otp.png", "masterball.png"),
)


def main() -> int:
    for src_name, dst_name in PAIRS:
        src = ITEMS / src_name
        dst = ITEMS / dst_name
        if not src.is_file():
            print(f"missing source: {src}", file=sys.stderr)
            return 1
        im = Image.open(src).convert("RGBA")
        if im.size != (INV_SIZE, INV_SIZE):
            im = im.resize((INV_SIZE, INV_SIZE), Image.Resampling.NEAREST)
        im.save(dst, optimize=True)
        print(f"{src_name} {im.size} -> {dst_name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
