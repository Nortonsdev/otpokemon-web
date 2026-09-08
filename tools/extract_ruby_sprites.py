#!/usr/bin/env python3
"""Export Ruby.spr looktypes 1, 4, 7, 10 using OTClient/Ruby DAT+SPR rules."""

from __future__ import annotations

import mmap
import struct
import sys
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageEnhance

THING_LAST_ATTR = 255
ATTR_GROUND = 0
ATTR_WRITABLE = 8
ATTR_WRITABLE_ONCE = 9
ATTR_LIGHT = 21
ATTR_DISPLACEMENT = 24
ATTR_ELEVATION = 25
ATTR_MINIMAP_COLOR = 28
ATTR_LENS_HELP = 29
ATTR_CLOTH = 32
ATTR_MARKET = 33
ATTR_USABLE = 34

LOOKS = {
    1: "bulbasaur",
    4: "charmander",
    6: "charizard",
    7: "squirtle",
    10: "caterpie",
    78: "rapidash",
}

ITEMS = {
    "pokeball": (26661,),
    "premierball": (26678,),
    "small_potion": (8878,),
    "great_potion": (8879,),
}


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

    def i8(self) -> int:
        v = struct.unpack_from("<b", self.data, self.pos)[0]
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

    def i32(self) -> int:
        v = struct.unpack_from("<i", self.data, self.pos)[0]
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
            name_len = r.u16()
            r.raw(name_len)
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
        # else: flag only
    raise RuntimeError(f"attrs never ended id={thing_id} cat={category}")


def read_animator(r: BinaryReader, phases: int) -> None:
    r.u8()  # async
    r.i32()  # loop
    r.i8()  # start
    for _ in range(phases):
        r.u32()
        r.u32()


def read_frame_group(r: BinaryReader, has_group_type: bool) -> FrameGroup:
    group_type = r.u8() if has_group_type else 0
    width = r.u8()
    height = r.u8()
    if width > 1 or height > 1:
        r.u8()  # realSize
    layers = r.u8()
    pattern_x = r.u8()
    pattern_y = r.u8()
    pattern_z = r.u8()
    phases = r.u8()
    if phases > 1:
        read_animator(r, phases)
    total = width * height * layers * pattern_x * pattern_y * pattern_z * phases
    if total > 4096:
        raise RuntimeError(f"totalSprites {total} > 4096")
    sprite_ids = [r.u32() for _ in range(total)]
    return FrameGroup(
        group_type=group_type,
        width=width,
        height=height,
        layers=layers,
        pattern_x=pattern_x,
        pattern_y=pattern_y,
        pattern_z=pattern_z,
        phases=phases,
        sprite_ids=sprite_ids,
    )


def read_thing(r: BinaryReader, thing_id: int, category: str) -> ThingType:
    skip_thing_attributes(r, thing_id, category)
    thing = ThingType(thing_id=thing_id, category=category)
    if category == "creature":
        group_count = r.u8()
        for _ in range(group_count):
            thing.groups.append(read_frame_group(r, True))
    else:
        thing.groups.append(read_frame_group(r, False))
    return thing


def parse_dat(path: Path) -> dict[int, ThingType]:
    data = path.read_bytes()
    r = BinaryReader(data)
    signature = r.u32()
    item_count = r.u16()
    creature_count = r.u16()
    effect_count = r.u16()
    missile_count = r.u16()
    print(
        f"DAT signature={signature:#x} items={item_count} "
        f"creatures={creature_count} effects={effect_count} missiles={missile_count}"
    )
    items: dict[int, ThingType] = {}
    for item_id in range(100, item_count + 1):
        thing = read_thing(r, item_id, "item")
        if item_id in {i for ids in ITEMS.values() for i in ids}:
            items[item_id] = thing
    creatures: dict[int, ThingType] = {}
    for look_id in range(1, creature_count + 1):
        thing = read_thing(r, look_id, "creature")
        if look_id in LOOKS:
            creatures[look_id] = thing
            g0 = thing.groups[0] if thing.groups else None
            print(
                f"look {look_id} {LOOKS[look_id]} groups={len(thing.groups)} "
                + (
                    f"g0 {g0.width}x{g0.height} layers={g0.layers} "
                    f"px={g0.pattern_x} py={g0.pattern_y} pz={g0.pattern_z} "
                    f"phases={g0.phases} sprites={len(g0.sprite_ids)}"
                    if g0
                    else "empty"
                )
            )
            for gi, g in enumerate(thing.groups):
                print(
                    f"  group[{gi}] type={g.group_type} {g.width}x{g.height} "
                    f"L={g.layers} X={g.pattern_x} Y={g.pattern_y} Z={g.pattern_z} "
                    f"P={g.phases} n={len(g.sprite_ids)} ids={g.sprite_ids[:12]}"
                )
    for effect_id in range(1, effect_count + 1):
        read_thing(r, effect_id, "effect")
    for missile_id in range(1, missile_count + 1):
        read_thing(r, missile_id, "missile")
    print(f"DAT parse complete, pos={r.pos}/{len(data)}")
    return creatures, items


def decode_sprite(mm: mmap.mmap, sprite_id: int) -> Image.Image:
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    if sprite_id <= 0:
        return img
    mm.seek(((sprite_id - 1) * 4) + 8)
    address = struct.unpack("<I", mm.read(4))[0]
    if address == 0:
        return img
    mm.seek(address)
    mm.read(3)  # color key
    pixel_data_size = struct.unpack("<H", mm.read(2))[0]
    pixels = bytearray(32 * 32 * 4)
    write = 0
    read = 0
    while read < pixel_data_size and write < 32 * 32:
        if read + 4 > pixel_data_size:
            break
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
    img.putdata(
        [
            (pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3])
            for i in range(0, len(pixels), 4)
        ]
    )
    return img


def corpse_from(frame: Image.Image) -> Image.Image:
    fallen = frame.rotate(90, expand=False, resample=Image.Resampling.NEAREST)
    dark = ImageEnhance.Brightness(fallen).enhance(0.55)
    out = Image.new("RGBA", (frame.width, frame.height), (0, 0, 0, 0))
    out.paste(dark, (0, max(0, (frame.height - dark.height) // 2 - 4)), dark)
    return out


def group_sprite_index(group: FrameGroup, x: int, y: int, z: int, layer: int, phase: int, w: int, h: int) -> int:
    return (
        (
            (
                (
                    (((phase % group.phases) * group.pattern_z + z) * group.pattern_y + y)
                    * group.pattern_x
                    + x
                )
                * group.layers
                + layer
            )
            * group.height
            + h
        )
        * group.width
        + w
    )


def compose_frame(group: FrameGroup, mm: mmap.mmap, direction: int, phase: int) -> Image.Image:
    fw, fh = group.width * 32, group.height * 32
    frame = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    for h in range(group.height):
        for w in range(group.width):
            for layer in range(max(1, group.layers)):
                idx = group_sprite_index(group, direction, 0, 0, layer, phase, w, h)
                sid = group.sprite_ids[idx] if 0 <= idx < len(group.sprite_ids) else 0
                tile = decode_sprite(mm, sid)
                # OTClient: feet on tile, compose from bottom-right quadrant.
                px = (group.width - 1 - w) * 32
                py = (group.height - 1 - h) * 32
                frame.paste(tile, (px, py), tile)
    return frame


def export_look(thing: ThingType, mm: mmap.mmap, out_dir: Path) -> None:
    name = LOOKS[thing.thing_id]
    look_dir = out_dir / name
    look_dir.mkdir(parents=True, exist_ok=True)
    idle = next((g for g in thing.groups if g.group_type == 0), thing.groups[0])
    walk = next((g for g in thing.groups if g.group_type == 1), thing.groups[-1])
    fw, fh = idle.width * 32, idle.height * 32
    dirs = ["north", "east", "south", "west"]
    walk_phases = [0, min(1, walk.phases - 1)] if walk.phases > 1 else [0, 0]
    sheet = Image.new("RGBA", (fw * 4, fh * 3), (0, 0, 0, 0))
    for row, phase in enumerate([0, *walk_phases]):
        group = idle if row == 0 else walk
        for x, dname in enumerate(dirs):
            frame = compose_frame(group, mm, x, phase)
            if row == 0:
                frame.save(look_dir / f"idle_{dname}.png")
            else:
                frame.save(look_dir / f"walk{row}_{dname}.png")
            sheet.paste(frame, (x * fw, row * fh))
            if dname == "south" and row == 0:
                portrait = frame.copy()
                portrait.thumbnail((32, 32), Image.Resampling.NEAREST)
                portrait.save(look_dir / "portrait.png")
                portrait.save(out_dir / f"{name}_portrait.png")
    sheet.save(look_dir / "sheet.png")
    sheet.save(out_dir / f"{name}_sheet.png")
    south = compose_frame(idle, mm, 2, 0)
    corpse = corpse_from(south if south.height <= 32 else south.resize((32, 32), Image.Resampling.NEAREST))
    corpse.save(look_dir / "corpse.png")
    print(f"exported {name} -> {look_dir} ({fw}x{fh})")


def export_item(thing: ThingType, mm: mmap.mmap, out_dir: Path, name: str) -> bool:
    group = thing.groups[0]
    sprite_ids = [sid for sid in group.sprite_ids if sid > 0]
    if not sprite_ids:
        print(f"skip item {name} id={thing.thing_id} (no sprite ids)")
        return False
    if group.width == 1 and group.height == 1:
        img = decode_sprite(mm, sprite_ids[0])
    else:
        img = compose_frame(group, mm, 0, 0)
        if img.width > 32 or img.height > 32:
            img = img.resize((32, 32), Image.Resampling.NEAREST)
    if not img.getbbox():
        print(f"skip item {name} id={thing.thing_id} (empty frame)")
        return False
    dest = out_dir / "items" / f"{name}.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest)
    print(f"exported item {name} id={thing.thing_id} -> {dest}")
    return True


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/assets/ruby/extracted")
    out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else "client/public/assets/pokemon")
    out_dir.mkdir(parents=True, exist_ok=True)
    creatures, items = parse_dat(root / "Ruby.dat")
    missing = [look for look in LOOKS if look not in creatures]
    if missing:
        raise SystemExit(f"missing looks: {missing}")
    with (root / "Ruby.spr").open("rb") as fh:
        mm = mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ)
        try:
            sig, count = struct.unpack_from("<II", mm, 0)
            print(f"SPR signature={sig:#x} spriteCount={count}")
            for look_id, thing in creatures.items():
                export_look(thing, mm, out_dir)
            for name, ids in ITEMS.items():
                for iid in ids:
                    thing = items.get(iid)
                    if thing:
                        export_item(thing, mm, out_dir.parent, name)
                        break
        finally:
            mm.close()
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
