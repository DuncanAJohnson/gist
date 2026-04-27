import { useEffect, useRef, type RefObject } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, WALL_THICKNESS } from '../../BaseSimulation';
import { WorldToCanvas } from '../../../lib/worldToCanvas';
import { getVisualDrawer } from './registry';
import { resolvePosition } from './positionSources';
import type { PixelRenderable, DataPositionResolver } from './types';
import type { PhysicsBody, Vec2 } from '../../../physics/types';
import './visuals';

interface RenderLayerProps {
  renderables: PixelRenderable[];
  objRefs: RefObject<Record<string, PhysicsBody>>;
  dataSources: Record<string, DataPositionResolver>;
  simulationTimeRef: RefObject<number>;
  canvasContainer: HTMLDivElement | null;
  pixelsPerUnit: number;
  /** Render-side zoom (live pixelsPerUnit / configPixelsPerUnit). The canvas
   * buffer scales by this; physics is unaffected. Defaults to 1. */
  zoomFactor?: number;
  gravity: Vec2;
}

function RenderLayer({
  renderables,
  objRefs,
  dataSources,
  simulationTimeRef,
  canvasContainer,
  pixelsPerUnit,
  zoomFactor = 1,
  gravity,
}: RenderLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Keep live pointers to the latest props so the rAF loop never reads stale data.
  const renderablesRef = useRef(renderables);
  const dataSourcesRef = useRef(dataSources);
  const pixelsPerUnitRef = useRef(pixelsPerUnit);
  const zoomFactorRef = useRef(zoomFactor);
  const gravityRef = useRef(gravity);
  renderablesRef.current = renderables;
  dataSourcesRef.current = dataSources;
  pixelsPerUnitRef.current = pixelsPerUnit;
  zoomFactorRef.current = zoomFactor;
  gravityRef.current = gravity;

  // Mount an overlay canvas inside the BaseSimulation container. Initial
  // dimensions read from the zoomFactor ref so a remount mid-zoom (e.g. engine
  // switch) doesn't briefly snap back to default size.
  useEffect(() => {
    if (!canvasContainer) return;
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH * zoomFactorRef.current;
    canvas.height = CANVAS_HEIGHT * zoomFactorRef.current;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.display = 'block';
    canvasContainer.style.position = 'relative';
    canvasContainer.appendChild(canvas);
    canvasRef.current = canvas;
    return () => {
      canvas.remove();
      canvasRef.current = null;
    };
  }, [canvasContainer]);

  // Resize the canvas buffer when the zoom slider moves. Setting width/height
  // attributes clears the buffer; the next rAF tick repaints, so a single
  // dropped frame is the only visible artifact.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_WIDTH * zoomFactor;
    canvas.height = CANVAS_HEIGHT * zoomFactor;
  }, [zoomFactor]);

  // rAF draw loop: always redraw at browser frame rate, reading live physics state.
  useEffect(() => {
    let rafId: number;

    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const cw = canvas.width;
          const ch = canvas.height;
          ctx.clearRect(0, 0, cw, ch);
          ctx.fillStyle = '#fafafa';
          ctx.fillRect(0, 0, cw, ch);

          const w2c = new WorldToCanvas(
            pixelsPerUnitRef.current,
            ch,
            WALL_THICKNESS * zoomFactorRef.current,
          );
          const resolveCtx = {
            objRefs: objRefs.current ?? {},
            dataSources: dataSourcesRef.current,
            simulationTime: simulationTimeRef.current ?? 0,
            w2c,
          };

          for (const r of renderablesRef.current) {
            const drawer = getVisualDrawer(r.visual.type);
            if (!drawer) continue;
            const resolved = resolvePosition(r.source, resolveCtx);
            if (!resolved) continue;
            drawer(
              {
                ctx,
                position: resolved.position,
                body: resolved.body,
                opacity: r.opacity,
                w2c,
                gravity: gravityRef.current,
              },
              r.visual
            );
          }
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [objRefs, simulationTimeRef]);

  return null;
}

export default RenderLayer;
