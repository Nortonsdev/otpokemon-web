# Editor de mapas (OTPokemon Web)

Editor web inspirado no [YATME](https://github.com/knobik/yatme) (MIT) e no fluxo do Remere Map Editor, adaptado para **Tibia.spr + Tibia.dat clássicos** (Myst 854 / Brave 1098 / Huntera), não protobuf Tibia 15.

## Pipeline de dados

```
OTBM (mapa)
    ├── posições (x, y, z)
    ├── item IDs por tile
    ▼
Tibia.dat + Tibia.spr (+ items.xml opcional)
    ├── flags / sprites 32px (parser clássico OTClient/Ruby)
    ▼
Paleta no browser → pintar no canvas → salvar OTBM
    ▼
POST /api/map → servidor → jogo carrega ao entrar no mundo
```

Código OTBM (árvore binária, towns, waypoints): `shared/editor/otbm.ts` (derivado do YATME).

## Abrir o editor

- Dev: [http://localhost:5173/editor.html](http://localhost:5173/editor.html)
- Produção: `/editor` ou `/editor.html`

## Fluxo capt / RME

1. **RME desktop**: use o mesmo `Tibia.spr` + `Tibia.dat` (+ `items.otb` se o RME pedir). Edite `.otbm` e coloque em `server/data/world.otbm` ou use **Aplicar no jogo** no editor web.
2. **Editor web**: carregue DAT/SPR (upload local — não commitar no git), pinte, salve OTBM, **Aplicar no jogo**.
3. **Jogo**: ao fazer login/enter, o servidor envia o mapa ativo (OTBM convertido para ground/walls/roofs + `cells` com item IDs).

## Ferramentas

- Novo mapa (tamanho + andar Z)
- Abrir / salvar OTBM (compatível RME/YATME subset)
- Brush / apagar / pan / zoom
- Waypoints e cidades/templos (modais estilo YATME)
- Ir para posição (`x, y, z` ou `{x=…, y=…, z=…}`)
- PNG avulso na paleta (IDs ≥ 100000)
- Desfazer / refazer

## Arquivos grandes

`.spr` / `.dat` ficam fora do git (`.gitignore`). Use pasta local ou assets do cliente Tibia/Huntera.
