#!/usr/bin/env node
/** Pixel OTP/Tibia UI atlas matching 30-miniwindow.otml clips. */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../client/public/assets/ui/tibia");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}

function chunk(tag, data) {
  const t = Buffer.from(tag);
  return Buffer.concat([u32(data.length), t, data, u32(crc32(Buffer.concat([t, data])))]);
}

function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function canvas(w, h, fill = [0, 0, 0, 0]) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = fill[0];
    rgba[i * 4 + 1] = fill[1];
    rgba[i * 4 + 2] = fill[2];
    rgba[i * 4 + 3] = fill[3];
  }
  return { w, h, rgba };
}

function px(img, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4;
  img.rgba[i] = r;
  img.rgba[i + 1] = g;
  img.rgba[i + 2] = b;
  img.rgba[i + 3] = a;
}

function mix(a, b, t) {
  return [
    (a[0] + (b[0] - a[0]) * t) | 0,
    (a[1] + (b[1] - a[1]) * t) | 0,
    (a[2] + (b[2] - a[2]) * t) | 0,
  ];
}

function hash(x, y, s = 0) {
  let n = (x * 374761393 + y * 668265263 + s * 1274126177) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return (n & 255) / 255;
}

function fillRect(img, x, y, w, h, rgb, a = 255) {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) px(img, x + xx, y + yy, rgb[0], rgb[1], rgb[2], a);
}

function noiseFill(img, x, y, w, h, base, amp = 10, seed = 1) {
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const n = (hash(x + xx, y + yy, seed) - 0.5) * amp;
      const grain = (hash(x + xx * 3, (y + yy) * 7, seed + 9) - 0.5) * amp * 0.4;
      const v = [
        Math.max(0, Math.min(255, base[0] + n + grain)),
        Math.max(0, Math.min(255, base[1] + n + grain)),
        Math.max(0, Math.min(255, base[2] + n + grain * 0.8)),
      ];
      px(img, x + xx, y + yy, v[0], v[1], v[2], 255);
    }
  }
}

function bevel(img, x, y, w, h, hi = [110, 114, 118], lo = [18, 18, 20], inset = 0) {
  const x0 = x + inset;
  const y0 = y + inset;
  const x1 = x + w - 1 - inset;
  const y1 = y + h - 1 - inset;
  for (let xx = x0; xx <= x1; xx++) {
    px(img, xx, y0, hi[0], hi[1], hi[2]);
    px(img, xx, y1, lo[0], lo[1], lo[2]);
  }
  for (let yy = y0; yy <= y1; yy++) {
    px(img, x0, yy, hi[0], hi[1], hi[2]);
    px(img, x1, yy, lo[0], lo[1], lo[2]);
  }
  px(img, x0, y0, Math.min(255, hi[0] + 18), Math.min(255, hi[1] + 18), Math.min(255, hi[2] + 18));
  px(img, x1, y1, Math.max(0, lo[0] - 6), Math.max(0, lo[1] - 6), Math.max(0, lo[2] - 6));
}

function drawMiniWindow(img, ox, oy, w, h, { top = 23, inner = false } = {}) {
  const base = inner ? [32, 34, 36] : [58, 60, 62];
  const head = inner ? [36, 38, 40] : [66, 68, 70];
  noiseFill(img, ox, oy, w, h, base, inner ? 6 : 12, inner ? 3 : 1);
  if (!inner) noiseFill(img, ox, oy, w, top, head, 8, 2);
  bevel(img, ox, oy, w, h, [118, 122, 126], [12, 12, 14], 0);
  bevel(img, ox, oy, w, h, [78, 80, 84], [28, 28, 30], 1);
  fillRect(img, ox, oy, w, 1, [10, 10, 12]);
  fillRect(img, ox, oy + h - 1, w, 1, [8, 8, 10]);
  fillRect(img, ox, oy, 1, h, [10, 10, 12]);
  fillRect(img, ox + w - 1, oy, 1, h, [8, 8, 10]);
  if (!inner) {
    fillRect(img, ox + 2, oy + top - 1, w - 4, 1, [28, 28, 30]);
    fillRect(img, ox + 2, oy + top, w - 4, 1, [72, 74, 76]);
  }
}

function save(img, name) {
  writeFileSync(join(OUT, name), encodePng(img.w, img.h, img.rgba));
}

function line(img, x0, y0, x1, y1, rgb) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (;;) {
    px(img, x, y, rgb[0], rgb[1], rgb[2]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function drawIconClose(img, ox, oy, rgb = [210, 210, 214]) {
  line(img, ox + 2, oy + 2, ox + 9, oy + 9, rgb);
  line(img, ox + 9, oy + 2, ox + 2, oy + 9, rgb);
}

function drawIconMin(img, ox, oy, rgb = [210, 210, 214]) {
  fillRect(img, ox + 2, oy + 8, 8, 2, rgb);
}

function drawIconLock(img, ox, oy, locked, rgb = [210, 210, 214]) {
  fillRect(img, ox + 3, oy + 6, 6, 5, rgb);
  line(img, ox + 4, oy + 6, ox + 4, oy + 4, rgb);
  line(img, ox + 7, oy + 6, ox + 7, oy + 4, rgb);
  line(img, ox + 4, oy + 3, ox + 7, oy + 3, rgb);
  if (!locked) px(img, ox + 7, oy + 4, 58, 60, 62);
  px(img, ox + 5, oy + 8, 40, 40, 42);
}

function drawIconWrench(img, ox, oy, rgb = [210, 210, 214]) {
  line(img, ox + 2, oy + 9, ox + 8, oy + 3, rgb);
  fillRect(img, ox + 7, oy + 2, 3, 3, rgb);
  fillRect(img, ox + 2, oy + 8, 3, 3, rgb);
}

function people(img, ox, oy, rgb) {
  fillRect(img, ox + 6, oy + 2, 4, 3, rgb);
  fillRect(img, ox + 5, oy + 5, 6, 7, rgb);
  fillRect(img, ox + 2, oy + 4, 3, 2, rgb);
  fillRect(img, ox + 1, oy + 6, 4, 6, rgb);
  fillRect(img, ox + 11, oy + 4, 3, 2, rgb);
  fillRect(img, ox + 11, oy + 6, 4, 6, rgb);
}

function cog(img, ox, oy, rgb) {
  fillRect(img, ox + 6, oy + 3, 4, 10, rgb);
  fillRect(img, ox + 3, oy + 6, 10, 4, rgb);
  fillRect(img, ox + 5, oy + 5, 6, 6, rgb);
  px(img, ox + 7, oy + 7, 40, 42, 44);
  px(img, ox + 8, oy + 7, 40, 42, 44);
  px(img, ox + 7, oy + 8, 40, 42, 44);
  px(img, ox + 8, oy + 8, 40, 42, 44);
}

function bag(img, ox, oy, rgb) {
  fillRect(img, ox + 4, oy + 6, 8, 8, rgb);
  line(img, ox + 6, oy + 6, ox + 6, oy + 4, rgb);
  line(img, ox + 9, oy + 6, ox + 9, oy + 4, rgb);
  line(img, ox + 6, oy + 3, ox + 9, oy + 3, rgb);
}

mkdirSync(OUT, { recursive: true });

const atlas = canvas(364, 309, [0, 0, 0, 0]);
drawMiniWindow(atlas, 0, 127, 182, 182, { top: 23, inner: false });
drawMiniWindow(atlas, 182, 127, 182, 182, { top: 4, inner: true });
save(atlas, "windows.png");

const icons = canvas(72, 12, [0, 0, 0, 0]);
drawIconClose(icons, 0, 0);
drawIconMin(icons, 12, 0);
drawIconLock(icons, 24, 0, false);
drawIconLock(icons, 36, 0, true, [220, 90, 90]);
drawIconWrench(icons, 48, 0);
fillRect(icons, 62, 2, 8, 8, [180, 184, 190]);
save(icons, "miniwindow_icons.png");

function iconButton(draw) {
  const img = canvas(16, 16, [48, 50, 52, 255]);
  bevel(img, 0, 0, 16, 16, [120, 124, 128], [16, 16, 18]);
  draw(img, 0, 0, [210, 214, 220]);
  return img;
}
save(iconButton((img, x, y, rgb) => people(img, x, y, rgb)), "party.png");
save(iconButton((img, x, y, rgb) => cog(img, x, y, rgb)), "modulemanager.png");
save(iconButton((img, x, y, rgb) => bag(img, x, y, rgb)), "shop_button.png");

const dialog = canvas(96, 96, [40, 42, 44, 255]);
noiseFill(dialog, 0, 0, 96, 96, [42, 44, 46], 8, 5);
bevel(dialog, 0, 0, 96, 96, [120, 124, 128], [12, 12, 14]);
bevel(dialog, 0, 0, 96, 96, [72, 74, 76], [24, 24, 26], 1);
save(dialog, "dialog.png");

const dtitle = canvas(182, 23, [62, 64, 68, 255]);
noiseFill(dtitle, 0, 0, 182, 23, [64, 66, 70], 7, 6);
bevel(dtitle, 0, 0, 182, 23, [118, 122, 126], [14, 14, 16]);
save(dtitle, "dialog_title.png");

function makeButton(w, h) {
  const img = canvas(w, h, [70, 72, 76, 255]);
  noiseFill(img, 0, 0, w, h, [72, 74, 78], 6, 7);
  bevel(img, 0, 0, w, h, [140, 144, 150], [20, 20, 22]);
  bevel(img, 0, 0, w, h, [96, 98, 102], [40, 40, 42], 1);
  return img;
}
save(makeButton(48, 22), "button.png");
save(makeButton(22, 22), "button_square.png");

const flat = canvas(48, 16, [56, 58, 60, 255]);
bevel(flat, 0, 0, 48, 16, [100, 104, 108], [24, 24, 26]);
save(flat, "flatbutton.png");

const hs = canvas(64, 16, [40, 42, 44, 255]);
fillRect(hs, 0, 0, 16, 16, [62, 64, 68]);
fillRect(hs, 48, 0, 16, 16, [62, 64, 68]);
bevel(hs, 0, 0, 16, 16, [120, 124, 128], [16, 16, 18]);
bevel(hs, 48, 0, 16, 16, [120, 124, 128], [16, 16, 18]);
line(hs, 11, 8, 5, 8, [210, 210, 214]);
line(hs, 5, 8, 8, 5, [210, 210, 214]);
line(hs, 5, 8, 8, 11, [210, 210, 214]);
line(hs, 53, 8, 59, 8, [210, 210, 214]);
line(hs, 59, 8, 56, 5, [210, 210, 214]);
line(hs, 59, 8, 56, 11, [210, 210, 214]);
fillRect(hs, 22, 2, 20, 12, [78, 80, 84]);
bevel(hs, 22, 2, 20, 12, [130, 134, 138], [20, 20, 22]);
save(hs, "hscrollbar.png");

const vs = canvas(16, 64, [40, 42, 44, 255]);
fillRect(vs, 0, 0, 16, 16, [62, 64, 68]);
fillRect(vs, 0, 48, 16, 16, [62, 64, 68]);
bevel(vs, 0, 0, 16, 16, [120, 124, 128], [16, 16, 18]);
bevel(vs, 0, 48, 16, 16, [120, 124, 128], [16, 16, 18]);
line(vs, 8, 5, 8, 11, [210, 210, 214]);
line(vs, 8, 5, 5, 8, [210, 210, 214]);
line(vs, 8, 5, 11, 8, [210, 210, 214]);
line(vs, 8, 59, 8, 53, [210, 210, 214]);
line(vs, 8, 59, 5, 56, [210, 210, 214]);
line(vs, 8, 59, 11, 56, [210, 210, 214]);
fillRect(vs, 2, 22, 12, 20, [78, 80, 84]);
bevel(vs, 2, 22, 12, 20, [130, 134, 138], [20, 20, 22]);
save(vs, "vscrollbar.png");

console.log("wrote tibia UI to", OUT);
