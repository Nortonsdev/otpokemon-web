# OTPokemon Web

Brand-new browser Pokémon MMORPG milestone. **Looks and plays like Tibia/Huntera from above** (32px sqm grid, outfit + Pokémon looktypes, window frames), with Ruby Pokémon systems. The **Node server owns game truth** (walk, follow, catch, login, persistence). The Phaser 3 client only renders and sends intents — it never teleports the local player.

Tiles, citizen looktype 128, and UI frames come from the public Huntera catalog. Pokémon looks are exported from official `Ruby.dat` / `Ruby.spr` (looktypes 1, 4, 7, 10). This is not a clone or port of Huntera, Ruby Client, or OTClient.

## Run

```bash
npm install
npm start
```

Open [http://localhost:5173](http://localhost:5173).

Default account: **demo** / **demo** (create a character on first login).

The account screens sit on the live top-down map, Huntera-style (`#111` chrome, `frame-window` / `frame-button` / `frame-slot` / `frame-bar`).

## Play

1. Login or register, create a character, pick **Bulbasaur / Charmander / Squirtle**.
2. Walk with **WASD** / arrows (diagonals: two keys) or **left-click** a tile. You always steer the human — there is no idle auto-hunt. Movement is server-synced. Human uses 8 directions and a 3-frame Citizen 128 outfit; Pokémon use 4-dir 32×32 Ruby looks.
3. Click a party slot to **release**. Click the same slot to **recall**. Click another occupied slot to swap (recall then release). Never two Pokémon out. The out Pokémon follows on the tiles behind you. Nameplates are green `Nome [level]` with an HP bar under the name.
4. **Right-click** a wild (Caterpie) to put a **red square** on its tile and fire M1. Left-click walks, never attacks. Nothing out → `Você precisa ter um Pokémon fora.` No target → `Você não tem um alvo.`
5. With a Pokémon out, **M1–M10** (keys **1–0**, HUD clicks, or `m1` in chat) are that Pokémon’s moves. No out → moves do not fire. No target → `Você não tem um alvo.`
6. Close the tab and log in again: same tile, same party, same Pokémon out.

Layers: ground, item (flowers / gold), creature, wall, roof (roof dims when you walk under). No map/item/sprite editor on the play screen.

## Protocol

JSON over WebSocket `/ws`: `login`, `register`, `create`, `enter`, `walk`, `walkTo`, `turn`, `look`, `use`, `say`, `logout`, `pokebar`, `catch`, `target`, `attack`, `move`.

## Assets

- Pokémon sheets: `tools/extract_ruby_sprites.py` (Ruby.spr Alpha-RLE, DAT frame-groups).
- Huntera grass/path/stone/wall/roof + flowers/gold + citizen looktype 128: `tools/extract_huntera.py`.
- UI frames: `client/public/assets/ui/frames/` (Huntera `frame-window`, `frame-button`, `frame-slot`, `frame-bar`).
- HUD chrome from [rubyclient `data/images/game/pokemon`](https://github.com/OLDtherubyproject/rubyclient/tree/master/data/images/game/pokemon).

Species (Kanto XML base stats; creature max HP is Ruby `Pokemon::getMaxHealth`, not the raw XML HP):

| Pokémon    | number | look | types        | base HP | catchRate | moves            |
|------------|--------|------|--------------|---------|-----------|------------------|
| Bulbasaur  | 1      | 1    | grass/poison | 45      | 10        | Vine Whip, Spore |
| Charmander | 4      | 4    | fire         | 39      | 50        | Scratch (melee)  |
| Squirtle   | 7      | 7    | water        | 44      | 50        | Water Gun        |
| Caterpie   | 10     | 10   | bug          | 45      | 50        | Tackle           |

Max HP: `hpMax = max(1, ((2*baseHp + ivHp + ivHp + floor(evHp/30)) * level)/100 + level + 10)`. IVs are 1–31 on spawn; wild EVs are 0. A level-5 Charmander is 19–22 HP, a level-2 Caterpie is 13–15. Nameplates show `Nome [level]` plus an HP bar on wilds and the Pokémon that is out. Caterpie flees at 15% HP.

Poké Ball rate = 1. Catch succeeds if `rand(1,100) <= species.catchRate * ball.rate`. Party cap 6.

## Layout

- `server/` authoritative world, SQLite-free JSON persist in `server/data/save.json`
- `client/` Vite + Phaser 3 (ground, item, creature, wall, roof layers; top-down sqm camera)
- `client/public/assets/` committed PNG sheets, Huntera frames, and HUD
