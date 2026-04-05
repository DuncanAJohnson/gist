import { useEffect, useRef, type RefObject } from 'react';
import type Matter from 'matter-js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../BaseSimulation';
import { getVisualDrawer } from './registry';
import { resolvePosition } from './positionSources';
import type { PixelRenderable, DataPositionResolver } from './types';
import './visuals';

interface RenderLayerProps {
  renderables: PixelRenderable[];
  objRefs: RefObject<Record<string, Matter.Body>>;
  dataSources: Record<string, DataPositionResolver>;
  simulationTimeRef: RefObject<number>;
  canvasContainer: HTMLDivElement | null;
}

function RenderLayer({
  renderables,
  objRefs,
  dataSources,
  simulationTimeRef,
  canvasContainer,
}: RenderLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Keep live pointers to the latest props so the rAF loop never reads stale data.
  const renderablesRef = useRef(renderables);
  const dataSourcesRef = useRef(dataSources);
  renderablesRef.current = renderables;
  dataSourcesRef.current = dataSources;

  // Mount an overlay canvas inside the BaseSimulation container.
  useEffect(() => {
    if (!canvasContainer) return;
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
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

  // rAF draw loop: always redraw at browser frame rate, reading live physics state.
  useEffect(() => {
    let rafId: number;

    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.fillStyle = '#fafafa';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

          const resolveCtx = {
            objRefs: objRefs.current ?? {},
            dataSources: dataSourcesRef.current,
            simulationTime: simulationTimeRef.current ?? 0,
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
