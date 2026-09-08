# Nameplate name sharpness (Composer)

**Repo:** otpokemon-web  
**Escopo:** só o texto do nameplate (`makeNameplate` em `gameScene.js`). Barra HP intacta. Sem Gen1 / sem redesenhar Player Info.

## Problema

Nome pouco nítido, sem borda clara, pequeno (~7px).

## Ajustes

- Fonte **9px** (um pouco maior; sem oversize).
- Outline preto forte: `stroke: "#000000"`, `strokeThickness: 4`, `fontStyle: "bold"`, cor `#2fc24a` (NPC `#00d4e8`).
- Nitidez: `resolution: 4`; manter `setScale(1/zoom)` em `layoutNameplate` para tamanho em tela estável.
- Layout: nome acima, HP abaixo; gap apertado (`barTop = nameBottom + ui`).

## Pronto quando

Letras com borda preta legível, nome um pouco maior, barra HP igual à atual.

## Deploy

Commit no tip atual → `npx vercel --prod` → testar antes de F5.
