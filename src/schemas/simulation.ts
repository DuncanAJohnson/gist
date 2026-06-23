import { z } from 'zod';
import { VECTOR_KINDS } from '../components/simulation_components/renderables/vectorTheme';

// ============================================
// Example Configurations (imported from simulation files)
// ============================================

import tossBallJson from '../simulations/tossBall.json' with { type: 'json' };
import twoBoxesJson from '../simulations/twoBoxes.json' with { type: 'json' };

// Export for use in other components (e.g., front page examples)
export const exampleTossBall = tossBallJson as SimulationConfig;
export const exampleTwoBoxes = twoBoxesJson as SimulationConfig;

// ============================================
// Unit Types
// ============================================

export const UnitTypeSchema = z.enum(['m', 'cm', 'km', 'ft', 'in']).describe('Unit of measurement. Options: "m" (meters), "cm" (centimeters), "km" (kilometers), "ft" (feet), "in" (inches).');
export type UnitType = z.infer<typeof UnitTypeSchema>;

export const AngleUnitSchema = z.enum(['deg', 'rad', 'rot']).describe('Display unit for angle quantities (e.g. "velocity.angle"). Options: "deg" (degrees, default), "rad" (radians), "rot" (rotations/revolutions). Physics runs in radians internally; this only affects how angles are shown and authored.');
export type AngleUnit = z.infer<typeof AngleUnitSchema>;

// ============================================
// Vector Schemas
// ============================================

export const Vector2DSchema = z.object({
  x: z.number().describe('X component. Positive = rightward, negative = leftward. Applies to position, velocity, and acceleration uniformly. Values are in the simulation\'s configured units (e.g., meters).'),
  y: z.number().describe('Y component. Positive = upward, negative = downward (physics convention: Y-up, origin at bottom-left). Applies to position, velocity, and acceleration uniformly. Note: gravity is a separate scalar field with its own sign convention (positive magnitude = downward pull).'),
}).describe('2D vector for position, velocity, or acceleration. Coordinate system: origin (0,0) at BOTTOM-LEFT, X increases right, Y increases upward (real-world physics coordinates).');

export type Vector2D = z.infer<typeof Vector2DSchema>;

// ============================================
// Vector Arrow Schemas
// ============================================
// The `kind` field selects color, default scale, and default label from the
// vectorTheme; all overridable per-arrow. See `src/components/simulation_components/
// renderables/vectorTheme.ts` for the runtime registry.

export const VectorKindSchema = z.enum(VECTOR_KINDS).describe('Vector arrow kind. Drives default color, scale, and label. "velocity" reads body.velocity; "acceleration" reads finite-differenced total acceleration; "force-net" = m·a_derived; the remaining force kinds are wired by later phases.');

const VectorLabelDefSchema = z.object({
  main: z.string().describe('Main glyph (e.g., "v", "F").'),
  sub: z.string().optional().describe('Subscript (e.g., "net", "app", "ar"). Rendered smaller with a baseline shift.'),
});

export const VectorArrowConfigSchema = z.object({
  kind: VectorKindSchema,
  pixelsPerUnit: z.number().positive().optional().describe('Override the kind\'s default pixels-per-SI-unit scale.'),
  color: z.string().optional().describe('Override the kind\'s standard color (any CSS color string).'),
  label: z.union([z.string(), VectorLabelDefSchema, z.null()]).optional().describe('Override the kind\'s standard label. A plain string is rendered as-is; {main, sub} renders the sub as a subscript; `null` suppresses the label entirely.'),
  labelPlacement: z.enum(['tail', 'midpoint', 'head']).optional().describe('Where to anchor the label relative to the arrow. Default: "midpoint" with a perpendicular offset to the arrow\'s left.'),
  labelFontSize: z.number().positive().optional().describe('Override the default label font size in px.'),
}).describe('A single vector arrow rendered on an object, with optional per-arrow visual overrides.');

export const VectorArrowEntrySchema = z.union([
  VectorKindSchema,
  VectorArrowConfigSchema,
]).describe('Either a kind name shorthand ("velocity") for default styling, or a full {kind, color?, label?, ...} config for per-arrow overrides.');

// VectorKind is owned by vectorTheme.ts (runtime source of truth, drives the
// color/label/scale registries). Re-export here so callers that already pull
// from the schema don't have to learn a second import path.
export type { VectorKind } from '../components/simulation_components/renderables/vectorTheme';
export type VectorArrowConfig = z.infer<typeof VectorArrowConfigSchema>;
export type VectorArrowEntry = z.infer<typeof VectorArrowEntrySchema>;

// ============================================
// Object Config Schema
// ============================================

// Back-compat shim: legacy sims authored `showForceArrows: true` (Phase 1 of
// the vector-arrows refactor). Translate to `showVectors: ["force-net"]` before
// validation. Legacy sims with `showForceArrows: false` (or unset) get the
// field dropped silently. If the new field is already present we don't touch
// it — the user's authored value always wins.
export const ObjectConfigSchema = z.preprocess(
  (raw) => {
    if (raw && typeof raw === 'object' && 'showForceArrows' in (raw as object)) {
      const { showForceArrows, ...rest } = raw as Record<string, unknown> & { showForceArrows?: unknown };
      if (showForceArrows === true && (rest as { showVectors?: unknown }).showVectors === undefined) {
        return { ...rest, showVectors: ['force-net'] };
      }
      return rest;
    }
    return raw;
  },
  z.object({
  id: z.string().describe('Unique identifier for this object (e.g., "ball", "boxA", "platform"). Used by controls, outputs, and graphs to reference this object.'),
  x: z.number().describe('Initial X position of the object\'s center, in configured units. With default settings (pixelsPerUnit=10, unit="m"), canvas is 80m wide. X=0 is left edge.'),
  y: z.number().describe('Initial Y position of the object\'s center, in configured units. With default settings, canvas is 60m tall. Y=0 is bottom edge, Y increases upward.'),
  width: z.number().describe('Bounding-box width in configured units. DIORAMA-SIZED, not real-world: pick from the SKELETON\'s scene_dimension so the largest object is ~10% of the smaller scene dimension and the smallest stays ≥ 4%. A "real" soccer ball is 0.22 m, but at a 30 m scene that\'s invisible — emit ~3 m instead. The actual collider shape (rectangle, circle, or convex hull) is looked up from the SVG manifest by `svg` and scaled into this box.'),
  height: z.number().describe('Bounding-box height in configured units. DIORAMA-SIZED, not real-world: pick to match the SVG\'s natural aspect ratio given `width`. The actual collider shape is looked up from the SVG manifest by `svg` and scaled into this box.'),
  svg: z.string().describe('Name of a renderable from public/renderables/manifest.json (e.g., "soccer_ball", "brick_block", "boat"). Drives both the visual sprite and the physical collider shape, scaled to width × height.'),
  velocity: Vector2DSchema.optional().describe('Initial linear velocity {x, y} in units/second. Positive Y = upward motion. Typical range: -30 to 30 m/s.'),
  acceleration: Vector2DSchema.optional().describe('Additional constant linear acceleration {x, y} in units/s², applied ON TOP OF environment gravity each frame via velocity integration (v += a·dt). NOT a gravity override — environment.gravity continues to act on this body. Use for non-gravity constant accelerations: rocket thrust ({x:0, y:15}), constant braking deceleration ({x:-3, y:0} on a body moving +x), conveyor-belt push, a constant horizontal wind, etc. Leave unset (or {x:0, y:0}) for plain gravity-only motion. Typical range: -20 to 20 m/s².'),
  restitution: z.number().optional().describe('Bounciness (0-1). 0 = no bounce, 1 = perfect bounce, 0.8 = realistic. Default: 0.8'),
  friction: z.number().optional().describe('Surface friction (0-1). Affects sliding against other objects. Default: 0.1'),
  dragCoefficient: z.number().optional().describe('Dimensionless drag coefficient (Cd) for the per-frame quadratic air-resistance model. Examples: 0.47 (sphere), 1.05 (cube broadside), 1.28 (flat plate), 1.5 (parachute / feather, high-drag). Set to 0 to opt this body out of air resistance entirely. Defaults to a shape-based value (sphere=0.47, rectangle=1.05, polygon=1.0). Active only when environment.airResistance.enabled is true.'),
  referenceArea: z.number().optional().describe('Drag reference area in m² for the per-frame quadratic air-resistance model. Defaults to the body\'s widest horizontal extent (treating the 2D world as a 1m-deep slice) — a stand-in for projected area perpendicular to vertical motion, the dominant case in secondary-curriculum drag problems. Override explicitly when the body travels horizontally (set to vertical extent instead) or when the body\'s shape implies a non-default frontal area. See the in-app "Design philosophy" doc for the linear-A scoping rationale.'),
  inertia: z.number().optional().describe('inertia is the second moment of area in two dimensions, affects rotation. Set to 1e10 for to prevent body rotation. Default: 0'),
  isStatic: z.boolean().optional().describe('If true, object is immovable (good for floors, walls, platforms). Default: false'),
  mass: z.number().optional().describe('Mass of the object in kg. Default: 1'),
  angularVelocity: z.number().optional().describe('Initial angular velocity in radians/second. Default: 0'),
  angle: z.number().optional().describe('Initial angle in radians. Default: 0'),
  showVectors: z.array(VectorArrowEntrySchema).optional().describe('Vector arrows to draw on this object. Each entry is either a shorthand kind string ("velocity", "acceleration", "force-net", "force-applied", "force-friction", "force-drag", "force-gravity") for default styling, or a full {kind, color?, label?, labelPlacement?, labelFontSize?, pixelsPerUnit?} config for per-arrow overrides. Multiple kinds can be combined on one body (e.g., ["velocity", "acceleration"] for a projectile, ["force-applied", "force-friction", "force-net"] for a Newton\'s 2nd Law diorama). Default: no arrows. (Legacy `showForceArrows: true` is auto-translated to `showVectors: ["force-net"]`.)'),
  }).describe('A physics object in the simulation. Carries position, bounding-box size, an SVG manifest name (which drives both visual and collider), and optional physics properties.')
);

export type ObjectConfig = z.infer<typeof ObjectConfigSchema>;

// ============================================
// Control Config Schemas (discriminated union)
// ============================================

export const SliderConfigSchema = z.object({
  type: z.literal('slider'),
  label: z.string().describe('Display label shown to users (e.g., "Initial Velocity", "Box A Speed")'),
  targetObj: z.string().describe('ID of the object to control (must match an object\'s id)'),
  property: z.string().describe('Property path to control. Cartesian components: "velocity.x", "velocity.y", "position.x", "position.y", "acceleration.x", "acceleration.y". Polar projections: "velocity.magnitude" / "velocity.angle" (and the same for acceleration). A ".magnitude" slider changes speed while preserving direction; an ".angle" slider rotates the vector while preserving magnitude — ideal for projectile launch (a Speed slider + a Launch-angle slider). Angle is in the environment\'s angleUnit (default degrees), measured counter-clockwise from +X. Note: an "acceleration.*" slider drives an ADDITIONAL constant acceleration on top of environment gravity (rocket thrust, braking, conveyor push) — not a gravity override.'),
  min: z.number().describe('Minimum slider value in configured units. Velocity: typically -30 to 30 m/s. Position X: 0 to canvas width. Position Y: 0 to canvas height. Acceleration: typically -20 to 20 m/s² for non-gravity effects.'),
  max: z.number().describe('Maximum slider value in configured units. With default settings: Position X max ~80m, Position Y max ~60m.'),
  step: z.number().describe('Slider increment in configured units. Use 0.01 for fine control, 0.1 for coarse control.'),
  defaultValue: z.number().describe('Initial value when simulation loads in configured units. Should match the object\'s initial property value.'),
}).describe('Slider control for adjusting numeric properties. Values are in real-world units (meters, etc.) with Y-up coordinates.');

export const ToggleConfigSchema = z.object({
  type: z.literal('toggle'),
  label: z.string().describe('Display label shown to users'),
  targetObj: z.string().describe('ID of the object to control (must match an object\'s id)'),
  property: z.string().describe('Property path to toggle. Example: "isStatic"'),
  defaultValue: z.boolean().describe('Initial toggle state'),
}).describe('Toggle control for boolean properties.');

export const ControlConfigSchema = z.discriminatedUnion('type', [
  SliderConfigSchema,
  ToggleConfigSchema,
]).describe('Interactive control for students to adjust simulation parameters. Sliders for numeric values, toggles for booleans.');

export type SliderConfig = z.infer<typeof SliderConfigSchema>;
export type ToggleConfig = z.infer<typeof ToggleConfigSchema>;
export type ControlConfig = z.infer<typeof ControlConfigSchema>;

// ============================================
// Output Config Schemas
// ============================================

export const OutputValueConfigSchema = z.object({
  label: z.string().describe('Display label (e.g., "Velocity", "Position X", "Acceleration")'),
  targetObj: z.string().describe('ID of the object to read from (must match an object\'s id)'),
  property: z.string().describe('Property path to display. Cartesian components: "velocity.x", "velocity.y", "acceleration.x", "acceleration.y", "position.x", "position.y". Polar projections: "velocity.magnitude" (speed, |v|), "velocity.angle" (direction), and the same for acceleration. Magnitude is in the configured length unit; angle is in the environment angleUnit (default degrees), counter-clockwise from +X.'),
  unit: z.string().optional().describe('Unit label for display (e.g., "m/s", "m/s²", "m"). Will use the configured unit type. Leave blank to auto-generate based on property and environment unit.'),
}).describe('A single value to display in real-time. Values are automatically converted to real-world units.');

export const OutputGroupConfigSchema = z.object({
  title: z.string().optional().describe('Group title (e.g., "Ball Outputs", "Box A Properties")'),
  values: z.array(OutputValueConfigSchema).describe('Array of values to display in this group'),
}).describe('A group of output values, typically for one object. Groups values visually.');

export type OutputValueConfig = z.infer<typeof OutputValueConfigSchema>;
export type OutputGroupConfig = z.infer<typeof OutputGroupConfigSchema>;

// ============================================
// Graph Config Schemas (discriminated union)
// ============================================

export const LineConfigSchema = z.object({
  label: z.string().describe('Line label for the legend (e.g., "Velocity Y", "Box A Position")'),
  color: z.string().describe('Line color as hex (e.g., "#ff6bff").'),
  targetObj: z.string().describe('ID of the object to track (must match an object\'s id)'),
  property: z.string().describe('Property path to plot. Cartesian components: "velocity.x", "velocity.y", "acceleration.x", "acceleration.y", "position.x", "position.y". Polar projections: "velocity.magnitude" (speed), "velocity.angle" (direction), and the same for acceleration. Overlaying e.g. ["velocity.x", "velocity.y", "velocity.magnitude"] is a useful component-vs-resultant view. Magnitude is in the configured length unit; angle is in the environment angleUnit (default degrees), counter-clockwise from +X.'),
}).describe('Configuration for a single line on a graph. Values are automatically converted to real-world units.');

export const LineGraphConfigSchema = z.object({
  type: z.literal('line'),
  title: z.string().describe('Graph title (e.g., "Velocity Over Time", "Position vs Time")'),
  yAxisRange: z.object({
    min: z.number().describe('Minimum Y-axis value in configured units (e.g., -2 for -2 m/s). Set to encompass expected values with padding.'),
    max: z.number().describe('Maximum Y-axis value in configured units (e.g., 2 for 2 m/s). Set to encompass expected values with padding.'),
  }).describe('Y-axis range in configured units. X-axis is always time in seconds.'),
  yAxisLabel: z.string().optional().describe('Y-axis label with units (e.g., "Velocity (m/s)", "Position (m)"). If not provided, defaults to "Value".'),
  lines: z.array(LineConfigSchema).describe('Array of lines to plot. Use contrasting colors for multiple lines.'),
}).describe('Time-series line graph. X-axis is time, Y-axis shows property values in real-world units. Great for comparing velocity vs acceleration.');

export const GraphConfigSchema = z.discriminatedUnion('type', [
  LineGraphConfigSchema,
]).describe('Graph configuration. Currently supports line graphs for time-series data.');

export type LineConfig = z.infer<typeof LineConfigSchema>;
export type LineGraphConfig = z.infer<typeof LineGraphConfigSchema>;
export type GraphConfig = z.infer<typeof GraphConfigSchema>;

// ============================================
// Air Resistance Config Schema
// ============================================

export const AirResistanceConfigSchema = z.object({
  enabled: z.boolean().optional().default(false).describe('When true, dynamic objects experience quadratic, mass-dependent drag: F_drag = ½·ρ·Cd·A·|v|·v. Each body uses its dragCoefficient and referenceArea (or shape-based defaults). When false (or omitted), no air-resistance compute runs and bodies move undamped. Default: false.'),
  airDensity: z.number().optional().default(1.225).describe('Air density ρ in kg/m³. Default: 1.225 (Earth at sea level). Use 0 for vacuum, ~0.020 for Mars surface, ~67 for Venus surface, ~1.977 for cold/dense air. Applies uniformly to every body subject to drag.'),
}).describe('Air-resistance settings, applied uniformly across the environment when enabled. Per-object drag intensity is set via the object\'s dragCoefficient and referenceArea (or their shape-based defaults). See the in-app "Design philosophy" doc for the diorama-scoped design rationale.');

// ============================================
// Environment Config Schema
// ============================================

export const EnvironmentConfigSchema = z.object({
  walls: z.array(z.enum(['left', 'right', 'top', 'bottom'])).describe('Array of walls to include. Options: "left", "right", "top", "bottom". Empty array [] = no walls (objects can exit canvas). Use walls to contain objects or create bounce surfaces.'),
  gravity: z.number().optional().default(9.8).describe('Gravity acceleration in units/s² (downward). Default: 9.8 for Earth gravity in m/s². Set to 0 for zero-gravity. For cm/s² use 980.'),
  unit: UnitTypeSchema.optional().default('m').describe('Unit of measurement for all positions, velocities, and sizes. Default: "m" (meters). Options: "m", "cm", "km", "ft", "in".'),
  angleUnit: AngleUnitSchema.optional().default('deg').describe('Display unit for angle quantities such as "velocity.angle" / "acceleration.angle". Default: "deg". Options: "deg", "rad", "rot". Mirrors `unit` for the angle family; physics is radians internally.'),
  pixelsPerUnit: z.number().optional().default(10).describe('Scale factor: how many pixels equal one unit. The simulation canvas is 800×600 pixels, so the SI canvas size is (800/pixelsPerUnit) × (600/pixelsPerUnit). Pick this value so the largest object is roughly 10–25% of the smaller canvas dimension.'),
  // Legacy "matter" values (early exploration, removed 2026-05-11) are coerced
  // to "rapier" so older saved configs don't fail validation on load.
  physicsEngine: z.preprocess(
    (v) => (v === 'matter' ? 'rapier' : v),
    z.enum(['rapier', 'planck']).optional().default('rapier'),
  ).describe('Which physics engine powers the simulation. "rapier" uses Rapier (WASM, SI-native, deterministic, default). "planck" uses Planck.js (pure JS port of Box2D, SI-native). Existing configs without this field use rapier.'),
  airResistance: AirResistanceConfigSchema.optional().describe('Optional air-resistance configuration. When omitted or .enabled = false, no per-frame drag is applied and bodies move undamped. When .enabled = true, quadratic mass-dependent drag is computed per body each frame from its dragCoefficient · referenceArea and the environment\'s airDensity.'),
}).describe('Environment settings. Controls units, scale, boundaries, and gravity. Uses real-world physics coordinates: origin at bottom-left, Y increases upward.');

export type AirResistanceConfig = z.infer<typeof AirResistanceConfigSchema>;

export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

// ============================================
// Simulation Config Schema (top-level)
// ============================================

const schemaDescription = `Physics simulation configuration using real-world units.

COORDINATE SYSTEM (Real-World Physics):
- Origin (0, 0) is at BOTTOM-LEFT corner of the simulation canvas
- X increases to the right
- Y increases UPWARD (like standard physics)
- Positive Y velocity = upward motion

CANVAS:
- The simulation canvas is 800 × 600 pixels.
- SI canvas size is (800 / pixelsPerUnit) × (600 / pixelsPerUnit) in the configured unit.
- With pixelsPerUnit=10 and unit="m" → 80m × 60m canvas.

DIORAMA SCOPING (CRITICAL — read before authoring sizes):
GIST sims are bounded teaching dioramas, not scale models of reality. Object widths/heights and scene scale are tuned so the action POPS on canvas, not so they match real-world spans. Physical constants (g, masses, velocities) stay realistic — only spatial scale is diorama-scoped. The qualitative claim ("the bowling ball looks bigger than the feather") is what students need; absolute size doesn't matter.

SCENE SCALE:
- Set by the action's time budget, NOT real-world span. Aim for the main event to resolve in 2–6 seconds. Working backward from a target time gives a scene size in the 10–80 unit range (most sims land 20–60).
- Free fall from rest: scene_height ≈ ½·g·t² (t=3s → 44m). Vertical toss: scene_height ≈ v₀²/(2g). Horizontal projectile: scene_width ≈ v₀·t. Add ~20% padding.

OBJECTS:
- Each object is described by its center (x, y), bounding-box width and height, and an svg name from the public manifest.
- The svg name drives BOTH the visual sprite AND the collider shape (rectangle / circle / convex hull). The collider is scaled to fit within width × height.
- Width/height are DIORAMA-SIZED, NOT real-world sizes. Rule: let D = the smaller scene dimension in configured units. Largest object ≈ 10% of D. Smallest object ≥ 4% of D. Preserve real-world ordering (bowling ball > feather) but compress extreme ratios (use ~2-3:1 visual ratio, not the real 5:1+).
- Aspect ratio per object: match the svg's natural ratio (a boat is wider than tall, a person is taller than wide).
- Always pass the same configured unit; do not mix.

GUIDELINES:
- Keep simulations simple: 1-3 objects, focus on 1-2 physics concepts
- Always include at least one control for interactivity
- Use outputs to show current state, graphs to show history
- Use clear, educational labels
- All values (positions, velocities, sizes) are in the configured unit

EXAMPLE 1 - Vertical Ball Toss:
${JSON.stringify(exampleTossBall, null, 2)}

EXAMPLE 2 - Two Boxes Collision:
${JSON.stringify(exampleTwoBoxes, null, 2)}`;

export const SimulationConfigSchema = z.object({
  title: z.string().describe('Short, clear title for the simulation. Should indicate the physics concept. Examples: "Toss Ball", "Two Boxes Collision", "Pendulum Motion"'),
  description: z.string().describe('Brief educational description for students explaining what they can learn or observe. Keep it engaging.'),
  environment: EnvironmentConfigSchema,
  objects: z.array(ObjectConfigSchema).optional().default([]).describe('Array of physics objects in the simulation. 1-3 objects recommended. Each object\'s collider shape and visual sprite both come from its `svg` manifest entry, scaled to width × height.'),
  controls: z.array(ControlConfigSchema).optional().default([]).describe('Interactive controls (sliders, toggles) for students to adjust parameters. Include at least one for interactivity.'),
  outputs: z.array(OutputGroupConfigSchema).optional().default([]).describe('Real-time value displays. Group by object. Show velocity, acceleration, position as relevant.'),
  graphs: z.array(GraphConfigSchema).optional().default([]).describe('Time-series graphs to visualize property changes. Great for comparing related quantities.'),
}).describe(schemaDescription);

export type SimulationConfig = z.infer<typeof SimulationConfigSchema>;

// ============================================
// Runtime types (used by components, includes callbacks)
// ============================================

export interface DataPoint {
  time: number;
  [key: string]: number;
}

// Re-export schema for JSON generation
export { SimulationConfigSchema as schema };
