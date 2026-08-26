import { randomInt, randomUUID } from "node:crypto";
import {
  ATK_MS,
  BALL,
  DELTA,
  DIR,
  PARTY_CAP,
  PLAYER_HP,
  SPECIES,
  STARTERS,
  STEP_MS,
  applyRubyHealth,
  behind,
} from "./species.js";
import { MAP, WILD_GROUPS, hasRoof, inBounds, tileName, walkable } from "./map.js";
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
    this.ensureDemoAccount();
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
      if (t === "walkTo") return this.setWalkTo(player, msg.x, msg.y);
      if (t === "turn") return this.turn(player, msg.dir);
      if (t === "look") return this.look(player, msg.x, msg.y);
      if (t === "use") return this.use(player, msg);
      if (t === "say") return this.say(player, msg.text);
      if (t === "logout") return this.logoutPlayer(client, true);
      if (t === "pokebar") return this.pokebar(player, msg.slot);
      if (t === "partyOrder") return this.partyOrder(player, msg);
      if (t === "hud") return this.saveHud(player, msg);
      if (t === "catch") return this.catchBall(player);
      if (t === "target") return this.setTarget(player, msg.id);
      if (t === "attack") return this.attack(player, msg.id);
      if (t === "move") return this.useMove(player, Number(msg.n));
      if (t === "order") return this.order(player, msg);
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
      bag: [{ item: "pokeball", count: 20 }],
      party: [this.makeMon(specKey, 5)],
      out: null,
      target: null,
      mount: null,
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

  makeMon(species, level = 5, opts = {}) {
    const spec = SPECIES[species];
    const mon = {
      uid: opts.uid || randomUUID(),
      species,
      name: spec.name,
      look: spec.look,
      gender: opts.gender || (randomInt(0, 2) ? "m" : "f"),
      level,
      baseHp: spec.baseStats.hp,
      baseStats: { ...spec.baseStats },
      ball: opts.ball || "charged",
    };
    applyRubyHealth(mon);
    if (opts.hp != null) mon.hp = Math.max(0, Math.min(opts.hp, mon.hpMax));
    return mon;
  }

  ensureMon(mon) {
    if (!mon) return mon;
    const spec = SPECIES[mon.species];
    if (!spec) return mon;
    mon.look = spec.look;
    mon.name = spec.name;
    mon.baseStats = { ...spec.baseStats };
    mon.baseHp = spec.baseStats.hp;
    delete mon.ivs;
    delete mon.evs;
    applyRubyHealth(mon);
    return mon;
  }

  ensureDemoAccount() {
    if (!this.save.accounts.demo) this.save.accounts.demo = { password: "demo", chars: [] };
    const acc = this.save.accounts.demo;
    acc.password = "demo";
    let name = acc.chars.find((n) => this.save.characters[n]?.account === "demo") || acc.chars[0] || "Demo";
    if (!acc.chars.includes(name)) acc.chars.unshift(name);
    let rec = this.save.characters[name];
    if (!rec || rec.account !== "demo") {
      rec = {
        name,
        account: "demo",
        x: 8,
        y: 12,
        z: MAP.z,
        dir: DIR.S,
        hp: PLAYER_HP,
        hpMax: PLAYER_HP,
        bag: [{ item: "pokeball", count: 20 }],
        party: [],
        out: 0,
        target: null,
      };
    }
    rec.bag = [{ item: "pokeball", count: 20 }];
    const party = (rec.party || []).filter(Boolean).map((p) => this.ensureMon(p));
    if (!party.some((p) => p.species === "charizard")) party.unshift(this.makeMon("charizard", 36));
    if (!party.some((p) => p.species === "rapidash")) {
      const at = party[0]?.species === "charizard" ? 1 : 0;
      party.splice(at, 0, this.makeMon("rapidash", 40));
    }
    rec.party = party.slice(0, PARTY_CAP);
    rec.out = rec.party.findIndex((p) => p?.species === "charizard");
    if (rec.out < 0) rec.out = 0;
    rec.mount = null;
    if (!walkable(rec.x, rec.y)) {
      rec.x = 8;
      rec.y = 12;
    }
    this.save.characters[name] = rec;
    this.persist();
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
      look: 128,
      busyUntil: 0,
      targetId: null,
      walkTo: null,
      mount: null,
      charName,
      bag: rec.bag,
      party: (rec.party || []).map((p) => this.ensureMon(p)),
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
    player.hud = rec.hud || null;
    this.snapshotPlayer(player);
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
        items: MAP.items,
      },
      you: this.publicCreature(player),
      creatures: [...this.creatures.values()].map((c) => this.publicCreature(c)),
      party: this.partyPayload(player),
      bag: player.bag,
      hud: player.hud || rec.hud || null,
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
    rec.hud = player.hud || rec.hud;
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
      species: c.species || null,
      hp: c.hp,
      hpMax: c.hpMax,
      level: c.level || (c.kind === "player" ? 1 : 5),
      masterId: c.masterId || null,
      wild: !!c.wild,
      plate: c.kind === "player" ? c.name : `${c.name} [${c.level || 5}]`,
      dead: !!c.dead,
      mount: c.mount
        ? { ability: c.mount.ability, species: c.mount.species, look: c.mount.look }
        : null,
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
              gender: p.gender || (String(p.uid || "a").charCodeAt(0) % 2 ? "m" : "f"),
              ball: i === player.outSlot ? "discharged" : p.ball || "charged",
            }
          : null
      );
    }
    return {
      slots,
      out: player.outSlot,
      count: player.party.filter(Boolean).length,
      mount: player.mount
        ? {
            ability: player.mount.ability,
            species: player.mount.species,
            look: player.mount.look,
            slot: player.mount.slot,
          }
        : null,
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
    if (fromClient && creature.kind === "player") creature.walkTo = null;
    if (creature.dead) return;
    const t = this.now();
    if (t < creature.busyUntil) return;
    creature.dir = dir;
    const d = DELTA[dir];
    const nx = creature.x + d.x;
    const ny = creature.y + d.y;
    if (!walkable(nx, ny, { surf: creature.mount?.ability === "surf" }) || this.occupant(nx, ny)) {
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
    const who = this.occupant(x, y) || this.corpseAt(x, y);
    let text;
    if (who) {
      if (who.kind === "player") text = `You see ${who.name}.`;
      else if (who.dead) text = `Você vê o corpo de um ${who.name}.`;
      else text = `You see ${who.name} [${who.level || 5}]. Health: ${who.hp} / ${who.hpMax}.`;
    } else text = `You see ${tileName(x, y)}.`;
    this.sys(player, text);
  }

  use(player, msg) {
    if (msg && msg.item === "pokeball") {
      if (msg.id != null) {
        const id = Number(msg.id);
        if (this.creatures.has(id)) player.targetId = id;
      }
      return this.catchBall(player);
    }
    this.sys(player, "Nada acontece.");
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
    if (client) this.send(client.ws, { t: "target", id, plate: c.plate || `${c.name} [${c.level || 5}]`, name: c.name });
  }

  attack(player, id) {
    id = Number(id);
    const c = this.creatures.get(id);
    if (!c || c.id === player.id) {
      this.sys(player, "Você não tem um alvo.");
      return;
    }
    player.targetId = id;
    const client = this.clientOf(player);
    if (client) this.send(client.ws, { t: "target", id, plate: c.plate || `${c.name} [${c.level || 5}]`, name: c.name });
    if (!c.wild || c.dead) return;
    this.useMove(player, 1);
  }

  setWalkTo(player, x, y) {
    x = Number(x);
    y = Number(y);
    if (!inBounds(x, y)) return;
    player.walkTo = { x, y };
  }

  tickClickWalk() {
    for (const c of this.creatures.values()) {
      if (c.kind !== "player" || !c.walkTo) continue;
      if (this.now() < c.busyUntil) continue;
      const { x, y } = c.walkTo;
      if (c.x === x && c.y === y) {
        c.walkTo = null;
        continue;
      }
      const destOcc = this.occupant(x, y);
      const dist = Math.max(Math.abs(x - c.x), Math.abs(y - c.y));
      if (destOcc && dist <= 1) {
        c.walkTo = null;
        continue;
      }
      const dir = this.greedyDir(c.x, c.y, x, y, c.id);
      if (dir == null) {
        c.walkTo = null;
        continue;
      }
      this.walk(c, dir, false);
    }
  }

  pokebar(player, slot) {
    slot = Number(slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= PARTY_CAP) return;
    if (player.mount) {
      const mounted = player.mount.slot;
      this.dismount(player);
      if (slot === mounted) return;
    }
    const mon = player.party[slot];
    if (!mon) return;
    if (player.outSlot === slot) {
      this.goback(player, true);
      return;
    }
    if (player.outSlot != null) this.goback(player, true);
    this.releaseSlot(player, slot, false);
  }

  saveHud(player, msg) {
    if (!msg?.layout || typeof msg.layout !== "object") return;
    player.hud = msg.layout;
    this.snapshotPlayer(player);
  }

  partyOrder(player, { from, to }) {
    from = Number(from);
    to = Number(to);
    if (!Number.isInteger(from) || !Number.isInteger(to)) return;
    if (from < 0 || to < 0 || from >= PARTY_CAP || to >= PARTY_CAP || from === to) return;
    const party = player.party.slice();
    while (party.length < PARTY_CAP) party.push(null);
    const [mon] = party.splice(from, 1);
    party.splice(to, 0, mon);
    player.party = party.slice(0, PARTY_CAP);
    if (player.outSlot === from) player.outSlot = to;
    else if (player.outSlot != null) {
      if (from < player.outSlot && to >= player.outSlot) player.outSlot -= 1;
      else if (from > player.outSlot && to <= player.outSlot) player.outSlot += 1;
    }
    if (player.mount?.slot === from) player.mount.slot = to;
    else if (player.mount?.slot != null) {
      if (from < player.mount.slot && to >= player.mount.slot) player.mount.slot -= 1;
      else if (from > player.mount.slot && to <= player.mount.slot) player.mount.slot += 1;
    }
    this.syncParty(player);
    this.snapshotPlayer(player);
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
      baseHp: mon.baseHp,
      baseStats: mon.baseStats,
      ivs: mon.ivs,
      evs: mon.evs,
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

  order(player, msg) {
    const ability = String(msg.ability || "").toLowerCase();
    if (!["fly", "hide", "ride", "surf"].includes(ability)) return;
    if (player.mount?.ability === ability) {
      this.dismount(player);
      return;
    }
    const slot = this.findAbilitySlot(player, ability);
    if (slot == null) {
      this.sys(player, "Nenhum Pokémon com essa habilidade.");
      return;
    }
    this.mount(player, slot, ability);
  }

  findAbilitySlot(player, ability) {
    if (player.mount && SPECIES[player.mount.species]?.abilities?.includes(ability)) {
      return player.mount.slot;
    }
    if (player.outSlot != null) {
      const mon = player.party[player.outSlot];
      if (mon && SPECIES[mon.species]?.abilities?.includes(ability)) return player.outSlot;
    }
    return null;
  }

  mount(player, slot, ability) {
    const mon = player.party[slot];
    const spec = mon ? SPECIES[mon.species] : null;
    if (!mon || !spec?.abilities?.includes(ability)) {
      this.sys(player, "Nenhum Pokémon com essa habilidade.");
      return;
    }
    if (player.outId) this.goback(player, false);
    if (player.mount) {
      player.mount = null;
      player.look = 128;
    }
    player.mount = {
      ability,
      species: mon.species,
      look: spec.look,
      uid: mon.uid,
      slot,
    };
    player.look = spec.look;
    this.broadcastArea({ t: "outfit", creature: this.publicCreature(player) });
    this.syncParty(player);
    this.snapshotPlayer(player);
    const label = ability === "fly" ? "Fly" : ability === "ride" ? "Ride" : ability === "hide" ? "Hide" : "Surf";
    this.sys(player, `${label}!`);
  }

  dismount(player) {
    const mount = player.mount;
    player.mount = null;
    player.look = 128;
    this.broadcastArea({ t: "outfit", creature: this.publicCreature(player) });
    this.syncParty(player);
    this.snapshotPlayer(player);
    if (mount && Number.isInteger(mount.slot) && player.party[mount.slot]) {
      this.releaseSlot(player, mount.slot, false);
    }
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
    if (!poke) {
      this.sys(player, "Você precisa ter um Pokémon fora.");
      return;
    }
    const spec = SPECIES[poke.species];
    const move = spec.moves[n - 1];
    if (!move) return;
    const target = player.targetId ? this.creatures.get(player.targetId) : null;
    if (!target || target.id === poke.id || target.id === player.id) {
      this.sys(player, "Você não tem um alvo.");
      return;
    }
    if (target.dead) {
      this.sys(player, "Esse Pokémon já foi derrotado.");
      return;
    }
    const t = this.now();
    if (t < (player.atkBusyUntil || 0) || t < (poke.atkBusyUntil || 0)) return;
    player.atkBusyUntil = t + ATK_MS;
    poke.atkBusyUntil = t + ATK_MS;
    const dmg = Math.max(2, Math.floor(move.power / 5) + randomInt(1, 3));
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
    this.sys(player, `Seu ${poke.name} causou ${dmg} de dano em um ${target.name}.`);
    if (target.kind === "pokemon" && target.masterId) {
      const master = this.creatures.get(target.masterId);
      const mon = master?.party.find((p) => p && p.uid === target.uid);
      if (mon) mon.hp = target.hp;
      if (master) this.syncParty(master);
    }
    if (target.hp <= 0) {
      this.defeat(target);
      return;
    }
    if (target.wild) this.wildRetaliate(target, poke);
  }

  wildRetaliate(wild, poke) {
    if (!wild?.wild || wild.dead || !poke || poke.hp <= 0) return;
    const dmg = Math.max(1, randomInt(1, 3));
    poke.hp = Math.max(0, poke.hp - dmg);
    this.broadcastArea({
      t: "fx",
      from: wild.id,
      to: poke.id,
      move: "Tackle",
      dmg,
      hp: poke.hp,
      hpMax: poke.hpMax,
      retaliate: true,
    });
    const master = this.creatures.get(poke.masterId);
    if (!master) return;
    this.sys(master, `Um ${wild.name} causou ${dmg} de dano em seu ${poke.name}.`);
    const mon = master.party.find((p) => p && p.uid === poke.uid);
    if (mon) mon.hp = poke.hp;
    this.syncParty(master);
    if (poke.hp <= 0) {
      this.sys(master, `${poke.name} foi nocauteado!`);
      this.goback(master, false);
    }
  }

  flee(creature) {
    if (!creature.wild) return;
    this.vacate(creature);
    this.creatures.delete(creature.id);
    this.broadcastArea({ t: "disappear", id: creature.id });
    this.wildRespawnAt = this.now() + 8000;
    for (const c of this.creatures.values()) {
      if (c.kind === "player" && c.targetId === creature.id) c.targetId = null;
    }
  }

  defeat(creature) {
    if (!creature.wild) return;
    creature.dead = true;
    creature.hp = 0;
    creature.busyUntil = this.now() + 1e12;
    this.vacate(creature);
    this.broadcastArea({ t: "down", id: creature.id, x: creature.x, y: creature.y });
  }

  removeCorpse(creature) {
    if (!creature) return;
    this.vacate(creature);
    this.creatures.delete(creature.id);
    this.broadcastArea({ t: "disappear", id: creature.id });
    for (const c of this.creatures.values()) {
      if (c.kind === "player" && c.targetId === creature.id) c.targetId = null;
    }
    this.ensureWild();
  }

  catchBall(player) {
    const balls = player.bag.find((i) => i.item === "pokeball");
    if (!balls || balls.count <= 0) return this.sys(player, "Você não tem Pokébolas.");
    const target = player.targetId ? this.creatures.get(player.targetId) : null;
    if (!target || !target.wild) return this.sys(player, "Você não tem um alvo.");
    if (!target.dead) return this.sys(player, "O Pokémon ainda está vivo.");
    if (player.party.filter(Boolean).length >= PARTY_CAP) return this.sys(player, "A party está cheia.");
    balls.count -= 1;
    const spec = SPECIES[target.species];
    const rate = spec.catchRate * BALL.rate;
    const roll = randomInt(1, 101);
    this.broadcastArea({ t: "catchAttempt", from: player.id, to: target.id });
    if (roll <= rate) {
      const mon = this.makeMon(target.species, target.level || 2);
      let placed = false;
      for (let i = 0; i < PARTY_CAP; i++) {
        if (!player.party[i]) {
          player.party[i] = mon;
          placed = true;
          break;
        }
      }
      if (!placed) player.party.push(mon);
      this.sys(player, "Catch successful");
      this.removeCorpse(target);
      player.targetId = null;
    } else {
      this.sys(player, `${target.name} escapou!`);
      this.removeCorpse(target);
      player.targetId = null;
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
      if (t && t.id !== poke.id && !t.dead) follow = t;
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
      if (!walkable(nx, ny, { surf: false })) continue;
      const occ = this.occupant(nx, ny);
      if (occ && occ.id !== selfId) continue;
      const dist = Math.max(Math.abs(tx - nx), Math.abs(ty - ny));
      const cur = Math.max(Math.abs(tx - x), Math.abs(ty - y));
      if (dist <= cur) opts.push({ dir, dist, diag: dir % 2 });
    }
    opts.sort((a, b) => a.dist - b.dist || a.diag - b.diag);
    return opts.length ? opts[0].dir : null;
  }

  corpseAt(x, y) {
    for (const c of this.creatures.values()) {
      if (c.dead && c.x === x && c.y === y) return c;
    }
    return null;
  }

  ensureWild() {
    for (const group of WILD_GROUPS) {
      const living = [...this.creatures.values()].filter(
        (c) => c.wild && !c.dead && c.species === group.species
      ).length;
      for (let i = living; i < group.want; i++) this.spawnWild(group.species, group.spots);
    }
  }

  spawnWild(species = "caterpie", spots = MAP.wildSpawns) {
    const spec = SPECIES[species];
    if (!spec) return;
    const free = (spots || MAP.wildSpawns).filter((s) => walkable(s.x, s.y) && !this.occupant(s.x, s.y));
    if (!free.length) return;
    const spot = free[randomInt(0, free.length)];
    const catHp = this.makeMon("caterpie", 2);
    const wild = {
      id: cid(),
      kind: "wild",
      wild: true,
      species,
      name: spec.name,
      look: spec.look,
      x: spot.x,
      y: spot.y,
      z: MAP.z,
      dir: DIR.S,
      hp: catHp.hp,
      hpMax: catHp.hpMax,
      level: 2,
      baseHp: SPECIES.caterpie.baseStats.hp,
      baseStats: { ...SPECIES.caterpie.baseStats },
      busyUntil: 0,
    };
    this.creatures.set(wild.id, wild);
    this.occupy(wild);
    this.broadcastArea({ t: "appear", creature: this.publicCreature(wild) });
  }

  tickWildWander() {
    for (const c of this.creatures.values()) {
      if (!c.wild || c.dead || this.now() < c.busyUntil) continue;
      if (randomInt(0, 5) !== 0) continue;
      this.walk(c, randomInt(0, 8), false);
    }
  }

  tick() {
    const t = this.now();
    this.tickClickWalk();
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
