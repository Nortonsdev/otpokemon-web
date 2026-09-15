import { ballCatchKey } from "../../server/species.js";

const THROW_FRAMES = [0, 1, 2, 3, 5, 6, 7, 8];
const THROW_MS = 34;
const STRIP_MS = 70;
const HIT_MS = 55;
const HIT_FRAMES = 8;

/** Abre → raio → absorve (strip pokeidle 64×64). */
const OPEN_BEAM_ABSORB = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const WOBBLE_PAIRS = [
  [16, 17],
  [19, 20],
  [22, 23],
  [25, 26],
  [28, 29],
  [31, 32],
  [34, 35],
  [37, 38],
];
const SUCCESS_TAIL = [85, 86, 88, 89];
const BROKE_BURST = [
  4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 20, 22, 23, 25, 26, 28, 29, 31, 32, 34, 35, 37, 38, 40,
  41, 43, 44, 46, 47, 49, 50, 52, 53, 55, 56, 58, 59, 61, 62, 64, 65,
];

const FX = {
  premier: {
    throw: "fx-throw-premier",
    catch: "fx-catch-pokeball",
    broke: "fx-broke-pokeball",
    hit: "fx-premier-hit",
    tint: null,
  },
  ultra: {
    throw: "fx-throw-ultra",
    catch: "fx-catch-ultra",
    broke: "fx-broke-ultra",
    hit: null,
    tint: null,
  },
  master: {
    throw: "fx-throw-master",
    catch: "fx-catch-pokeball",
    broke: "fx-broke-pokeball",
    hit: "fx-master-hit",
    tint: 0xb080e8,
  },
};

export function catchFxKeys() {
  return Object.values(FX).flatMap((row) => [row.throw, row.catch, row.broke, row.hit].filter(Boolean));
}

export function catchFxUrls() {
  return {
    "fx-throw-premier": "/assets/fx/catch/throw_premierball.png",
    "fx-throw-ultra": "/assets/fx/catch/throw_ultraball.png",
    "fx-throw-master": "/assets/fx/catch/throw_masterball.png",
    "fx-catch-pokeball": "/assets/fx/catch/pokeball_catch.png",
    "fx-catch-ultra": "/assets/fx/catch/ultraball_catch.png",
    "fx-broke-pokeball": "/assets/fx/catch/pokeball_broke.png",
    "fx-broke-ultra": "/assets/fx/catch/ultraball_broke.png",
    "fx-premier-hit": "/assets/fx/premier_hit_fx_32.png",
    "fx-master-hit": "/assets/fx/master_hit_fx_32.png",
  };
}

function flattenPairs(pairs) {
  const out = [];
  for (const [a, b] of pairs) out.push(a, b);
  return out;
}

function playFrames(scene, sprite, frames, ms, onComplete) {
  let i = 0;
  const step = () => {
    if (!sprite.active) return;
    if (i >= frames.length) {
      onComplete?.();
      return;
    }
    sprite.setFrame(frames[i]);
    i += 1;
    scene.time.delayedCall(ms, step);
  };
  if (frames.length) {
    sprite.setFrame(frames[0]);
    scene.time.delayedCall(ms, step);
  } else onComplete?.();
}

function playHitStrip(scene, key, x, y, depth, onComplete) {
  if (!key || !scene.textures.exists(key)) {
    onComplete?.();
    return;
  }
  const spr = scene.add.sprite(x, y, key, 0).setDepth(depth);
  spr.setDisplaySize(48, 48);
  scene.addActor(spr);
  playFrames(
    scene,
    spr,
    Array.from({ length: HIT_FRAMES }, (_, n) => n),
    HIT_MS,
    () => {
      spr.destroy();
      onComplete?.();
    }
  );
}

function playThrowArc(scene, cfg, sx, sy, tx, ty, depth, onComplete) {
  if (!scene.textures.exists(cfg.throw)) {
    onComplete?.();
    return;
  }
  const spr = scene.add.sprite(sx, sy, cfg.throw, 0).setDepth(depth);
  spr.setDisplaySize(32, 32);
  if (cfg.tint != null) spr.setTint(cfg.tint);
  scene.addActor(spr);
  let fi = 0;
  const duration = THROW_FRAMES.length * THROW_MS;
  scene.tweens.add({
    targets: { p: 0 },
    p: 1,
    duration,
    ease: "Linear",
    onUpdate: (tw) => {
      const p = tw.getValue();
      spr.x = sx + (tx - sx) * p;
      spr.y = sy + (ty - sy) * p - Math.sin(p * Math.PI) * 22;
      const frame = THROW_FRAMES[Math.min(fi, THROW_FRAMES.length - 1)];
      spr.setFrame(frame);
    },
    onComplete: () => {
      spr.setPosition(tx, ty - 4);
      onComplete?.(spr);
    },
  });
  for (let n = 1; n < THROW_FRAMES.length; n++) {
    scene.time.delayedCall(n * THROW_MS, () => {
      fi = n;
    });
  }
}

function absorbCorpse(scene, corpse, tx, ty, uiScale) {
  if (!corpse) return;
  scene.tweens.add({
    targets: corpse,
    x: tx,
    y: ty - 8,
    scaleX: 0.35,
    scaleY: 0.35,
    alpha: 0.15,
    duration: OPEN_BEAM_ABSORB.length * STRIP_MS * 0.55,
    ease: "Quad.easeIn",
    onComplete: () => {
      corpse.setAlpha(1);
      corpse.setScale(1);
    },
  });
}

/**
 * Pipeline: arco (throw) → impacto OTP (premier/master) → abre/raio/absorve → wobble → sucesso ou broke.
 */
export function runCatchPipeline(scene, msg, coords, corpseSprite, hooks) {
  const key = ballCatchKey(msg.ball);
  const cfg = FX[key] || FX.premier;
  const { tx, ty, depth } = coords;
  const ui = hooks?.uiScale?.() ?? 1;

  playThrowArc(scene, cfg, coords.sx, coords.sy, tx, ty, depth, (throwSpr) => {
    const stripDepth = depth + 1;
    const afterHit = () => {
      if (!scene.textures.exists(cfg.catch)) {
        hooks?.onFinish?.();
        throwSpr?.destroy();
        return;
      }
      const strip = scene.add.sprite(tx, ty - 4, cfg.catch, 0).setDepth(stripDepth);
      strip.setDisplaySize(64, 64);
      if (cfg.tint != null) strip.setTint(cfg.tint);
      scene.addActor(strip);
      throwSpr?.destroy();

      playFrames(scene, strip, OPEN_BEAM_ABSORB, STRIP_MS, () => {
        if (msg.ok) absorbCorpse(scene, corpseSprite, tx, ty, ui);

        const wobbleCount = msg.ok ? 3 : 2;
        const wobbleFrames = flattenPairs(WOBBLE_PAIRS.slice(0, wobbleCount));
        playFrames(scene, strip, wobbleFrames, STRIP_MS, () => {
          if (msg.ok) {
            playFrames(scene, strip, SUCCESS_TAIL, STRIP_MS, () => {
              hooks?.playAudio?.("success");
              strip.destroy();
              hooks?.onFinish?.();
            });
          } else if (scene.textures.exists(cfg.broke)) {
            strip.setTexture(cfg.broke, 4);
            playFrames(scene, strip, BROKE_BURST, STRIP_MS * 0.85, () => {
              hooks?.playAudio?.("fail");
              strip.destroy();
              hooks?.onFinish?.();
            });
          } else {
            hooks?.playAudio?.("fail");
            strip.destroy();
            hooks?.onFinish?.();
          }
        });
      });
    };

    if (cfg.hit) {
      playHitStrip(scene, cfg.hit, tx, ty - 4, depth + 2, afterHit);
    } else {
      afterHit();
    }
  });
}
