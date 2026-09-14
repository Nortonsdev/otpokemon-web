#!/usr/bin/env python3
"""Export Pokémon outfits from OTP2072026 Object Builder pack (Tibia.dat + Tibia.spr).

The encrypted otp.dat/otp-*.spr in data/assets/ are not readable offline; the zip
includes decrypted Tibia.dat/Tibia.spr under objectbuilder/ for editors.

Look IDs match modules/game_pokemon/pokemondata.lua (field looktype).
"""

from __future__ import annotations

import mmap
import re
import sys
from pathlib import Path

# Reuse OT extended DAT/SPR parsing and compositing from Ruby exporter.
from extract_ruby_sprites import (
    ThingType,
    compose_frame,
    corpse_from,
    decode_sprite,
    export_item,
    parse_dat,
)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PACK = Path("/tmp/otp2072026/OTP2072026/objectbuilder")
DEFAULT_OUT = ROOT / "client/public/assets/pokemon"

# Milestone species (server/species.js + meadow wilds)
SPECIES_NAMES = [
    "bulbasaur",
    "ivysaur",
    "venusaur",
    "charmander",
    "charmeleon",
    "charizard",
    "squirtle",
    "wartortle",
    "blastoise",
    "caterpie",
    "metapod",
    "butterfree",
    "weedle",
    "kakuna",
    "beedrill",
    "pidgey",
    "pidgeotto",
    "pidgeot",
    "raticate",
    "rapidash",
]

POKEMONDATA = Path("/tmp/otp2072026/OTP2072026/modules/game_pokemon/pokemondata.lua")


def load_look_ids(data_path: Path, names: list[str]) -> dict[int, str]:
    text = data_path.read_text(encoding="utf-8", errors="replace")
    out: dict[int, str] = {}
    for name in names:
        m = re.search(rf"name = '{re.escape(name)}'[^}}]*looktype = (\d+)", text)
        if not m:
            raise RuntimeError(f"looktype not found for {name!r} in pokemondata.lua")
        out[int(m.group(1))] = name
    return out


def sheet_walk_phases(phases: int) -> tuple[int, int, int]:
    """Return idle phase and two walk phases for a 4×3 OTP-style sheet."""
    if phases >= 6:
        return 0, 1, 5
    if phases >= 3:
        return 0, 1, 2
    if phases == 2:
        return 0, 1, 1
    return 0, 0, 0


def export_creature(
    thing: ThingType,
    mm: mmap.mmap,
    out_dir: Path,
    name: str,
) -> None:
    from PIL import Image

    look_dir = out_dir / name
    look_dir.mkdir(parents=True, exist_ok=True)
    group = thing.groups[0]
    idle_phase, walk_a, walk_b = sheet_walk_phases(group.phases)
    fw, fh = group.width * 32, group.height * 32
    dirs = ["north", "east", "south", "west"]
    sheet = Image.new("RGBA", (fw * 4, fh * 3), (0, 0, 0, 0))
    for row, phase in enumerate((idle_phase, walk_a, walk_b)):
        for x, dname in enumerate(dirs):
            frame = compose_frame(group, mm, x, phase)
            if row == 0:
                frame.save(look_dir / f"idle_{dname}.png")
            else:
                frame.save(look_dir / f"walk{row}_{dname}.png")
            sheet.paste(frame, (x * fw, row * fh))
            if dname == "south" and row == 0:
                portrait = frame.copy()
                if portrait.width > 32 or portrait.height > 32:
                    portrait.thumbnail((32, 32), Image.Resampling.NEAREST)
                portrait.save(look_dir / "portrait.png")
                legacy = out_dir / f"{name}_portrait.png"
                if legacy.parent.exists():
                    portrait.save(legacy)
    sheet.save(look_dir / "sheet.png")
    legacy_sheet = out_dir / f"{name}_sheet.png"
    if legacy_sheet.parent.exists():
        sheet.save(legacy_sheet)
    south = compose_frame(group, mm, 2, idle_phase)
    if south.width > 32 or south.height > 32:
        corpse_src = south
    else:
        corpse_src = south
    corpse = corpse_from(
        corpse_src if corpse_src.height <= 64 else corpse_src.resize((32, 32), Image.Resampling.NEAREST)
    )
    corpse.save(look_dir / "corpse.png")
    print(f"exported {name} look={thing.thing_id} {fw}x{fh} phases={group.phases} -> {look_dir}")


def main() -> int:
    pack = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PACK
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    pdata = Path(sys.argv[3]) if len(sys.argv) > 3 else POKEMONDATA
    dat = pack / "Tibia.dat"
    spr = pack / "Tibia.spr"
    if not dat.is_file() or not spr.is_file():
        print("Missing Tibia.dat/Tibia.spr under", pack, file=sys.stderr)
        return 1
    if not pdata.is_file():
        print("Missing pokemondata.lua at", pdata, file=sys.stderr)
        return 1

    looks = load_look_ids(pdata, SPECIES_NAMES)
    out_dir.mkdir(parents=True, exist_ok=True)

    import extract_ruby_sprites as ruby

    ruby.LOOKS = looks
    creatures, _items = parse_dat(dat)

    missing = [lid for lid in looks if lid not in creatures]
    if missing:
        print("WARN: missing creature looks in DAT:", missing)

    with spr.open("rb") as fh:
        mm = mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ)
        try:
            for look_id, name in sorted(looks.items()):
                thing = creatures.get(look_id)
                if not thing:
                    continue
                export_creature(thing, mm, out_dir, name)
        finally:
            mm.close()

    print("done", len(looks), "species ->", out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
