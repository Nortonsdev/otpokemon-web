/** Phaser RetroFont from OTClient otpfont atlas (16×16 glyphs, ASCII 32+). */
import Phaser from "phaser";

const GLYPH = 16;
const COLS = 16;
const ROWS = 14;

export const OTP_FONT_CHARS = Array.from({ length: COLS * ROWS }, (_, i) =>
  String.fromCharCode(32 + i)
).join("");

export function preloadOtpFonts(scene) {
  scene.load.image("otpfont", "/assets/fonts/otpfont.png");
  scene.load.image("otpfont2", "/assets/fonts/otpfont2.png");
  scene.load.image("otpfont24", "/assets/fonts/otpfont24.png");
}

export function registerOtpBitmapFonts(scene) {
  if (!scene?.textures?.exists("otpfont")) return;
  if (scene.cache.bitmapFont.exists("otpfont")) return;
  const Parse = PhaserRetroParse(scene);
  if (!Parse) return;
  Parse("otpfont", {
    image: "otpfont",
    width: GLYPH,
    height: GLYPH,
    chars: OTP_FONT_CHARS,
    charsPerRow: COLS,
    spacing: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
  });
}

function PhaserRetroParse(scene) {
  const Retro = Phaser.GameObjects.RetroFont;
  if (!Retro?.Parse) return null;
  return (key, config) => {
    scene.cache.bitmapFont.add(key, Retro.Parse(scene, config));
  };
}
