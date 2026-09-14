/**
 * Built-in Huntera tile IDs shared by the OTBM editor, runtime converter,
 * and Phaser client. These match `tools/extract_huntera.py` exports in
 * `/assets/tiles/*.png`. User-provided DAT/SPR can add more IDs at runtime.
 */

export const TILE_SIZE = 32;

export const BUILTIN_TILE_IDS = {
  grass: 106,
  path: 351,
  wall: 2200,
  roof: 1088,
  flower: 102,
  rose: 3658,
  gold: 3031,
  stone: 26121,
  water: 4597,
  wood: 42337,
  cave: 44092,
  marble: 23720,
} as const;

export type BuiltinTileName = keyof typeof BUILTIN_TILE_IDS;

export const CUSTOM_ID_START = 100000;

/** Ground layer indices used by the Phaser client (see groundTexture). */
export const GROUND = {
  grass: 0,
  path: 1,
  stone: 2,
  wood: 3,
  water: 4,
  cave: 5,
  marble: 6,
} as const;

export const WALL_IDS = new Set<number>([BUILTIN_TILE_IDS.wall]);
export const ROOF_IDS = new Set<number>([BUILTIN_TILE_IDS.roof]);

export const ITEM_KIND_BY_ID: Record<number, string> = {
  [BUILTIN_TILE_IDS.flower]: "flower",
  [BUILTIN_TILE_IDS.rose]: "rose",
  [BUILTIN_TILE_IDS.gold]: "gold",
};

const TEXTURE_BY_ID: Record<number, string> = {
  [BUILTIN_TILE_IDS.grass]: "grass",
  [BUILTIN_TILE_IDS.path]: "path",
  [BUILTIN_TILE_IDS.wall]: "wall",
  [BUILTIN_TILE_IDS.roof]: "roof",
  [BUILTIN_TILE_IDS.flower]: "flower",
  [BUILTIN_TILE_IDS.rose]: "rose",
  [BUILTIN_TILE_IDS.gold]: "gold",
  [BUILTIN_TILE_IDS.stone]: "stone",
  [BUILTIN_TILE_IDS.water]: "water",
  [BUILTIN_TILE_IDS.wood]: "wood",
  [BUILTIN_TILE_IDS.cave]: "cave",
  [BUILTIN_TILE_IDS.marble]: "marble",
};

const GROUND_BY_ID: Record<number, number> = {
  [BUILTIN_TILE_IDS.grass]: GROUND.grass,
  [BUILTIN_TILE_IDS.path]: GROUND.path,
  [BUILTIN_TILE_IDS.stone]: GROUND.stone,
  [BUILTIN_TILE_IDS.wood]: GROUND.wood,
  [BUILTIN_TILE_IDS.water]: GROUND.water,
  [BUILTIN_TILE_IDS.cave]: GROUND.cave,
  [BUILTIN_TILE_IDS.marble]: GROUND.marble,
};

const GROUND_TEXTURES = new Set(["grass", "path", "stone", "wood", "water", "cave", "marble"]);

export function textureNameForItemId(id: number): string | null {
  return TEXTURE_BY_ID[id] ?? null;
}

export function builtinNameForId(id: number): BuiltinTileName | null {
  const hit = Object.entries(BUILTIN_TILE_IDS).find(([, v]) => v === id);
  return (hit?.[0] as BuiltinTileName) ?? null;
}

export function groundIndexFromId(id: number): number {
  return GROUND_BY_ID[id] ?? GROUND.grass;
}

export function groundTextureName(cell: number): string {
  if (cell === GROUND.path) return "path";
  if (cell === GROUND.stone) return "stone";
  if (cell === GROUND.wood) return "wood";
  if (cell === GROUND.water) return "water";
  if (cell === GROUND.cave) return "cave";
  if (cell === GROUND.marble) return "marble";
  return "grass";
}

export function isGroundTexture(name: string): boolean {
  return GROUND_TEXTURES.has(name);
}

export function isWallId(id: number): boolean {
  return WALL_IDS.has(id);
}

export function isRoofId(id: number): boolean {
  return ROOF_IDS.has(id);
}

export function itemKindForId(id: number): string | undefined {
  return ITEM_KIND_BY_ID[id];
}

export const BUILTIN_PALETTE_IDS: number[] = Object.values(BUILTIN_TILE_IDS);
