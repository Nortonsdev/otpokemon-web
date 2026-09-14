# Editor de mapas (OTPokemon Web)

Editor web inspirado no [YATME](https://github.com/knobik/yatme) (MIT) e no **formato** OTBM do Remere Map Editor (sem port C++). Toda a sprint roda em **JavaScript/TypeScript** no Vite: parser spr/dat, canvas, OTBM read/write no Node (`tsx`) e no browser. **Sem C++, sem WASM obrigatório.**

Adaptado para **Tibia.spr + Tibia.dat clássicos** (Myst 854 / Brave 1098 / Huntera), não protobuf Tibia 15.

## Pipeline de dados

Ver mapeamento completo capt ↔ YATME: **[docs/DATA_PIPELINE.md](DATA_PIPELINE.md)**.

Resumo:

```
OTBM → Tibia.dat → sprite IDs → Tibia.spr → canvas → OTBM → /api/map → jogo
         (+ items.xml nomes)
```

Código OTBM (árvore binária, towns, waypoints): `shared/editor/otbm.ts` (derivado do YATME). Assinatura gravada: **`Saved with YATME`**.

## Abrir o editor

- Dev: [http://localhost:5173/editor.html](http://localhost:5173/editor.html)
- Produção: `/editor` ou `/editor.html`

## Remere's Map Editor ↔ este editor ↔ o jogo

O ficheiro `.otbm` é o **mesmo** formato binário (árvore `0xFE`/`0xFF`/`0xFD`) usado pelo Remere's Map Editor. Não há conversão intermédia.

1. **Mesma versão de cliente** — RME, o editor web e o `items.otb` do servidor OT têm de apontar para o **mesmo** `Tibia.dat` + `Tibia.spr` (e o `items.otb` gerado para essa versão). IDs de item no OTBM são índices desse DAT, não nomes.
2. **RME → web** — File → Save Map no Remere, depois **Abrir OTBM** no browser. Towns, waypoints, tile areas e stacks de items são lidos.
3. **Web → RME** — **Salvar OTBM** descarrega `map.otbm`. Abre no Remere com o mesmo DAT/SPR. A descrição do mapa inclui `Saved with YATME`.
4. **Web → jogo** — **Aplicar no jogo** faz `POST /api/map` com `Content-Type: application/octet-stream` e cabeçalho `x-map-filename: world.otbm`. O servidor grava `world.otbm`, converte tiles para o runtime Phaser `{w,h,z,ground,walls,roofs,items,cells}` e o cliente desenha os mesmos `/assets/tiles/*.png` (ou sprites do DAT se carregados).
5. **RME → jogo (sem browser)** — copie o `.otbm` para `server/data/world.otbm` (local) e reinicie o servidor. Em Vercel o mapa ativo vive em `/tmp` na instância Fluid que também serve o WebSocket — use **Aplicar no jogo** para a mesma instância.
6. **Não commitar packs** — `.dat`, `.spr` e `items.otb` estão no `.gitignore`. O repo só traz PNGs Huntera já extraídos (`grass`, `path`, `water`, `wall`, …). Carregue DAT/SPR/XML no editor se quiser a paleta completa.

Versões típicas: OTBM v4 (MAP_OTBM_5), `majorItems`/`minorItems` 4 (como o RME). Mapas v0 precisam da callback de count (DAT) para stackables.

O jogo é **um andar jogável**: o templo da primeira cidade (ou o Z com mais tiles) vira o floor Phaser. Os outros andares ficam no OTBM e podem ser editados (controlo Z) mas não são enviados como camadas extra.

## Ferramentas

| Ferramenta | Atalho | Comportamento |
|------------|--------|----------------|
| FILE Novo / Abrir / Salvar / Aplicar | Ctrl+O / Ctrl+S | OTBM download e `POST /api/map` |
| Brush / Apagar / Preencher / Retângulo / Selecionar | B E F R M | Pintar, flood fill, retângulo, pan (espaço) |
| Casa | H | Pinta `OTBM_HOUSETILE` + house id (Alt/direito remove) |
| PVP / non-PVP / **SAFE** | P / N / S | Remere `TILESTATE_*` + `OTBM_TILE_ZONE`. SAFE = protection zone: Catch↔party só nesses sqm (e no raio do templo) |
| Waypoint / Spawn / Ir para | | Clique no mapa; spawn persiste como zone id 4 |
| Desfazer / Refazer | Ctrl+Z / Ctrl+Y | Histórico profundo do mapa |
| Cidades / Waypoints | MAP menu | Modais estilo YATME |
| DAT / SPR / XML / +PNG | FILE | Paleta clássica; PNG avulso recebe IDs ≥ 100000 |
| Andares | ▲ ▼ | Z 0–15 (▲ sobe no mundo = Z menor) |
| Zoom | scroll, `+` / `-` | 0.25×–4× |

## Módulos

| Peça | Ficheiro |
|------|----------|
| OTBM IO | `shared/editor/otbm.ts` |
| Modelo runtime | `shared/editor/mapRuntime.ts`, `shared/editor/tileCatalog.ts` |
| Brushes (fill/select) | `shared/editor/brushes.ts` |
| Renderer | `client/src/editor/renderer.ts` |
| Paleta | `client/src/editor/palette.ts`, `previews.ts` |
| App | `client/src/editor/main.ts` |
| API | `server/mapHttp.ts`, `server/mapLoader.ts` (Vercel: rewrite `/api/map` → `/api/ws`; bundle in `api/_lib/server.bundle.js`) |

## Arquivos grandes

`.spr` / `.dat` / `items.otb` ficam fora do git (`.gitignore`). Use pasta local ou assets do cliente Tibia/Huntera — **não** scrapear packs com copyright para o repositório.
