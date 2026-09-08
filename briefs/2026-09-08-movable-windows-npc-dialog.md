# Janelas HUD móveis (OTClient MiniWindow) + diálogo NPC

**Repo:** otpokemon-web  
**Data:** 2026-09-08  
**Fora de escopo:** Gen1 151, IDLE/auto-hunt, quest completa (só fala placeholder).

## Assets

`client/public/assets/ui/tibia/` — sprites OTP (atlas `windows.png` no layout do `30-miniwindow.otml`):

- `windows.png` — chrome MiniWindow. Clips: bg `0 127 182 182`, fg `182 127 182 182`, border `4`, border-top `23`
- `miniwindow_icons.png` — Close / Minimize / Lock (direita → esquerda)
- `party.png`, `modulemanager.png`, `shop_button.png` — botões do topo
- `dialog.png`, `dialog_title.png` — diálogo NPC
- `button.png` / `button_square.png` / `flatbutton.png`
- `hscrollbar.png`, `vscrollbar.png`

Gerar de novo: `node tools/gen-tibia-ui.mjs`. Se o zip do OTClient do Drive for enviado, substituir estes PNGs pelos originais (os clips continuam iguais).

## A) Janelas móveis

Aplicar chrome `.miniwindow` (9-slice de `windows.png`) em:

1. Player Info (painel vermelho)
2. Pokelist (slots)
3. NPC Dialog (nova)

Comportamento (OTP `30-miniwindow.otml`):

- Arrastar pelo título; posição em `localStorage` `poketibia.win.<id>.x` / `.y`
- Header direita → esquerda: **Close → Minimize (~24px) → Lock**
- Clique na janela sobe z-index; clamp na viewport
- Top bar (ícones party / modulemanager / shop) reabre Player Info, Pokelist e diálogo; estado on/off

Módulo: `client/src/ui/miniWindow.js` + CSS `.miniwindow`.

## B) NPCs

- 2–3 NPCs no mapa (`kind: "npc"`), look humano
- Nameplate: nome + `(!)`; HP ciano `#00d4e8`; barra ~22px + contorno preto
- LMB no NPC → miniwindow `Oi, o que você quer?`
- NPC não é alvo (`canTarget: false`; server rejeita `setTarget`)
- Não abrir diálogo em player / próprio poke
