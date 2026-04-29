import { WorldToCanvas } from './worldToCanvas';
import type { ObjectConfig } from '../schemas/simulation';

export type CornerKey = 'tl' | 'tr' | 'bl' | 'br';
export type EdgeKey = 't' | 'r' | 'b' | 'l';
export type HandleKey = CornerKey | EdgeKey;

export interface ObjectAABBPx {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface ObjectEditCommit {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DragState =
  | { kind: 'idle' }
  | {
      kind: 'dragging-body';
      id: string;
      pointerStart: CanvasPoint;
      objectStartSI: { x: number; y: number };
    }
  | {
      kind: 'dragging-corner';
      id: string;
      corner: CornerKey;
      anchorSI: { x: number; y: number };
      aspectRatio: number;
      uniform: boolean;
    }
  | {
      kind: 'dragging-edge';
      id: string;
      edge: EdgeKey;
      anchorSI: { x: number; y: number };
      otherWidthSI: number;
      otherHeightSI: number;
    };

const HANDLE_HIT_RADIUS = 9;

export function getObjectAABBPx(
  obj: Pick<ObjectConfig, 'x' | 'y' | 'width' | 'height'>,
  w2c: WorldToCanvas,
  unitScale: number,
): ObjectAABBPx {
  const cx = w2c.pointX(obj.x * unitScale);
  const cy = w2c.pointY(obj.y * unitScale);
  const halfW = (obj.width * unitScale * w2c.pixelsPerUnit) / 2;
  const halfH = (obj.height * unitScale * w2c.pixelsPerUnit) / 2;
  return {
    cx,
    cy,
    halfW,
    halfH,
    left: cx - halfW,
    right: cx + halfW,
    top: cy - halfH,
    bottom: cy + halfH,
  };
}

export function getCornerHandlePositions(aabb: ObjectAABBPx): Record<CornerKey, CanvasPoint> {
  return {
    tl: { x: aabb.left, y: aabb.top },
    tr: { x: aabb.right, y: aabb.top },
    bl: { x: aabb.left, y: aabb.bottom },
    br: { x: aabb.right, y: aabb.bottom },
  };
}

export function getEdgeHandlePositions(aabb: ObjectAABBPx): Record<EdgeKey, CanvasPoint> {
  return {
    t: { x: aabb.cx, y: aabb.top },
    r: { x: aabb.right, y: aabb.cy },
    b: { x: aabb.cx, y: aabb.bottom },
    l: { x: aabb.left, y: aabb.cy },
  };
}

function distanceSq(a: CanvasPoint, b: CanvasPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function hitHandle(
  p: CanvasPoint,
  aabb: ObjectAABBPx,
  showEdges: boolean,
): HandleKey | null {
  const r2 = HANDLE_HIT_RADIUS * HANDLE_HIT_RADIUS;
  const corners = getCornerHandlePositions(aabb);
  for (const key of ['tl', 'tr', 'bl', 'br'] as CornerKey[]) {
    if (distanceSq(p, corners[key]) <= r2) return key;
  }
  if (showEdges) {
    const edges = getEdgeHandlePositions(aabb);
    for (const key of ['t', 'r', 'b', 'l'] as EdgeKey[]) {
      if (distanceSq(p, edges[key]) <= r2) return key;
    }
  }
  return null;
}

export function hitBody(p: CanvasPoint, aabb: ObjectAABBPx): boolean {
  return p.x >= aabb.left && p.x <= aabb.right && p.y >= aabb.top && p.y <= aabb.bottom;
}

export function cursorForHandle(handle: HandleKey): string {
  switch (handle) {
    case 'tl':
    case 'br':
      return 'nwse-resize';
    case 'tr':
    case 'bl':
      return 'nesw-resize';
    case 'l':
    case 'r':
      return 'ew-resize';
    case 't':
    case 'b':
      return 'ns-resize';
  }
}

const CORNER_OPPOSITE_SI: Record<CornerKey, { sx: -1 | 1; sy: -1 | 1 }> = {
  // sx, sy point from anchor (opposite corner) to dragged corner in SI (Y up).
  tl: { sx: -1, sy: 1 },
  tr: { sx: 1, sy: 1 },
  bl: { sx: -1, sy: -1 },
  br: { sx: 1, sy: -1 },
};

const EDGE_OPPOSITE_SI: Record<EdgeKey, { sx: -1 | 0 | 1; sy: -1 | 0 | 1 }> = {
  l: { sx: -1, sy: 0 },
  r: { sx: 1, sy: 0 },
  t: { sx: 0, sy: 1 },
  b: { sx: 0, sy: -1 },
};

export function getCornerAnchorSI(
  obj: Pick<ObjectConfig, 'x' | 'y' | 'width' | 'height'>,
  corner: CornerKey,
  unitScale: number,
): { x: number; y: number } {
  const halfWSI = (obj.width * unitScale) / 2;
  const halfHSI = (obj.height * unitScale) / 2;
  const sign = CORNER_OPPOSITE_SI[corner];
  return {
    x: obj.x * unitScale - sign.sx * halfWSI,
    y: obj.y * unitScale - sign.sy * halfHSI,
  };
}

export function getEdgeAnchorSI(
  obj: Pick<ObjectConfig, 'x' | 'y' | 'width' | 'height'>,
  edge: EdgeKey,
  unitScale: number,
): { x: number; y: number } {
  const halfWSI = (obj.width * unitScale) / 2;
  const halfHSI = (obj.height * unitScale) / 2;
  const sign = EDGE_OPPOSITE_SI[edge];
  return {
    x: obj.x * unitScale - sign.sx * halfWSI,
    y: obj.y * unitScale - sign.sy * halfHSI,
  };
}

export function computeMoveCommit(
  state: Extract<DragState, { kind: 'dragging-body' }>,
  pointerCanvas: CanvasPoint,
  w2c: WorldToCanvas,
  unitScale: number,
): { x: number; y: number } {
  const startSI = w2c.fromPoint(state.pointerStart);
  const nowSI = w2c.fromPoint(pointerCanvas);
  const dxSI = nowSI.x - startSI.x;
  const dySI = nowSI.y - startSI.y;
  const newCxSI = state.objectStartSI.x + dxSI;
  const newCySI = state.objectStartSI.y + dySI;
  return { x: newCxSI / unitScale, y: newCySI / unitScale };
}

export function computeCornerCommit(
  state: Extract<DragState, { kind: 'dragging-corner' }>,
  pointerCanvas: CanvasPoint,
  w2c: WorldToCanvas,
  unitScale: number,
  minSizeSI: number,
): ObjectEditCommit {
  const pSI = w2c.fromPoint(pointerCanvas);
  const sign = CORNER_OPPOSITE_SI[state.corner];
  const rawWSI = Math.abs(pSI.x - state.anchorSI.x);
  const rawHSI = Math.abs(pSI.y - state.anchorSI.y);

  const aspect = state.uniform ? 1 : state.aspectRatio;

  let newWSI: number;
  let newHSI: number;
  if (rawWSI / aspect >= rawHSI) {
    newWSI = Math.max(minSizeSI, rawWSI);
    newHSI = newWSI / aspect;
  } else {
    newHSI = Math.max(minSizeSI, rawHSI);
    newWSI = newHSI * aspect;
  }
  if (newWSI < minSizeSI) {
    newWSI = minSizeSI;
    newHSI = newWSI / aspect;
  }
  if (newHSI < minSizeSI) {
    newHSI = minSizeSI;
    newWSI = newHSI * aspect;
  }

  const newCxSI = state.anchorSI.x + sign.sx * (newWSI / 2);
  const newCySI = state.anchorSI.y + sign.sy * (newHSI / 2);

  return {
    x: newCxSI / unitScale,
    y: newCySI / unitScale,
    width: newWSI / unitScale,
    height: newHSI / unitScale,
  };
}

export function computeEdgeCommit(
  state: Extract<DragState, { kind: 'dragging-edge' }>,
  pointerCanvas: CanvasPoint,
  w2c: WorldToCanvas,
  unitScale: number,
  minSizeSI: number,
): ObjectEditCommit {
  const pSI = w2c.fromPoint(pointerCanvas);
  const sign = EDGE_OPPOSITE_SI[state.edge];
  const isHorizontalEdge = state.edge === 'l' || state.edge === 'r';

  let newWSI: number;
  let newHSI: number;
  let newCxSI: number;
  let newCySI: number;

  if (isHorizontalEdge) {
    newWSI = Math.max(minSizeSI, Math.abs(pSI.x - state.anchorSI.x));
    newHSI = state.otherHeightSI;
    newCxSI = state.anchorSI.x + sign.sx * (newWSI / 2);
    newCySI = state.anchorSI.y;
  } else {
    newHSI = Math.max(minSizeSI, Math.abs(pSI.y - state.anchorSI.y));
    newWSI = state.otherWidthSI;
    newCxSI = state.anchorSI.x;
    newCySI = state.anchorSI.y + sign.sy * (newHSI / 2);
  }

  return {
    x: newCxSI / unitScale,
    y: newCySI / unitScale,
    width: newWSI / unitScale,
    height: newHSI / unitScale,
  };
}
