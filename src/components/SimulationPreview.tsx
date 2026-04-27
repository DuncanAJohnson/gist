import { useEffect, useState } from 'react';
import { getSimulation } from '../lib/simulationService';
import type { ObjectConfig } from '../schemas/simulation';

interface Props {
  simulationId: number;
  width?: number;
  height?: number;
}

const SIM_W = 800;
const SIM_H = 600;

const configCache = new Map<number, any>();

function flipY(y: number) {
  return SIM_H - y;
}

function SimulationPreview({ simulationId, width = 240, height = 180 }: Props) {
  const [config, setConfig] = useState<any>(() => configCache.get(simulationId) ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (configCache.has(simulationId)) {
      setConfig(configCache.get(simulationId));
      return;
    }
    let alive = true;
    getSimulation(simulationId)
      .then((json) => {
        configCache.set(simulationId, json);
        if (alive) setConfig(json);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [simulationId]);

  const frame = 'rounded-lg border border-gray-200 bg-white shadow-lg p-2';

  if (error) {
    return (
      <div
        className={`${frame} flex items-center justify-center text-xs text-gray-400`}
        style={{ width, height }}
      >
        Preview unavailable
      </div>
    );
  }

  if (!config) {
    return (
      <div
        className={`${frame} flex items-center justify-center text-xs text-gray-400`}
        style={{ width, height }}
      >
        Loading preview…
      </div>
    );
  }

  const ppu = config?.environment?.pixelsPerUnit ?? 10;
  const objects: ObjectConfig[] = Array.isArray(config?.objects) ? config.objects : [];

  return (
    <div className={frame}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${SIM_W} ${SIM_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', borderRadius: 4 }}
      >
        <rect x={0} y={0} width={SIM_W} height={SIM_H} fill="#fafafa" />
        {objects.map((obj, i) => {
          if (!obj?.svg) return null;
          const cx = (obj.x ?? 0) * ppu;
          const cy = flipY((obj.y ?? 0) * ppu);
          const w = (obj.width ?? 0) * ppu;
          const h = (obj.height ?? 0) * ppu;
          const angleDeg = obj.angle ? (-obj.angle * 180) / Math.PI : 0;
          const transform = angleDeg ? `rotate(${angleDeg} ${cx} ${cy})` : undefined;
          return (
            <image
              key={obj.id ?? `obj-${i}`}
              href={`/renderables/${obj.svg}.svg`}
              x={cx - w / 2}
              y={cy - h / 2}
              width={w}
              height={h}
              transform={transform}
              preserveAspectRatio="xMidYMid meet"
            />
          );
        })}
        {objects.length === 0 && (
          <text x={SIM_W / 2} y={SIM_H / 2} fontSize={40} fill="#bbb" textAnchor="middle">
            (no objects)
          </text>
        )}
      </svg>
    </div>
  );
}

export default SimulationPreview;
