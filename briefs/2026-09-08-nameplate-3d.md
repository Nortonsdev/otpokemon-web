# Nameplate 3D name + HP bar (Composer)

**Repo:** otpokemon-web  
**Escopo:** nameplate (`makeNameplate` / `layoutNameplate` / HP bar em `gameScene.js`). Sem Gen1 / sem redesenhar Player Info.

## Problemas (pós 66c4522)

- Nome verde `#2fc24a` com contorno preto ainda parece borrado (franja cinza / AA).
- Barra HP também soft, sem contorno 1px nítido.
- Pedido: efeito **3D** no nome e na barra para melhorar contraste e nitidez percebida.

## Ajustes

### Nome 3D (Tibia/OT)

- Container com 3 camadas de texto (~9px):
  - sombra +1,+1 preta
  - highlight -1,-1 verde/ciano mais claro
  - face principal com `strokeThickness: 1`
- `setRoundPixels(true)`, `Math.round` em x/y do container a cada layout.
- `setScale(1/zoom)` no container + resolution compensada.

### Barra HP 3D

- Tamanho compacto mantido (~22×3 + pad 1).
- Outline preto 1px, track escuro, bevel topo (#3a3a3a) e base (#000).
- Fill HP com highlight/ shadow 1px nas bordas superior/inferior do preenchimento.
- Snap `Math.round` junto com o nome; gap nome↔barra 1px.

## Pronto quando

Letras e barra com profundidade visível, sem shimmer ao andar (testar andando antes de F5).
