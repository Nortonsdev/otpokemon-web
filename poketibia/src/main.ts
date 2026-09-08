import { GameLoop } from './game/loop';
import { Scene } from './game/scene';

const canvasEl = document.getElementById('game');
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error('canvas#game not found');
}
const canvas: HTMLCanvasElement = canvasEl;

const scene = new Scene();

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

const loop = new GameLoop(
  (dt) => scene.update(dt),
  (ctx) => scene.render(ctx, canvas.clientWidth, canvas.clientHeight),
  canvas,
);

window.addEventListener('resize', resize);
resize();
loop.start();
