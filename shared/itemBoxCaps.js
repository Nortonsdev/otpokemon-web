/** Capacidade fixa das caixinhas do Inventário Myst (grid 5 colunas). */
export const ITEM_BOX_COLS = 5;
export const ITEM_BOX_COMPACT_ROWS = 5;
export const ITEM_BOX_CELL_PX = 28;
export const ITEM_BOX_GAP_PX = 2;
export const ITEM_BOX_GRID_PAD_PX = 2;
/** Faixa da scrollbar à direita do grid (fora dos slots). */
export const ITEM_BOX_SCROLL_GUTTER_PX = 6;
const ITEM_BOX_MINI_BORDER_PX = 8;
const ITEM_BOX_BODY_PAD_PX = 4;

export function itemBoxGridWidthPx() {
  return (
    ITEM_BOX_COLS * ITEM_BOX_CELL_PX +
    (ITEM_BOX_COLS - 1) * ITEM_BOX_GAP_PX +
    2 * ITEM_BOX_GRID_PAD_PX
  );
}

/** Largura total da miniwindow (border-box), alinhada ao CSS `.item-box-win`. */
export function itemBoxWindowWidthPx() {
  return (
    itemBoxGridWidthPx() +
    ITEM_BOX_SCROLL_GUTTER_PX +
    ITEM_BOX_BODY_PAD_PX +
    ITEM_BOX_MINI_BORDER_PX
  );
}

export const ITEM_BOX_SLOTS = {
  coins: 8,
  bag: 30,
  pokebag: 6,
  catch: 30,
};

export const ITEM_BOX_IDS = new Set(Object.keys(ITEM_BOX_SLOTS));

export function itemBoxRowCount(id) {
  const slots = ITEM_BOX_SLOTS[id] ?? 0;
  return Math.max(1, Math.ceil(slots / ITEM_BOX_COLS));
}
