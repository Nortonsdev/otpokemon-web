#!/usr/bin/env python3
"""Export meadow + Charizard sprites from OTP2072026 (pixel art OTP desktop).

Download OTP2072026.zip (MediaFire) once; inside the zip:
  - data/assets/otp.dat + otp-*.spr — encrypted at rest (OT client only).
  - objectbuilder/Tibia.dat + Tibia.spr — same outfits, decrypted for editors.

This tool reads objectbuilder/ + looktypes from modules/game_pokemon/pokemondata.lua.
Output: client/public/assets/pokemon/{species}/sheet.png (+ idle/walk/corpse/portrait).

Keep MEADOW_WILD_SPECIES in sync with server/map.js.
"""

from __future__ import annotations

import mmap
import re
import subprocess
import sys
import zipfile
from pathlib import Path

from extract_ruby_sprites import ThingType, compose_frame, corpse_from, parse_dat

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "client/public/assets/pokemon"
CACHE_DIR = Path("/tmp/otp2072026")
ZIP_PATH = CACHE_DIR / "OTP2072026.zip"
PACK_ROOT = CACHE_DIR / "OTP2072026"
DEFAULT_PACK = PACK_ROOT / "objectbuilder"
POKEMONDATA = PACK_ROOT / "modules/game_pokemon/pokemondata.lua"
MEDIAFIRE_PAGE = "https://www.mediafire.com/file/kfbi8exxzcddd2s/OTP2072026.zip/file"

# Exact meadow wilds (server/map.js MEADOW_WILD_SPECIES)
MEADOW_WILD_SPECIES = [
    "bulbasaur",
    "ivysaur",
    "venusaur",
    "charmander",
    "charmeleon",
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

# Party default + NPC Dono / decor (not a meadow wild)
MEADOW_EXTRA_SPECIES = ["charizard"]

SPECIES_NAMES = [*MEADOW_WILD_SPECIES, *MEADOW_EXTRA_SPECIES]


def mediafire_direct_url(page_url: str) -> str:
    html = subprocess.check_output(
        ["curl", "-sL", page_url, "-A", "Mozilla/5.0"],
        text=True,
    )
    m = re.search(r'https://download[^"\']+', html)
    if not m:
        raise RuntimeError("MediaFire direct download URL not found")
    return m.group(0)


def ensure_pack() -> Path:
    dat = DEFAULT_PACK / "Tibia.dat"
    spr = DEFAULT_PACK / "Tibia.spr"
    if dat.is_file() and spr.is_file() and POKEMONDATA.is_file():
        return DEFAULT_PACK

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if not ZIP_PATH.is_file() or ZIP_PATH.stat().st_size < 10_000_000:
        url = mediafire_direct_url(MEDIAFIRE_PAGE)
        print("GET", url)
        subprocess.check_call(
            ["curl", "-L", "--fail", "-A", "Mozilla/5.0", "-o", str(ZIP_PATH), url],
        )

    with zipfile.ZipFile(ZIP_PATH) as zf:
        for name in zf.namelist():
            if name.startswith("OTP2072026/objectbuilder/") or name.startswith(
                "OTP2072026/modules/game_pokemon/pokemondata.lua"
            ):
                zf.extract(name, CACHE_DIR)

    if not dat.is_file() or not spr.is_file():
        raise RuntimeError(f"Missing {dat} or {spr} after zip extract")
    if not POKEMONDATA.is_file():
        raise RuntimeError(f"Missing {POKEMONDATA} after zip extract")
    return DEFAULT_PACK


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
                portrait.save(legacy)
    sheet.save(look_dir / "sheet.png")
    sheet.save(out_dir / f"{name}_sheet.png")
    south = compose_frame(group, mm, 2, idle_phase)
    corpse = corpse_from(
        south if south.height <= 64 else south.resize((32, 32), Image.Resampling.NEAREST)
    )
    corpse.save(look_dir / "corpse.png")
    print(f"exported {name} look={thing.thing_id} {fw}x{fh} phases={group.phases}")


def verify_outputs(out_dir: Path, names: list[str]) -> None:
    missing: list[str] = []
    for name in names:
        base = out_dir / name
        for fname in ("sheet.png", "corpse.png", "portrait.png"):
            if not (base / fname).is_file():
                missing.append(f"{name}/{fname}")
    if missing:
        raise RuntimeError("incomplete export:\n  " + "\n  ".join(missing))


def main() -> int:
    pack = Path(sys.argv[1]) if len(sys.argv) > 1 else ensure_pack()
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

    print("meadow wilds:", len(MEADOW_WILD_SPECIES), "+ extra:", MEADOW_EXTRA_SPECIES)
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

    verify_outputs(out_dir, SPECIES_NAMES)
    print("done", len(SPECIES_NAMES), "species ->", out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
