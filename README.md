# OTPokemon Web

Brand-new browser Pokémon MMORPG milestone. The **Node server owns game truth** (walk, follow, catch, login, persistence). The Phaser 3 client only renders and sends intents — it never teleports the local player.

Tiles and the human trainer come from the public Huntera catalog. Pokémon looks are exported from official `Ruby.dat` / `Ruby.spr` (looktypes 1, 4, 7, 10). This is not a clone or port of Huntera, Ruby Client, or OTClient.

## Run

```bash
npm install
npm start
```

Open [http://localhost:5173](http://localhost:5173).

Default account: **demo** / **demo** (create a character on first login).

## Play

1. Login or register, create a character, pick **Bulbasaur / Charmander / Squirtle**.
2. Walk with **WASD** / arrows (diagonals: two keys) or **left-click** a tile (Tibia-style). Movement is server-synced.
3. Click a party slot to **release**. Click the same slot to **recall**. Click another occupied slot to swap (recall then release). Never two Pokémon out.
4. **Right-click** a wild (Caterpie) to target it and attack. The out Pokémon uses M1 / melee. Left-click never attacks. Nothing out → no player punch; target is still set so **C** / `catch` works.
5. With a Pokémon out, **M1–M10** are that Pokémon’s moves (`m1`… in chat also works). No out → moves do not fire. No target → `Você não tem um alvo.`
6. Close the tab and log in again: same tile, same party, same Pokémon out.

## Protocol

JSON over WebSocket `/ws`: `login`, `register`, `create`, `enter`, `walk`, `walkTo`, `turn`, `look`, `use`, `say`, `logout`, `pokebar`, `catch`, `target`, `attack`.

## Assets

- Pokémon sheets: `tools/extract_ruby_sprites.py` (Ruby.spr Alpha-RLE, DAT frame-groups).
- Huntera grass/path/wall/roof + citizen looktype 128: `tools/extract_huntera.py`.
- HUD chrome from [rubyclient `data/images/game/pokemon`](https://github.com/OLDtherubyproject/rubyclient/tree/master/data/images/game/pokemon).

Species (Kanto XML values used by the server):

| Pokémon   | number | look | types        | HP | catchRate | moves              |
|-----------|--------|------|--------------|----|-----------|--------------------|
| Bulbasaur | 1      | 1    | grass/poison | 45 | 10        | Vine Whip, Spore   |
| Charmander| 4      | 4    | fire         | 39 | 50        | Scratch (melee)    |
| Squirtle  | 7      | 7    | water        | 44 | 50        | Water Gun          |
| Caterpie  | 10     | 10   | bug          | 45 | 50        | Tackle             |

Poké Ball rate = 1. Catch succeeds if `rand(1,100) <= species.catchRate * ball.rate`. Party cap 6.

## Layout

- `server/` authoritative world, SQLite-free JSON persist in `server/data/save.json`
- `client/` Vite + Phaser 3 (ground, wall, creature, roof layers)
- `client/public/assets/` committed PNG sheets and HUD
