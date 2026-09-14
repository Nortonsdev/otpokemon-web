/** OTP registro_balls.png — 32×32 cells, top to bottom. */
export const BALL_REGISTRY = {
  premierball: { label: "Premier Ball", row: 0, catch: true },
  ultraball: { label: "Ultra Ball", row: 3, catch: true },
  masterball: { label: "Master Ball", row: 4, catch: true },
};

export const CATCH_BALL_ITEMS = Object.keys(BALL_REGISTRY);

const ATLAS = "/assets/ui/registro_balls.png";

export function ballIconStyle(item) {
  const row = BALL_REGISTRY[item]?.row;
  if (row == null) return null;
  return {
    backgroundImage: `url(${ATLAS})`,
    backgroundPosition: `0 -${row * 32}px`,
    backgroundSize: "32px 192px",
    width: "32px",
    height: "32px",
    imageRendering: "pixelated",
  };
}

export function ballIconHtml(item, count) {
  const meta = BALL_REGISTRY[item];
  if (!meta) return "";
  const n = Math.max(0, Number(count) || 0);
  const stack = n > 0 ? `<span class="item-stack">${n}</span>` : "";
  return `<span class="item-sprite ball-atlas" data-ball="${item}" title="${meta.label}"></span>${stack}`;
}

export function applyBallAtlas(root) {
  if (!root) return;
  for (const el of root.querySelectorAll(".ball-atlas[data-ball]")) {
    const item = el.dataset.ball;
    const st = ballIconStyle(item);
    if (!st) continue;
    Object.assign(el.style, st);
    el.style.display = "inline-block";
  }
}
