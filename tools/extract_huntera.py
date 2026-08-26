#!/usr/bin/env python3
"""Extract a tiny Huntera 32px tile set plus citizen looktype 128."""

from __future__ import annotations

import json
import lzma
import subprocess
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

from extract_huntera_parse import parse_appearances

BASE_URL = "https://huntera.com.br/things/1332"
TILE_IDS = {
    "grass": 106,
    "path": 351,
    "wall": 2200,
    "roof": 1088,
    "flower": 102,
    "rose": 3658,
    "gold": 3031,
    "stone": 26121,
}
OUTFIT_ID = 128
SPRITE_TYPES = {
    0: (32, 32, 12, 12),
    1: (32, 64, 12, 6),
    2: (64, 32, 6, 12),
    3: (64, 64, 6, 6),
}
HEAD = (194, 136, 64)
BODY = (42, 92, 186)
LEGS = (92, 64, 40)
FEET = (36, 32, 32)
MASK_COLORS = (
    ((255, 255, 0), HEAD),
    ((255, 0, 0), BODY),
    ((0, 255, 0), LEGS),
    ((0, 0, 255), FEET),
)


def sprite_index(info, x, y, z, layer, phase) -> int:
    px, py, pz = info.pattern_x, max(1, info.pattern_y), max(1, info.pattern_z)
    layers = max(1, info.layers)
    return ((((phase * pz + z) * py + y) * px + x) * layers + layer)


def decompress_cip_lzma(data: bytes) -> bytes:
    payload = bytearray(data[32:])
    payload[5:13] = b"\xff" * 8
    return lzma.decompress(bytes(payload), format=lzma.FORMAT_ALONE)


def bmp_to_image(bmp_bytes: bytes) -> Image.Image:
    img = Image.open(BytesIO(bmp_bytes)).convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if (r, g, b) == (255, 0, 255):
                pixels[x, y] = (0, 0, 0, 0)
    return img


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    print(f"GET {url}")
    subprocess.check_call(
        [
            "curl",
            "-L",
            "--fail",
            "-A",
            "Mozilla/5.0 otpokemon-web extractor",
            "-o",
            str(dest),
            url,
        ]
    )
    return dest


def sheet_tile(sheet: Image.Image, sprite_id: int, entry: dict) -> Image.Image:
    tw, th, cols, rows = SPRITE_TYPES[entry.get("spritetype", 0)]
    index = sprite_id - entry["firstspriteid"]
    x = (index % cols) * tw
    y = (index // cols) * th
    return sheet.crop((x, y, x + tw, y + th))


def closest_mask(rgb: tuple[int, int, int]):
    r, g, b = rgb
    best, best_d = None, 1e9
    for src, color in MASK_COLORS:
        d = (r - src[0]) ** 2 + (g - src[1]) ** 2 + (b - src[2]) ** 2
        if d < best_d:
            best, best_d = color, d
    return best if best_d < 50000 else None


def colorize(base: Image.Image, mask: Image.Image) -> Image.Image:
    base = base.convert("RGBA")
    mask = mask.convert("RGBA").resize(base.size)
    out = base.copy()
    bp, mp, op = base.load(), mask.load(), out.load()
    w, h = base.size
    for y in range(h):
        for x in range(w):
            mr, mg, mb, ma = mp[x, y]
            if ma < 16:
                continue
            tint = closest_mask((mr, mg, mb))
            if not tint:
                continue
            br, bg, bb, ba = bp[x, y]
            if ba < 16:
                continue
            lum = (br + bg + bb) / (3 * 255)
            op[x, y] = (
                min(255, int(tint[0] * (0.35 + 0.9 * lum))),
                min(255, int(tint[1] * (0.35 + 0.9 * lum))),
                min(255, int(tint[2] * (0.35 + 0.9 * lum))),
                ba,
            )
    return out


def find_entry(catalog: list, sid: int) -> dict:
    for e in catalog:
        if e.get("type") == "sprite" and e["firstspriteid"] <= sid <= e["lastspriteid"]:
            return e
    raise KeyError(f"no sheet for sprite {sid}")


def main() -> int:
    assets = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/assets/huntera")
    out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else "client/public/assets")
    catalog = json.loads((assets / "catalog-content.json").read_text())
    objects, outfits = parse_appearances(assets / "appearances.dat")
    by_id = {o.appearance_id: o for o in objects}
    outfit = next(o for o in outfits if o.appearance_id == OUTFIT_ID)
    tiles = {name: by_id[tid] for name, tid in TILE_IDS.items()}

    needed: set[int] = set()
    tile_sprite = {}
    for name, app in tiles.items():
        sid = app.groups[0].info.sprite_ids[0]
        tile_sprite[name] = sid
        needed.add(sid)
        print(f"tile {name} id={app.appearance_id} sprite={sid} name={app.name!r}")

    idle = next(g for g in outfit.groups if g.group_id == 0)
    walk = next(g for g in outfit.groups if g.group_id == 1)
    pose_ids: dict[str, tuple[int, int]] = {}
    dirs = ["north", "east", "south", "west"]
    walk_phases = [1, 5] if walk.info.phases >= 6 else [0, min(1, walk.info.phases - 1)]
    for x, dname in enumerate(dirs):
        ib = sprite_index(idle.info, x, 0, 0, 0, 0)
        im = sprite_index(idle.info, x, 0, 0, 1, 0)
        pose_ids[f"idle_{dname}"] = (idle.info.sprite_ids[ib], idle.info.sprite_ids[im])
        needed.update(pose_ids[f"idle_{dname}"])
        for pi, phase in enumerate(walk_phases, start=1):
            wb = sprite_index(walk.info, x, 0, 0, 0, phase)
            wm = sprite_index(walk.info, x, 0, 0, 1, phase)
            pose_ids[f"walk{pi}_{dname}"] = (walk.info.sprite_ids[wb], walk.info.sprite_ids[wm])
            needed.update(pose_ids[f"walk{pi}_{dname}"])

    unique = {find_entry(catalog, sid)["file"]: find_entry(catalog, sid) for sid in needed}
    print(f"need {len(needed)} sprites from {len(unique)} sheets")
    sheets: dict[str, tuple[dict, Image.Image]] = {}
    cache = assets / "sheets"
    for fname, entry in unique.items():
        raw_path = download(f"{BASE_URL}/{fname}", cache / fname)
        sheets[fname] = (entry, bmp_to_image(decompress_cip_lzma(raw_path.read_bytes())))

    def get_sprite(sid: int) -> Image.Image:
        entry = find_entry(catalog, sid)
        return sheet_tile(sheets[entry["file"]][1], sid, entry)

    tile_dir = out_dir / "tiles"
    tile_dir.mkdir(parents=True, exist_ok=True)
    mapping = {"tiles": {}, "outfit": {"id": OUTFIT_ID, "name": "citizen"}}
    for name, sid in tile_sprite.items():
        img = get_sprite(sid)
        img.save(tile_dir / f"{name}.png")
        mapping["tiles"][name] = {
            "id": TILE_IDS[name],
            "sprite": sid,
            "w": img.width,
            "h": img.height,
        }

    human_dir = out_dir / "human"
    human_dir.mkdir(parents=True, exist_ok=True)
    first = colorize(*[get_sprite(s) for s in pose_ids["idle_south"]])
    fw, fh = first.size
    sheet = Image.new("RGBA", (fw * 4, fh * 3), (0, 0, 0, 0))
    for x, dname in enumerate(dirs):
        for row, key in enumerate((f"idle_{dname}", f"walk1_{dname}", f"walk2_{dname}")):
            frame = colorize(*[get_sprite(s) for s in pose_ids[key]])
            frame.save(human_dir / f"{key}.png")
            sheet.paste(frame, (x * fw, row * fh))
            if key == "idle_south":
                frame.save(human_dir / "portrait.png")
    sheet.save(human_dir / "sheet.png")
    mapping["outfit"]["frameW"] = fw
    mapping["outfit"]["frameH"] = fh
    mapping["outfit"]["dirs"] = 4
    mapping["outfit"]["frames"] = 3
    (out_dir / "huntera_manifest.json").write_text(json.dumps(mapping, indent=2))
    print("wrote", human_dir / "sheet.png", "size", sheet.size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
