#!/usr/bin/env python3
"""Minimal appearances.dat protobuf reader for Huntera/Tibia 13 assets."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


def read_varint(buf: bytes, i: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while True:
        b = buf[i]
        i += 1
        result |= (b & 0x7F) << shift
        if not (b & 0x80):
            return result, i
        shift += 7


def skip_field(buf: bytes, i: int, wire: int) -> int:
    if wire == 0:
        _, i = read_varint(buf, i)
        return i
    if wire == 1:
        return i + 8
    if wire == 2:
        n, i = read_varint(buf, i)
        return i + n
    if wire == 5:
        return i + 4
    raise ValueError(f"unsupported wire {wire}")


def iter_fields(buf: bytes, start: int = 0, end: int | None = None):
    i = start
    end = len(buf) if end is None else end
    while i < end:
        key, i = read_varint(buf, i)
        field = key >> 3
        wire = key & 7
        if wire == 0:
            val, i = read_varint(buf, i)
            yield field, wire, val
        elif wire == 2:
            n, i = read_varint(buf, i)
            yield field, wire, buf[i : i + n]
            i += n
        elif wire == 1:
            i += 8
            yield field, wire, None
        elif wire == 5:
            i += 4
            yield field, wire, None
        else:
            i = skip_field(buf, i, wire)


@dataclass
class SpriteInfo:
    pattern_x: int = 1
    pattern_y: int = 1
    pattern_z: int = 1
    layers: int = 1
    sprite_ids: list[int] = field(default_factory=list)
    phases: int = 1


@dataclass
class FrameGroup:
    group_id: int = 0
    info: SpriteInfo = field(default_factory=SpriteInfo)


@dataclass
class Flags:
    bank: bool = False
    waypoints: int = 0
    clip: bool = False
    bottom: bool = False
    top: bool = False
    unpass: bool = False
    unsight: bool = False
    automap: int | None = None


@dataclass
class Appearance:
    appearance_id: int = 0
    name: str = ""
    flags: Flags = field(default_factory=Flags)
    groups: list[FrameGroup] = field(default_factory=list)


def parse_sprite_info(buf: bytes) -> SpriteInfo:
    info = SpriteInfo()
    phase_count = 0
    for field, wire, val in iter_fields(buf):
        if field == 1:
            info.pattern_x = val
        elif field == 2:
            info.pattern_y = val
        elif field == 3:
            info.pattern_z = val
        elif field == 4:
            info.layers = val
        elif field == 5:
            info.sprite_ids.append(val)
        elif field == 6 and wire == 2:
            for f2, w2, v2 in iter_fields(val):
                if f2 == 6:
                    phase_count += 1
    if phase_count:
        info.phases = phase_count
    return info


def parse_flags(buf: bytes) -> Flags:
    flags = Flags()
    for field, wire, val in iter_fields(buf):
        if field == 1:
            flags.bank = True
            if wire == 2:
                for f2, w2, v2 in iter_fields(val):
                    if f2 == 1:
                        flags.waypoints = v2
        elif field == 2:
            flags.clip = True
        elif field == 3:
            flags.bottom = True
        elif field == 4:
            flags.top = True
        elif field == 13:
            flags.unpass = True
        elif field == 15:
            flags.unsight = True
        elif field == 30 and wire == 2:
            for f2, w2, v2 in iter_fields(val):
                if f2 == 1:
                    flags.automap = v2
    return flags


def parse_frame_group(buf: bytes) -> FrameGroup:
    g = FrameGroup()
    for field, wire, val in iter_fields(buf):
        if field in (1, 2) and wire == 0:
            g.group_id = val
        elif field == 3 and wire == 2:
            g.info = parse_sprite_info(val)
    return g


def parse_appearance(buf: bytes) -> Appearance:
    a = Appearance()
    for field, wire, val in iter_fields(buf):
        if field == 1:
            a.appearance_id = val
        elif field == 2 and wire == 2:
            a.groups.append(parse_frame_group(val))
        elif field == 3 and wire == 2:
            a.flags = parse_flags(val)
        elif field == 4 and wire == 2:
            a.name = val.decode("utf-8", "replace")
    return a


def parse_appearances(path: Path) -> tuple[list[Appearance], list[Appearance]]:
    data = path.read_bytes()
    objects: list[Appearance] = []
    outfits: list[Appearance] = []
    for field, wire, val in iter_fields(data):
        if wire != 2:
            continue
        if field == 1:
            objects.append(parse_appearance(val))
        elif field == 2:
            outfits.append(parse_appearance(val))
    return objects, outfits
