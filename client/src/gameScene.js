import Phaser from "phaser";
import { MAP } from "../../server/map.js";

const TILE = 32;
const SPRITE_COL = [0, 1, 1, 2, 2, 3, 3, 0];
const LOOK = { 1: "bulbasaur", 4: "charmander", 7: "squirtle", 10: "caterpie" };

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
    for (const name of Object.values(LOOK)) {
      this.load.spritesheet(name, `/assets/pokemon/${name}/sheet.png`, {
        frameWidth: 32,
        frameHeight: 32,
      });
    }
  }

  create() {
    this.groundLayer = this.add.layer();
    this.itemLayer = this.add.layer();
    this.wallLayer = this.add.layer();
    this.creatureLayer = this.add.layer();
    this.roofLayer = this.add.layer();
    this.keys = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,C,SHIFT,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT,NINE,ZERO");
    this.input.keyboard.enabled = false;
    this.input.mouse?.disableContextMenu();
    document.getElementById("game")?.addEventListener("contextmenu", (e) => e.preventDefault());
    this.input.on("pointerdown", (p) => this.onPointer(p));
    this.targetId = null;
    this.targetMark = this.add.rectangle(0, 0, TILE - 2, TILE - 2, 0xff2020, 0.18);
    this.targetMark.setStrokeStyle(3, 0xff3030, 1);
    this.targetMark.setOrigin(0, 0);
    this.targetMark.setVisible(false);
    this.targetMark.setDepth(1000);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor(0x111111);
    if (this.pendingWorld) {
      const payload = this.pendingWorld;
      this.pendingWorld = null;
      this.enterWorld(payload);
    } else {
      this.enterPreview();
    }
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
    this.targetMark?.setVisible(false);
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
    this.cameras.main.centerOn(8 * TILE + 16, 12 * TILE + 16);
    this.cameras.main.setRoundPixels(true);
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
    this.cameras.main.setZoom(2);
    this.cameras.main.setRoundPixels(true);
    const you = this.sprites.get(this.youId);
    if (you) this.cameras.main.startFollow(you, true, 1, 1);
    this.updateRoofs();
  }

  drawMap() {
    const { w, h, ground, walls, roofs, items } = this.mapData;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const g = this.add
          .image(x * TILE, y * TILE, groundTexture(ground[y][x]))
          .setOrigin(0, 0);
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
    if (c.kind === "player") return "human";
    return LOOK[c.look] || "caterpie";
  }

  spawn(c) {
    if (this.sprites.has(c.id)) this.despawn(c.id);
    const tex = this.textureFor(c);
    const size = tex === "human" ? 64 : 32;
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
    this.state.set(c.id, { ...c, moving: false, phase: 0 });
    const cx = pos.x + size / 2;
    const barY = plateY + 3;
    const bg = this.add.rectangle(cx, barY, 28, 4, 0x111111).setOrigin(0.5, 0);
    bg.setStrokeStyle(1, 0x000000, 0.9);
    bg.setDepth(c.y * 10 + 8);
    const fg = this.add.rectangle(cx - 13, barY + 1, 26, 2, 0x3dcc4a).setOrigin(0, 0);
    fg.setDepth(c.y * 10 + 9);
    this.hpBars.set(c.id, { bg, fg });
    this.setHpBar(c.id, c.hp, c.hpMax);
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
    const size = sprite.texture.key === "human" ? 64 : 32;
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

  place(id, x, y, dir, moving) {
    const st = this.state.get(id);
    const sprite = this.sprites.get(id);
    if (!st || !sprite) return;
    const tex = sprite.texture.key;
    const size = tex === "human" ? 64 : 32;
    const pos = tileWorld(x, y, size);
    sprite.setPosition(pos.x, pos.y);
    sprite.setFrame(frameIndex(dir, moving, st.phase));
    sprite.setDepth(y * 10 + 6);
    this.layoutNameplate(id, pos.x, pos.y, y * 10 + 6);
  }

  handleNet(msg) {
    if (!this.live && msg.t !== "map") return;
    if (msg.t === "appear") this.spawn(msg.creature);
    if (msg.t === "disappear") this.despawn(msg.id);
    if (msg.t === "turn") {
      const st = this.state.get(msg.id);
      if (!st) return;
      st.dir = msg.dir;
      this.sprites.get(msg.id)?.setFrame(frameIndex(msg.dir, false, 0));
    }
    if (msg.t === "moved") {
      this.animateMove(msg);
      if (msg.id === this.targetId) this.layoutTarget();
    }
    if (msg.t === "fx") {
      this.flash(msg.to);
      if (msg.hp != null) this.setHpBar(msg.to, msg.hp, msg.hpMax);
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
    const st = this.targetId ? this.state.get(this.targetId) : null;
    if (!st) {
      this.targetMark.setVisible(false);
      return;
    }
    this.targetMark.setPosition(st.x * TILE + 1, st.y * TILE + 1);
    this.targetMark.setDepth(1000);
    this.targetMark.setVisible(true);
  }

  animateMove(msg) {
    const st = this.state.get(msg.id);
    const sprite = this.sprites.get(msg.id);
    if (!st || !sprite) return;
    st.dir = msg.dir;
    st.x = msg.x;
    st.y = msg.y;
    st.moving = true;
    st.phase = st.phase ? 0 : 1;
    const pos = tileWorld(msg.x, msg.y, sprite.texture.key === "human" ? 64 : 32);
    this.tweens.killTweensOf(sprite);
    this.tweens.add({
      targets: sprite,
      x: pos.x,
      y: pos.y,
      duration: msg.ms || 200,
      onUpdate: () => {
        sprite.setFrame(frameIndex(st.dir, true, st.phase));
        sprite.setDepth(Math.round(st.y) * 10 + 6);
        this.layoutNameplate(msg.id, sprite.x, sprite.y, sprite.depth);
      },
      onComplete: () => {
        st.moving = false;
        sprite.setFrame(frameIndex(st.dir, false, 0));
        this.place(msg.id, msg.x, msg.y, st.dir, false);
        if (msg.id === this.youId) this.updateRoofs();
      },
    });
  }

  flash(id) {
    const s = this.sprites.get(id);
    if (!s) return;
    this.tweens.add({ targets: s, alpha: 0.3, yoyo: true, duration: 80, repeat: 1 });
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
    let best = null;
    let bestDepth = -Infinity;
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
    if (best) return best;
    const tx = Math.floor(worldX / TILE);
    const ty = Math.floor(worldY / TILE);
    for (const [, st] of this.state) {
      if (st.id !== this.youId && st.x === tx && st.y === ty) return st;
    }
    return null;
  }

  onPointer(pointer) {
    if (!this.live) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tx = Math.floor(world.x / TILE);
    const ty = Math.floor(world.y / TILE);
    if (pointer.rightButtonDown()) {
      const who = this.creatureAt(world.x, world.y);
      if (who) this.net.send({ t: "attack", id: who.id });
      else this.net.send({ t: "look", x: tx, y: ty });
      return;
    }
    if (pointer.leftButtonDown()) {
      this.net.send({ t: "walkTo", x: tx, y: ty });
    }
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
    if (!this.live) return;
    if (isTyping()) {
      this.input.keyboard.enabled = false;
      return;
    }
    this.input.keyboard.enabled = true;
    const dir = this.currentDir();
    if (dir != null) this.net.send({ t: "walk", dir });
    if (Phaser.Input.Keyboard.JustDown(this.keys.C)) this.net.send({ t: "catch" });
    const move = this.moveKey();
    if (move != null) this.net.send({ t: "move", n: move });
    this.layoutTarget();
  }
}
