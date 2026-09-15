import { attackSlotCount, moveSheetCss, moveTileStyle } from "../../shared/attackBar.js";

export function attackMoveIconStyle(moveName) {
  const s = moveTileStyle(moveName);
  const sheet = moveSheetCss();
  return `background-image:${s.backgroundImage};background-size:${s.backgroundSize};background-position:${s.backgroundPosition};width:${sheet.tile}px;height:${sheet.tile}px;`;
}

export { attackSlotCount, moveSheetCss, moveTileStyle };
