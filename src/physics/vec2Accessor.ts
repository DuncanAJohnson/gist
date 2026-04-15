import type { Vec2 } from './types';

/**
 * Live getter/setter wrapper over a Vec2 stored elsewhere (typically inside a
 * physics engine body). Reads go through `read()` each access; writes call
 * `write()` with the full updated vector.
 *
 * This lets callers keep using `body.position.x`, `body.velocity.y = 3`, and
 * `setNestedValue(body, 'velocity.x', v)` without knowing the underlying engine.
 */
export class Vec2Accessor {
  constructor(
    private readonly read: () => Vec2,
    private readonly write: (v: Vec2) => void,
  ) {}

  get x(): number {
    return this.read().x;
  }
  set x(value: number) {
    const cur = this.read();
    this.write({ x: value, y: cur.y });
  }

  get y(): number {
    return this.read().y;
  }
  set y(value: number) {
    const cur = this.read();
    this.write({ x: cur.x, y: value });
  }

  toJSON(): Vec2 {
    return this.read();
  }
}
