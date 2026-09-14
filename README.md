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
3. Click a **Lista de Pokemon** row (left pokebar) to **release**. Click the same row to **recall**. Click another occupied row to swap (recall then release). Never two Pokémon out. Wrench on the header (hover) reorders the six slots. The out Pokémon follows on the tiles behind you. Nameplates are green `Nome [level]` with an HP bar under the name.
4. **Right-click** a wild (Caterpie) to put a **red circle** on it and fire M1. Left-click walks, never attacks. Nothing out → `Você precisa ter um Pokémon fora.` No target → `Você não tem um alvo.` Damage logs `Seu Charmander causou N de dano em um Caterpie.`
5. With a Pokémon out, **M1–M10** (keys **1–0**, HUD clicks, or `m1` in chat) are that Pokémon’s moves. No out → moves do not fire. No target → `Você não tem um alvo.`
6. Close the tab and log in again: same tile, same party, same Pokémon out.

Layers: ground, item (flowers / gold), creature, wall, roof (roof dims when you walk under). O editor de mapas fica em **`/editor.html`** (tela de login tem o link).

## Editor de mapas (OTBM + Remere)

O mapa canónico é **sempre** um `.otbm` (formato de árvore binária do [Remere's Map Editor](https://github.com/hampusborgos/rme) / [YATME](https://github.com/knobik/yatme)). O editor em `/editor.html` lê e grava esse ficheiro; o servidor converte tiles para o payload Phaser.

### Remere ↔ OTPokemon

Use **a mesma versão** de `Tibia.dat` + `Tibia.spr` (e o `items.otb` gerado para ela) no Remere desktop e, se quiser a paleta completa, no upload DAT/SPR do editor web. Os IDs no OTBM são os IDs desse DAT — misturar versões troca sprites e flags.

| Direção | Como |
|---------|------|
| Remere → editor web | Save `.otbm` no RME → **Abrir OTBM** |
| Editor web → Remere | **Salvar OTBM** (`map.otbm`, descrição `Saved with YATME`) → abrir no RME com o mesmo DAT/SPR |
| Editor web → jogo | **Aplicar no jogo** = `POST /api/map` com `x-map-filename: world.otbm` |
| Remere → jogo (local) | Copiar para `server/data/world.otbm` e reiniciar `npm start` |

Sem DAT/SPR o editor pinta com os PNGs em `client/public/assets/tiles/` (grass `106`, path `351`, water `4597`, wall `2200`, … — ver `shared/editor/tileCatalog.ts`). Esses IDs coincidem com o extract Huntera já no repo; **não** commite packs Tibia/Huntera.

Happy path: **Novo → pintar (brush/fill) → Salvar OTBM → Abrir o mesmo ficheiro (mapa idêntico) → Aplicar no jogo → login demo/demo e entrar** — o mundo Phaser usa os mesmos tiles.

Atalhos: `B` brush, `E` apagar, `F` preencher, `M` selecionar, `H`/espaço pan, `Ctrl+Z`/`Y` undo/redo, `Ctrl+S` salvar, `Ctrl+O` abrir.

Detalhes, versões OTBM e módulos: [docs/EDITOR.md](docs/EDITOR.md).

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

## Deploy (Vercel)

This is a Vite static client plus a Node WebSocket world on Vercel Fluid Compute.

```bash
npx vercel --prod
```

Or import the GitHub repo in the Vercel dashboard (root `.`, build `npm run build`, output `dist`). `vercel.json` rewrites `/ws`, `/health`, and `/api/map` onto **`api/ws.js`** (one Fluid Function, so apply-map and the Phaser world share the same `world.otbm`). That function imports **`api/_lib/server.bundle.js`** — a committed esbuild of `server/` + `shared/` with **no TypeScript at runtime**. `npm run build` regenerates the bundle. Do not put the bundle at `api/server.bundle.js`: Vercel would treat it as its own function route (that URL used to 404). See **[docs/VERCEL_API.md](docs/VERCEL_API.md)**.

Limits of this host: the world is in-memory on one Function instance. Connections drop at the plan `maxDuration` (Hobby default 300s; anonymous/temp deploys cap at 60s) and the client reconnects. A reconnect may land on a new instance, so `/tmp` saves are demo-quality, not a durable MMORPG backend.

Anonymous `vercel deploy --temporary` URLs expire unless you [claim the deployment](https://vercel.com/docs/deployments/claim-deployments). For a lasting project, log in with `vercel login` or import this GitHub repo in the Vercel dashboard.

Default account after a cold start: **demo** / **demo**.

## Layout

- `server/` authoritative world, JSON persist in `server/data/save.json` (or `/tmp/otpokemon` on Vercel)
- `shared/editor/` OTBM IO, tile catalog, runtime conversion, brushes
- `client/src/editor/` canvas renderer, palette, YATME-style UI
- `client/` Vite + Phaser 3 (ground, item, creature, wall, roof layers; top-down sqm camera)
- `client/public/assets/` committed PNG sheets, Huntera frames, and HUD
- `api/ws.js` Vercel Function that serves WebSocket **and** `/api/map` (bundle: `api/_lib/server.bundle.js`)
