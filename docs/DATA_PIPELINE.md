# Data pipeline (PROJECT.md → OTPokemon)

Mapeamento oficial capt / YATME `PROJECT.md`. **Pack atual: spr/dat clássico + Pokémon (Ruby.spr no jogo, não no pipeline de tiles do mapa).**

## Diagrama

```
OTBM map file                    ← igual YATME (shared/editor/otbm.ts)
    │  tile x, y, z + item IDs
    ▼
Tibia.dat                        ← no YATME: appearances.dat (protobuf 15)
    │  defs de item, flags, sprite IDs, pattern w×h, layers (subset clássico)
    │  implementação: shared/editor/classicClient.ts → readClassicDat()
    │  (se arquivo for protobuf Huntera/appearances: parseAppearancesDat — NÃO é pack 15 completo)
    ▼
índice de sprite no .spr         ← no YATME: catalog-content.json (faixas → folhas)
    │  item.spriteIds[] aponta para ID no Tibia.spr
    ▼
Tibia.spr                        ← no YATME: .bmp.lzma sheets
    │  pixels 32×32 RLE (classicClient.ts → parseSpr)
    ▼
Paleta + canvas (client/src/editor/main.ts) → serializeOtbm → POST /api/map
    ▼
server/mapLoader.ts → mapRuntime → jogo (enter / payload map)

items.xml (opcional)             ← igual YATME: nomes/tipos → parseItemsXml()
```

## Onde está no código

| Etapa PROJECT.md | Arquivo | Status |
|------------------|---------|--------|
| OTBM load/save, tile areas, items | `shared/editor/otbm.ts` | OK (port YATME MIT) |
| Towns, temples | `otbm.ts` + modal Cidades no editor | OK |
| Waypoints | `WaypointManager.ts` + modal + `otbm.ts` | OK |
| Tibia.dat clássico | `classicClient.ts` `readClassicDat` | OK (items; outfits/effects/missiles DAT = próxima iteração) |
| Tibia.spr | `classicClient.ts` `parseSpr` | OK (32px; 64px multi-tile parcial via w×h no DAT) |
| items.xml | `parseItemsXml` + upload XML no editor | OK |
| Runtime / walk | `mapRuntime.ts` + `server/map.js` | OK |
| Pokémon no mapa | — | Fora do pipeline de tiles (creatures = Ruby/Huntera no gameplay) |

## Fallback sem upload DAT/SPR

Tiles Huntera já exportados em `client/public/assets/tiles/` + IDs em `BUILTIN_TILE_IDS` — editor pinta e grava OTBM com esses item IDs mesmo antes de carregar spr/dat.

## Futuro: pack Tibia 15.00 (capt)

Quando o pack for **appearances.dat + catalog-content.json + .bmp.lzma**:

- Reutilizar pipeline nativo do [YATME](https://github.com/knobik/yatme) (`appearances.ts`, `SpriteResolver`, etc.) atrás de um `loadClientAssets()` com detecção de formato.
- **Não** substituir o caminho clássico; escolher parser por assinatura do pack (clássico vs 15).

Nesta sprint: **não** forçar protobuf 15 se o arquivo for DAT clássico (detecção em `isProtobufDat()`).
