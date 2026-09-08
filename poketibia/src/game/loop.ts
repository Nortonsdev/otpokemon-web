export type UpdateFn = (dt: number) => void;
export type RenderFn = (ctx: CanvasRenderingContext2D) => void;

export class GameLoop {
  private running = false;
  private lastTime = 0;
  private rafId = 0;

  constructor(
    private readonly update: UpdateFn,
    private readonly render: RenderFn,
    private readonly canvas: HTMLCanvasElement,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;

    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.update(dt);

    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      this.render(ctx);
    }

    this.rafId = requestAnimationFrame(this.tick);
  };
}
