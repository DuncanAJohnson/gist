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
const DEFAULT_COLOR = '#4ecdc4';

const configCache = new Map<number, any>();

function flipY(y: number) {
  return SIM_H - y;
}

type ResolvedPos = { cx: number; cy: number; angleDeg: number };

function resolveSource(
  source: any,
  objectsById: Map<string, ObjectConfig>,
  ppu: number
): ResolvedPos | null {
  if (!source || typeof source !== 'object') return null;
  if (source.type === 'body') {
    const obj = objectsById.get(source.bodyId);
    if (!obj) return null;
    const followAngle = source.followAngle !== false;
    const worldAngle = followAngle ? obj.angle ?? 0 : 0;
    return {
      cx: (obj.x ?? 0) * ppu,
      cy: flipY((obj.y ?? 0) * ppu),
      angleDeg: (-worldAngle * 180) / Math.PI,
    };
  }
  if (source.type === 'fixed') {
    return {
      cx: (source.x ?? 0) * ppu,
      cy: flipY((source.y ?? 0) * ppu),
      angleDeg: source.angle ? (-source.angle * 180) / Math.PI : 0,
    };
  }
  // 'data' sources have no value at t=0; skip in preview.
  return null;
}

function shapeFromBody(
  body: any,
  cx: number,
  cy: number,
  ppu: number,
  transform: string | undefined,
  key: string | number
) {
  if (!body || !body.type) return null;
  const color = typeof body.color === 'string' && body.color ? body.color : DEFAULT_COLOR;

  if (body.type === 'rectangle') {
    const w = (body.width ?? 0) * ppu;
    const h = (body.height ?? 0) * ppu;
    return (
      <rect
        key={key}
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        fill={color}
        transform={transform}
      />
    );
  }
  if (body.type === 'circle') {
    return (
      <circle key={key} cx={cx} cy={cy} r={(body.radius ?? 0) * ppu} fill={color} />
    );
  }
  if (body.type === 'polygon') {
    const sides: number = body.sides ?? 0;
    const r = (body.radius ?? 0) * ppu;
    const points: string[] = [];
    for (let i = 0; i < sides; i++) {
      const theta = (i * 2 * Math.PI) / sides - Math.PI / 2;
      points.push(`${cx + r * Math.cos(theta)},${cy + r * Math.sin(theta)}`);
    }
    return <polygon key={key} points={points.join(' ')} fill={color} transform={transform} />;
  }
  if (body.type === 'vertex') {
    const verts: Array<{ x: number; y: number }> = body.vertices ?? [];
    const points = verts.map((v) => `${cx + v.x * ppu},${cy - v.y * ppu}`).join(' ');
    return <polygon key={key} points={points} fill={color} transform={transform} />;
  }
  return null;
}

function shapeFromVisual(
  visual: any,
  cx: number,
  cy: number,
  ppu: number,
  transform: string | undefined,
  opacity: number,
  key: string | number
) {
  const color = typeof visual.color === 'string' && visual.color ? visual.color : DEFAULT_COLOR;
  const stroke = typeof visual.stroke === 'string' ? visual.stroke : undefined;
  const strokeWidth = visual.strokeWidth;

  if (visual.shape === 'rectangle') {
    const w = (visual.width ?? 0) * ppu;
    const h = (visual.height ?? 0) * ppu;
    return (
      <rect
        key={key}
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        fill={color}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        transform={transform}
      />
    );
  }
  if (visual.shape === 'circle') {
    return (
      <circle
        key={key}
        cx={cx}
        cy={cy}
        r={(visual.radius ?? 0) * ppu}
        fill={color}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    );
  }
  if (visual.shape === 'polygon') {
    const sides: number = visual.sides ?? 0;
    const r = (visual.radius ?? 0) * ppu;
    const points: string[] = [];
    for (let i = 0; i < sides; i++) {
      const theta = (i * 2 * Math.PI) / sides - Math.PI / 2;
      points.push(`${cx + r * Math.cos(theta)},${cy + r * Math.sin(theta)}`);
    }
    return (
      <polygon
        key={key}
        points={points.join(' ')}
        fill={color}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        transform={transform}
      />
    );
  }
  return null;
}

function imageElement(
  href: string,
  cx: number,
  cy: number,
  w: number,
  h: number,
  transform: string | undefined,
  opacity: number,
  key: string | number
) {
  return (
    <image
      key={key}
      href={href}
      x={cx - w / 2}
      y={cy - h / 2}
      width={w}
      height={h}
      opacity={opacity}
      transform={transform}
      preserveAspectRatio="xMidYMid meet"
    />
  );
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
  const renderables: any[] = Array.isArray(config?.renderables) ? config.renderables : [];

  const objectsById = new Map<string, ObjectConfig>();
  for (const obj of objects) objectsById.set(obj.id, obj);

  const coveredBodyIds = new Set<string>();
  for (const r of renderables) {
    if (r?.source?.type === 'body' && typeof r.source.bodyId === 'string') {
      coveredBodyIds.add(r.source.bodyId);
    }
  }

  const sortedRenderables = [...renderables].sort(
    (a, b) => (a?.zIndex ?? 0) - (b?.zIndex ?? 0)
  );

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
        {objects
          .filter((obj) => !coveredBodyIds.has(obj.id))
          .map((obj, i) => {
            const cx = (obj.x ?? 0) * ppu;
            const cy = flipY((obj.y ?? 0) * ppu);
            const angleDeg = obj.angle ? (-obj.angle * 180) / Math.PI : 0;
            const transform = angleDeg ? `rotate(${angleDeg} ${cx} ${cy})` : undefined;
            return shapeFromBody(obj.body, cx, cy, ppu, transform, obj.id ?? `body-${i}`);
          })}
        {sortedRenderables.map((r, i) => {
          const pos = resolveSource(r.source, objectsById, ppu);
          if (!pos) return null;
          const { cx, cy, angleDeg } = pos;
          const transform = angleDeg ? `rotate(${angleDeg} ${cx} ${cy})` : undefined;
          const opacity = typeof r.opacity === 'number' ? r.opacity : 1;
          const v = r.visual;
          if (!v || typeof v !== 'object') return null;
          const key = r.id ?? `r-${i}`;
          if (v.type === 'shape') {
            return shapeFromVisual(v, cx, cy, ppu, transform, opacity, key);
          }
          if (v.type === 'image') {
            const w = (v.width ?? 0) * ppu;
            const h = (v.height ?? 0) * ppu;
            return imageElement(v.src, cx, cy, w, h, transform, opacity, key);
          }
          if (v.type === 'renderable') {
            const w = (v.width ?? 0) * ppu;
            const h = (v.height ?? 0) * ppu;
            const href = `/renderables/${v.name}.svg`;
            return imageElement(href, cx, cy, w, h, transform, opacity, key);
          }
          return null;
        })}
        {objects.length === 0 && renderables.length === 0 && (
          <text x={SIM_W / 2} y={SIM_H / 2} fontSize={40} fill="#bbb" textAnchor="middle">
            (no objects)
          </text>
        )}
      </svg>
    </div>
  );
}

export default SimulationPreview;
