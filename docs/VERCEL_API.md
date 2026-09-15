# Vercel API routes (OTPokemon)

The game world and the map editor share **one** Vercel Fluid Function so `POST /api/map` and the Phaser WebSocket see the same `/tmp` `world.otbm`.

## Public HTTP

| Method | URL | What it does |
|--------|-----|----------------|
| GET | `/health` | `{ ok: true }` (rewrite → `/api/ws`) |
| GET/WS | `/ws` | Game WebSocket (rewrite → `/api/ws`) |
| GET | `/api/map` | Download active `world.otbm` |
| POST | `/api/map` | Apply map. Body = OTBM bytes. Header `x-map-filename: world.otbm`. `Content-Type: application/octet-stream` |
| GET | `/api/map/json` | Runtime JSON (small maps include `cells`) |
| GET | `/api/server.bundle.js` | JSON **probe only** — not the Node bundle |

Do **not** import TypeScript from a Vercel function. `api/ws.js` loads `api/_lib/server.bundle.js` (esbuild of `server/` + `shared/`, `ws` left external).

## Why `/api/server.bundle.js` used to 404

Vercel treats every `api/*.js` file as a Serverless/Fluid function. The real esbuild output used to live at `api/server.bundle.js`, so `GET /api/server.bundle.js` invoked that file as a function. The HTTP server did not handle that path → **404**.

The bundle now lives at **`api/_lib/server.bundle.js`** (`_lib` is not a public route). `vercel.json` `includeFiles` packs it into `api/ws.js`. `GET /api/server.bundle.js` is a tiny JSON probe.

## Why `/api/map` is rewritten to `/api/ws`

A second function file (`api/map.js`) would be a **separate isolate**. Apply-map would write `world.otbm` in one `/tmp` and the game WebSocket would read another. So:

```
/api/map  →  /api/ws?otpMap=1   (same Fluid function)
```

`resolveMapPath()` also honors `x-forwarded-uri` / `x-vercel-original-path` if the query string is dropped.

## Local

```bash
npm start          # Vite :5173 proxies /ws and /api/map → :3001
npm run build      # vite build && node tools/bundle-api.mjs
npm test           # OTBM roundtrip + bundle HTTP smoke
```

Editor: `/editor.html` → FILE → Aplicar no jogo → `POST /api/map`.
