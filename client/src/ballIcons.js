/** Inventário: só premierball/ultraball/masterball.png (32×32 gerados de *_otp.png). */
export const BALL_REGISTRY = {
  premierball: {
    label: "Premier Ball",
    icon: "/assets/items/premierball.png",
    catch: true,
  },
  ultraball: {
    label: "Ultra Ball",
    icon: "/assets/items/ultraball.png",
    catch: true,
  },
  masterball: {
    label: "Master Ball",
    icon: "/assets/items/masterball.png",
    catch: true,
  },
};

export const CATCH_BALL_ITEMS = Object.keys(BALL_REGISTRY);

export function ballIconHtml(item, count) {
  const meta = BALL_REGISTRY[item];
  if (!meta) return "";
  const n = Math.max(0, Number(count) || 0);
  const stack = n > 0 ? `<span class="item-stack">${n}</span>` : "";
  return `<img src="${meta.icon}" alt="" />${stack}`;
}
