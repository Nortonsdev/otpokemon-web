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

# Capt-confirmed: pokemondata looktype matches good OTP art in objectbuilder/Tibia.dat.
PDATA_LOOK_TRUSTED = frozenset(
    {"bulbasaur", "charmander", "squirtle", "caterpie", "charizard", "rapidash"}
)

# objectbuilder Tibia.dat look id ≠ pokemondata looktype for these (wrong/outdated slot in dat).
DAT_LOOK_OVERRIDE: dict[str, int] = {
    "ivysaur": 23,
    "venusaur": 21,
    "charmeleon": 28,
    "metapod": 30,
    "weedle": 20,
    "kakuna": 3015,
}

# No reliable OTP objectbuilder look found — export from Huntera appearances (same looktype index as pokemondata).
HUNTERA_FALLBACK = frozenset(
    {
        "blastoise",
        "butterfree",
        "beedrill",
        "pidgey",
        "pidgeotto",
        "pidgeot",
        "raticate",
        # objectbuilder Tibia.dat look ≠ pokemondata (e.g. dat 5 = Pidgeotto, dat 6 = Ekans; pdata wartortle = 6)
        "wartortle",
    }
)

HUNTERA_URL = "https://huntera.com.br/things/1332"
HUNTERA_CACHE = Path("/tmp/assets/huntera")


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


def load_look_ids(data_path: Path, names: list[str]) -> dict[str, int]:
    text = data_path.read_text(encoding="utf-8", errors="replace")
    out: dict[str, int] = {}
    for name in names:
        m = re.search(rf"name = '{re.escape(name)}'[^}}]*looktype = (\d+)", text)
        if not m:
            raise RuntimeError(f"looktype not found for {name!r} in pokemondata.lua")
        out[name] = int(m.group(1))
    return out


def dat_look_for_species(name: str, pdata_looks: dict[str, int]) -> int:
    if name in DAT_LOOK_OVERRIDE:
        return DAT_LOOK_OVERRIDE[name]
    return pdata_looks[name]


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


def export_huntera_meadow(
    names: list[str],
    pdata_looks: dict[str, int],
    out_dir: Path,
) -> None:
    import json

    from extract_huntera_parse import parse_appearances
    from extract_pokebrave_sprites import (
        SPRITE_TYPES,
        bmp_to_image,
        corpse_from,
        decompress_cip_lzma,
        download,
    )

    cache = HUNTERA_CACHE
    catalog_path = cache / "catalog-content.json"
    if not catalog_path.is_file():
        download(f"{HUNTERA_URL}/catalog-content.json", catalog_path)
    catalog = json.loads(catalog_path.read_text())
    app_name = next(e["file"] for e in catalog if e.get("type") == "appearances")
    appearances_path = cache / "appearances.dat"
    if not appearances_path.is_file():
        download(f"{HUNTERA_URL}/{app_name}", appearances_path)
    _, outfits = parse_appearances(appearances_path)
    by_look = {o.appearance_id: o for o in outfits}

    needed: set[int] = set()

    def collect(outfit) -> None:
        for g in outfit.groups:
            needed.update(g.info.sprite_ids)

    for name in names:
        collect(by_look[pdata_looks[name]])

    def find_entry(sid: int) -> dict:
        for entry in catalog:
            if entry.get("type") == "sprite" and entry["firstspriteid"] <= sid <= entry["lastspriteid"]:
                return entry
        raise KeyError(sid)

    sheets: dict[str, object] = {}
    from PIL import Image

    for sid in needed:
        entry = find_entry(sid)
        fname = entry["file"]
        if fname not in sheets:
            dest = cache / "sheets" / fname
            if not dest.is_file():
                download(f"{HUNTERA_URL}/{fname}", dest)
            raw = dest.read_bytes()
            sheets[fname] = bmp_to_image(decompress_cip_lzma(raw))

    def get_sprite(sid: int) -> Image.Image:
        entry = find_entry(sid)
        tw, th, cols, _ = SPRITE_TYPES[entry.get("spritetype", 0)]
        index = sid - entry["firstspriteid"]
        sheet = sheets[entry["file"]]
        x = (index % cols) * tw
        y = (index // cols) * th
        return sheet.crop((x, y, x + tw, y + th))

    def sprite_index_h(info, x: int, phase: int) -> int:
        px, py, pz = info.pattern_x, max(1, info.pattern_y), max(1, info.pattern_z)
        layers = max(1, info.layers)
        return ((((phase % info.phases) * pz) * py + 0) * px + x) * layers

    for name in names:
        look_id = pdata_looks[name]
        outfit = by_look[look_id]
        idle = next(g for g in outfit.groups if g.group_id == 0)
        walk = next((g for g in outfit.groups if g.group_id == 1), idle)
        sample = get_sprite(idle.info.sprite_ids[0])
        fw, fh = sample.size
        dirs = ["north", "east", "south", "west"]
        walk_phases = [1, 5] if walk.info.phases >= 6 else [0, min(1, walk.info.phases - 1)]
        look_dir = out_dir / name
        look_dir.mkdir(parents=True, exist_ok=True)
        sheet = Image.new("RGBA", (fw * 4, fh * 3), (0, 0, 0, 0))
        for row, phase in enumerate([0, *walk_phases]):
            group = idle if row == 0 else walk
            for x, dname in enumerate(dirs):
                idx = sprite_index_h(group.info, x, phase)
                sid = group.info.sprite_ids[idx]
                frame = get_sprite(sid)
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
                    portrait.save(out_dir / f"{name}_portrait.png")
        sheet.save(look_dir / "sheet.png")
        sheet.save(out_dir / f"{name}_sheet.png")
        south = get_sprite(idle.info.sprite_ids[sprite_index_h(idle.info, 2, 0)])
        corpse = corpse_from(
            south if south.height <= 64 else south.resize((32, 32), Image.Resampling.NEAREST)
        )
        corpse.save(look_dir / "corpse.png")
        print(f"exported {name} huntera look={look_id} {fw}x{fh}")


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
    pdata_looks = load_look_ids(pdata, SPECIES_NAMES)
    out_dir.mkdir(parents=True, exist_ok=True)

    huntera_names = [n for n in SPECIES_NAMES if n in HUNTERA_FALLBACK]
    otp_names = [n for n in SPECIES_NAMES if n not in HUNTERA_FALLBACK]

    export_by_look: dict[int, str] = {}
    for name in otp_names:
        lid = dat_look_for_species(name, pdata_looks)
        export_by_look[lid] = name

    import extract_ruby_sprites as ruby

    ruby.LOOKS = export_by_look
    creatures, _items = parse_dat(dat)

    missing = [lid for lid in export_by_look if lid not in creatures]
    if missing:
        raise RuntimeError(f"creature look(s) missing in objectbuilder DAT: {missing}")

    with spr.open("rb") as fh:
        mm = mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ)
        try:
            for look_id, name in sorted(export_by_look.items()):
                export_creature(creatures[look_id], mm, out_dir, name)
        finally:
            mm.close()

    if huntera_names:
        print("Huntera fallback (pokemondata looktypes):", huntera_names)
        export_huntera_meadow(huntera_names, pdata_looks, out_dir)

    verify_outputs(out_dir, SPECIES_NAMES)
    print("done", len(SPECIES_NAMES), "species ->", out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
