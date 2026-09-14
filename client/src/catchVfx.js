import { playCatchAudio } from "./catchSfx.js";

const TILE = 32;

function footCenter(scene, st) {
  const d = scene.displayTile(st);
  return { x: d.x * TILE + TILE / 2, y: d.y * TILE + TILE / 2 + 4 };
}

function addFx(scene, obj) {
  scene.addActor?.(obj);
  return obj;
}

/** Arc throw → open → red beam → absorb → close → fall → wobble (success) or explode (fail). */
export function playCatchSequence(scene, msg) {
  const fromSt = scene.state.get(msg.from);
  const toSt = scene.state.get(msg.to);
  if (!fromSt || !toSt) return;

  const from = footCenter(scene, fromSt);
  const to = footCenter(scene, toSt);
  const depth = Math.round(toSt.y) * 10 + 24;
  const corpse = scene.sprites.get(msg.to);

  playCatchAudio(scene, "throw");

  const ball = addFx(
    scene,
    scene.add.image(from.x, from.y, scene.ballTextureKey(msg.ball)).setDepth(depth)
  );
  ball.setDisplaySize(20, 20);

  const peakY = Math.min(from.y, to.y) - 28;
  const midX = (from.x + to.x) / 2;

  scene.tweens.add({
    targets: ball,
    x: midX,
    y: peakY,
    duration: 220,
    ease: "Sine.easeOut",
    onComplete: () => {
      scene.tweens.add({
        targets: ball,
        x: to.x,
        y: to.y - 8,
        duration: 200,
        ease: "Sine.easeIn",
        onComplete: () => openAndCatch(scene, msg, ball, to, corpse, depth),
      });
    },
  });
}

function openAndCatch(scene, msg, ball, to, corpse, depth) {
  const open = addFx(scene, scene.add.graphics().setDepth(depth + 1));
  open.lineStyle(2, 0xffffff, 1);
  open.strokeCircle(to.x, to.y - 6, 9);
  open.lineBetween(to.x - 8, to.y - 6, to.x - 2, to.y - 10);
  open.lineBetween(to.x + 8, to.y - 6, to.x + 2, to.y - 10);

  scene.tweens.add({
    targets: open,
    alpha: 0,
    duration: 180,
    delay: 120,
    onComplete: () => open.destroy(),
  });

  const beam = addFx(scene, scene.add.graphics().setDepth(depth + 2));
  beam.fillStyle(0xff2020, 0.85);
  beam.fillRect(to.x - 2, to.y - 48, 4, 44);
  beam.fillStyle(0xff8080, 0.45);
  beam.fillRect(to.x - 5, to.y - 48, 10, 44);

  scene.tweens.add({
    targets: beam,
    alpha: 0,
    duration: 320,
    delay: 80,
    onComplete: () => beam.destroy(),
  });

  if (corpse && msg.ok) {
    scene.tweens.add({
      targets: corpse,
      alpha: 0,
      scaleX: 0.4,
      scaleY: 0.4,
      duration: 280,
      delay: 100,
    });
  }

  scene.time.delayedCall(380, () => {
    if (msg.ok) finishSuccess(scene, msg, ball, to, depth);
    else finishFail(scene, msg, ball, to, corpse, depth);
  });
}

function finishSuccess(scene, msg, ball, to, depth) {
  playCatchAudio(scene, "success");
  ball.setPosition(to.x, to.y - 6);
  ball.setScale(0.85);
  scene.tweens.add({
    targets: ball,
    y: to.y + 2,
    duration: 160,
    ease: "Bounce.easeOut",
    onComplete: () => wobbleBall(scene, ball),
  });
}

function wobbleBall(scene, ball) {
  let i = 0;
  const run = () => {
    if (i >= 6) {
      scene.tweens.add({
        targets: ball,
        alpha: 0,
        duration: 200,
        delay: 400,
        onComplete: () => ball.destroy(),
      });
      return;
    }
    scene.tweens.add({
      targets: ball,
      x: ball.x + (i % 2 ? 4 : -4),
      angle: i % 2 ? 10 : -10,
      duration: 90,
      yoyo: true,
      onComplete: () => {
        i += 1;
        run();
      },
    });
  };
  run();
}

function finishFail(scene, msg, ball, to, corpse, depth) {
  playCatchAudio(scene, "fail");
  spawnSmoke(scene, to.x, to.y, depth);
  ball.setTint(0xff4444);
  scene.tweens.add({
    targets: ball,
    scaleX: 1.4,
    scaleY: 1.4,
    alpha: 0,
    duration: 220,
    onComplete: () => ball.destroy(),
  });
  if (corpse) {
    corpse.setAlpha(0);
    scene.time.delayedCall(280, () => {
      corpse.setAlpha(1);
      corpse.setScale(1);
      scene.flash(msg.to);
    });
  }
}

function spawnSmoke(scene, x, y, depth) {
  const g = addFx(scene, scene.add.graphics().setDepth(depth + 3));
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    const r = 6 + (i % 3) * 2;
    g.fillStyle(i % 2 ? 0xffffff : 0xffaa44, 0.9);
    g.fillCircle(x + Math.cos(a) * r, y + Math.sin(a) * r - 4, 3);
  }
  scene.tweens.add({
    targets: g,
    alpha: 0,
    y: y - 10,
    duration: 420,
    onComplete: () => g.destroy(),
  });
}
