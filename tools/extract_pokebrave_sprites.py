#!/usr/bin/env python3
"""Export PokeBrave/Huntera looktypes and item sprites (32px).

Prefers Tibia.dat + Tibia.spr (PokeBrave client). Falls back to Huntera catalog
for the same look/item ids when spr files are not present locally.
"""

from __future__ import annotations

import json
import lzma
import mmap
import struct
import subprocess
import sys
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "client/public/assets"
HUNTERA_URL = "https://huntera.com.br/things/1332"

LOOKS = {6: "charizard", 78: "rapidash"}
ITEMS = {
    "pokeball": (26661, 2456),
    "premierball": (26678,),
    "small_potion": (27642,),
    "great_potion": (27643,),
}

SPRITE_TYPES = {
    0: (32, 32, 12, 12),
    1: (32, 64, 12, 6),
    2: (64, 32, 6, 12),
    3: (64, 64, 6, 6),
}

THING_LAST_ATTR = 255
ATTR_DISPLACEMENT = 24
ATTR_LIGHT = 21
ATTR_MARKET = 33
ATTR_ELEVATION = 25
ATTR_USABLE = 34
ATTR_GROUND = 0
ATTR_WRITABLE = 8
ATTR_WRITABLE_ONCE = 9
ATTR_MINIMAP_COLOR = 28
ATTR_CLOTH = 32
ATTR_LENS_HELP = 29


@dataclass
class FrameGroup:
    group_type: int
    width: int
    height: int
    layers: int
    pattern_x: int
    pattern_y: int
    pattern_z: int
    phases: int
    sprite_ids: list[int] = field(default_factory=list)


@dataclass
class ThingType:
    thing_id: int
    category: str
    groups: list[FrameGroup] = field(default_factory=list)


class BinaryReader:
    def __init__(self, data: bytes | memoryview):
        self.data = data
        self.pos = 0

    def remaining(self) -> int:
        return len(self.data) - self.pos

    def u8(self) -> int:
        v = self.data[self.pos]
        self.pos += 1
        return v

    def u16(self) -> int:
        v = struct.unpack_from("<H", self.data, self.pos)[0]
        self.pos += 2
        return v

    def u32(self) -> int:
        v = struct.unpack_from("<I", self.data, self.pos)[0]
        self.pos += 4
        return v

    def raw(self, n: int) -> bytes:
        v = bytes(self.data[self.pos : self.pos + n])
        self.pos += n
        return v


def skip_thing_attributes(r: BinaryReader, thing_id: int, category: str) -> None:
    for _ in range(THING_LAST_ATTR + 8):
        if r.remaining() <= 0:
            raise RuntimeError(f"EOF in attrs id={thing_id} cat={category}")
        attr = r.u8()
        if attr == THING_LAST_ATTR:
            return
        if attr == 16:
            attr = 253
        elif attr > 16:
            attr -= 1
        if attr == ATTR_DISPLACEMENT:
            r.u16()
            r.u16()
        elif attr == ATTR_LIGHT:
            r.u16()
            r.u16()
        elif attr == ATTR_MARKET:
            r.u16()
            r.u16()
            r.u16()
            r.raw(r.u16())
            r.u16()
            r.u16()
        elif attr in (
            ATTR_ELEVATION,
            ATTR_USABLE,
            ATTR_GROUND,
            ATTR_WRITABLE,
            ATTR_WRITABLE_ONCE,
            ATTR_MINIMAP_COLOR,
            ATTR_CLOTH,
            ATTR_LENS_HELP,
        ):
            r.u16()


def read_animator(r: BinaryReader, phases: int) -> None:
    r.u8()
    r.u32()
    r.u8()
    for _ in range(phases):
        r.u32()
        r.u32()


def read_frame_group(r: BinaryReader, has_group_type: bool) -> FrameGroup:
    group_type = r.u8() if has_group_type else 0
    width = r.u8()
    height = r.u8()
    if width > 1 or height > 1:
        r.u8()
    layers = r.u8()
    pattern_x = r.u8()
    pattern_y = r.u8()
    pattern_z = r.u8()
    phases = r.u8()
    if phases > 1:
        read_animator(r, phases)
    total = width * height * layers * pattern_x * pattern_y * pattern_z * phases
    sprite_ids = [r.u32() for _ in range(total)]
    return FrameGroup(group_type, width, height, layers, pattern_x, pattern_y, pattern_z, phases, sprite_ids)


def read_thing(r: BinaryReader, thing_id: int, category: str) -> ThingType:
    skip_thing_attributes(r, thing_id, category)
    thing = ThingType(thing_id, category)
    if category == "creature":
        for _ in range(r.u8()):
            thing.groups.append(read_frame_group(r, True))
    else:
        thing.groups.append(read_frame_group(r, False))
    return thing


def parse_dat(path: Path) -> tuple[dict[int, ThingType], dict[int, ThingType]]:
    data = path.read_bytes()
    r = BinaryReader(data)
    r.u32()
    item_count = r.u16()
    creature_count = r.u16()
    r.u16()
    r.u16()
    items: dict[int, ThingType] = {}
    for item_id in range(100, item_count + 1):
        items[item_id] = read_thing(r, item_id, "item")
    creatures: dict[int, ThingType] = {}
    for look_id in range(1, creature_count + 1):
        creatures[look_id] = read_thing(r, look_id, "creature")
    for _ in range(r.u16()):
        pass
    for _ in range(r.u16()):
        pass
    return items, creatures


def decode_sprite(mm: mmap.mmap, sprite_id: int) -> Image.Image:
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    if sprite_id <= 0:
        return img
    mm.seek(((sprite_id - 1) * 4) + 8)
    address = struct.unpack("<I", mm.read(4))[0]
    if address == 0:
        return img
    mm.seek(address)
    mm.read(3)
    pixel_data_size = struct.unpack("<H", mm.read(2))[0]
    pixels = bytearray(32 * 32 * 4)
    write = 0
    read = 0
    while read < pixel_data_size and write < 32 * 32:
        transparent, colored = struct.unpack("<HH", mm.read(4))
        read += 4
        write += transparent
        for _ in range(colored):
            if write >= 32 * 32:
                break
            r, g, b, a = mm.read(4)
            read += 4
            o = write * 4
            pixels[o : o + 4] = bytes((r, g, b, a))
            write += 1
    img.putdata([(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]) for i in range(0, len(pixels), 4)])
    return img


def group_sprite_index(group: FrameGroup, x: int, phase: int) -> int:
    if group.width == 1 and group.height == 1 and group.layers == 1:
        return ((phase % group.phases) * group.pattern_z * group.pattern_y * group.pattern_x + x)
    return (
        (((((phase % group.phases) * group.pattern_z) * group.pattern_y + 0) * group.pattern_x + x) * group.layers + 0)
        * group.height
        + 0
    ) * group.width


def corpse_from(frame: Image.Image) -> Image.Image:
    fallen = frame.rotate(90, expand=False, resample=Image.Resampling.NEAREST)
    dark = ImageEnhance.Brightness(fallen).enhance(0.55)
    out = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    out.paste(dark, (0, 6), dark)
    return out


def export_creature(thing: ThingType, mm: mmap.mmap, out_dir: Path, name: str) -> None:
    look_dir = out_dir / "pokemon" / name
    look_dir.mkdir(parents=True, exist_ok=True)
    idle = next((g for g in thing.groups if g.group_type == 0), thing.groups[0])
    walk = next((g for g in thing.groups if g.group_type == 1), thing.groups[-1])
    dirs = ["north", "east", "south", "west"]
    walk_phases = [0, min(1, walk.phases - 1)] if walk.phases > 1 else [0, 0]
    sheet = Image.new("RGBA", (128, 96), (0, 0, 0, 0))
    for row, phase in enumerate([0, *walk_phases]):
        group = idle if row == 0 else walk
        for x, dname in enumerate(dirs):
            idx = group_sprite_index(group, x, phase)
            sprite_id = group.sprite_ids[idx] if 0 <= idx < len(group.sprite_ids) else 0
            frame = decode_sprite(mm, sprite_id)
            sheet.paste(frame, (x * 32, row * 32))
            if dname == "south" and row == 0:
                frame.save(look_dir / "portrait.png")
    sheet.save(look_dir / "sheet.png")
    south = sheet.crop((64, 0, 96, 32))
    corpse_from(south).save(look_dir / "corpse.png")
    print("creature", name, "->", look_dir)


def export_item(thing: ThingType, mm: mmap.mmap, out_dir: Path, name: str) -> None:
    sid = thing.groups[0].sprite_ids[0] if thing.groups and thing.groups[0].sprite_ids else 0
    img = decode_sprite(mm, sid)
    dest = out_dir / "items" / f"{name}.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest)
    print("item", name, "id", thing.thing_id, "->", dest)


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    print("GET", url)
    subprocess.check_call(["curl", "-L", "--fail", "-A", "otpokemon-web", "-o", str(dest), url])
    return dest


def decompress_cip_lzma(data: bytes) -> bytes:
    payload = bytearray(data[32:])
    payload[5:13] = b"\xff" * 8
    return lzma.decompress(bytes(payload), format=lzma.FORMAT_ALONE)


def bmp_to_image(bmp_bytes: bytes) -> Image.Image:
    img = Image.open(BytesIO(bmp_bytes)).convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            if px[x, y][:3] == (255, 0, 255):
                px[x, y] = (0, 0, 0, 0)
    return img


def sprite_index_h(info, x: int, phase: int) -> int:
    px, py, pz = info.pattern_x, max(1, info.pattern_y), max(1, info.pattern_z)
    layers = max(1, info.layers)
    return ((((phase % info.phases) * pz) * py + 0) * px + x) * layers


def export_creature_huntera(outfit, get_sprite, out_dir: Path, name: str) -> None:
    from extract_huntera_parse import parse_appearances

    look_dir = out_dir / "pokemon" / name
    look_dir.mkdir(parents=True, exist_ok=True)
    idle = next(g for g in outfit.groups if g.group_id == 0)
    walk = next(g for g in outfit.groups if g.group_id == 1)
    dirs = ["north", "east", "south", "west"]
    walk_phases = [1, 5] if walk.info.phases >= 6 else [0, min(1, walk.info.phases - 1)]
    sheet = Image.new("RGBA", (128, 96), (0, 0, 0, 0))
    for row, phase in enumerate([0, *walk_phases]):
        group = idle if row == 0 else walk
        for x, dname in enumerate(dirs):
            idx = sprite_index_h(group.info, x, phase)
            sid = group.info.sprite_ids[idx]
            frame = get_sprite(sid)
            sheet.paste(frame, (x * 32, row * 32))
            if dname == "south" and row == 0:
                frame.save(look_dir / "portrait.png")
    sheet.save(look_dir / "sheet.png")
    south = sheet.crop((64, 0, 96, 32))
    corpse_from(south).save(look_dir / "corpse.png")
    print("huntera creature", name, "->", look_dir)


def export_item_huntera(app, get_sprite, out_dir: Path, name: str) -> None:
    sid = app.groups[0].info.sprite_ids[0]
    img = get_sprite(sid)
    dest = out_dir / "items" / f"{name}.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest)
    print("huntera item", name, "id", app.appearance_id, "->", dest)


def huntera_extract(out_dir: Path) -> None:
    from extract_huntera_parse import parse_appearances

    cache = Path("/tmp/assets/huntera")
    catalog = json.loads(download(f"{HUNTERA_URL}/catalog-content.json", cache / "catalog-content.json").read_text())
    app_name = next(e["file"] for e in catalog if e.get("type") == "appearances")
    appearances = download(f"{HUNTERA_URL}/{app_name}", cache / "appearances.dat")
    objects, outfits = parse_appearances(appearances)
    by_item = {o.appearance_id: o for o in objects}
    by_look = {o.appearance_id: o for o in outfits}

    needed: set[int] = set()

    def collect_outfit(o):
        for g in o.groups:
            needed.update(g.info.sprite_ids)

    def collect_item(o):
        needed.update(o.groups[0].info.sprite_ids)

    for look_id in LOOKS:
        o = by_look.get(look_id)
        if o:
            collect_outfit(o)
    for _, ids in ITEMS.items():
        for iid in ids:
            o = by_item.get(iid)
            if o:
                collect_item(o)

    def find_entry(sid: int) -> dict:
        for e in catalog:
            if e.get("type") == "sprite" and e["firstspriteid"] <= sid <= e["lastspriteid"]:
                return e
        raise KeyError(sid)

    sheets: dict[str, Image.Image] = {}
    for sid in needed:
        entry = find_entry(sid)
        fname = entry["file"]
        if fname not in sheets:
            raw = download(f"{HUNTERA_URL}/{fname}", cache / "sheets" / fname).read_bytes()
            sheets[fname] = bmp_to_image(decompress_cip_lzma(raw))

    def get_sprite(sid: int) -> Image.Image:
        entry = find_entry(sid)
        tw, th, cols, _ = SPRITE_TYPES[entry.get("spritetype", 0)]
        index = sid - entry["firstspriteid"]
        sheet = sheets[entry["file"]]
        x = (index % cols) * tw
        y = (index // cols) * th
        return sheet.crop((x, y, x + tw, y + th))

    for look_id, name in LOOKS.items():
        o = by_look.get(look_id)
        if o:
            export_creature_huntera(o, get_sprite, out_dir, name)

    for name, ids in ITEMS.items():
        for iid in ids:
            o = by_item.get(iid)
            if o:
                export_item_huntera(o, get_sprite, out_dir, name)
                break


def spr_extract(src: Path, out_dir: Path) -> None:
    dat = src / "Tibia.dat"
    spr = src / "Tibia.spr"
    if not dat.exists():
        dat = src / "Ruby.dat"
        spr = src / "Ruby.spr"
    items, creatures = parse_dat(dat)
    with spr.open("rb") as fh:
        mm = mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ)
        try:
            for look_id, name in LOOKS.items():
                thing = creatures.get(look_id)
                if thing:
                    export_creature(thing, mm, out_dir, name)
            for name, ids in ITEMS.items():
                for iid in ids:
                    thing = items.get(iid)
                    if thing:
                        export_item(thing, mm, out_dir, name)
                        break
        finally:
            mm.close()


def main() -> int:
    out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT)
    src = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("/tmp/assets/pokebrave")
    dat = src / "Tibia.dat"
    spr = src / "Tibia.spr"
    if not dat.exists():
        dat = src / "Ruby.dat"
        spr = src / "Ruby.spr"
    if dat.exists() and spr.exists():
        print("using", dat, spr)
        spr_extract(src, out_dir)
    else:
        print("spr/dat missing, using Huntera catalog fallback")
        huntera_extract(out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
