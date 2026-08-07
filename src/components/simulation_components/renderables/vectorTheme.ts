/**
 * Standardized vector-arrow theme. Single source of truth for the colors,
 * symbols, default scales, and label conventions used by the VectorArrow
 * renderable and any UI that legends or describes vectors.
 *
 * See `/docs/vector-arrows` for the design rationale and live test scenes.
 */

/**
 * Canonical list of kinds. Used at runtime to drive registry lookups and at
 * schema-load time (via `src/schemas/simulation.ts`) to validate authored
 * `showVectors` entries. Adding a new kind here AND adding entries to all the
 * `Record<VectorKind, …>` maps below is what it takes to introduce one.
 */
export const VECTOR_KINDS = [
  'velocity',
  'acceleration',
  'force-net',
  'force-applied',
  'force-friction',
  'force-normal',
  'force-drag',
  'force-gravity',
] as const;

export type VectorKind = (typeof VECTOR_KINDS)[number];

export const VECTOR_COLORS: Record<VectorKind, string> = {
  velocity: '#2ecc71',          // green    — motion / kinematics
  acceleration: '#9b59b6',      // purple   — change in motion
  'force-net': '#e74c3c',       // red      — sum of forces
  'force-applied': '#3498db',   // blue     — the user's pull
  'force-friction': '#d35400',  // pumpkin  — opposes motion (contrasts with brown sprites)
  'force-normal': '#00897b',    // teal     — support force, ⟂ to the surface
  'force-drag': '#455a64',      // blue-grey 700 — air resistance (readable on white)
  'force-gravity': '#34495e',   // navy     — always-on weight
};

/**
 * Labels are structured as { main, sub? } so SVG / canvas can render proper
 * subscripts. Unicode subscripts cover only a partial set of letters
 * (no f, r, d, or g) — the structured form handles arbitrary multi-character
 * subscripts (`net`, `app`, `ar`) cleanly.
 */
export type VectorLabelDef = { main: string; sub?: string };

export const VECTOR_LABELS: Record<VectorKind, VectorLabelDef> = {
  velocity: { main: 'v' },
  acceleration: { main: 'a' },
  'force-net': { main: 'F', sub: 'net' },
  'force-applied': { main: 'F', sub: 'app' },
  'force-friction': { main: 'F', sub: 'f' },
  'force-normal': { main: 'F', sub: 'N' },
  'force-drag': { main: 'F', sub: 'ar' },
  'force-gravity': { main: 'F', sub: 'g' },
};

/**
 * Default pixels-per-SI-unit per kind. Tuned so a "natural" magnitude in the
 * unit produces an arrow ~100 px long: 5 m/s velocity, 9.8 m/s² gravity,
 * 50 N applied force.
 */
export const VECTOR_DEFAULT_SCALES: Record<VectorKind, number> = {
  velocity: 20,        // px per (m/s)
  acceleration: 10,    // px per (m/s²)
  'force-net': 2,      // px per N
  'force-applied': 2,
  'force-friction': 2,
  'force-normal': 2,
  'force-drag': 2,
  'force-gravity': 2,
};

export const VECTOR_GEOMETRY = {
  lineWidth: 3,
  headLength: 12,
  headAngleRad: Math.PI / 6,
  /**
   * Canvas dash pattern (px on, px off) for component-leg shafts. Component
   * arrows (vₓ / v_y from a `components: true` entry) are drawn dashed to
   * distinguish them from the solid resultant; the arrowhead stays filled.
   */
  componentDash: [7, 5] as number[],
  /**
   * Arrows shorter than this are suppressed. Tuned so that after the shaft is
   * shortened by `headLength · cos(headAngle) ≈ 10.4 px` (so the line stops at
   * the head's base), a visible shaft stub still remains.
   */
  minPixelLength: 14,
  /**
   * Sub-floor affordance for FORCE kinds (step-4 drive finding, 2026-08-06:
   * a creeping block near breakaway has a real but tiny F_net — suppressing
   * it entirely made "sliding + accelerating" visually identical to
   * equilibrium, teaching the wrong thing). A force arrow whose true length
   * lands in (subFloorZeroPx, minPixelLength) draws as a fixed-length dashed
   * stub with a HOLLOW arrowhead: direction is real, the open head + dash
   * say "not to scale". Exactly-zero (≤ subFloorZeroPx) still draws nothing,
   * so equilibrium and creep stay visually distinct.
   */
  subFloorStubLength: 10,
  subFloorDash: [3, 3] as number[],
  /**
   * At-or-below this true length a force is treated as physically zero (no
   * stub). Solver rest-noise sits around 1e-3 px at default scales, and the
   * smallest teachable creep nets (just past breakaway) are ~0.3 px — 0.1 px
   * separates the two.
   */
  subFloorZeroPx: 0.1,
};

export const VECTOR_LABEL_DEFAULTS = {
  fontSize: 13,
  fontFamily: 'system-ui, sans-serif',
  fontWeight: 600,
  perpendicularOffsetPx: 10,
  placement: 'midpoint' as 'tail' | 'midpoint' | 'head',
  /** Subscript size as a fraction of the main font. */
  subFontFactor: 0.72,
  /** Subscript baseline shift as a fraction of the main font. */
  subBaselineShiftFactor: 0.3,
};
