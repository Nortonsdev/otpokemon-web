import Phaser from "phaser";
import { buildLegacyMap, SPAWN } from "../../shared/mapLegacy.ts";
import {
  groundTextureName,
  isGroundTexture,
  itemKindForId,
  textureNameForItemId,
} from "../../shared/editor/tileCatalog.ts";

const PREVIEW_MAP = buildLegacyMap();
import { LOOK_NAME, STEP_MS } from "../../server/species.js";
import { hpColorHex, hpPercent } from "./hpColor.js";
import { playCatchSequence } from "./catchVfx.js";
import { CATCH_BALL_ITEMS } from "./ballIcons.js";
import { pokemonPlateText, speciesAssetSlug } from "../../shared/kantoDex.js";

const TILE = 32;
/** 64×64 (2×2 tile) meadow sheets — keep in sync with tools/extract_otp207_sprites.py exports. */
const LARGE_MONS = new Set([
  "blastoise",
  "bulbasaur",
  "charizard",
  "pidgeot",
  "rapidash",
  "squirtle",
  "venusaur",
  "wartortle",
]);

/** Non-square OTP sheets (frame width × height). */
const MON_FRAME_SIZE = {
  charmeleon: { w: 64, h: 32 },
};

const SPRITE_COL = [0, 1, 1, 2, 2, 3, 3, 0];

function monFrameSize(name) {
  if (MON_FRAME_SIZE[name]) return MON_FRAME_SIZE[name];
  const side = LARGE_MONS.has(name) ? 64 : 32;
  return { w: side, h: side };
}

function monFrame(name) {
  return monFrameSize(name).w;
}

function creatureSize(tex) {
  if (tex === "human" || LARGE_MONS.has(tex)) return 64;
  return 32;
}

/** Alvo em pixels de tela (câmera zoom=2 → fontSize world ≈ alvo/2). */
const NAMEPLATE_SCREEN_PX = 5.875;
const NAMEPLATE_SCREEN_PX_MAX = 6.5;
const NAMEPLATE_SCREEN_STROKE = 1.125;
/** Largura/altura da barra de HP em px de tela (com uiScale na layout). */
const BAR_W = 16;
const BAR_H = 2;
const BAR_PAD = 1;

function nameplateFillColor(kind) {
  if (kind === "npc") return "#00d4e8";
  if (kind === "player") return "#7dce6a";
  if (kind === "wild") return "#7aa2f7";
  return "#ffffff";
}

function nameplateTextStyle(kind) {
  return {
    fontFamily: "Tahoma, Verdana, Arial, sans-serif",
    fontSize: "3px",
    fontStyle: "bold",
    color: nameplateFillColor(kind),
    stroke: "#000000",
    strokeThickness: 1,
    resolution: Math.max(2, Math.ceil(typeof window !== "undefined" ? window.devicePixelRatio || 2 : 2)),
    padding: { x: 0, y: 0 },
  };
}

function nameplateNameBottomY(spriteY, st, size) {
  const wild = st?.kind === "wild" || st?.wild;
  const playerOrNpc = st?.kind === "player" || st?.kind === "npc";
  if (wild) return spriteY - 5;
  if (playerOrNpc || size > TILE) return spriteY + 6;
  return spriteY - 3;
}

function tileWorld(x, y, size) {
  if (size > TILE) {
    return { x: x * TILE - (size - TILE), y: y * TILE - (size - TILE) };
  }
  return { x: x * TILE, y: y * TILE };
}

function creatureFootprint(size) {
  return size > TILE ? 2 : 1;
}

function facingDir(dir) {
  return dir ?? 4;
}

function frameIndex(dir, moving, phase) {
  const col = SPRITE_COL[facingDir(dir)] ?? 2;
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
  return groundTextureName(cell);
}

function texTint(name) {
  if (name === "human") return 0x4a90d9;
  if (name === "charizard") return 0xe07020;
  if (name === "caterpie") return 0x70c040;
  if (name === "rapidash") return 0xe8a040;
  let h = 0;
  for (const ch of String(name || "")) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return 0x404040 + (h % 0xbfbfbf);
}

function hasAnimFrames(texture) {
  return (texture?.frameTotal || 0) > 1;
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
    this.actorLayer = null;
    this.missingSpriteLog = new Set();
    this.live = false;
    this.pendingWorld = null;
    this.targetId = null;
    this.targetMark = null;
    this.targetGizmo = null;
    this.targetPulse = null;
    this.glow = null;
    this.outMark = null;
    this.nextAutoAtk = 0;
    this.catchBusy = false;
  }

  ballTextureKey(item) {
    const key = `ball-${item || "premierball"}`;
    if (this.textures.exists(key)) return key;
    return this.textures.exists("ball-premierball") ? "ball-premierball" : "ball-pokeball";
  }

  outCreatureState() {
    for (const [, st] of this.state) {
      if (st.masterId === this.youId && !st.dead) return st;
    }
    return null;
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
    this.load.image("marble", "/assets/tiles/marble.png");
    this.load.spritesheet("human", "/assets/human/sheet.png", { frameWidth: 64, frameHeight: 64 });
    for (const name of Object.values(LOOK_NAME)) {
      const { w: fw, h: fh } = monFrameSize(name);
      this.load.spritesheet(name, `/assets/pokemon/${name}/sheet.png`, {
        frameWidth: fw,
        frameHeight: fh,
      });
      this.load.image(`${name}-corpse`, `/assets/pokemon/${name}/corpse.png`);
    }
    this.load.image("attacked", "/assets/fx/attacked.png");
    this.load.image("ball-pokeball", "/assets/items/pokeball.png");
    this.load.image("ball-premierball", "/assets/items/premierball.png");
    this.load.image("ball-ultraball", "/assets/items/ultraball.png");
    this.load.image("ball-masterball", "/assets/items/masterball.png");
    this.load.audio("catching", "/assets/sfx/catching.ogg");
    this.load.audio("catch_fail", "/assets/sfx/catch_fail.ogg");
    this.load.audio("catch_sucess", "/assets/sfx/catch_sucess.ogg");
    this.load.on("loaderror", (file) => {
      const key = file?.key || file?.src || "unknown";
      if (this.missingSpriteLog.has(`load:${key}`)) return;
      this.missingSpriteLog.add(`load:${key}`);
      console.warn(`[otpokemon] sprite failed to load: ${file?.url || file?.src || key}`);
    });
  }

  create() {
    // Phaser Layers composite as a group and paint over non-layer objects
    // regardless of child depth. Ground stays in a low layer; everything that
    // must y-sort with CHAR/pokes (walls, roofs, items, creatures) lives in
    // actorLayer so they are not buried under tiles.
    this.groundLayer = this.add.layer();
    this.actorLayer = this.add.layer();
    this.groundLayer.setDepth(0);
    this.actorLayer.setDepth(100);
    this.ensurePlaceholder();
    this.ensureAttackedTexture();
    this.keys = this.input.keyboard.addKeys(
      "W,A,S,D,UP,DOWN,LEFT,RIGHT,ESC,ENTER,SHIFT,C,TAB,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT,NINE,ZERO"
    );
    this.input.keyboard.enabled = false;
    this.input.keyboard.clearCaptures?.();
    this.input.mouse?.disableContextMenu();
    const onRight = (e) => {
      if (!this.live) return;
      if (e.target?.closest?.(".ot-window, .panel, input, button, select, textarea")) return;
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
    this.targetMark = this.add.image(0, 0, "attacked");
    this.targetMark.setOrigin(0.5, 0.82);
    this.targetMark.setVisible(false);
    this.targetMark.setAlpha(0.7);
    this.targetMark.setScale(0.92);
    this.targetGizmo = this.add.graphics();
    this.targetGizmo.setVisible(false);
    this.glow = this.add.graphics();
    this.actorLayer.add(this.targetMark);
    this.actorLayer.add(this.targetGizmo);
    this.actorLayer.add(this.glow);
    this.targetPulse?.stop();
    this.outMark = this.add.graphics();
    this.outMark.setVisible(false);
    this.actorLayer.add(this.outMark);

    this.targetPulse = this.tweens.add({
      targets: this.targetMark,
      props: {
        alpha: { from: 0.62, to: 0.78 },
        scaleX: { from: 0.86, to: 0.98 },
        scaleY: { from: 0.72, to: 0.84 },
      },
      duration: 720,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    this.cameras.main.setRoundPixels(false);
    this.cameras.main.setBackgroundColor(0x111111);
    if (this.pendingWorld) {
      const payload = this.pendingWorld;
      this.pendingWorld = null;
      this.enterWorld(payload);
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
    for (const bar of this.hpBars.values()) this.destroyHpBar(bar);
    this.sprites.clear();
    this.plates.clear();
    this.hpBars.clear();
    this.state.clear();
    this.groundLayer.removeAll(true);
    this.clearActorLayer();
    this.roofSprites = [];
    this.youId = null;
    this.targetId = null;
    this.targetMark?.setVisible(false);
    this.targetGizmo?.clear();
    this.targetGizmo?.setVisible(false);
    this.glow?.clear();
  }

  clearActorLayer() {
    if (!this.actorLayer) return;
    const keep = new Set([this.glow, this.targetMark, this.targetGizmo].filter(Boolean));
    for (const child of [...(this.actorLayer.list || [])]) {
      if (!keep.has(child)) child.destroy();
    }
    if (this.glow && this.glow.displayList !== this.actorLayer) this.actorLayer.add(this.glow);
    if (this.targetMark && this.targetMark.displayList !== this.actorLayer) this.actorLayer.add(this.targetMark);
    if (this.targetGizmo && this.targetGizmo.displayList !== this.actorLayer) this.actorLayer.add(this.targetGizmo);
  }

  ensurePlaceholder() {
    if (this.textures.exists("missing-creature")) return;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x1a1a1a, 0.92);
    g.fillRect(1, 1, 30, 30);
    g.lineStyle(2, 0xffe066, 1);
    g.strokeRect(1, 1, 30, 30);
    g.fillStyle(0xffe066, 1);
    g.fillCircle(16, 11, 5);
    g.fillRect(12, 16, 8, 12);
    g.generateTexture("missing-creature", 32, 32);
    g.destroy();
  }

  ensureAttackedTexture() {
    if (this.textureLooksValid("attacked")) return;
    this.logMissingSprite("attacked");
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.lineStyle(2, 0xe02820, 0.9);
    g.strokeEllipse(16, 23, 24, 12);
    g.lineStyle(2, 0xe02820, 1);
    g.strokeLineShape(new Phaser.Geom.Line(4, 16, 11, 16));
    g.strokeLineShape(new Phaser.Geom.Line(4, 16, 4, 23));
    g.strokeLineShape(new Phaser.Geom.Line(28, 16, 21, 16));
    g.strokeLineShape(new Phaser.Geom.Line(28, 16, 28, 23));
    g.strokeLineShape(new Phaser.Geom.Line(4, 30, 11, 30));
    g.strokeLineShape(new Phaser.Geom.Line(4, 30, 4, 23));
    g.strokeLineShape(new Phaser.Geom.Line(28, 30, 21, 30));
    g.strokeLineShape(new Phaser.Geom.Line(28, 30, 28, 23));
    g.generateTexture("attacked", 32, 32);
    g.destroy();
  }

  isOwnCreature(st) {
    if (!st) return false;
    if (st.id === this.youId) return true;
    if (st.masterId != null && st.masterId === this.youId) return true;
    return false;
  }

  isValidTarget(st) {
    if (!st) return false;
    if (st.kind === "npc" || st.canTarget === false) return false;
    if (this.isOwnCreature(st)) return false;
    return true;
  }

  clearTarget(send = true) {
    if (send && this.live && this.targetId != null) this.net.send({ t: "target", id: null });
    this.targetId = null;
    this.hud?.setTarget(null);
    this.targetMark?.setVisible(false);
    this.targetGizmo?.clear();
    this.targetGizmo?.setVisible(false);
  }

  logMissingSprite(key) {
    if (this.missingSpriteLog.has(key)) return;
    this.missingSpriteLog.add(key);
    console.warn(`[otpokemon] missing map sprite "${key}" — drawing placeholder`);
  }

  textureLooksValid(key) {
    if (!key || !this.textures.exists(key)) return false;
    const tex = this.textures.get(key);
    if (!tex || tex.key === "__MISSING") return false;
    try {
      const src = tex.getSourceImage();
      return !!(src && src.width >= 8 && src.height >= 8);
    } catch {
      return false;
    }
  }

  resolveTexture(c) {
    const key = this.textureFor(c);
    if (this.textureLooksValid(key)) return key;
    this.logMissingSprite(key);
    this.ensurePlaceholder();
    return "missing-creature";
  }

  addActor(obj) {
    if (obj && this.actorLayer && obj.displayList !== this.actorLayer) this.actorLayer.add(obj);
    return obj;
  }

  enterPreview() {
    if (!this.groundLayer) return;
    this.live = false;
    if (this.input?.keyboard) this.input.keyboard.enabled = false;
    this.clearWorld();
    this.mapData = {
      w: PREVIEW_MAP.w,
      h: PREVIEW_MAP.h,
      z: PREVIEW_MAP.z,
      ground: PREVIEW_MAP.ground,
      walls: PREVIEW_MAP.walls,
      roofs: PREVIEW_MAP.roofs,
      items: PREVIEW_MAP.items,
      cells: PREVIEW_MAP.cells,
    };
    this.drawMap();
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(2);
    this.cameras.main.setRoundPixels(false);
    this.cameras.main.centerOn(SPAWN.x * TILE + TILE / 2, SPAWN.y * TILE + TILE / 2);
  }

  enterWorld(payload) {
    if (!this.groundLayer || !this.actorLayer) {
      this.pendingWorld = payload;
      return;
    }
    this.pendingWorld = null;
    this.live = true;
    if (this.input?.keyboard) this.input.keyboard.enabled = true;
    this.clearWorld();
    this.mapData = payload.map;
    this.youId = payload.you.id;
    this.drawMap();
    for (const c of payload.creatures || []) this.spawn(c);
    const out = (payload.creatures || []).find((c) => c.masterId === payload.you.id);
    if (out) this.hud.outCreatureId = out.id;
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(2);
    this.cameras.main.setRoundPixels(false);
    this.layoutAll();
    this.lockCamera();
    this.updateRoofs();
  }

  drawMap() {
    const { w, h, ground, walls, roofs, items, cells } = this.mapData;
    const useCells = Array.isArray(cells) && cells.length === h;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const stack = useCells ? cells[y]?.[x]?.items : null;
        let drewGround = false;
        if (stack?.length) {
          for (const id of stack) {
            const tex = textureNameForItemId(id);
            if (!tex || !this.textureLooksValid(tex)) continue;
            if (tex === "wall") {
              const wall = this.add.image(x * TILE - 32, y * TILE - 32, "wall").setOrigin(0, 0);
              wall.setDepth(y * 10 + 5);
              this.addActor(wall);
              continue;
            }
            if (tex === "roof") {
              const roof = this.add.image(x * TILE - 32, y * TILE - 32, "roof").setOrigin(0, 0);
              roof.setDepth(y * 10 + 8);
              roof.tileX = x;
              roof.tileY = y;
              this.addActor(roof);
              this.roofSprites.push(roof);
              continue;
            }
            const spr = this.add.image(x * TILE, y * TILE, tex).setOrigin(0, 0);
            spr.setDepth(y);
            if (!drewGround && isGroundTexture(tex)) {
              this.groundLayer.add(spr);
              drewGround = true;
            } else {
              spr.setDepth(y * 10 + 2);
              this.addActor(spr);
            }
          }
        }
        if (!drewGround) {
          const g = this.add.image(x * TILE, y * TILE, groundTexture(ground[y][x])).setOrigin(0, 0);
          g.setDepth(y);
          this.groundLayer.add(g);
        }
        if (!stack?.length) {
          if (walls[y][x]) {
            const wall = this.add.image(x * TILE - 32, y * TILE - 32, "wall").setOrigin(0, 0);
            wall.setDepth(y * 10 + 5);
            this.addActor(wall);
          }
          if (roofs[y][x]) {
            const roof = this.add.image(x * TILE - 32, y * TILE - 32, "roof").setOrigin(0, 0);
            roof.setDepth(y * 10 + 8);
            roof.tileX = x;
            roof.tileY = y;
            this.addActor(roof);
            this.roofSprites.push(roof);
          }
        }
      }
    }
    if (!useCells) {
      for (const it of items || []) {
        const spr = this.add.image(it.x * TILE, it.y * TILE, it.kind).setOrigin(0, 0);
        spr.setDepth(it.y * 10 + 2);
        this.addActor(spr);
      }
    } else {
      for (const it of items || []) {
        const stack = cells[it.y]?.[it.x]?.items || [];
        const already = it.itemId
          ? stack.includes(it.itemId)
          : stack.some((id) => itemKindForId(id) === it.kind);
        if (already) continue;
        const spr = this.add.image(it.x * TILE, it.y * TILE, it.kind).setOrigin(0, 0);
        spr.setDepth(it.y * 10 + 2);
        this.addActor(spr);
      }
    }
  }

  textureFor(c) {
    if (c.kind === "player" || c.kind === "npc") {
      if (c.mount?.look != null) return LOOK_NAME[c.mount.look] || "charizard";
      if (c.kind === "npc" && c.look != null && c.look !== 128) {
        return LOOK_NAME[c.look] || "caterpie";
      }
      return "human";
    }
    return speciesAssetSlug(c.species || LOOK_NAME[c.look] || "caterpie");
  }

  spawn(c) {
    if (this.sprites.has(c.id)) this.despawn(c.id);
    const want = this.textureFor(c);
    const tex = this.resolveTexture(c);
    const size = creatureSize(want);
    const pos = tileWorld(c.x, c.y, size);
    const frame = hasAnimFrames(this.textures.get(tex)) ? frameIndex(c.dir, false, 0) : 0;
    const sprite = this.add.sprite(pos.x, pos.y, tex, frame);
    sprite.setOrigin(0, 0);
    sprite.setVisible(true);
    sprite.setActive(true);
    sprite.setDepth(c.y * 10 + 9);
    this.addActor(sprite);
    if (tex === "missing-creature") {
      sprite.setDisplaySize(size, size);
      sprite.setTint(texTint(want));
    }
    if (c.shiny && !c.dead) sprite.setTint(0xffe066);
    const plateY = nameplateNameBottomY(pos.y, c, size);
    const plate = this.add
      .text(pos.x + size / 2, plateY, c.plate || c.name, nameplateTextStyle(c.kind))
      .setOrigin(0.5, 1);
    plate.setDepth(c.y * 10 + 10);
    this.addActor(plate);
    this.sprites.set(c.id, sprite);
    this.plates.set(c.id, plate);
    this.state.set(c.id, {
      ...c,
      spriteSize: size,
      moving: false,
      phase: 0,
      fromX: c.x,
      fromY: c.y,
      walkStart: 0,
      walkMs: 0,
    });
    const cx = pos.x + size / 2;
    const outline = this.add.rectangle(cx, plateY, BAR_W + BAR_PAD * 2, BAR_H + BAR_PAD * 2, 0x000000).setOrigin(0.5, 0);
    const track = this.add.rectangle(cx, plateY + BAR_PAD, BAR_W, BAR_H, 0x1a1a1a).setOrigin(0.5, 0);
    const fg = this.add.rectangle(cx - BAR_W / 2, plateY + BAR_PAD, BAR_W, BAR_H, c.kind === "npc" ? 0x00d4e8 : 0x2fc24a).setOrigin(0, 0);
    outline.setDepth(c.y * 10 + 11);
    track.setDepth(c.y * 10 + 12);
    fg.setDepth(c.y * 10 + 13);
    this.addActor(outline);
    this.addActor(track);
    this.addActor(fg);
    this.hpBars.set(c.id, { outline, track, fg });
    this.setHpBar(c.id, c.hp, c.hpMax);
    this.refreshPlate(c.id);
    if (c.dead) this.applyCorpseLook(c.id);
  }

  despawn(id) {
    this.sprites.get(id)?.destroy();
    this.plates.get(id)?.destroy();
    this.destroyHpBar(this.hpBars.get(id));
    this.sprites.delete(id);
    this.plates.delete(id);
    this.hpBars.delete(id);
    this.state.delete(id);
  }

  destroyHpBar(bar) {
    if (!bar) return;
    bar.outline?.destroy();
    bar.track?.destroy();
    bar.bg?.destroy();
    bar.fg?.destroy();
  }

  setHpBarVisible(bar, visible) {
    if (!bar) return;
    bar.outline?.setVisible(visible);
    bar.track?.setVisible(visible);
    bar.bg?.setVisible(visible);
    bar.fg?.setVisible(visible);
  }

  uiScale() {
    const z = this.cameras.main?.zoom || 1;
    return z > 0 ? 1 / z : 1;
  }

  /** Texto ~NAMEPLATE_SCREEN_PX px na tela; fontSize em world divide pelo zoom (sem pisos altos). */
  applyNameplateScreenScale(plate) {
    const z = Math.max(0.25, this.cameras.main?.zoom || 1);
    const screenPx = Math.min(NAMEPLATE_SCREEN_PX_MAX, NAMEPLATE_SCREEN_PX);
    const worldFont = Math.max(1, Math.round(screenPx / z));
    plate.setFontSize(worldFont);
    plate.setScale(1);
    const strokeWorld = Math.max(1, Math.round(NAMEPLATE_SCREEN_STROKE / z));
    plate.setStroke("#000000", strokeWorld);
    plate.setResolution(
      Math.max(2, Math.ceil((typeof window !== "undefined" ? window.devicePixelRatio : 2) || 2))
    );
  }

  layoutNameplate(id, spriteX, spriteY, depth) {
    const sprite = this.sprites.get(id);
    const plate = this.plates.get(id);
    if (!sprite || !plate) return;
    const st = this.state.get(id);
    const size = st?.spriteSize || creatureSize(sprite.texture.key);
    const ui = this.uiScale();
    this.applyNameplateScreenScale(plate);
    const cx = spriteX + size / 2;
    const nameBottom = nameplateNameBottomY(spriteY, st, size);
    plate.setPosition(Math.round(cx), Math.round(nameBottom));
    plate.setDepth(depth + 1);
    const bar = this.hpBars.get(id);
    if (!bar) return;
    const nameGap = Math.max(1, Math.round(1 * ui));
    const barBlockH = (BAR_H + BAR_PAD * 2) * ui;
    const z = Math.max(0.25, this.cameras.main?.zoom || 1);
    const textH = Math.max(1, Math.round(NAMEPLATE_SCREEN_PX / z));
    const playerStack = st?.kind === "player";
    const barTop = playerStack
      ? nameBottom - textH - nameGap - barBlockH
      : nameBottom + nameGap;
    const innerTop = barTop + BAR_PAD * ui;
    const outW = BAR_W + BAR_PAD * 2;
    const outH = BAR_H + BAR_PAD * 2;
    for (const part of [bar.outline, bar.track, bar.fg]) part?.setScale(ui);
    bar.outline?.setSize(outW, outH);
    bar.outline?.setOrigin(0.5, 0);
    bar.outline?.setPosition(cx, barTop);
    bar.outline?.setDepth(depth + 2);
    bar.track?.setSize(BAR_W, BAR_H);
    bar.track?.setOrigin(0.5, 0);
    bar.track?.setPosition(cx, innerTop);
    bar.track?.setDepth(depth + 3);
    bar.fg.height = BAR_H;
    bar.fg.setOrigin(0, 0);
    bar.fg.setPosition(cx - (BAR_W * ui) / 2, innerTop);
    bar.fg.setDepth(depth + 4);
    this.setHpBar(id, st?.hp, st?.hpMax);
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
    const ratio = hpPercent(hp ?? st?.hp ?? 0, max);
    bar.fg.width = BAR_W * ratio;
    if (st?.kind === "npc") bar.fg.setFillStyle(0x00d4e8);
    else bar.fg.setFillStyle(hpColorHex(ratio));
  }

  refreshPlate(id) {
    const st = this.state.get(id);
    const plate = this.plates.get(id);
    if (!st || !plate) return;
    if (st.kind === "npc") {
      plate.setText(`${st.name} (!)`);
      plate.setColor("#00d4e8");
    } else if (st.kind === "player") {
      plate.setText(st.name);
      plate.setColor("#7dce6a");
    } else {
      plate.setText(pokemonPlateText(st));
      plate.setColor(st.kind === "wild" || st.wild ? "#7aa2f7" : "#ffffff");
    }
    this.applyNameplateScreenScale(plate);
    const sprite = this.sprites.get(id);
    if (sprite) this.layoutNameplate(id, sprite.x, sprite.y, sprite.depth);
  }

  applyCorpseLook(id) {
    const st = this.state.get(id);
    const sprite = this.sprites.get(id);
    if (!st || !sprite || sprite.texture.key === "human") return;
    st.dead = true;
    st.moving = false;
    st.hp = 0;
    const name = speciesAssetSlug(st.species || LOOK_NAME[st.look] || "caterpie");
    const corpseKey = `${name}-corpse`;
    if (this.textures.exists(corpseKey)) sprite.setTexture(corpseKey, 0);
    sprite.setOrigin(0.5, 0.5);
    sprite.setAngle(0);
    sprite.clearTint();
    sprite.setScale(1);
    const plate = this.plates.get(id);
    plate?.setVisible(false);
    this.setHpBarVisible(this.hpBars.get(id), false);
  }

  layoutCreature(id) {
    const st = this.state.get(id);
    const sprite = this.sprites.get(id);
    if (!st || !sprite) return;
    const d = this.displayTile(st);
    const size = st.spriteSize || creatureSize(sprite.texture.key);
    const pos = tileWorld(d.x, d.y, size);
    const walking = st.moving && !st.dead;
    const depth = Math.round(d.y) * 10 + 9;
    const ability = st.mount?.ability;
    const placeholder = sprite.texture.key === "missing-creature";
    if (st.dead) {
      sprite.setOrigin(0.5, 0.5);
      sprite.setAngle(0);
      sprite.setScale(1);
      const foot = creatureFootprint(size);
      sprite.setPosition(
        d.x * TILE + (foot * TILE) / 2,
        d.y * TILE + (foot * TILE) / 2 + (size > TILE ? 4 : 0)
      );
      this.plates.get(id)?.setVisible(false);
      this.setHpBarVisible(this.hpBars.get(id), false);
      sprite.setDepth(depth);
      return;
    }
    sprite.setVisible(true);
      this.plates.get(id)?.setVisible(true);
      this.setHpBarVisible(this.hpBars.get(id), true);
      sprite.setOrigin(0, 0);
      sprite.setAngle(0);
      sprite.clearTint();
      if (st.shiny) sprite.setTint(0xffe066);
      else if (placeholder) sprite.setTint(texTint(this.textureFor(st)));
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
      if (hasAnimFrames(sprite.texture)) sprite.setFrame(frameIndex(st.dir, walking, st.phase));
      this.layoutNameplate(id, px, py, depth);
      sprite.setDepth(depth);
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
    this.glow.setDepth(Math.round(d.y) * 10 + 5);
    this.glow.fillStyle(0xfff3c4, 0.16);
    this.glow.fillCircle(cx, cy, 38);
    this.glow.fillStyle(0xffe08a, 0.1);
    this.glow.fillCircle(cx, cy, 22);
  }

  handleNet(msg) {
    if (!this.live && msg.t !== "map") return;
    if (msg.t === "appear") {
      this.spawn(msg.creature);
      if (msg.creature?.masterId === this.youId) {
        this.hud.outCreatureId = msg.creature.id;
        this.flashRelease(msg.creature.id);
      }
    }
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
    if (msg.t === "target") {
      if (msg.id == null) this.clearTarget(false);
      else if (this.isValidTarget(this.state.get(msg.id))) this.setTarget(msg.id);
      else this.clearTarget(false);
    }
    if (msg.t === "disappear" && msg.id === this.targetId) this.clearTarget(false);
    if (msg.t === "catchAttempt") {
      this.catchBusy = true;
      playCatchSequence(this, msg);
      this.time.delayedCall(3400, () => {
        this.catchBusy = false;
      });
    }
  }

  flashRelease(id) {
    const s = this.sprites.get(id);
    if (!s) return;
    const g = this.add.graphics();
    g.setDepth(s.depth + 2);
    this.addActor(g);
    const cx = s.x + (s.displayWidth || TILE) / 2;
    const cy = s.y + (s.displayHeight || TILE) / 2;
    g.fillStyle(0xffffff, 0.75);
    g.fillCircle(cx, cy, 22);
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 280,
      onComplete: () => g.destroy(),
    });
  }

  setTarget(id) {
    const st = id != null ? this.state.get(id) : null;
    if (!this.isValidTarget(st)) {
      this.clearTarget(false);
      return;
    }
    this.targetId = st.id;
    this.hud?.setTarget(st);
    this.layoutTarget();
  }

  layoutTarget() {
    const mark = this.targetMark;
    const gizmo = this.targetGizmo;
    const st = this.targetId != null ? this.state.get(this.targetId) : null;
    if (!this.isValidTarget(st)) {
      mark?.setVisible(false);
      gizmo?.clear();
      gizmo?.setVisible(false);
      return;
    }
    const d = this.displayTile(st);
    const cx = d.x * TILE + TILE / 2;
    const feetY = d.y * TILE + TILE - 2;
    const depth = Math.round(d.y) * 10 + 8;
    if (mark) {
      this.addActor(mark);
      if (this.textures.exists("attacked")) mark.setTexture("attacked");
      mark.setOrigin(0.5, 0.82);
      mark.setPosition(cx, feetY);
      mark.setDepth(depth);
      mark.setVisible(true);
      mark.setActive(true);
    }
    if (gizmo) {
      this.addActor(gizmo);
      gizmo.clear();
      gizmo.setVisible(true);
      gizmo.setDepth(depth);
      const pulse = 0.66 + 0.08 * Math.sin((this.now() || 0) / 180);
      gizmo.lineStyle(2, 0xff2a22, pulse);
      gizmo.strokeEllipse(cx, feetY - 5, 26, 11);
      const x0 = cx - 13;
      const x1 = cx + 13;
      const y0 = feetY - 11;
      const y1 = feetY + 1;
      const arm = 6;
      gizmo.lineBetween(x0, y0, x0 + arm, y0);
      gizmo.lineBetween(x0, y0, x0, y0 + arm);
      gizmo.lineBetween(x1, y0, x1 - arm, y0);
      gizmo.lineBetween(x1, y0, x1, y0 + arm);
      gizmo.lineBetween(x0, y1, x0 + arm, y1);
      gizmo.lineBetween(x0, y1, x0, y1 - arm);
      gizmo.lineBetween(x1, y1, x1 - arm, y1);
      gizmo.lineBetween(x1, y1, x1, y1 - arm);
    }
    this.layoutOutMark();
    this.actorLayer?.queueDepthSort?.();
  }

  layoutOutMark() {
    const g = this.outMark;
    if (!g) return;
    const out = this.outCreatureState();
    const tgt = this.targetId != null ? this.state.get(this.targetId) : null;
    if (!out || !tgt || tgt.dead || !tgt.wild) {
      g.clear();
      g.setVisible(false);
      return;
    }
    const d = this.displayTile(out);
    const cx = d.x * TILE + TILE / 2;
    const feetY = d.y * TILE + TILE - 2;
    const depth = Math.round(d.y) * 10 + 7;
    g.clear();
    g.setVisible(true);
    g.setDepth(depth);
    const pulse = 0.55 + 0.12 * Math.sin((this.now() || 0) / 160);
    g.lineStyle(2, 0x44ff66, pulse);
    g.strokeEllipse(cx, feetY - 5, 24, 10);
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
    st.walkMs = Math.max(80, msg.ms || STEP_MS);
    st.phase = st.phase ? 0 : 1;
    if (msg.id === this.youId) this.updateRoofs();
  }

  floatDamage(id, dmg) {
    const st = this.state.get(id);
    if (!st || dmg == null || dmg <= 0) return;
    const ui = this.uiScale();
    const d = this.displayTile(st);
    const x = d.x * TILE + TILE / 2;
    const y = d.y * TILE - 4;
    const txt = this.add
      .text(x, y, `-${dmg}`, {
        fontFamily: "Tahoma, Verdana, Arial, sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#ff5a4a",
        stroke: "#000000",
        strokeThickness: 2,
        resolution: 2,
      })
      .setOrigin(0.5, 1);
    txt.setScale(ui);
    txt.setDepth(2000);
    this.addActor(txt);
    this.tweens.add({
      targets: txt,
      y: y - 18,
      alpha: 0,
      duration: 620,
      ease: "Cubic.easeOut",
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
    const y0 = da.y * TILE + TILE / 2;
    const x1 = db.x * TILE + TILE / 2;
    const y1 = db.y * TILE + TILE / 2;
    const dot = this.add.image(x0, y0, "attacked").setDepth(Math.round(db.y) * 10 + 15);
    dot.setDisplaySize(12, 12);
    dot.setAlpha(0.85);
    this.addActor(dot);
    this.tweens.add({
      targets: dot,
      x: x1,
      y: y1 - 4,
      alpha: 0.2,
      duration: 160,
      ease: "Quad.easeOut",
      onComplete: () => {
        dot.destroy();
        const g = this.add.graphics();
        g.setDepth(Math.round(db.y) * 10 + 14);
        this.addActor(g);
        g.fillStyle(0xffe8a0, 0.85);
        g.fillCircle(x1, y1, 4);
        g.fillStyle(0xff4040, 0.55);
        g.fillCircle(x1, y1, 7);
        this.tweens.add({
          targets: g,
          alpha: 0,
          duration: 180,
          onComplete: () => g.destroy(),
        });
      },
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
    let own = null;
    let ownDepth = -Infinity;
    const consider = (st, depth) => {
      if (!st || st.id === this.youId) return;
      if (this.isOwnCreature(st)) {
        if (depth >= ownDepth) {
          own = st;
          ownDepth = depth;
        }
        return;
      }
      if (depth >= bestDepth) {
        best = st;
        bestDepth = depth;
      }
    };
    for (const [, st] of this.state) {
      const d = this.displayTile(st);
      const onTile =
        (Math.floor(d.x + 0.001) === tx && Math.floor(d.y + 0.001) === ty) ||
        (st.x === tx && st.y === ty);
      if (!onTile) continue;
      consider(st, Math.round(d.y) * 10);
    }
    if (best) return best;
    for (const [id, sprite] of this.sprites) {
      const st = this.state.get(id);
      if (!st || id === this.youId) continue;
      const b = sprite.getBounds();
      if (!Phaser.Geom.Rectangle.Contains(b, worldX, worldY)) continue;
      consider(st, sprite.depth);
    }
    return best || own;
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
    if (who?.kind === "npc") {
      if (right) this.net.send({ t: "look", x: tx, y: ty });
      else this.hud?.openNpcDialog(who);
      return;
    }
    if (right) {
      if (this.isOwnCreature(who)) {
        this.net.send({ t: "look", x: tx, y: ty });
        return;
      }
      if (this.isValidTarget(who) && !who.dead) this.net.send({ t: "attack", id: who.id });
      else this.net.send({ t: "look", x: tx, y: ty });
      return;
    }
    const item = this.hud?.selectedItem;
    if (item === "pokeball" || CATCH_BALL_ITEMS.includes(item)) {
      if (this.catchBusy) return;
      if (who && who.wild && who.dead) {
        this.net.send({ t: "use", item, id: who.id });
        this.hud.selectItem(null);
      } else if (who && who.wild && !who.dead) {
        this.hud.log("Derrote o Pokémon antes de capturar.", "combate");
      }
      return;
    }
    if (item === "small_potion" || item === "great_potion") {
      if (who && this.isOwnCreature(who) && who.id !== this.youId) {
        this.net.send({ t: "use", item, id: who.id });
      }
      return;
    }
    if (who && who.wild && !who.dead && this.isValidTarget(who)) {
      this.setTarget(who.id);
      this.net.send({ t: "target", id: who.id });
      this.net.send({ t: "walkTo", x: who.x, y: who.y });
      return;
    }
    if (this.isValidTarget(who)) {
      this.setTarget(who.id);
      this.net.send({ t: "target", id: who.id });
      return;
    }
    if (this.isOwnCreature(who)) {
      this.net.send({ t: "look", x: tx, y: ty });
      return;
    }
    this.clearTarget();
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
      this.clearTarget();
      document.getElementById("chat-input")?.blur();
    }
    const move = this.moveKey();
    if (move != null && Date.now() >= (this.hud?.moveCdUntil || 0)) this.net.send({ t: "move", n: move });
    if (this.keys.TAB && Phaser.Input.Keyboard.JustDown(this.keys.TAB)) {
      if (Date.now() >= (this.hud?.moveCdUntil || 0)) this.net.send({ t: "move", n: 1 });
    }
    this.tickAutoCombat();
  }

  tickAutoCombat() {
    if (this.hud?.selectedItem || this.catchBusy) return;
    const tgt = this.targetId != null ? this.state.get(this.targetId) : null;
    if (!tgt || !tgt.wild || tgt.dead) return;
    const out = this.outCreatureState();
    const you = this.state.get(this.youId);
    if (!out || !you) return;
    const dist = Math.max(Math.abs(out.x - tgt.x), Math.abs(out.y - tgt.y));
    if (dist > 1) {
      this.net.send({ t: "walkTo", x: tgt.x, y: tgt.y });
      return;
    }
    const now = Date.now();
    if (now < this.nextAutoAtk || now < (this.hud?.moveCdUntil || 0)) return;
    this.nextAutoAtk = now + 1050;
    this.net.send({ t: "attack", id: tgt.id });
  }
}
