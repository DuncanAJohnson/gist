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
// Body Config Schemas (discriminated union)
// ============================================

export const RectangleBodyConfigSchema = z.object({
  type: z.literal('rectangle'),
  width: z.number().describe('Width in configured units (with default pixelsPerUnit=10 and unit="m", 4-8m recommended for visibility)'),
  height: z.number().describe('Height in configured units (with default pixelsPerUnit=10 and unit="m", 4-8m recommended for visibility)'),
  color: z.string().optional().describe('Hex color (e.g., "#ff6bff"). Good choices: "#ff6bff" (pink), "#4ecdc4" (teal), "#ff6b6b" (coral), "#95e1d3" (mint)'),
}).describe('Rectangular body shape. Use for boxes, platforms, walls.');

export const CircleBodyConfigSchema = z.object({
  type: z.literal('circle'),
  radius: z.number().describe('Radius in configured units (with default pixelsPerUnit=10 and unit="m", 2-4m recommended for visibility)'),
  color: z.string().optional().describe('Hex color (e.g., "#ff6bff"). Good choices: "#ff6bff" (pink), "#4ecdc4" (teal), "#ff6b6b" (coral), "#95e1d3" (mint)'),
}).describe('Circular body shape. Use for balls, wheels, planets.');

export const PolygonBodyConfigSchema = z.object({
  type: z.literal('polygon'),
  sides: z.number().describe('Number of sides (3 = triangle, 5 = pentagon, 6 = hexagon, etc.)'),
  radius: z.number().describe('Radius from center to vertices in configured units (with default pixelsPerUnit=10 and unit="m", 2-4m recommended for visibility)'),
  color: z.string().optional().describe('Hex color (e.g., "#ff6bff")'),
}).describe('Regular polygon body shape. Use for triangles, pentagons, hexagons.');

export const VertexBodyConfigSchema = z.object({
  type: z.literal('vertex'),
  vertices: z.array(Vector2DSchema).describe('Array of {x, y} points defining the polygon vertices in order'),
  color: z.string().optional().describe('Hex color (e.g., "#ff6bff")'),
}).describe('Custom polygon defined by vertices. Use for irregular shapes, ramps, custom obstacles.');

export const BodyConfigSchema = z.discriminatedUnion('type', [
  RectangleBodyConfigSchema,
  CircleBodyConfigSchema,
  PolygonBodyConfigSchema,
  VertexBodyConfigSchema,
]).describe('Shape configuration for a physics body. Choose from: rectangle, circle, polygon, or vertex (custom shape).');

export type RectangleBodyConfig = z.infer<typeof RectangleBodyConfigSchema>;
export type CircleBodyConfig = z.infer<typeof CircleBodyConfigSchema>;
export type PolygonBodyConfig = z.infer<typeof PolygonBodyConfigSchema>;
export type VertexBodyConfig = z.infer<typeof VertexBodyConfigSchema>;
export type BodyConfig = z.infer<typeof BodyConfigSchema>;

// ============================================
// Object Config Schema
// ============================================

export const ObjectConfigSchema = z.object({
  id: z.string().describe('Unique identifier for this object (e.g., "ball", "boxA", "platform"). Used by controls, outputs, and graphs to reference this object.'),
  x: z.number().describe('Initial X position in configured units. With default settings (pixelsPerUnit=10, unit="m"), canvas is 80m wide. X=0 is left edge.'),
  y: z.number().describe('Initial Y position in configured units. With default settings, (pixelsPerUnit=10, unit="m"), canvas is 60m tall. Y=0 is bottom edge, Y increases upward.'),
  body: BodyConfigSchema,
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
}).describe('A physics object in the simulation. Configure shape, position, velocity, and physics properties. Uses real-world units with Y-up coordinate system.');

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
  color: z.string().describe('Line color as hex (e.g., "#ff6bff"). Match object colors for visual consistency.'),
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
  pixelsPerUnit: z.number().optional().default(10).describe('Scale factor: how many pixels equal one unit. Default: 10 (10px = 1m, giving 80m x 60m canvas). For larger simulations, use smaller values (e.g., 8 for 100m x 75m canvas).'),
}).describe('Environment settings. Controls units, scale, boundaries, and gravity. Uses real-world physics coordinates: origin at bottom-left, Y increases upward.');

export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

// ============================================
// Simulation Config Schema (top-level)
// ============================================

const schemaDescription = `Physics simulation configuration using real-world units with Matter.js engine.

COORDINATE SYSTEM (Real-World Physics):
- Origin (0, 0) is at BOTTOM-LEFT corner
- X increases to the right
- Y increases UPWARD (like standard physics)
- Positive Y velocity = upward motion

UNITS & SCALE:
- Default: unit="m" (meters), pixelsPerUnit=100 → 8m x 6m canvas
- For larger simulations: reduce pixelsPerUnit (e.g., 8 → 100m x 75m canvas)
- For smaller simulations: increase pixelsPerUnit or use "cm"
- Gravity default: 9.8 m/s² (Earth gravity)

GUIDELINES:
- Keep simulations simple: 1-3 objects, focus on 1-2 physics concepts
- Always include at least one control for interactivity
- Use outputs to show current state, graphs to show history
- Match graph line colors to object colors for visual consistency
- Use clear, educational labels
- All values (positions, velocities, sizes) are in the configured unit

GOOD COLOR CHOICES:
- "#ff6bff" (pink/magenta)
- "#4ecdc4" (teal/cyan)
- "#ff6b6b" (coral/red)
- "#95e1d3" (mint green)
- "#ffa07a" (light salmon)

EXAMPLE 1 - Vertical Ball Toss:
${JSON.stringify(exampleTossBall, null, 2)}

EXAMPLE 2 - Two Boxes Collision:
${JSON.stringify(exampleTwoBoxes, null, 2)}`;

export const SimulationConfigSchema = z.object({
  title: z.string().describe('Short, clear title for the simulation. Should indicate the physics concept. Examples: "Toss Ball", "Two Boxes Collision", "Pendulum Motion"'),
  description: z.string().describe('Brief educational description for students explaining what they can learn or observe. Keep it engaging.'),
  environment: EnvironmentConfigSchema,
  objects: z.array(ObjectConfigSchema).optional().default([]).describe('Array of physics objects in the simulation. 1-3 objects recommended.'),
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
