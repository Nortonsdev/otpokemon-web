import Phaser from "phaser";
import { MAP, SPAWN } from "../../server/map.js";
import { LOOK_NAME } from "../../server/species.js";

const TILE = 32;
const LARGE_MONS = new Set(["charizard", "rapidash"]);
const SPRITE_COL = [0, 1, 1, 2, 2, 3, 3, 0];

function monFrame(name) {
  return LARGE_MONS.has(name) ? 64 : 32;
}

function creatureSize(tex) {
  if (tex === "human" || LARGE_MONS.has(tex)) return 64;
  return 32;
}

function tileWorld(x, y, size) {
  if (size > TILE) return { x: x * TILE - (size - TILE), y: y * TILE - (size - TILE) };
  return { x: x * TILE, y: y * TILE };
}

function frameIndex(dir, moving, phase) {
  const col = SPRITE_COL[dir] ?? 2;
  const row = moving ? (phase === 0 ? 1 : 2) : 0;
  return row * 4 + col;
}

function isTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function groundTexture(cell) {
  if (cell === 1) return "path";
  if (cell === 2) return "stone";
  if (cell === 3) return "wood";
  if (cell === 4) return "water";
  if (cell === 5) return "cave";
  return "grass";
}

export class GameScene extends Phaser.Scene {
  constructor(net, hud) {
    super("game");
    this.net = net;
    this.hud = hud;
    this.sprites = new Map();
    this.plates = new Map();
    this.hpBars = new Map();
    this.state = new Map();
    this.youId = null;
    this.mapData = null;
    this.keys = null;
    this.roofSprites = [];
    this.groundLayer = null;
    this.itemLayer = null;
    this.wallLayer = null;
    this.roofLayer = null;
    this.creatureLayer = null;
    this.live = false;
    this.pendingWorld = null;
    this.targetId = null;
    this.targetMark = null;
    this.glow = null;
  }

  preload() {
    this.load.image("grass", "/assets/tiles/grass.png");
    this.load.image("path", "/assets/tiles/path.png");
    this.load.image("stone", "/assets/tiles/stone.png");
    this.load.image("wall", "/assets/tiles/wall.png");
    this.load.image("roof", "/assets/tiles/roof.png");
    this.load.image("flower", "/assets/tiles/flower.png");
    this.load.image("rose", "/assets/tiles/rose.png");
    this.load.image("gold", "/assets/tiles/gold.png");
    this.load.image("water", "/assets/tiles/water.png");
    this.load.image("wood", "/assets/tiles/wood.png");
    this.load.image("cave", "/assets/tiles/cave.png");
    this.load.spritesheet("human", "/assets/human/sheet.png", { frameWidth: 64, frameHeight: 64 });
    for (const name of Object.values(LOOK_NAME)) {
      const fw = monFrame(name);
      this.load.spritesheet(name, `/assets/pokemon/${name}/sheet.png`, {
        frameWidth: fw,
        frameHeight: fw,
      });
      this.load.image(`${name}-corpse`, `/assets/pokemon/${name}/corpse.png`);
    }
  }

  create() {
    this.groundLayer = this.add.layer();
    this.itemLayer = this.add.layer();
    this.wallLayer = this.add.layer();
    this.creatureLayer = this.add.layer();
    this.roofLayer = this.add.layer();
    this.keys = this.input.keyboard.addKeys(
      "W,A,S,D,UP,DOWN,LEFT,RIGHT,ESC,ENTER,SHIFT,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT,NINE,ZERO"
    );
    this.input.keyboard.enabled = false;
    this.input.keyboard.clearCaptures?.();
    this.input.mouse?.disableContextMenu();
    const onRight = (e) => {
      if (!this.live) return;
      if (e.target?.closest?.(".float-window, .panel, input, button, select, textarea")) return;
      e.preventDefault();
      this.handleWorldClick(e.clientX, e.clientY, "right");
    };
    document.getElementById("game")?.addEventListener("contextmenu", onRight);
    document.addEventListener("contextmenu", onRight, true);
    this.input.on("pointerdown", (p) => {
      document.getElementById("chat-input")?.blur();
      this.onPointer(p);
    });
    this.targetId = null;
    this.targetMark = this.add.graphics();
    this.targetMark.setDepth(4);
    this.glow = this.add.graphics();
    this.glow.setDepth(3);
    this.cameras.main.setRoundPixels(false);
    this.cameras.main.setBackgroundColor(0x111111);
    if (this.pendingWorld) {
      const payload = this.pendingWorld;
      this.pendingWorld = null;
      this.enterWorld(payload);
    } else {
      this.enterPreview();
    }
  }

  now() {
    return this.time?.now ?? 0;
  }

  displayTile(st) {
    if (!st) return { x: 0, y: 0 };
    if (!st.moving || !st.walkMs) return { x: st.x, y: st.y };
    const t = Math.max(0, Math.min(1, (this.now() - st.walkStart) / st.walkMs));
    if (t >= 1) {
      st.moving = false;
      return { x: st.x, y: st.y };
    }
    return {
      x: st.fromX + (st.x - st.fromX) * t,
      y: st.fromY + (st.y - st.fromY) * t,
    };
  }

  clearWorld() {
    for (const s of this.sprites.values()) s.destroy();
    for (const p of this.plates.values()) p.destroy();
    for (const bar of this.hpBars.values()) {
      bar.bg.destroy();
      bar.fg.destroy();
    }
    this.sprites.clear();
    this.plates.clear();
    this.hpBars.clear();
    this.state.clear();
    this.groundLayer.removeAll(true);
    this.itemLayer.removeAll(true);
    this.wallLayer.removeAll(true);
    this.roofLayer.removeAll(true);
    this.roofSprites = [];
    this.youId = null;
    this.targetId = null;
    this.targetMark?.clear();
    this.glow?.clear();
  }

  enterPreview() {
    if (!this.groundLayer) return;
    this.live = false;
    if (this.input?.keyboard) this.input.keyboard.enabled = false;
    this.clearWorld();
    this.mapData = {
      w: MAP.w,
      h: MAP.h,
      z: MAP.z,
      ground: MAP.ground,
      walls: MAP.walls,
      roofs: MAP.roofs,
      items: MAP.items,
    };
    this.drawMap();
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(2);
    this.cameras.main.setRoundPixels(false);
    this.cameras.main.centerOn(SPAWN.x * TILE + TILE / 2, SPAWN.y * TILE + TILE / 2);
  }

  enterWorld(payload) {
    if (!this.groundLayer) {
      this.pendingWorld = payload;
      return;
    }
    this.live = true;
    if (this.input?.keyboard) this.input.keyboard.enabled = true;
    this.clearWorld();
    this.mapData = payload.map;
    this.youId = payload.you.id;
    this.drawMap();
    for (const c of payload.creatures) this.spawn(c);
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(2);
    this.cameras.main.setRoundPixels(false);
    this.layoutAll();
    this.lockCamera();
    this.updateRoofs();
  }

  drawMap() {
    const { w, h, ground, walls, roofs, items } = this.mapData;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const g = this.add.image(x * TILE, y * TILE, groundTexture(ground[y][x])).setOrigin(0, 0);
        g.setDepth(y);
        this.groundLayer.add(g);
        if (walls[y][x]) {
          const wall = this.add.image(x * TILE - 32, y * TILE - 32, "wall").setOrigin(0, 0);
          wall.setDepth(y * 10 + 5);
          this.wallLayer.add(wall);
        }
        if (roofs[y][x]) {
          const roof = this.add.image(x * TILE - 32, y * TILE - 32, "roof").setOrigin(0, 0);
          roof.setDepth(y * 10 + 8);
          roof.tileX = x;
          roof.tileY = y;
          this.roofLayer.add(roof);
          this.roofSprites.push(roof);
        }
      }
    }
    for (const it of items || []) {
      const spr = this.add.image(it.x * TILE, it.y * TILE, it.kind).setOrigin(0, 0);
      spr.setDepth(it.y * 10 + 2);
      this.itemLayer.add(spr);
    }
  }

  textureFor(c) {
    if (c.kind === "player") {
      if (c.mount?.look != null) return LOOK_NAME[c.mount.look] || "charizard";
      return "human";
    }
    return LOOK_NAME[c.look] || "caterpie";
  }

  spawn(c) {
    if (this.sprites.has(c.id)) this.despawn(c.id);
    const tex = this.textureFor(c);
    const size = creatureSize(tex);
    const pos = tileWorld(c.x, c.y, size);
    const sprite = this.add.sprite(pos.x, pos.y, tex, frameIndex(c.dir || 4, false, 0));
    sprite.setOrigin(0, 0);
    sprite.setDepth(c.y * 10 + 6);
    this.creatureLayer.add(sprite);
    const plateY = tex === "human" ? pos.y + 8 : pos.y - 2;
    const plate = this.add
      .text(pos.x + size / 2, plateY, c.plate || c.name, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#7dce6a",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1);
    plate.setDepth(c.y * 10 + 7);
    this.sprites.set(c.id, sprite);
    this.plates.set(c.id, plate);
    this.state.set(c.id, {
      ...c,
      moving: false,
      phase: 0,
      fromX: c.x,
      fromY: c.y,
      walkStart: 0,
      walkMs: 0,
    });
    const cx = pos.x + size / 2;
    const barY = plateY + 3;
    const bg = this.add.rectangle(cx, barY, 28, 4, 0x111111).setOrigin(0.5, 0);
    bg.setStrokeStyle(1, 0x000000, 0.9);
    bg.setDepth(c.y * 10 + 8);
    const fg = this.add.rectangle(cx - 13, barY + 1, 26, 2, 0x3dcc4a).setOrigin(0, 0);
    fg.setDepth(c.y * 10 + 9);
    this.hpBars.set(c.id, { bg, fg });
    this.setHpBar(c.id, c.hp, c.hpMax);
    this.refreshPlate(c.id);
    if (c.dead) this.applyCorpseLook(c.id);
  }

  despawn(id) {
    this.sprites.get(id)?.destroy();
    this.plates.get(id)?.destroy();
    const bar = this.hpBars.get(id);
    bar?.bg.destroy();
    bar?.fg.destroy();
    this.sprites.delete(id);
    this.plates.delete(id);
    this.hpBars.delete(id);
    this.state.delete(id);
  }

  layoutNameplate(id, spriteX, spriteY, depth) {
    const sprite = this.sprites.get(id);
    const plate = this.plates.get(id);
    if (!sprite || !plate) return;
    const size = creatureSize(sprite.texture.key);
    const cx = spriteX + size / 2;
    const plateY = size === 64 ? spriteY + 8 : spriteY - 2;
    plate.setPosition(cx, plateY);
    plate.setDepth(depth + 1);
    const bar = this.hpBars.get(id);
    if (!bar) return;
    const barY = plateY + 3;
    bar.bg.setPosition(cx, barY);
    bar.bg.setDepth(depth + 2);
    bar.fg.setPosition(cx - 13, barY + 1);
    bar.fg.setDepth(depth + 3);
  }

  setHpBar(id, hp, hpMax) {
    const st = this.state.get(id);
    if (st) {
      if (hp != null) st.hp = hp;
      if (hpMax != null) st.hpMax = hpMax;
    }
    const bar = this.hpBars.get(id);
    if (!bar) return;
    const max = Math.max(1, hpMax ?? st?.hpMax ?? 1);
    const ratio = Math.max(0, Math.min(1, (hp ?? st?.hp ?? 0) / max));
    bar.fg.width = 26 * ratio;
    if (ratio > 0.5) bar.fg.setFillStyle(0x3dcc4a);
    else if (ratio > 0.2) bar.fg.setFillStyle(0xe0c040);
    else bar.fg.setFillStyle(0xcc3d3d);
  }

  refreshPlate(id) {
    const st = this.state.get(id);
    const plate = this.plates.get(id);
    if (!st || !plate) return;
    if (st.kind === "player") plate.setText(st.name);
    else plate.setText(`${st.name} [${st.level || 5}]`);
  }

  applyCorpseLook(id) {
    const st = this.state.get(id);
    const sprite = this.sprites.get(id);
    if (!st || !sprite || sprite.texture.key === "human") return;
    st.dead = true;
    st.moving = false;
    st.hp = 0;
    const name = LOOK_NAME[st.look] || "caterpie";
    const corpseKey = `${name}-corpse`;
    if (this.textures.exists(corpseKey)) sprite.setTexture(corpseKey, 0);
    sprite.setOrigin(0.5, 0.5);
    sprite.setAngle(0);
    sprite.clearTint();
    sprite.setScale(1);
    const plate = this.plates.get(id);
    plate?.setVisible(false);
    const bar = this.hpBars.get(id);
    bar?.bg.setVisible(false);
    bar?.fg.setVisible(false);
  }

  layoutCreature(id) {
    const st = this.state.get(id);
    const sprite = this.sprites.get(id);
    if (!st || !sprite) return;
    const d = this.displayTile(st);
    const size = creatureSize(sprite.texture.key);
    const pos = tileWorld(d.x, d.y, size);
    const walking = st.moving && !st.dead;
    const depth = Math.round(d.y) * 10 + 6;
    const ability = st.mount?.ability;
    if (st.dead) {
      sprite.setOrigin(0.5, 0.5);
      sprite.setAngle(0);
      sprite.setScale(1);
      sprite.setPosition(d.x * TILE + TILE / 2, d.y * TILE + TILE / 2 + (size > 32 ? 8 : 4));
      this.plates.get(id)?.setVisible(false);
      const bar = this.hpBars.get(id);
      bar?.bg.setVisible(false);
      bar?.fg.setVisible(false);
    } else {
      sprite.setVisible(true);
      this.plates.get(id)?.setVisible(true);
      const bar = this.hpBars.get(id);
      bar?.bg.setVisible(true);
      bar?.fg.setVisible(true);
      sprite.setOrigin(0, 0);
      sprite.setAngle(0);
      sprite.clearTint();
      let px = pos.x;
      let py = pos.y;
      if (ability === "fly") {
        py -= 10;
        sprite.setScale(1);
      } else if (ability === "hide") {
        sprite.setScale(0.55);
        py += 10;
      } else if (ability === "ride") {
        sprite.setScale(1.12);
        py -= 2;
      } else {
        sprite.setScale(1);
      }
      sprite.setPosition(px, py);
      sprite.setFrame(frameIndex(st.dir || 4, walking, st.phase));
    }
    sprite.setDepth(depth);
    this.layoutNameplate(id, pos.x, pos.y, depth);
  }

  layoutAll() {
    for (const id of this.sprites.keys()) this.layoutCreature(id);
    this.layoutGlow();
  }

  lockCamera() {
    if (!this.live) return;
    const st = this.state.get(this.youId);
    if (!st) return;
    const d = this.displayTile(st);
    this.cameras.main.centerOn(d.x * TILE + TILE / 2, d.y * TILE + TILE / 2);
  }

  layoutGlow() {
    if (!this.glow) return;
    this.glow.clear();
    const st = this.state.get(this.youId);
    if (!this.live || !st) return;
    const d = this.displayTile(st);
    const cx = d.x * TILE + TILE / 2;
    const cy = d.y * TILE + TILE / 2;
    this.glow.fillStyle(0xfff3c4, 0.16);
    this.glow.fillCircle(cx, cy, 38);
    this.glow.fillStyle(0xffe08a, 0.1);
    this.glow.fillCircle(cx, cy, 22);
  }

  handleNet(msg) {
    if (!this.live && msg.t !== "map") return;
    if (msg.t === "appear") this.spawn(msg.creature);
    if (msg.t === "disappear") this.despawn(msg.id);
    if (msg.t === "turn") {
      const st = this.state.get(msg.id);
      if (!st) return;
      st.dir = msg.dir;
    }
    if (msg.t === "moved") this.animateMove(msg);
    if (msg.t === "fx") {
      this.flash(msg.to);
      this.flash(msg.from);
      this.playStrike(msg.from, msg.to);
      if (msg.hp != null) this.setHpBar(msg.to, msg.hp, msg.hpMax);
      this.refreshPlate(msg.to);
      if (msg.dmg != null) this.floatDamage(msg.to, msg.dmg);
    }
    if (msg.t === "outfit" && msg.creature) this.spawn(msg.creature);
    if (msg.t === "down") {
      const st = this.state.get(msg.id);
      if (st) {
        st.dead = true;
        st.hp = 0;
        st.moving = false;
        if (msg.x != null) st.x = msg.x;
        if (msg.y != null) st.y = msg.y;
      }
      this.applyCorpseLook(msg.id);
    }
    if (msg.t === "target") this.setTarget(msg.id);
    if (msg.t === "disappear" && msg.id === this.targetId) this.setTarget(null);
  }

  setTarget(id) {
    this.targetId = id || null;
    const st = id ? this.state.get(id) : null;
    this.hud?.setTarget(st || null);
    this.layoutTarget();
  }

  layoutTarget() {
    if (!this.targetMark) return;
    this.targetMark.clear();
    const st = this.targetId ? this.state.get(this.targetId) : null;
    if (!st) return;
    const d = this.displayTile(st);
    const cx = d.x * TILE + TILE / 2;
    const cy = d.y * TILE + TILE / 2;
    this.targetMark.setDepth(Math.round(d.y) * 10 + 12);
    this.targetMark.fillStyle(0xff2020, 0.22);
    this.targetMark.fillCircle(cx, cy, 18);
    this.targetMark.lineStyle(4, 0xff2a2a, 1);
    this.targetMark.strokeCircle(cx, cy, 18);
    this.targetMark.lineStyle(2, 0xfff0f0, 0.95);
    this.targetMark.strokeCircle(cx, cy, 10);
  }

  animateMove(msg) {
    const st = this.state.get(msg.id);
    if (!st) return;
    const disp = this.displayTile(st);
    st.fromX = disp.x;
    st.fromY = disp.y;
    st.dir = msg.dir;
    st.x = msg.x;
    st.y = msg.y;
    st.moving = true;
    st.walkStart = this.now();
    st.walkMs = Math.max(80, msg.ms || 200);
    st.phase = st.phase ? 0 : 1;
    if (msg.id === this.youId) this.updateRoofs();
  }

  floatDamage(id, dmg) {
    const st = this.state.get(id);
    const sprite = this.sprites.get(id);
    if (!st || !sprite) return;
    const d = this.displayTile(st);
    const x = d.x * TILE + TILE / 2;
    const y = d.y * TILE - 6;
    const txt = this.add
      .text(x, y, String(dmg), {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: "#ff4040",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1);
    txt.setDepth(2000);
    this.tweens.add({
      targets: txt,
      y: y - 26,
      alpha: 0,
      duration: 700,
      onComplete: () => txt.destroy(),
    });
  }

  flash(id) {
    const s = this.sprites.get(id);
    if (!s) return;
    this.tweens.add({ targets: s, alpha: 0.3, yoyo: true, duration: 80, repeat: 1 });
  }

  playStrike(fromId, toId) {
    const a = this.state.get(fromId);
    const b = this.state.get(toId);
    if (!a || !b) return;
    const da = this.displayTile(a);
    const db = this.displayTile(b);
    const x0 = da.x * TILE + TILE / 2;
    const y0 = da.y * TILE;
    const x1 = db.x * TILE + TILE / 2;
    const y1 = db.y * TILE;
    const g = this.add.graphics();
    g.setDepth(2500);
    g.lineStyle(2, 0xffe066, 1);
    g.lineBetween(x0, y0, x1, y1);
    g.fillStyle(0xfff3a0, 1);
    g.fillCircle(x0, y0, 4);
    g.fillCircle(x1, y1, 6);
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 280,
      onComplete: () => g.destroy(),
    });
  }

  updateRoofs() {
    const you = this.state.get(this.youId);
    if (!you) return;
    const under = this.mapData.roofs[you.y]?.[you.x];
    for (const roof of this.roofSprites) {
      const near = Math.abs(roof.tileX - you.x) <= 1 && Math.abs(roof.tileY - you.y) <= 1;
      roof.setAlpha(under && near ? 0.15 : 1);
    }
  }

  creatureAt(worldX, worldY) {
    const tx = Math.floor(worldX / TILE);
    const ty = Math.floor(worldY / TILE);
    let best = null;
    let bestDepth = -Infinity;
    for (const [, st] of this.state) {
      if (st.id === this.youId) continue;
      const d = this.displayTile(st);
      const onTile =
        (Math.floor(d.x + 0.001) === tx && Math.floor(d.y + 0.001) === ty) ||
        (st.x === tx && st.y === ty);
      if (!onTile) continue;
      const depth = Math.round(d.y) * 10;
      if (depth >= bestDepth) {
        best = st;
        bestDepth = depth;
      }
    }
    if (best) return best;
    for (const [id, sprite] of this.sprites) {
      if (id === this.youId) continue;
      const b = sprite.getBounds();
      if (Phaser.Geom.Rectangle.Contains(b, worldX, worldY)) {
        if (sprite.depth >= bestDepth) {
          best = this.state.get(id);
          bestDepth = sprite.depth;
        }
      }
    }
    return best;
  }

  handleWorldClick(clientX, clientY, button) {
    if (!this.live) return;
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * this.scale.width;
    const py = ((clientY - rect.top) / rect.height) * this.scale.height;
    const world = this.cameras.main.getWorldPoint(px, py);
    this.applyClick(world.x, world.y, button === "right");
  }

  applyClick(worldX, worldY, right) {
    if (right) {
      const now = Date.now();
      if (now - (this.lastRightAt || 0) < 80) return;
      this.lastRightAt = now;
    }
    const tx = Math.floor(worldX / TILE);
    const ty = Math.floor(worldY / TILE);
    const who = this.creatureAt(worldX, worldY);
    if (right) {
      if (who && !who.dead) this.net.send({ t: "attack", id: who.id });
      else if (who) this.net.send({ t: "target", id: who.id });
      else this.net.send({ t: "look", x: tx, y: ty });
      return;
    }
    const item = this.hud?.selectedItem;
    if (item === "pokeball" || item === "premierball") {
      if (who) {
        this.net.send({ t: "use", item, id: who.id });
        if (who.dead) this.hud.selectItem(null);
      } else {
        this.hud.selectItem(null);
      }
      return;
    }
    if (item === "small_potion" || item === "great_potion") {
      if (who && who.masterId === this.youId) {
        this.net.send({ t: "use", item, id: who.id });
      }
      return;
    }
    this.net.send({ t: "walkTo", x: tx, y: ty });
  }

  onPointer(pointer) {
    if (!this.live) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const right = pointer.button === 2 || pointer.rightButtonDown();
    this.applyClick(world.x, world.y, right);
  }

  currentDir() {
    const k = this.keys;
    const up = k.W.isDown || k.UP.isDown;
    const down = k.S.isDown || k.DOWN.isDown;
    const left = k.A.isDown || k.LEFT.isDown;
    const right = k.D.isDown || k.RIGHT.isDown;
    if (up && right) return 1;
    if (down && right) return 3;
    if (down && left) return 5;
    if (up && left) return 7;
    if (up) return 0;
    if (right) return 2;
    if (down) return 4;
    if (left) return 6;
    return null;
  }

  moveKey() {
    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.ONE)) return 1;
    if (Phaser.Input.Keyboard.JustDown(k.TWO)) return 2;
    if (Phaser.Input.Keyboard.JustDown(k.THREE)) return 3;
    if (Phaser.Input.Keyboard.JustDown(k.FOUR)) return 4;
    if (Phaser.Input.Keyboard.JustDown(k.FIVE)) return 5;
    if (Phaser.Input.Keyboard.JustDown(k.SIX)) return 6;
    if (Phaser.Input.Keyboard.JustDown(k.SEVEN)) return 7;
    if (Phaser.Input.Keyboard.JustDown(k.EIGHT)) return 8;
    if (Phaser.Input.Keyboard.JustDown(k.NINE)) return 9;
    if (Phaser.Input.Keyboard.JustDown(k.ZERO)) return 10;
    return null;
  }

  update() {
    this.layoutAll();
    this.lockCamera();
    this.layoutTarget();
    if (!this.live) return;
    if (isTyping()) {
      this.input.keyboard.enabled = false;
      return;
    }
    this.input.keyboard.enabled = true;
    if (this.keys.ENTER && Phaser.Input.Keyboard.JustDown(this.keys.ENTER)) {
      document.getElementById("chat-input")?.focus();
      return;
    }
    const dir = this.currentDir();
    if (dir != null) this.net.send({ t: "walk", dir });
    if (this.keys.ESC && Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this.hud?.selectItem(null);
      document.getElementById("chat-input")?.blur();
    }
    const move = this.moveKey();
    if (move != null) this.net.send({ t: "move", n: move });
  }
}
