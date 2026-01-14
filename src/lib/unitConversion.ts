import { 
  SIMULATION_WIDTH, 
  SIMULATION_HEIGHT, 
  WALL_THICKNESS 
} from '../components/BaseSimulation';

/**
 * Supported unit types for the simulation
 */
export type UnitType = 'm' | 'cm' | 'km' | 'ft' | 'in';

/**
 * Unit labels for display purposes
 */
export const UNIT_LABELS: Record<UnitType, string> = {
  m: 'meters',
  cm: 'centimeters',
  km: 'kilometers',
  ft: 'feet',
  in: 'inches',
};

/**
 * Unit abbreviations for compact display
 */
export const UNIT_ABBREV: Record<UnitType, string> = {
  m: 'm',
  cm: 'cm',
  km: 'km',
  ft: 'ft',
  in: 'in',
};

/**
 * UnitConverter handles conversions between real-world units and Matter.js pixels.
 * 
 * Coordinate systems:
 * - Real-world (JSON config): Origin at bottom-left of usable space, Y increases upward
 * - Matter.js (pixels): Origin at top-left of canvas, Y increases downward
 * 
 * The usable simulation space is offset by WALL_THICKNESS from the canvas edges.
 * The conversion uses pixelsPerUnit to scale values, adds wall offset, and flips Y-axis.
 */
export class UnitConverter {
  public readonly unit: UnitType;
  public readonly pixelsPerUnit: number;
  private readonly simulationWidth: number;
  private readonly simulationHeight: number;
  private readonly wallOffset: number;
  private readonly frameRate: number;

  constructor(unit: UnitType = 'm', pixelsPerUnit: number = 100, simulationWidth: number = SIMULATION_WIDTH, simulationHeight: number = SIMULATION_HEIGHT, frameRate: number = 60) {
    this.unit = unit;
    this.pixelsPerUnit = pixelsPerUnit;
    this.simulationWidth = simulationWidth;
    this.simulationHeight = simulationHeight;
    this.wallOffset = WALL_THICKNESS;
    this.frameRate = frameRate;
  }

  /**
   * Get the unit abbreviation for display (e.g., "m", "cm")
   */
  getUnitLabel(): string {
    return UNIT_ABBREV[this.unit];
  }

  /**
   * Get usable simulation dimensions in the configured unit
   */
  getSimulationDimensions(): { width: number; height: number } {
    return {
      width: this.simulationWidth / this.pixelsPerUnit,
      height: this.simulationHeight / this.pixelsPerUnit,
    };
  }

  // ==========================================
  // Position Conversions
  // ==========================================

  /**
   * Convert X position from real-world units to canvas pixels
   * (scale + wall offset: simulation x=0 is at canvas x=wallOffset)
   */
  toPixelsX(value: number): number {
    return value * this.pixelsPerUnit + this.wallOffset;
  }

  /**
   * Convert X position from canvas pixels to real-world units
   */
  fromPixelsX(pixels: number): number {
    return (pixels - this.wallOffset) / this.pixelsPerUnit;
  }

  /**
   * Convert Y position from real-world units to canvas pixels
   * (scale + Y-axis flip + wall offset: simulation y=0 is at the bottom of usable space)
   */
  toPixelsY(value: number): number {
    // Bottom of usable space in canvas coords is: wallOffset + simulationHeight
    // Simulation y=0 → canvas y = wallOffset + simulationHeight
    // Simulation y increases → canvas y decreases
    return this.wallOffset + this.simulationHeight - (value * this.pixelsPerUnit);
  }

  /**
   * Convert Y position from canvas pixels to real-world units
   */
  fromPixelsY(pixels: number): number {
    return (this.wallOffset + this.simulationHeight - pixels) / this.pixelsPerUnit;
  }

  /**
   * Convert position vector from real-world units to pixels
   */
  toPixelsPosition(pos: { x: number; y: number }): { x: number; y: number } {
    return {
      x: this.toPixelsX(pos.x),
      y: this.toPixelsY(pos.y),
    };
  }

  /**
   * Convert position vector from pixels to real-world units
   */
  fromPixelsPosition(pos: { x: number; y: number }): { x: number; y: number } {
    return {
      x: this.fromPixelsX(pos.x),
      y: this.fromPixelsY(pos.y),
    };
  }

  // ==========================================
  // Velocity and Acceleration Conversions
  // ==========================================

  /**
   * Convert X velocity or acceleration from real-world units to pixels
   * (simple scale, no flip)
   */
  toPixelsVelocityAccelerationX(value: number): number {
    return value * this.pixelsPerUnit / this.frameRate;
  }

  /**
   * Convert X velocity or acceleration from pixels to real-world units
   */
  fromPixelsVelocityAccelerationX(pixels: number): number {
    return pixels * this.frameRate / this.pixelsPerUnit;
  }

  /**
   * Convert Y velocity or acceleration from real-world units to pixels
   * (scale + negate: positive Y in real-world is upward, but downward in pixels)
   */
  toPixelsVelocityAccelerationY(value: number): number {
    return -value * this.pixelsPerUnit / this.frameRate;
  }

  /**
   * Convert Y velocity or acceleration from pixels to real-world units
   */
  fromPixelsVelocityAccelerationY(pixels: number): number {
    return -pixels * this.frameRate / this.pixelsPerUnit;
  }

  /**
   * Convert velocity or acceleration vector from real-world units to pixels
   */
  toPixelsVelocityAcceleration(vector: { x: number; y: number }): { x: number; y: number } {
    return {
      x: this.toPixelsVelocityAccelerationX(vector.x),
      y: this.toPixelsVelocityAccelerationY(vector.y),
    };
  }

  /**
   * Convert movement vector from pixels to real-world units
   */
  fromPixelsVelocityAcceleration(vector: { x: number; y: number }): { x: number; y: number } {
    return {
      x: this.fromPixelsVelocityAccelerationX(vector.x),
      y: this.fromPixelsVelocityAccelerationY(vector.y),
    };
  }

  // ==========================================
  // Dimension Conversions (no flip, just scale)
  // ==========================================

  /**
   * Convert a dimension (radius, width, height) from real-world units to pixels
   */
  toPixelsDimension(value: number): number {
    return value * this.pixelsPerUnit;
  }

  /**
   * Convert a dimension from pixels to real-world units
   */
  fromPixelsDimension(pixels: number): number {
    return pixels / this.pixelsPerUnit;
  }

  // ==========================================
  // Gravity Conversion
  // ==========================================

  /**
   * Convert gravity from real-world units (e.g., 9.8 m/s²) to Matter.js gravity scale.
   * 
   * Matter.js applies gravity as: force = mass * gravity.y * gravity.scale * delta²
   * where delta is in milliseconds (typically 16.67ms for 60fps).
   * 
   * To achieve real-world gravity acceleration in pixel space:
   * - Real gravity: g units/s² → g * pixelsPerUnit pixels/s²
   * - Matter.js uses gravity.y = 1 as direction
   * - We need to calculate the scale factor
   * 
   * The formula accounts for Matter.js's internal time handling.
   */
  toMatterGravityScale(gravity: number): number {
    return (gravity * this.pixelsPerUnit) / 1000000;
  }

  // ==========================================
  // Property-specific conversion helpers
  // ==========================================

  /**
   * Convert a property value from real-world units to pixels based on property path
   */
  toPixelsProperty(property: string, value: number): number {
    if (property.startsWith('position.') || property === 'x') {
      const axis = property.split('.').pop();
      return axis === 'y' ? this.toPixelsY(value) : this.toPixelsX(value);
    }
    if (property.startsWith('velocity.') || property.startsWith('acceleration.')) {
      const axis = property.split('.').pop();
      return axis === 'y' ? this.toPixelsVelocityAccelerationY(value) : this.toPixelsVelocityAccelerationX(value);
    }
    // Default: treat as dimension (no flip)
    return this.toPixelsDimension(value);
  }

  /**
   * Convert a property value from pixels to real-world units based on property path
   */
  fromPixelsProperty(property: string, pixels: number): number {
    if (property.startsWith('position.') || property === 'x') {
      const axis = property.split('.').pop();
      return axis === 'y' ? this.fromPixelsY(pixels) : this.fromPixelsX(pixels);
    }
    if (property.startsWith('velocity.') || property.startsWith('acceleration.')) {
      const axis = property.split('.').pop();
      return axis === 'y' ? this.fromPixelsVelocityAccelerationY(pixels) : this.fromPixelsVelocityAccelerationX(pixels);
    }
    // Default: treat as dimension (no flip)
    return this.fromPixelsDimension(pixels);
  }
}

/**
 * Create a UnitConverter from environment config
 */
export function createUnitConverter(environment: {
  unit?: UnitType;
  pixelsPerUnit?: number;
}): UnitConverter {
  return new UnitConverter(
    environment.unit ?? 'm',
    environment.pixelsPerUnit ?? 100
  );
}

