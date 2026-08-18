import Phaser from "phaser";

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

export class GameScene extends Phaser.Scene {
  constructor(net, hud, payload) {
    super("game");
    this.net = net;
    this.hud = hud;
    this.payload = payload;
    this.sprites = new Map();
    this.plates = new Map();
    this.state = new Map();
    this.youId = null;
    this.mapData = null;
    this.keys = null;
    this.roofSprites = [];
    this.groundLayer = null;
    this.wallLayer = null;
    this.roofLayer = null;
    this.creatureLayer = null;
  }

  preload() {
    this.load.image("grass", "/assets/tiles/grass.png");
    this.load.image("path", "/assets/tiles/path.png");
    this.load.image("wall", "/assets/tiles/wall.png");
    this.load.image("roof", "/assets/tiles/roof.png");
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
    this.wallLayer = this.add.layer();
    this.creatureLayer = this.add.layer();
    this.roofLayer = this.add.layer();
    this.keys = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,C,SHIFT");
    this.input.mouse?.disableContextMenu();
    document.getElementById("game")?.addEventListener("contextmenu", (e) => e.preventDefault());
    this.input.on("pointerdown", (p) => this.onPointer(p));
    this.enterWorld(this.payload);
  }

  enterWorld(payload) {
    this.payload = payload;
    this.mapData = payload.map;
    this.youId = payload.you.id;
    for (const s of this.sprites.values()) s.destroy();
    for (const p of this.plates.values()) p.destroy();
    this.sprites.clear();
    this.plates.clear();
    this.state.clear();
    this.groundLayer.removeAll(true);
    this.wallLayer.removeAll(true);
    this.roofLayer.removeAll(true);
    this.roofSprites = [];
    this.drawMap();
    for (const c of payload.creatures) this.spawn(c);
    this.cameras.main.setZoom(2);
    const you = this.sprites.get(this.youId);
    if (you) this.cameras.main.startFollow(you, true, 0.15, 0.15);
    this.updateRoofs();
  }

  drawMap() {
    const { w, h, ground, walls, roofs } = this.mapData;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const g = this.add.image(x * TILE, y * TILE, ground[y][x] === 1 ? "path" : "grass").setOrigin(0, 0);
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
    const plate = this.add
      .text(pos.x + size / 2, pos.y - 2, c.plate || c.name, {
        fontFamily: "Trebuchet MS",
        fontSize: "10px",
        color: "#fff",
        backgroundColor: "#00000088",
      })
      .setOrigin(0.5, 1);
    plate.setDepth(c.y * 10 + 7);
    this.sprites.set(c.id, sprite);
    this.plates.set(c.id, plate);
    this.state.set(c.id, { ...c, moving: false, phase: 0 });
  }

  despawn(id) {
    this.sprites.get(id)?.destroy();
    this.plates.get(id)?.destroy();
    this.sprites.delete(id);
    this.plates.delete(id);
    this.state.delete(id);
  }

  place(id, x, y, dir, moving) {
    const st = this.state.get(id);
    const sprite = this.sprites.get(id);
    const plate = this.plates.get(id);
    if (!st || !sprite) return;
    const tex = sprite.texture.key;
    const size = tex === "human" ? 64 : 32;
    const pos = tileWorld(x, y, size);
    sprite.setPosition(pos.x, pos.y);
    sprite.setFrame(frameIndex(dir, moving, st.phase));
    sprite.setDepth(y * 10 + 6);
    plate.setPosition(pos.x + size / 2, pos.y - 2);
    plate.setDepth(y * 10 + 7);
  }

  handleNet(msg) {
    if (msg.t === "appear") this.spawn(msg.creature);
    if (msg.t === "disappear") this.despawn(msg.id);
    if (msg.t === "turn") {
      const st = this.state.get(msg.id);
      if (!st) return;
      st.dir = msg.dir;
      this.sprites.get(msg.id)?.setFrame(frameIndex(msg.dir, false, 0));
    }
    if (msg.t === "moved") this.animateMove(msg);
    if (msg.t === "fx") this.flash(msg.to);
  }

  animateMove(msg) {
    const st = this.state.get(msg.id);
    const sprite = this.sprites.get(msg.id);
    const plate = this.plates.get(msg.id);
    if (!st || !sprite) return;
    st.dir = msg.dir;
    st.x = msg.x;
    st.y = msg.y;
    st.moving = true;
    st.phase = st.phase ? 0 : 1;
    const tex = sprite.texture.key;
    const size = tex === "human" ? 64 : 32;
    const pos = tileWorld(msg.x, msg.y, size);
    this.tweens.killTweensOf(sprite);
    this.tweens.add({
      targets: sprite,
      x: pos.x,
      y: pos.y,
      duration: msg.ms || 200,
      onUpdate: () => {
        sprite.setFrame(frameIndex(st.dir, true, st.phase));
        sprite.setDepth(Math.round(st.y) * 10 + 6);
        plate.setPosition(sprite.x + size / 2, sprite.y - 2);
        plate.setDepth(sprite.depth + 1);
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

  update() {
    const dir = this.currentDir();
    if (dir != null) this.net.send({ t: "walk", dir });
    if (Phaser.Input.Keyboard.JustDown(this.keys.C)) this.net.send({ t: "catch" });
  }
}
