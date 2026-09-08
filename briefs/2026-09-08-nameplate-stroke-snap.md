# Nameplate stroke + snap (Composer)

**Repo:** otpokemon-web  
**Escopo:** só nameplate (`makeNameplate` / `layoutNameplate` em `gameScene.js`). Barra HP intacta. Sem Gen1 / sem redesenhar Player Info.

## Problemas

- Contorno muito grosso (stroke 4 + hardenNameplate).
- Nome longe da barra HP.
- Ao andar, pixels quebram / shimmer.

## Ajustes

### A) Contorno leve

- `strokeThickness` 1 ou 2 (nunca ≥3).
- Nome ~8–9px, verde `#2fc24a` (NPC ciano ok).
- Nitidez via `resolution`, sem `hardenNameplate` / engrossar stroke.

### B) Rente ao HP

- Nome acima, barra abaixo.
- Gap nome↔barra 0–2px (`NAME_BAR_GAP` em pixels de tela).

### C) Pixel snap ao andar

- `cameras.main.setRoundPixels(true)` (+ `pixelArt: true`).
- `Math.round` em x/y do nameplate e barra a cada `layoutNameplate`.
- Manter `setScale(1/zoom)` + resolution compensada.

## Pronto quando

Contorno fino, nome colado na barra, andar estável. Sem regressão na barra HP.

## Deploy

Commit no tip atual → `npx vercel --prod` → testar andando antes de F5.
