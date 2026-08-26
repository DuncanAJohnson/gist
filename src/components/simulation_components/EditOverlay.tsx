import { useEffect, useRef, type RefObject } from 'react';
import { CANVAS_HEIGHT, CANVAS_WIDTH, WALL_THICKNESS } from '../BaseSimulation';
import { WorldToCanvas } from '../../lib/worldToCanvas';
import { getManifestItem } from '../../lib/renderableManifest';
import type { ExpandedObjectConfig } from '../../schemas/simulation';
import type { PhysicsBody } from '../../physics/types';
import type { InfoTarget } from '../../lib/infoTargets';
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
  /**
   * When true and editModeActive is false, body clicks bubble up via
   * onResetPromptRequested instead of selecting/editing — used to surface a
   * "reset the sim to move objects" prompt while running or paused mid-sim.
   */
  clickShowsResetPrompt: boolean;
  editedObjects: ExpandedObjectConfig[];
  selectedObjectId: string | null;
  onSelect: (id: string | null) => void;
  onCommitEdit: (id: string, partial: ObjectEditCommit) => void;
  /**
   * Called when the user clicks an object body while editing is locked. The
   * overlay reports viewport (page) coordinates so a popup can be positioned
   * next to the click.
   */
  onResetPromptRequested?: (clientX: number, clientY: number) => void;
  objRefs: RefObject<Record<string, PhysicsBody>>;
  /**
   * ⇧-click info gesture (InfoBoxes). Active in every mode except position
   * picking; the overlay canvas therefore keeps pointer-events on whenever
   * this is true, even when neither editing nor the reset prompt is live.
   */
  infoActive?: boolean;
  /** Which walls exist, so the floor/walls are hit-testable info targets. */
  walls?: readonly string[];
  /** Hover target changed (null = nothing under the pointer). */
  onInfoHover?: (target: InfoTarget | null, clientX: number, clientY: number, shiftHeld: boolean) => void;
  /** ⇧-click on a target. */
  onInfoPin?: (target: InfoTarget, clientX: number, clientY: number) => void;
  /** Plain pointerdown anywhere on the canvas — dismisses pinned boxes. */
  onInfoClear?: () => void;
  pixelsPerMeter: number;
  unitScale: number;
  /**
   * Render-side zoom factor (live pixelsPerUnit / configPixelsPerUnit). The
   * overlay's bitmap and CSS dimensions scale by this so it stays pixel-aligned
   * with the main RenderLayer canvas — without it, the overlay bitmap stays at
   * the unzoomed size, the browser stretches it via CSS to fill the zoomed
   * container, and the AABB math (which uses the zoomed `pixelsPerMeter`)
   * lands handles outside the visible area and breaks hit-tests when zoomed.
   * Defaults to 1.
   */
  zoomFactor?: number;
}

const HANDLE_SIZE = 8;
const ACCENT = '#2563eb';
const ACCENT_FILL = '#ffffff';

function isCircleObject(svg: string): boolean {
  const item = getManifestItem(svg);
  // collider can be null in shipped manifest entries (e.g. "basketball") —
  // those fall back to rectangle colliders, so treat them as non-circles.
  return item?.physical_properties.collider?.type === 'circle';
}

function EditOverlay({
  canvasContainer,
  editModeActive,
  clickShowsResetPrompt,
  editedObjects,
  selectedObjectId,
  onSelect,
  onCommitEdit,
  onResetPromptRequested,
  objRefs,
  infoActive = false,
  walls,
  onInfoHover,
  onInfoPin,
  onInfoClear,
  pixelsPerMeter,
  unitScale,
  zoomFactor = 1,
}: EditOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStateRef = useRef<DragState>({ kind: 'idle' });
  const lastPointerRef = useRef<CanvasPoint | null>(null);

  // Live-pointer refs so the rAF loop and event handlers always see fresh values.
  const editModeActiveRef = useRef(editModeActive);
  const clickShowsResetPromptRef = useRef(clickShowsResetPrompt);
  const editedObjectsRef = useRef(editedObjects);
  const selectedObjectIdRef = useRef(selectedObjectId);
  const onSelectRef = useRef(onSelect);
  const onCommitEditRef = useRef(onCommitEdit);
  const onResetPromptRequestedRef = useRef(onResetPromptRequested);
  const pixelsPerMeterRef = useRef(pixelsPerMeter);
  const unitScaleRef = useRef(unitScale);
  const zoomFactorRef = useRef(zoomFactor);
  const infoActiveRef = useRef(infoActive);
  const wallsRef = useRef(walls);
  const onInfoHoverRef = useRef(onInfoHover);
  const onInfoPinRef = useRef(onInfoPin);
  const onInfoClearRef = useRef(onInfoClear);
  const lastInfoHoverRef = useRef<{ key: string | null; shift: boolean }>({ key: null, shift: false });
  infoActiveRef.current = infoActive;
  wallsRef.current = walls;
  onInfoHoverRef.current = onInfoHover;
  onInfoPinRef.current = onInfoPin;
  onInfoClearRef.current = onInfoClear;
  editModeActiveRef.current = editModeActive;
  clickShowsResetPromptRef.current = clickShowsResetPrompt;
  editedObjectsRef.current = editedObjects;
  selectedObjectIdRef.current = selectedObjectId;
  onSelectRef.current = onSelect;
  onCommitEditRef.current = onCommitEdit;
  onResetPromptRequestedRef.current = onResetPromptRequested;
  pixelsPerMeterRef.current = pixelsPerMeter;
  unitScaleRef.current = unitScale;
  zoomFactorRef.current = zoomFactor;

  // Mount the overlay canvas on top of RenderLayer's canvas. Initial bitmap
  // and CSS dimensions read from the zoom ref so a remount mid-zoom doesn't
  // briefly snap back to the unzoomed size.
  useEffect(() => {
    if (!canvasContainer) return;
    const z = zoomFactorRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH * z;
    canvas.height = CANVAS_HEIGHT * z;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = `${z * 100}%`;
    canvas.style.height = `${z * 100}%`;
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

  // Resize the overlay buffer when the zoom slider moves. Mirrors the same
  // pattern in RenderLayer so the two canvases stay pixel-aligned.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_WIDTH * zoomFactor;
    canvas.height = CANVAS_HEIGHT * zoomFactor;
    canvas.style.width = `${zoomFactor * 100}%`;
    canvas.style.height = `${zoomFactor * 100}%`;
  }, [zoomFactor]);

  // Toggle pointer-events: capture clicks both for edit mode and for the
  // "click while running/dirty → show reset prompt" affordance.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const interactive = editModeActive || clickShowsResetPrompt;
    canvas.style.pointerEvents = interactive || infoActive ? 'auto' : 'none';
    if (!editModeActive) {
      dragStateRef.current = { kind: 'idle' };
    }
    if (!interactive) {
      canvas.style.cursor = 'default';
    }
  }, [editModeActive, clickShowsResetPrompt, infoActive]);

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

    // pixelsPerMeter is already zoom-scaled by JsonSimulation; canvasHeight
    // and wallOffset are scaled here so the three inputs to WorldToCanvas
    // form a consistent coordinate system. Matches the construction in
    // RenderLayer.tsx's draw loop.
    const buildW2C = () => {
      const z = zoomFactorRef.current;
      return new WorldToCanvas(
        pixelsPerMeterRef.current,
        CANVAS_HEIGHT * z,
        WALL_THICKNESS * z,
      );
    };

    const findObject = (id: string): ExpandedObjectConfig | undefined =>
      editedObjectsRef.current.find((o) => o.id === id);

    // Return obj with x/y substituted from the live physics body, so the
    // overlay tracks the engine pose (which a slider on position.x/y can move
    // independently of editedConfig). Falls back to editedConfig if no body.
    const liveObj = (obj: ExpandedObjectConfig, unit: number): ExpandedObjectConfig => {
      const body = objRefs.current?.[obj.id];
      if (!body) return obj;
      return { ...obj, x: body.position.x / unit, y: body.position.y / unit };
    };

    // Info-target hit test: bodies first (reverse order, like selection), then
    // the wall slabs by their canvas-pixel rectangles — walls are not objects,
    // but the floor is the contact most friction questions are about.
    const hitInfoTarget = (p: CanvasPoint, w2c: WorldToCanvas, unit: number): InfoTarget | null => {
      const objects = editedObjectsRef.current;
      for (let i = objects.length - 1; i >= 0; i--) {
        if (hitBody(p, getObjectAABBPx(liveObj(objects[i], unit), w2c, unit))) {
          return { kind: 'object', id: objects[i].id };
        }
      }
      const z = zoomFactorRef.current;
      const t = WALL_THICKNESS * z;
      const W = CANVAS_WIDTH * z;
      const H = CANVAS_HEIGHT * z;
      const has = (side: string) => wallsRef.current?.includes(side) === true;
      if (has('bottom') && p.y >= H - t) return { kind: 'wall', side: 'bottom' };
      if (has('top') && p.y <= t) return { kind: 'wall', side: 'top' };
      if (has('left') && p.x <= t) return { kind: 'wall', side: 'left' };
      if (has('right') && p.x >= W - t) return { kind: 'wall', side: 'right' };
      return null;
    };

    const reportInfoHover = (e: PointerEvent, p: CanvasPoint, w2c: WorldToCanvas, unit: number) => {
      if (!infoActiveRef.current || !onInfoHoverRef.current) return;
      const target = hitInfoTarget(p, w2c, unit);
      const key = target ? (target.kind === 'object' ? `object:${target.id}` : `wall:${target.side}`) : null;
      const last = lastInfoHoverRef.current;
      // Fire on target/shift change — and on every move while over a target,
      // so the hint and hover box follow the pointer.
      if (key === last.key && e.shiftKey === last.shift && key === null) return;
      lastInfoHoverRef.current = { key, shift: e.shiftKey };
      onInfoHoverRef.current(target, e.clientX, e.clientY, e.shiftKey);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const p = getPointer(e);
      lastPointerRef.current = p;
      const w2c = buildW2C();
      const unit = unitScaleRef.current;

      // ⇧-click: pin an info box. Claims the click outright — no selection,
      // no drag, no reset prompt. A plain click anywhere dismisses the pins.
      if (infoActiveRef.current) {
        if (e.shiftKey) {
          const target = hitInfoTarget(p, w2c, unit);
          if (target) {
            onInfoPinRef.current?.(target, e.clientX, e.clientY);
            e.preventDefault();
            return;
          }
        } else {
          onInfoClearRef.current?.();
        }
      }

      // Editing is locked (sim running or paused mid-sim) — if a body was
      // clicked, hand the viewport-space click coords up so a "reset to edit"
      // prompt can appear.
      if (!editModeActiveRef.current) {
        if (!clickShowsResetPromptRef.current) return;
        const objects = editedObjectsRef.current;
        for (let i = objects.length - 1; i >= 0; i--) {
          const aabb = getObjectAABBPx(liveObj(objects[i], unit), w2c, unit);
          if (hitBody(p, aabb)) {
            onResetPromptRequestedRef.current?.(e.clientX, e.clientY);
            e.preventDefault();
            return;
          }
        }
        return;
      }

      const selId = selectedObjectIdRef.current;
      if (selId) {
        const selObj = findObject(selId);
        if (selObj) {
          const aabb = getObjectAABBPx(liveObj(selObj, unit), w2c, unit);
          const showEdges = !isCircleObject(selObj.svg);
          const handle = hitHandle(p, aabb, showEdges);
          if (handle) {
            canvas.setPointerCapture(e.pointerId);
            if (handle === 'tl' || handle === 'tr' || handle === 'bl' || handle === 'br') {
              const isCircle = isCircleObject(selObj.svg);
              const liveSel = liveObj(selObj, unit);
              dragStateRef.current = {
                kind: 'dragging-corner',
                id: selObj.id,
                corner: handle,
                anchorSI: getCornerAnchorSI(liveSel, handle, unit),
                aspectRatio: selObj.height > 0 ? selObj.width / selObj.height : 1,
                uniform: isCircle,
              };
            } else {
              const liveSel = liveObj(selObj, unit);
              dragStateRef.current = {
                kind: 'dragging-edge',
                id: selObj.id,
                edge: handle,
                anchorSI: getEdgeAnchorSI(liveSel, handle, unit),
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
        const aabb = getObjectAABBPx(liveObj(obj, unit), w2c, unit);
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
      const p = getPointer(e);
      lastPointerRef.current = p;
      const state = dragStateRef.current;
      const w2c = buildW2C();
      const unit = unitScaleRef.current;

      if (state.kind === 'idle') reportInfoHover(e, p, w2c, unit);

      if (!editModeActiveRef.current) {
        // Hint that bodies are clickable; clicking will trigger the reset prompt.
        if (clickShowsResetPromptRef.current) {
          let cursor = 'default';
          const objects = editedObjectsRef.current;
          for (let i = objects.length - 1; i >= 0; i--) {
            if (hitBody(p, getObjectAABBPx(liveObj(objects[i], unit), w2c, unit))) {
              cursor = 'pointer';
              break;
            }
          }
          canvas.style.cursor = cursor;
        }
        return;
      }

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
          const aabb = getObjectAABBPx(liveObj(selObj, unit), w2c, unit);
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
          const aabb = getObjectAABBPx(liveObj(objects[i], unit), w2c, unit);
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

    const onPointerLeave = () => {
      if (lastInfoHoverRef.current.key === null) return;
      lastInfoHoverRef.current = { key: null, shift: false };
      onInfoHoverRef.current?.(null, 0, 0, false);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
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
          // Clear using the bitmap's actual size (already zoom-scaled by the
          // zoomFactor effect above), not the unzoomed constants.
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (editModeActiveRef.current) {
            const z = zoomFactorRef.current;
            const w2c = new WorldToCanvas(
              pixelsPerMeterRef.current,
              CANVAS_HEIGHT * z,
              WALL_THICKNESS * z,
            );
            const unit = unitScaleRef.current;
            const selId = selectedObjectIdRef.current;
            if (selId) {
              const obj = editedObjectsRef.current.find((o) => o.id === selId);
              if (obj) {
                const showEdges = !isCircleObject(obj.svg);
                const drag = dragStateRef.current;

                // Always render outline + handles at the live body position so
                // the overlay tracks any motion (drag or position slider).
                const body = objRefs.current?.[selId];
                const drawObj: ExpandedObjectConfig = body
                  ? { ...obj, x: body.position.x / unit, y: body.position.y / unit }
                  : obj;
                const aabb = getObjectAABBPx(drawObj, w2c, unit);

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
                  const ghostObj: ExpandedObjectConfig = { ...obj, ...commit };
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
