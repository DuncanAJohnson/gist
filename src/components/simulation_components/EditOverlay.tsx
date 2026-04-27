import { useEffect, useRef, type RefObject } from 'react';
import { CANVAS_HEIGHT, CANVAS_WIDTH, WALL_THICKNESS } from '../BaseSimulation';
import { WorldToCanvas } from '../../lib/worldToCanvas';
import { getManifestItem } from '../../lib/renderableManifest';
import type { ObjectConfig } from '../../schemas/simulation';
import type { PhysicsBody } from '../../physics/types';
import {
  computeCornerCommit,
  computeEdgeCommit,
  computeMoveCommit,
  cursorForHandle,
  getCornerAnchorSI,
  getCornerHandlePositions,
  getEdgeAnchorSI,
  getEdgeHandlePositions,
  getObjectAABBPx,
  hitBody,
  hitHandle,
  type CanvasPoint,
  type DragState,
  type ObjectAABBPx,
  type ObjectEditCommit,
} from '../../lib/editGeometry';

interface EditOverlayProps {
  canvasContainer: HTMLDivElement | null;
  editModeActive: boolean;
  editedObjects: ObjectConfig[];
  selectedObjectId: string | null;
  onSelect: (id: string | null) => void;
  onCommitEdit: (id: string, partial: ObjectEditCommit) => void;
  objRefs: RefObject<Record<string, PhysicsBody>>;
  pixelsPerMeter: number;
  unitScale: number;
}

const HANDLE_SIZE = 8;
const ACCENT = '#2563eb';
const ACCENT_FILL = '#ffffff';

function isCircleObject(svg: string): boolean {
  const item = getManifestItem(svg);
  return item?.physical_properties.collider.type === 'circle';
}

function EditOverlay({
  canvasContainer,
  editModeActive,
  editedObjects,
  selectedObjectId,
  onSelect,
  onCommitEdit,
  objRefs,
  pixelsPerMeter,
  unitScale,
}: EditOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStateRef = useRef<DragState>({ kind: 'idle' });
  const lastPointerRef = useRef<CanvasPoint | null>(null);

  // Live-pointer refs so the rAF loop and event handlers always see fresh values.
  const editModeActiveRef = useRef(editModeActive);
  const editedObjectsRef = useRef(editedObjects);
  const selectedObjectIdRef = useRef(selectedObjectId);
  const onSelectRef = useRef(onSelect);
  const onCommitEditRef = useRef(onCommitEdit);
  const pixelsPerMeterRef = useRef(pixelsPerMeter);
  const unitScaleRef = useRef(unitScale);
  editModeActiveRef.current = editModeActive;
  editedObjectsRef.current = editedObjects;
  selectedObjectIdRef.current = selectedObjectId;
  onSelectRef.current = onSelect;
  onCommitEditRef.current = onCommitEdit;
  pixelsPerMeterRef.current = pixelsPerMeter;
  unitScaleRef.current = unitScale;

  // Mount the overlay canvas on top of RenderLayer's canvas.
  useEffect(() => {
    if (!canvasContainer) return;
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.display = 'block';
    canvas.style.zIndex = '2';
    canvas.style.pointerEvents = 'none';
    canvasContainer.style.position = 'relative';
    canvasContainer.appendChild(canvas);
    canvasRef.current = canvas;
    return () => {
      canvas.remove();
      canvasRef.current = null;
    };
  }, [canvasContainer]);

  // Toggle pointer-events based on edit mode.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.pointerEvents = editModeActive ? 'auto' : 'none';
    if (!editModeActive) {
      canvas.style.cursor = 'default';
      dragStateRef.current = { kind: 'idle' };
    }
  }, [editModeActive]);

  // Pointer event handlers.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPointer = (e: PointerEvent): CanvasPoint => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    };

    const buildW2C = () =>
      new WorldToCanvas(pixelsPerMeterRef.current, CANVAS_HEIGHT, WALL_THICKNESS);

    const findObject = (id: string): ObjectConfig | undefined =>
      editedObjectsRef.current.find((o) => o.id === id);

    const onPointerDown = (e: PointerEvent) => {
      if (!editModeActiveRef.current) return;
      if (e.button !== 0) return;
      const p = getPointer(e);
      lastPointerRef.current = p;
      const w2c = buildW2C();
      const unit = unitScaleRef.current;

      const selId = selectedObjectIdRef.current;
      if (selId) {
        const selObj = findObject(selId);
        if (selObj) {
          const aabb = getObjectAABBPx(selObj, w2c, unit);
          const showEdges = !isCircleObject(selObj.svg);
          const handle = hitHandle(p, aabb, showEdges);
          if (handle) {
            canvas.setPointerCapture(e.pointerId);
            if (handle === 'tl' || handle === 'tr' || handle === 'bl' || handle === 'br') {
              const isCircle = isCircleObject(selObj.svg);
              dragStateRef.current = {
                kind: 'dragging-corner',
                id: selObj.id,
                corner: handle,
                anchorSI: getCornerAnchorSI(selObj, handle, unit),
                aspectRatio: selObj.height > 0 ? selObj.width / selObj.height : 1,
                uniform: isCircle,
              };
            } else {
              dragStateRef.current = {
                kind: 'dragging-edge',
                id: selObj.id,
                edge: handle,
                anchorSI: getEdgeAnchorSI(selObj, handle, unit),
                otherWidthSI: selObj.width * unit,
                otherHeightSI: selObj.height * unit,
              };
            }
            canvas.style.cursor = cursorForHandle(handle);
            e.preventDefault();
            return;
          }
        }
      }

      // Body hit-test in reverse order so the most-recently-defined object wins
      // when overlapping (matches RenderLayer's draw-by-zIndex order).
      const objects = editedObjectsRef.current;
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        const aabb = getObjectAABBPx(obj, w2c, unit);
        if (hitBody(p, aabb)) {
          canvas.setPointerCapture(e.pointerId);
          onSelectRef.current(obj.id);
          const body = objRefs.current?.[obj.id];
          const startSI = body
            ? { x: body.position.x, y: body.position.y }
            : { x: obj.x * unit, y: obj.y * unit };
          dragStateRef.current = {
            kind: 'dragging-body',
            id: obj.id,
            pointerStart: p,
            objectStartSI: startSI,
          };
          canvas.style.cursor = 'grabbing';
          e.preventDefault();
          return;
        }
      }

      // Empty space → clear selection.
      onSelectRef.current(null);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!editModeActiveRef.current) return;
      const p = getPointer(e);
      lastPointerRef.current = p;
      const state = dragStateRef.current;
      const w2c = buildW2C();
      const unit = unitScaleRef.current;

      if (state.kind === 'dragging-body') {
        const body = objRefs.current?.[state.id];
        if (body) {
          const startSI = w2c.fromPoint(state.pointerStart);
          const nowSI = w2c.fromPoint(p);
          body.position.x = state.objectStartSI.x + (nowSI.x - startSI.x);
          body.position.y = state.objectStartSI.y + (nowSI.y - startSI.y);
        }
        return;
      }

      if (state.kind === 'dragging-corner' || state.kind === 'dragging-edge') {
        // Resize math is computed each frame by the rAF loop for the ghost; no live body mutation.
        return;
      }

      // Idle: update cursor based on hover.
      const selId = selectedObjectIdRef.current;
      let cursor = 'default';
      if (selId) {
        const selObj = findObject(selId);
        if (selObj) {
          const aabb = getObjectAABBPx(selObj, w2c, unit);
          const showEdges = !isCircleObject(selObj.svg);
          const handle = hitHandle(p, aabb, showEdges);
          if (handle) {
            cursor = cursorForHandle(handle);
          } else if (hitBody(p, aabb)) {
            cursor = 'grab';
          }
        }
      }
      if (cursor === 'default') {
        const objects = editedObjectsRef.current;
        for (let i = objects.length - 1; i >= 0; i--) {
          const aabb = getObjectAABBPx(objects[i], w2c, unit);
          if (hitBody(p, aabb)) {
            cursor = 'grab';
            break;
          }
        }
      }
      canvas.style.cursor = cursor;
    };

    const onPointerUp = (e: PointerEvent) => {
      const state = dragStateRef.current;
      if (state.kind === 'idle') return;
      const p = getPointer(e);
      const w2c = buildW2C();
      const unit = unitScaleRef.current;
      const minSizeSI = 4 / Math.max(pixelsPerMeterRef.current, 0.0001);

      if (state.kind === 'dragging-body') {
        const moved = computeMoveCommit(state, p, w2c, unit);
        const obj = findObject(state.id);
        if (obj) {
          onCommitEditRef.current(state.id, {
            x: moved.x,
            y: moved.y,
            width: obj.width,
            height: obj.height,
          });
        }
      } else if (state.kind === 'dragging-corner') {
        const commit = computeCornerCommit(state, p, w2c, unit, minSizeSI);
        onCommitEditRef.current(state.id, commit);
      } else if (state.kind === 'dragging-edge') {
        const commit = computeEdgeCommit(state, p, w2c, unit, minSizeSI);
        onCommitEditRef.current(state.id, commit);
      }

      dragStateRef.current = { kind: 'idle' };
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer may not be captured (e.g. cancel after lostpointercapture); ignore.
      }
      canvas.style.cursor = 'default';
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    };
  }, [objRefs]);

  // rAF draw loop.
  useEffect(() => {
    let rafId: number;

    const drawHandle = (ctx: CanvasRenderingContext2D, p: CanvasPoint) => {
      const half = HANDLE_SIZE / 2;
      ctx.fillStyle = ACCENT_FILL;
      ctx.fillRect(p.x - half, p.y - half, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x - half, p.y - half, HANDLE_SIZE, HANDLE_SIZE);
    };

    const drawAABB = (ctx: CanvasRenderingContext2D, aabb: ObjectAABBPx, dashed: boolean) => {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      if (dashed) ctx.setLineDash([6, 4]);
      ctx.strokeRect(aabb.left, aabb.top, aabb.right - aabb.left, aabb.bottom - aabb.top);
      ctx.setLineDash([]);
    };

    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

          if (editModeActiveRef.current) {
            const w2c = new WorldToCanvas(
              pixelsPerMeterRef.current,
              CANVAS_HEIGHT,
              WALL_THICKNESS,
            );
            const unit = unitScaleRef.current;
            const selId = selectedObjectIdRef.current;
            if (selId) {
              const obj = editedObjectsRef.current.find((o) => o.id === selId);
              if (obj) {
                const showEdges = !isCircleObject(obj.svg);
                const drag = dragStateRef.current;

                // For body drags, render the outline at the live body position.
                let aabb: ObjectAABBPx;
                if (drag.kind === 'dragging-body' && drag.id === selId) {
                  const body = objRefs.current?.[selId];
                  if (body) {
                    const liveObj: ObjectConfig = {
                      ...obj,
                      x: body.position.x / unit,
                      y: body.position.y / unit,
                    };
                    aabb = getObjectAABBPx(liveObj, w2c, unit);
                  } else {
                    aabb = getObjectAABBPx(obj, w2c, unit);
                  }
                } else {
                  aabb = getObjectAABBPx(obj, w2c, unit);
                }

                drawAABB(ctx, aabb, false);

                const corners = getCornerHandlePositions(aabb);
                drawHandle(ctx, corners.tl);
                drawHandle(ctx, corners.tr);
                drawHandle(ctx, corners.bl);
                drawHandle(ctx, corners.br);
                if (showEdges) {
                  const edges = getEdgeHandlePositions(aabb);
                  drawHandle(ctx, edges.t);
                  drawHandle(ctx, edges.r);
                  drawHandle(ctx, edges.b);
                  drawHandle(ctx, edges.l);
                }

                // Draw ghost rectangle during a resize drag.
                if (
                  (drag.kind === 'dragging-corner' || drag.kind === 'dragging-edge') &&
                  drag.id === selId &&
                  lastPointerRef.current
                ) {
                  const minSizeSI = 4 / Math.max(pixelsPerMeterRef.current, 0.0001);
                  const commit =
                    drag.kind === 'dragging-corner'
                      ? computeCornerCommit(drag, lastPointerRef.current, w2c, unit, minSizeSI)
                      : computeEdgeCommit(drag, lastPointerRef.current, w2c, unit, minSizeSI);
                  const ghostObj: ObjectConfig = { ...obj, ...commit };
                  const ghostAABB = getObjectAABBPx(ghostObj, w2c, unit);
                  drawAABB(ctx, ghostAABB, true);
                }
              }
            }
          }
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [objRefs]);

  return null;
}

export default EditOverlay;
