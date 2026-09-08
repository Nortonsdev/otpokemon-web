# pokétibia — Fase 0

Esqueleto mínimo: **Vite + TypeScript + Canvas 2D + game loop**.

Sem mapa, combate, party, items, login ou backend. Só roda.

## Estrutura

```
poketibia/
├── public/assets/     # sprites, items, looks (Fase 1+)
├── src/
│   ├── main.ts
│   └── game/
│       ├── loop.ts    # requestAnimationFrame loop
│       └── scene.ts   # cena placeholder
├── index.html
├── package.json
└── vite.config.ts
```

O projeto **otpokemon-web** na raiz do repositório permanece intacto.

## Como rodar

```bash
cd poketibia
npm i
npm run dev
```

Abra **http://localhost:5173** — tela verde com grid 32px e título “pokétibia”.

## Build

```bash
npm run build
npm run preview
```
