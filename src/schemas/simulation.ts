import { z } from 'zod';

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

// ============================================
// Vector Schemas
// ============================================

export const Vector2DSchema = z.object({
  x: z.number().describe('X component. For velocity: positive = rightward, negative = leftward. For position: depends on pixelsPerUnit scale.'),
  y: z.number().describe('Y component. For velocity: positive = downward, negative = upward. For position: Y increases upward from origin at bottom-left.'),
}).describe('2D vector for position, velocity, or acceleration. Coordinate system: origin (0,0) at BOTTOM-LEFT, X increases right, Y increases upward (real-world physics coordinates).');

export type Vector2D = z.infer<typeof Vector2DSchema>;

// ============================================
// Object Config Schema
// ============================================

export const ObjectConfigSchema = z.object({
  id: z.string().describe('Unique identifier for this object (e.g., "ball", "boxA", "platform"). Used by controls, outputs, and graphs to reference this object.'),
  x: z.number().describe('Initial X position of the object\'s center, in configured units. With default settings (pixelsPerUnit=10, unit="m"), canvas is 80m wide. X=0 is left edge.'),
  y: z.number().describe('Initial Y position of the object\'s center, in configured units. With default settings, canvas is 60m tall. Y=0 is bottom edge, Y increases upward.'),
  width: z.number().describe('Bounding-box width in configured units. The actual collider shape (rectangle, circle, or convex hull) is looked up from the SVG manifest by `svg` and scaled into this box.'),
  height: z.number().describe('Bounding-box height in configured units. The actual collider shape is looked up from the SVG manifest by `svg` and scaled into this box.'),
  svg: z.string().describe('Name of a renderable from public/renderables/manifest.json (e.g., "soccer_ball", "brick_block", "boat"). Drives both the visual sprite and the physical collider shape, scaled to width × height.'),
  velocity: Vector2DSchema.optional().describe('Initial linear velocity {x, y} in units/second. Positive Y = upward motion. Typical range: -30 to 30 m/s.'),
  acceleration: Vector2DSchema.optional().describe('Initial linear acceleration {x, y} in units/s². Usually not set directly; gravity provides Y acceleration.'),
  restitution: z.number().optional().describe('Bounciness (0-1). 0 = no bounce, 1 = perfect bounce, 0.8 = realistic. Default: 0.8'),
  frictionAir: z.number().optional().describe('Air resistance (0-1). 0 = no drag, 0.01-0.05 = light damping, 0.1 = high drag. Default: 0'),
  friction: z.number().optional().describe('Surface friction (0-1). Affects sliding against other objects. Default: 0.1'),
  frictionStatic: z.number().optional().describe('Static surface friction (0-10). As in a Coulomb friction model, static friction affects friction resistance when an object is at rest. Default: 0.5'),
  inertia: z.number().optional().describe('inertia is the second moment of area in two dimensions, affects rotation. Set to 1e10 for to prevent body rotation. Default: 0'),
  isStatic: z.boolean().optional().describe('If true, object is immovable (good for floors, walls, platforms). Default: false'),
  mass: z.number().optional().describe('Mass of the object in kg. Default: 1'),
  angularVelocity: z.number().optional().describe('Initial angular velocity in radians/second. Default: 0'),
  angle: z.number().optional().describe('Initial angle in radians. Default: 0'),
  showForceArrows: z.boolean().optional().describe('If true, draw arrows on this object showing the net force from the physics engine. Default: false'),
}).describe('A physics object in the simulation. Carries position, bounding-box size, an SVG manifest name (which drives both visual and collider), and optional physics properties.');

export type ObjectConfig = z.infer<typeof ObjectConfigSchema>;

// ============================================
// Control Config Schemas (discriminated union)
// ============================================

export const SliderConfigSchema = z.object({
  type: z.literal('slider'),
  label: z.string().describe('Display label shown to users (e.g., "Initial Velocity", "Box A Speed")'),
  targetObj: z.string().describe('ID of the object to control (must match an object\'s id)'),
  property: z.string().describe('Property path to control. Options: "velocity.x", "velocity.y", "position.x", "position.y"'),
  min: z.number().describe('Minimum slider value in configured units. Velocity: typically -30 to 30 m/s. Position X: 0 to canvas width. Position Y: 0 to canvas height.'),
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
  property: z.string().describe('Property path to display. Options: "velocity.x", "velocity.y", "acceleration.x", "acceleration.y", "position.x", "position.y"'),
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
  property: z.string().describe('Property path to plot. Options: "velocity.x", "velocity.y", "acceleration.x", "acceleration.y", "position.x", "position.y"'),
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
// Environment Config Schema
// ============================================

export const EnvironmentConfigSchema = z.object({
  walls: z.array(z.enum(['left', 'right', 'top', 'bottom'])).describe('Array of walls to include. Options: "left", "right", "top", "bottom". Empty array [] = no walls (objects can exit canvas). Use walls to contain objects or create bounce surfaces.'),
  gravity: z.number().optional().default(9.8).describe('Gravity acceleration in units/s² (downward). Default: 9.8 for Earth gravity in m/s². Set to 0 for zero-gravity. For cm/s² use 980.'),
  unit: UnitTypeSchema.optional().default('m').describe('Unit of measurement for all positions, velocities, and sizes. Default: "m" (meters). Options: "m", "cm", "km", "ft", "in".'),
  pixelsPerUnit: z.number().optional().default(10).describe('Scale factor: how many pixels equal one unit. The simulation canvas is 800×600 pixels, so the SI canvas size is (800/pixelsPerUnit) × (600/pixelsPerUnit). Pick this value so the largest object is roughly 10–25% of the smaller canvas dimension.'),
  physicsEngine: z.enum(['matter', 'rapier', 'planck']).optional().default('rapier').describe('Which physics engine powers the simulation. "matter" uses Matter.js. "rapier" uses Rapier (WASM, SI-native, deterministic, default). "planck" uses Planck.js (pure JS port of Box2D, SI-native). Existing configs without this field use rapier.'),
}).describe('Environment settings. Controls units, scale, boundaries, and gravity. Uses real-world physics coordinates: origin at bottom-left, Y increases upward.');

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
- Pick pixelsPerUnit so the LARGEST object is roughly 10–25% of the smaller (600 px) dimension.

OBJECTS:
- Each object is described by its center (x, y), bounding-box width and height, and an svg name from the public manifest.
- The svg name drives BOTH the visual sprite AND the collider shape (rectangle / circle / convex hull). The collider is scaled to fit within width × height.
- Width and height should reflect the typical real-world bounding box of the named object (e.g., a soccer_ball is ~0.22 m, a brick_block is ~0.5 m, a person is ~1.8 m tall).
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
