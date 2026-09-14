/**
 * Classic Tibia client pipeline (Myst 854 / Brave 1098 style):
 * OTBM item IDs → Tibia.dat + Tibia.spr (+ optional items.xml names).
 *
 * Adapted from YATME PROJECT.md data pipeline; replaces appearances.dat / catalog-content.
 */

export const TILE_SIZE = 32;

export interface ClassicItemDef {
  id: number;
  name: string;
  spriteIds: number[];
  stackable?: boolean;
  fluid?: boolean;
  isGround?: boolean;
  blocks?: boolean;
  width?: number;
  height?: number;
}

export interface ClassicCatalog {
  items: Map<number, ClassicItemDef>;
  sprites: Map<number, Uint8Array>;
  tileSize: number;
}

const textDecoder = new TextDecoder();

function readVarint(buf: Uint8Array, i: number): [number, number] {
  let result = 0;
  let shift = 0;
  while (i < buf.length) {
    const b = buf[i++];
    result |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return [result, i];
    shift += 7;
  }
  throw new Error("varint EOF");
}

function iterFields(buf: Uint8Array, start = 0, end = buf.length) {
  const out: Array<[number, number, number | Uint8Array]> = [];
  let i = start;
  while (i < end) {
    const [key, i2] = readVarint(buf, i);
    i = i2;
    const field = key >> 3;
    const wire = key & 7;
    if (wire === 0) {
      const [val, i3] = readVarint(buf, i);
      i = i3;
      out.push([field, wire, val]);
    } else if (wire === 2) {
      const [n, i3] = readVarint(buf, i);
      i = i3 + n;
      out.push([field, wire, buf.subarray(i3, i3 + n)]);
    } else if (wire === 1) {
      i += 8;
      out.push([field, wire, 0]);
    } else if (wire === 5) {
      i += 4;
      out.push([field, wire, 0]);
    } else break;
  }
  return out;
}

function parseAppearancesDat(buffer: ArrayBuffer): Map<number, ClassicItemDef> {
  const buf = new Uint8Array(buffer);
  const catalog = new Map<number, ClassicItemDef>();
  for (const [field, wire, val] of iterFields(buf)) {
    if (field !== 1 || wire !== 2 || !(val instanceof Uint8Array)) continue;
    let id = 0;
    let bank = false;
    let unpass = false;
    const spriteIds: number[] = [];
    for (const [f2, w2, v2] of iterFields(val)) {
      if (f2 === 1 && typeof v2 === "number") id = v2;
      else if (f2 === 2 && w2 === 2 && v2 instanceof Uint8Array) {
        for (const [ff] of iterFields(v2)) {
          if (ff === 1) bank = true;
          if (ff === 13) unpass = true;
        }
      } else if (f2 === 3 && w2 === 2 && v2 instanceof Uint8Array) {
        for (const [f3, w3, v3] of iterFields(v2)) {
          if (f3 === 3 && w3 === 2 && v3 instanceof Uint8Array) {
            for (const [f4, , v4] of iterFields(v3)) {
              if (f4 === 5 && typeof v4 === "number") spriteIds.push(v4);
            }
          }
        }
      }
    }
    if (id > 0) {
      catalog.set(id, {
        id,
        name: `Item ${id}`,
        spriteIds,
        isGround: bank,
        blocks: unpass,
        stackable: false,
      });
    }
  }
  return catalog;
}

function readClassicDat(buffer: ArrayBuffer): Map<number, ClassicItemDef> {
  const view = new DataView(buffer);
  let o = 4;
  const itemCount = view.getUint16(o, true);
  o += 2;
  const catalog = new Map<number, ClassicItemDef>();
  for (let id = 100; id < 100 + itemCount; id++) {
    const flags: number[] = [];
    while (o < buffer.byteLength) {
      const f = view.getUint8(o++);
      if (f === 0xff) break;
      flags.push(f);
      if (f === 0x00) {
        o += 2;
        break;
      }
      if (f === 0x09 || f === 0x0a) o += 2;
      else if (f === 0x16 || f === 0x19) o += 2;
      else if (f === 0x1a) {
        const len = view.getUint16(o, true);
        o += 2 + len;
      } else if (f === 0x1b) o += 4;
      else if (f === 0x1c) o += 2;
    }
    let width = 1;
    let height = 1;
    if (o + 2 <= buffer.byteLength) {
      width = view.getUint8(o++);
      height = view.getUint8(o++);
      if (width === 0 || height === 0) {
        width = 1;
        height = 1;
        o -= 2;
      } else {
        o += 2;
      }
    }
    const spriteIds: number[] = [];
    const count = width * height;
    for (let i = 0; i < count && o + 2 <= buffer.byteLength; i++) {
      spriteIds.push(view.getUint16(o, true));
      o += 2;
    }
    const stackable = flags.includes(0x0c);
    const fluid = flags.includes(0x0b);
    const bank = flags.includes(0x01);
    const unpass = flags.includes(0x0d);
    catalog.set(id, {
      id,
      name: `Item ${id}`,
      spriteIds,
      stackable,
      fluid,
      isGround: bank,
      blocks: unpass,
      width,
      height,
    });
  }
  return catalog;
}

function decompressSpriteRle(data: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  let read = 0;
  let write = 0;
  while (read < data.length && write < out.length) {
    const v = data[read++];
    if (v === 0) {
      const skip = data[read++];
      write += skip * 4;
    } else {
      out[write++] = v;
      out[write++] = data[read++];
      out[write++] = data[read++];
      out[write++] = 0xff;
    }
  }
  for (let p = 0; p < out.length; p += 4) {
    if (out[p] === 255 && out[p + 1] === 0 && out[p + 2] === 255) out[p + 3] = 0;
  }
  return out;
}

function parseSpr(buffer: ArrayBuffer): Map<number, Uint8Array> {
  const view = new DataView(buffer);
  const count = view.getUint32(4, true);
  const offsets: number[] = [];
  let o = 8;
  for (let i = 0; i < count; i++) {
    offsets.push(view.getUint32(o, true));
    o += 4;
  }
  const sprites = new Map<number, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const off = offsets[i];
    if (!off || off >= buffer.byteLength) continue;
    const len = view.getUint16(off + 1, true);
    const raw = new Uint8Array(buffer, off + 3, len);
    sprites.set(i + 1, decompressSpriteRle(raw, TILE_SIZE));
  }
  return sprites;
}

function isProtobufDat(buffer: ArrayBuffer): boolean {
  const u8 = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  if (u8[0] === 0x0a) return true;
  const sig = new DataView(buffer).getUint32(0, true);
  const s = String.fromCharCode(sig & 0xff, (sig >> 8) & 0xff, (sig >> 16) & 0xff, (sig >> 24) & 0xff);
  return s !== "DAT\x00";
}

export function parseItemsXml(xmlText: string): Map<number, string> {
  const names = new Map<number, string>();
  const re = /<item\s+id="(\d+)"[^>]*name="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xmlText))) {
    names.set(Number(m[1]), m[2]);
  }
  return names;
}

export async function loadClassicClient(
  datBuf: ArrayBuffer,
  sprBuf: ArrayBuffer,
  itemsXmlText?: string,
): Promise<ClassicCatalog> {
  const items = isProtobufDat(datBuf) ? parseAppearancesDat(datBuf) : readClassicDat(datBuf);
  if (itemsXmlText) {
    const names = parseItemsXml(itemsXmlText);
    for (const [id, name] of names) {
      const e = items.get(id);
      if (e) e.name = name;
    }
  }
  const sprites = parseSpr(sprBuf);
  return { items, sprites, tileSize: TILE_SIZE };
}

export function spriteToCanvas(
  sprites: Map<number, Uint8Array>,
  spriteId: number,
  tileSize = TILE_SIZE,
): HTMLCanvasElement | null {
  const px = sprites.get(spriteId);
  if (!px) return null;
  const canvas = document.createElement("canvas");
  canvas.width = tileSize;
  canvas.height = tileSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(tileSize, tileSize);
  img.data.set(px);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function itemPreviewCanvas(catalog: ClassicCatalog, itemId: number): HTMLCanvasElement | null {
  const def = catalog.items.get(itemId);
  if (!def?.spriteIds?.length) return null;
  return spriteToCanvas(catalog.sprites, def.spriteIds[0], catalog.tileSize);
}

/** Built-in Huntera tile ids (fallback before DAT load). */
export const BUILTIN_TILE_IDS: Record<string, number> = {
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
};

export const CUSTOM_ID_START = 100000;
