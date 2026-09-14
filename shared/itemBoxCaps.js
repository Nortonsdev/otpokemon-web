/** Capacidade fixa das caixinhas do Inventário Myst (grid 5 colunas). */
export const ITEM_BOX_COLS = 5;
export const ITEM_BOX_COMPACT_ROWS = 5;

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
