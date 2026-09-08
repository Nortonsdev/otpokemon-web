const TILE = 32;

export class Scene {
  private time = 0;

  update(dt: number): void {
    this.time += dt;
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = '#142014';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#243824';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += TILE) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += TILE) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
      ctx.stroke();
    }

    const cx = width / 2;
    const cy = height / 2;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);

    ctx.fillStyle = '#e8d878';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('pokétibia', cx, cy - 20);

    ctx.fillStyle = '#8cb878';
    ctx.font = '14px monospace';
    ctx.fillText('Fase 0 — Canvas 2D · game loop', cx, cy + 16);

    ctx.fillStyle = `rgba(240, 192, 64, ${0.4 + pulse * 0.6})`;
    ctx.beginPath();
    ctx.arc(cx, cy + 56, 6 + pulse * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
