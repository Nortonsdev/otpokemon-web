import { randomInt, randomUUID } from "node:crypto";
import {
  BALL,
  DELTA,
  DIR,
  PARTY_CAP,
  PLAYER_HP,
  SPECIES,
  STARTERS,
  STEP_MS,
  behind,
} from "./species.js";
import { MAP, hasRoof, inBounds, tileName, walkable } from "./map.js";
import { loadSave, saveNow } from "./persist.js";

let nextId = 1;
function cid() {
  return nextId++;
}

export class World {
  constructor() {
    this.save = loadSave();
    this.clients = new Map();
    this.creatures = new Map();
    this.occupancy = new Map();
    this.wildRespawnAt = 0;
    this.ensureWild();
    this.dirty = false;
  }

  key(x, y) {
    return `${x},${y}`;
  }

  occupy(creature) {
    this.occupancy.set(this.key(creature.x, creature.y), creature.id);
  }

  vacate(creature) {
    const k = this.key(creature.x, creature.y);
    if (this.occupancy.get(k) === creature.id) this.occupancy.delete(k);
  }

  occupant(x, y) {
    const id = this.occupancy.get(this.key(x, y));
    return id ? this.creatures.get(id) : null;
  }

  persist() {
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    saveNow(this.save);
    this.dirty = false;
  }

  send(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  broadcast(msg, except = null) {
    const data = JSON.stringify(msg);
    for (const [ws] of this.clients) {
      if (ws !== except && ws.readyState === 1) ws.send(data);
    }
  }

  broadcastArea(msg) {
    this.broadcast(msg);
  }

  attach(ws) {
    const client = { ws, account: null, playerId: null, charName: null };
    this.clients.set(ws, client);
    this.send(ws, { t: "hello", motd: "OTPokemon Web milestone. demo/demo" });
  }

  detach(ws) {
    const client = this.clients.get(ws);
    if (!client) return;
    if (client.playerId) this.logoutPlayer(client, false);
    this.clients.delete(ws);
  }

  handle(ws, msg) {
    const client = this.clients.get(ws);
    if (!client || !msg || typeof msg !== "object") return;
    const t = msg.t;
    try {
      if (t === "register") return this.register(client, msg);
      if (t === "login") return this.login(client, msg);
      if (t === "create") return this.createCharacter(client, msg);
      if (t === "enter") return this.enter(client, msg);
      if (!client.playerId) return this.err(client, "Not in game.");
      const player = this.creatures.get(client.playerId);
      if (!player) return this.err(client, "Player missing.");
      if (t === "walk") return this.walk(player, msg.dir, true);
      if (t === "turn") return this.turn(player, msg.dir);
      if (t === "look") return this.look(player, msg.x, msg.y);
      if (t === "use") return this.use(player, msg);
      if (t === "say") return this.say(player, msg.text);
      if (t === "logout") return this.logoutPlayer(client, true);
      if (t === "pokebar") return this.pokebar(player, msg.slot);
      if (t === "catch") return this.catchBall(player);
      if (t === "target") return this.setTarget(player, msg.id);
    } catch (err) {
      console.error(err);
      this.err(client, "Server error.");
    }
  }

  err(client, text) {
    this.send(client.ws, { t: "err", text });
  }

  sys(player, text) {
    const client = this.clientOf(player);
    if (client) this.send(client.ws, { t: "info", text });
  }

  clientOf(player) {
    for (const [, c] of this.clients) if (c.playerId === player.id) return c;
    return null;
  }

  register(client, { user, pass }) {
    const name = String(user || "").trim().toLowerCase();
    const password = String(pass || "");
    if (!/^[a-z0-9_]{3,16}$/.test(name)) return this.err(client, "Invalid account name.");
    if (password.length < 3) return this.err(client, "Password too short.");
    if (this.save.accounts[name]) return this.err(client, "Account exists.");
    this.save.accounts[name] = { password, chars: [] };
    this.persist();
    client.account = name;
    this.send(client.ws, { t: "welcome", user: name, chars: [] });
  }

  login(client, { user, pass }) {
    const name = String(user || "").trim().toLowerCase();
    const acc = this.save.accounts[name];
    if (!acc || acc.password !== String(pass || "")) return this.err(client, "Wrong account or password.");
    client.account = name;
    this.send(client.ws, { t: "welcome", user: name, chars: acc.chars.slice() });
  }

  createCharacter(client, { name, starter }) {
    if (!client.account) return this.err(client, "Login first.");
    const charName = String(name || "").trim();
    if (!/^[A-Za-z][A-Za-z0-9 ]{1,18}$/.test(charName)) return this.err(client, "Invalid character name.");
    const key = charName.toLowerCase();
    if (Object.keys(this.save.characters).some((n) => n.toLowerCase() === key)) {
      return this.err(client, "Name already taken.");
    }
    const specKey = String(starter || "").toLowerCase();
    if (!STARTERS.includes(specKey)) return this.err(client, "Choose Bulbasaur, Charmander or Squirtle.");
    const spec = SPECIES[specKey];
    const record = {
      name: charName,
      account: client.account,
      x: MAP.w ? 8 : 8,
      y: 12,
      z: MAP.z,
      dir: DIR.S,
      hp: PLAYER_HP,
      hpMax: PLAYER_HP,
      bag: [{ item: "pokeball", count: 10 }],
      party: [this.makeMon(specKey, 5)],
      out: null,
      target: null,
    };
    record.x = 8;
    record.y = 12;
    this.save.characters[charName] = record;
    this.save.accounts[client.account].chars.push(charName);
    this.persist();
    this.send(client.ws, {
      t: "welcome",
      user: client.account,
      chars: this.save.accounts[client.account].chars.slice(),
    });
  }

  makeMon(species, level = 5) {
    const spec = SPECIES[species];
    return {
      uid: randomUUID(),
      species,
      name: spec.name,
      look: spec.look,
      level,
      hp: spec.hp,
      hpMax: spec.hp,
      ball: "charged",
    };
  }

  enter(client, { name }) {
    if (!client.account) return this.err(client, "Login first.");
    const charName = String(name || "");
    const rec = this.save.characters[charName];
    if (!rec || rec.account !== client.account) return this.err(client, "Unknown character.");
    if (this.findPlayerByName(charName)) this.forceLogoutName(charName);
    const player = {
      id: cid(),
      kind: "player",
      name: rec.name,
      x: rec.x,
      y: rec.y,
      z: rec.z,
      dir: rec.dir ?? DIR.S,
      hp: rec.hp,
      hpMax: rec.hpMax,
      look: "human",
      busyUntil: 0,
      targetId: null,
      charName,
      bag: rec.bag,
      party: rec.party,
      outSlot: rec.out,
      outId: null,
    };
    if (!walkable(player.x, player.y)) {
      player.x = 8;
      player.y = 12;
    }
    this.creatures.set(player.id, player);
    this.occupy(player);
    client.playerId = player.id;
    client.charName = charName;
    if (Number.isInteger(player.outSlot) && player.party[player.outSlot]) {
      this.releaseSlot(player, player.outSlot, true);
    }
    this.send(client.ws, {
      t: "map",
      map: {
        w: MAP.w,
        h: MAP.h,
        z: MAP.z,
        ground: MAP.ground,
        walls: MAP.walls,
        roofs: MAP.roofs,
      },
      you: this.publicCreature(player),
      creatures: [...this.creatures.values()].map((c) => this.publicCreature(c)),
      party: this.partyPayload(player),
      bag: player.bag,
    });
    this.broadcastArea({ t: "appear", creature: this.publicCreature(player) }, client.ws);
    if (player.outId) {
      const poke = this.creatures.get(player.outId);
      if (poke) this.broadcastArea({ t: "appear", creature: this.publicCreature(poke) }, client.ws);
    }
  }

  findPlayerByName(name) {
    for (const c of this.creatures.values()) {
      if (c.kind === "player" && c.charName === name) return c;
    }
    return null;
  }

  forceLogoutName(name) {
    for (const [ws, client] of this.clients) {
      if (client.charName === name) this.logoutPlayer(client, false);
    }
  }

  snapshotPlayer(player) {
    const rec = this.save.characters[player.charName];
    if (!rec) return;
    rec.x = player.x;
    rec.y = player.y;
    rec.z = player.z;
    rec.dir = player.dir;
    rec.hp = player.hp;
    rec.hpMax = player.hpMax;
    rec.bag = player.bag;
    rec.party = player.party;
    rec.out = player.outSlot;
    this.persist();
  }

  logoutPlayer(client, notify) {
    const player = this.creatures.get(client.playerId);
    if (player) {
      if (player.outId) {
        const poke = this.creatures.get(player.outId);
        if (poke) {
          const mon = player.party.find((p) => p && p.uid === poke.uid);
          if (mon) {
            mon.hp = poke.hp;
            mon.ball = "discharged";
          }
          this.vacate(poke);
          this.creatures.delete(poke.id);
          this.broadcastArea({ t: "disappear", id: poke.id });
        }
        player.outId = null;
      }
      this.snapshotPlayer(player);
      this.vacate(player);
      this.creatures.delete(player.id);
      this.broadcastArea({ t: "disappear", id: player.id });
    }
    client.playerId = null;
    client.charName = null;
    if (notify) this.send(client.ws, { t: "loggedOut" });
    this.flush();
  }

  publicCreature(c) {
    return {
      id: c.id,
      kind: c.kind,
      name: c.name,
      x: c.x,
      y: c.y,
      z: c.z,
      dir: c.dir,
      look: c.look,
      hp: c.hp,
      hpMax: c.hpMax,
      level: c.level || (c.kind === "player" ? 1 : 5),
      masterId: c.masterId || null,
      wild: !!c.wild,
      plate: c.kind === "player" ? c.name : `${c.name} [${c.level || 5}]`,
    };
  }

  partyPayload(player) {
    const slots = [];
    for (let i = 0; i < PARTY_CAP; i++) {
      const p = player.party[i];
      slots.push(
        p
          ? {
              slot: i,
              uid: p.uid,
              species: p.species,
              name: p.name,
              look: p.look,
              hp: p.hp,
              hpMax: p.hpMax,
              level: p.level,
              ball: i === player.outSlot ? "discharged" : p.ball || "charged",
            }
          : null
      );
    }
    return {
      slots,
      out: player.outSlot,
      count: player.party.filter(Boolean).length,
    };
  }

  syncParty(player) {
    const client = this.clientOf(player);
    if (client) this.send(client.ws, { t: "party", party: this.partyPayload(player), bag: player.bag });
  }

  now() {
    return Date.now();
  }

  walk(creature, dir, fromClient) {
    dir = Number(dir);
    if (!Number.isInteger(dir) || dir < 0 || dir > 7) return;
    const t = this.now();
    if (t < creature.busyUntil) return;
    creature.dir = dir;
    const d = DELTA[dir];
    const nx = creature.x + d.x;
    const ny = creature.y + d.y;
    if (!walkable(nx, ny) || this.occupant(nx, ny)) {
      this.broadcastArea({ t: "turn", id: creature.id, dir });
      if (creature.kind === "player") this.snapshotPlayer(creature);
      return;
    }
    this.vacate(creature);
    creature.x = nx;
    creature.y = ny;
    creature.busyUntil = t + STEP_MS;
    this.occupy(creature);
    this.broadcastArea({
      t: "moved",
      id: creature.id,
      x: creature.x,
      y: creature.y,
      dir,
      ms: STEP_MS,
    });
    if (creature.kind === "player") this.snapshotPlayer(creature);
  }

  turn(creature, dir) {
    dir = Number(dir);
    if (!Number.isInteger(dir) || dir < 0 || dir > 7) return;
    creature.dir = dir;
    this.broadcastArea({ t: "turn", id: creature.id, dir });
    if (creature.kind === "player") this.snapshotPlayer(creature);
  }

  look(player, x, y) {
    x = Number(x);
    y = Number(y);
    const who = this.occupant(x, y);
    let text;
    if (who) text = `You see ${who.kind === "player" ? who.name : `${who.name} [${who.level || 5}]`}.`;
    else text = `You see ${tileName(x, y)}.`;
    this.sys(player, text);
  }

  use(player, msg) {
    if (msg && msg.item === "pokeball") return this.catchBall(player);
    this.sys(player, "Nothing happens.");
  }

  say(player, text) {
    text = String(text || "").slice(0, 120);
    if (!text) return;
    const m = /^m(\d{1,2})$/i.exec(text.trim());
    if (m) return this.useMove(player, Number(m[1]));
    this.broadcastArea({ t: "say", id: player.id, name: player.name, text });
  }

  setTarget(player, id) {
    id = Number(id);
    if (id === player.id) {
      player.targetId = null;
      return;
    }
    const c = this.creatures.get(id);
    if (!c) {
      player.targetId = null;
      this.sys(player, "Você não tem um alvo.");
      return;
    }
    player.targetId = id;
    const client = this.clientOf(player);
    if (client) this.send(client.ws, { t: "target", id });
  }

  pokebar(player, slot) {
    slot = Number(slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= PARTY_CAP) return;
    const mon = player.party[slot];
    if (!mon) return;
    if (player.outSlot === slot) {
      this.goback(player, true);
      return;
    }
    if (player.outSlot != null) this.goback(player, true);
    this.releaseSlot(player, slot, false);
  }

  releaseSlot(player, slot, restoring) {
    const mon = player.party[slot];
    if (!mon) return;
    if (player.outId) this.goback(player, false);
    const pos = this.summonTile(player);
    if (!pos) {
      this.sys(player, "No space to release.");
      return;
    }
    const poke = {
      id: cid(),
      kind: "pokemon",
      name: mon.name,
      species: mon.species,
      look: mon.look,
      x: pos.x,
      y: pos.y,
      z: player.z,
      dir: player.dir,
      hp: mon.hp,
      hpMax: mon.hpMax,
      level: mon.level,
      masterId: player.id,
      busyUntil: 0,
      uid: mon.uid,
    };
    this.creatures.set(poke.id, poke);
    this.occupy(poke);
    player.outSlot = slot;
    player.outId = poke.id;
    mon.ball = "discharged";
    if (!restoring) this.broadcastArea({ t: "appear", creature: this.publicCreature(poke) });
    this.syncParty(player);
    this.snapshotPlayer(player);
    if (!restoring) this.sys(player, `Go, ${mon.name}!`);
  }

  goback(player, talk) {
    const poke = player.outId ? this.creatures.get(player.outId) : null;
    if (poke) {
      const mon = player.party.find((p) => p && p.uid === poke.uid);
      if (mon) {
        mon.hp = poke.hp;
        mon.ball = "charged";
      }
      this.vacate(poke);
      this.creatures.delete(poke.id);
      this.broadcastArea({ t: "disappear", id: poke.id });
    }
    if (talk && player.party[player.outSlot]) this.sys(player, `${player.party[player.outSlot].name}, come back!`);
    player.outId = null;
    player.outSlot = null;
    this.syncParty(player);
    this.snapshotPlayer(player);
  }

  summonTile(player) {
    const b = behind(player.x, player.y, player.dir);
    if (walkable(b.x, b.y) && !this.occupant(b.x, b.y)) return b;
    for (const d of DELTA) {
      const x = player.x + d.x;
      const y = player.y + d.y;
      if (walkable(x, y) && !this.occupant(x, y)) return { x, y };
    }
    return null;
  }

  outPokemon(player) {
    return player.outId ? this.creatures.get(player.outId) : null;
  }

  useMove(player, n) {
    if (n < 1 || n > 10) return;
    const poke = this.outPokemon(player);
    if (!poke) return;
    const spec = SPECIES[poke.species];
    const move = spec.moves[n - 1];
    if (!move) return;
    const target = player.targetId ? this.creatures.get(player.targetId) : null;
    if (!target || target.id === poke.id || target.id === player.id) {
      this.sys(player, "Você não tem um alvo.");
      return;
    }
    const dmg = move.power + randomInt(1, 5);
    target.hp = Math.max(0, (target.hp || 1) - dmg);
    this.broadcastArea({
      t: "fx",
      from: poke.id,
      to: target.id,
      move: move.name,
      dmg,
      hp: target.hp,
      hpMax: target.hpMax,
    });
    this.sys(player, `${poke.name} used ${move.name}!`);
    if (target.kind === "pokemon" && target.masterId) {
      const master = this.creatures.get(target.masterId);
      const mon = master?.party.find((p) => p && p.uid === target.uid);
      if (mon) mon.hp = target.hp;
      if (master) this.syncParty(master);
    }
    if (target.hp <= 0) this.defeat(target);
  }

  defeat(creature) {
    if (creature.kind === "wild") {
      this.vacate(creature);
      this.creatures.delete(creature.id);
      this.broadcastArea({ t: "disappear", id: creature.id });
      this.wildRespawnAt = this.now() + 8000;
    }
  }

  catchBall(player) {
    const balls = player.bag.find((i) => i.item === "pokeball");
    if (!balls || balls.count <= 0) return this.sys(player, "You have no Poké Balls.");
    const target = player.targetId ? this.creatures.get(player.targetId) : null;
    if (!target || !target.wild) return this.sys(player, "Você não tem um alvo.");
    if (player.party.filter(Boolean).length >= PARTY_CAP) return this.sys(player, "Party is full.");
    balls.count -= 1;
    const spec = SPECIES[target.species];
    const rate = spec.catchRate * BALL.rate;
    const roll = randomInt(1, 101);
    this.broadcastArea({ t: "catchAttempt", from: player.id, to: target.id });
    if (roll <= rate) {
      const mon = this.makeMon(target.species, target.level || 2);
      mon.hp = Math.max(1, target.hp);
      player.party.push(mon);
      this.vacate(target);
      this.creatures.delete(target.id);
      this.broadcastArea({ t: "disappear", id: target.id });
      player.targetId = null;
      this.sys(player, `Gotcha! ${mon.name} was caught.`);
      this.wildRespawnAt = this.now() + 8000;
    } else {
      this.sys(player, `${target.name} broke free!`);
    }
    this.syncParty(player);
    this.snapshotPlayer(player);
  }

  followStep(poke) {
    const master = this.creatures.get(poke.masterId);
    if (!master) return;
    let follow = master;
    if (master.targetId) {
      const t = this.creatures.get(master.targetId);
      if (t && t.id !== poke.id) follow = t;
    }
    const dest = behind(follow.x, follow.y, follow.dir);
    if (poke.x === dest.x && poke.y === dest.y) {
      poke.dir = follow.dir;
      return;
    }
    const dir = this.greedyDir(poke.x, poke.y, dest.x, dest.y, poke.id);
    if (dir == null) return;
    this.walk(poke, dir, false);
  }

  greedyDir(x, y, tx, ty, selfId) {
    const opts = [];
    for (let dir = 0; dir < 8; dir++) {
      const nx = x + DELTA[dir].x;
      const ny = y + DELTA[dir].y;
      if (!walkable(nx, ny)) continue;
      const occ = this.occupant(nx, ny);
      if (occ && occ.id !== selfId) continue;
      const dist = Math.max(Math.abs(tx - nx), Math.abs(ty - ny));
      const cur = Math.max(Math.abs(tx - x), Math.abs(ty - y));
      if (dist <= cur) opts.push({ dir, dist, diag: dir % 2 });
    }
    opts.sort((a, b) => a.dist - b.dist || a.diag - b.diag);
    return opts.length ? opts[0].dir : null;
  }

  ensureWild() {
    const existing = [...this.creatures.values()].filter((c) => c.wild).length;
    const want = 2;
    for (let i = existing; i < want; i++) this.spawnWild();
  }

  spawnWild() {
    const spots = MAP.wildSpawns.filter((s) => walkable(s.x, s.y) && !this.occupant(s.x, s.y));
    if (!spots.length) return;
    const spot = spots[randomInt(0, spots.length)];
    const spec = SPECIES.caterpie;
    const wild = {
      id: cid(),
      kind: "wild",
      wild: true,
      species: "caterpie",
      name: spec.name,
      look: spec.look,
      x: spot.x,
      y: spot.y,
      z: MAP.z,
      dir: DIR.S,
      hp: spec.hp,
      hpMax: spec.hp,
      level: 2,
      busyUntil: 0,
    };
    this.creatures.set(wild.id, wild);
    this.occupy(wild);
    this.broadcastArea({ t: "appear", creature: this.publicCreature(wild) });
  }

  tickWildWander() {
    for (const c of this.creatures.values()) {
      if (!c.wild || this.now() < c.busyUntil) continue;
      if (randomInt(0, 5) !== 0) continue;
      this.walk(c, randomInt(0, 8), false);
    }
  }

  tick() {
    const t = this.now();
    for (const c of this.creatures.values()) {
      if (c.kind === "pokemon" && c.masterId && t >= c.busyUntil) this.followStep(c);
    }
    this.tickWildWander();
    if (this.wildRespawnAt && t >= this.wildRespawnAt) {
      this.wildRespawnAt = 0;
      this.ensureWild();
    }
    this.flush();
  }
}
