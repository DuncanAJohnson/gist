declare module 'poly-decomp' {
  type Point = [number, number];
  type Polygon = Point[];

  export function makeCCW(polygon: Polygon): boolean;
  export function quickDecomp(polygon: Polygon): Polygon[];
  export function decomp(polygon: Polygon): Polygon[];
  export function isSimple(polygon: Polygon): boolean;
  export function removeCollinearPoints(polygon: Polygon, thresholdAngle: number): void;
  export function removeDuplicatePoints(polygon: Polygon, precision: number): void;
}

