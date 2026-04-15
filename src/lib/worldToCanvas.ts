import type { Vec2 } from '../physics/types';

/**
 * Converts between the simulation world (SI, Y-up, origin at bottom-left of the
 * usable simulation space) and the canvas (pixels, Y-down, origin at top-left).
 *
 * Built fresh per render frame from the environment config's `pixelsPerUnit`
 * (a pure *render* scale — it has no bearing on physics) and the fixed
 * canvas/wall dimensions from BaseSimulation.
 */
export class WorldToCanvas {
  constructor(
    public readonly pixelsPerUnit: number,
    private readonly canvasHeight: number,
    private readonly wallOffset: number,
  ) {}

  pointX(x: number): number {
    return x * this.pixelsPerUnit + this.wallOffset;
  }

  pointY(y: number): number {
    return this.canvasHeight - this.wallOffset - y * this.pixelsPerUnit;
  }

  point(p: Vec2): { x: number; y: number } {
    return { x: this.pointX(p.x), y: this.pointY(p.y) };
  }

  /** Scale a length (m → px). No sign flip. */
  dimension(m: number): number {
    return m * this.pixelsPerUnit;
  }

  /** Y-flip inverts rotation direction. */
  angle(rad: number): number {
    return -rad;
  }

  fromPointX(px: number): number {
    return (px - this.wallOffset) / this.pixelsPerUnit;
  }

  fromPointY(py: number): number {
    return (this.canvasHeight - this.wallOffset - py) / this.pixelsPerUnit;
  }

  fromPoint(p: { x: number; y: number }): Vec2 {
    return { x: this.fromPointX(p.x), y: this.fromPointY(p.y) };
  }
}
