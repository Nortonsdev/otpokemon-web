# pokétibia: fluido tipo Huntera (browser Tibia) + Pokémon, SEM IDLE

**Repo:** otpokemon-web  
**Escopo:** feel + nameplate/HUD + fluidez de movimento/combate. Não Gen1 151. Não one-shot o jogo.

## Norte

- Sensação Tibia/Huntera no navegador: fluido, vivo, jogável.
- Tema Pokémon (party, wild, catch, batalha). Fan service de assets ok; não clone 1:1.
- **Proibido (IDLE):** auto-hunt, texto de automação sobre a cabeça, analisador de caçada, pathfind/teleporte de tutorial.

Combate e movimento são input manual: WASD/setas, clique no alvo, hotkeys de move (`1`–`0` / `m1`) e catch (`C`).

## Nameplate (Huntera)

- Nome em cima, barra HP embaixo.
- Barra largura fixa ~22px para todos; só o fill muda com %.
- Contorno preto 1px + track escuro interno.
- Altura ~3px. HP lerp: 100% verde `#2fc24a` → 59% amarelo → 24% vermelho → 0–2% preto.
- Fonte ~7px + outline; `scale = 1/camera.zoom`.
- Atualizar no `fx` com `hp` / `hpMax`.

## Player Info

Painel vermelho OTP compacto (~220px): portrait + Lv, HP/EXP/FISH/STM, party balls, chips, tooltips Health / Experience / Stamina.

## Fluidez

- Walk interpolado na duração `STEP_MS` (sem snap seco).
- Alvo: marca nos pés (`attacked.png`); sem auto-attack em loop.
- Damage numbers pequenos no `fx`.
- Sem caça automática, analyzer ou botões de idle.
