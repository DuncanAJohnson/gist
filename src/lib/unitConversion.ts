import { BASE_SIMULATION_HEIGHT, BASE_SIMULATION_WIDTH } from '../components/BaseSimulation';

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
 * - Real-world (JSON config): Origin at bottom-left, Y increases upward
 * - Matter.js (pixels): Origin at top-left, Y increases downward
 * 
 * The conversion uses pixelsPerUnit to scale values and flips Y-axis for positions/velocities.
 */
export class UnitConverter {
  public readonly unit: UnitType;
  public readonly pixelsPerUnit: number;
  private readonly canvasWidth: number;
  private readonly canvasHeight: number;
  private readonly frameRate: number;

  constructor(unit: UnitType = 'm', pixelsPerUnit: number = 100, canvasWidth: number = BASE_SIMULATION_WIDTH, canvasHeight: number = BASE_SIMULATION_HEIGHT, frameRate: number = 60) {
    this.unit = unit;
    this.pixelsPerUnit = pixelsPerUnit;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.frameRate = frameRate;
  }

  /**
   * Get the unit abbreviation for display (e.g., "m", "cm")
   */
  getUnitLabel(): string {
    return UNIT_ABBREV[this.unit];
  }

  /**
   * Get canvas dimensions in the configured unit
   */
  getCanvasDimensions(): { width: number; height: number } {
    return {
      width: this.canvasWidth / this.pixelsPerUnit,
      height: this.canvasHeight / this.pixelsPerUnit,
    };
  }

  // ==========================================
  // Position Conversions
  // ==========================================

  /**
   * Convert X position from real-world units to pixels
   * (simple scale, no flip)
   */
  toPixelsX(value: number): number {
    return value * this.pixelsPerUnit;
  }

  /**
   * Convert X position from pixels to real-world units
   */
  fromPixelsX(pixels: number): number {
    return pixels / this.pixelsPerUnit;
  }

  /**
   * Convert Y position from real-world units to pixels
   * (scale + Y-axis flip: bottom-left origin to top-left origin)
   */
  toPixelsY(value: number): number {
    return this.canvasHeight - (value * this.pixelsPerUnit);
  }

  /**
   * Convert Y position from pixels to real-world units
   */
  fromPixelsY(pixels: number): number {
    return (this.canvasHeight - pixels) / this.pixelsPerUnit;
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

