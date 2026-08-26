import { useEffect, useState, type RefObject } from 'react';
import type { ExpandedObjectConfig } from '../../schemas/simulation';
import type { PhysicsBody } from '../../physics/types';
import { sameInfoTarget, type InfoAnchor, type InfoTarget } from '../../lib/infoTargets';

/**
 * ⇧-click object info (2026-08-26, Bill's call — replaces the "system totals"
 * ask, T10, for now).
 *
 * Hovering a body shows a ⇧ⓘ hint. ⇧-click PINS a box with the body's
 * material (mass, µ, e, static?). With one box pinned and ⇧ still held,
 * hovering a second target (another body, the floor, a wall) shows that
 * target's box AND an interaction box for the pair: the effective µ and e of
 * the contact under the engines' MAX combine rule, and which side governs.
 * ⇧-click the second target to pin the pair; a plain click on the canvas or
 * Esc dismisses everything.
 *
 * Why the interaction box exists: both engines take the LARGER coefficient of
 * a contact pair (RapierAdapter sets CoefficientCombineRule.Max for friction
 * AND restitution; Planck's mixRestitution is max and its friction is coerced
 * to match). That rule is invisible in the JSON and is exactly what deadens a
 * friction slider (checkFrictionSliderMasking) — showing it per pair is the
 * disclosure that lets the pair-friction question stay parked a while longer.
 *
 * Values are read LIVE off the physics body each tick (a slider on friction /
 * mass / restitution changes them mid-run), falling back to the config when
 * the body is absent. Walls are authored as explicit zero material in the
 * adapters (RapierAdapter createWalls), so an object↔wall contact always runs
 * at the object's own µ and e — the box says so.
 */

interface Material {
  name: string;
  mass: number | null;
  friction: number;
  restitution: number;
  isStatic: boolean;
  isWall: boolean;
}

const WALL_NAMES: Record<'top' | 'bottom' | 'left' | 'right', string> = {
  bottom: 'Floor',
  top: 'Ceiling',
  left: 'Left wall',
  right: 'Right wall',
};

function readMaterial(
  t: InfoTarget,
  objects: readonly ExpandedObjectConfig[],
  objRefs: RefObject<Record<string, PhysicsBody>>,
): Material | null {
  if (t.kind === 'wall') {
    // Explicit zero material — see RapierAdapter.createWalls.
    return { name: WALL_NAMES[t.side], mass: null, friction: 0, restitution: 0, isStatic: true, isWall: true };
  }
  const cfg = objects.find((o) => o.id === t.id);
  if (!cfg) return null;
  const body = objRefs.current?.[t.id];
  // Schema defaults are documented, not applied (nothing parses at runtime),
  // so the body is the truth for what the engine is actually using.
  return {
    name: cfg.id,
    mass: body ? body.mass : (cfg.mass ?? null),
    friction: body ? body.friction : (cfg.friction ?? 0.1),
    restitution: body ? body.restitution : (cfg.restitution ?? 0.8),
    isStatic: body ? body.isStatic : cfg.isStatic === true,
    isWall: false,
  };
}

function fmt(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

const BOX_CLASS =
  'bg-white/95 rounded-lg shadow-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 min-w-[10rem] pointer-events-none';

function MaterialBox({ m, accent }: { m: Material; accent: string }) {
  return (
    <div className={BOX_CLASS} style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="font-semibold text-slate-800 mb-1 flex items-center gap-1">
        {m.name}
        {m.isStatic && (
          <span className="ml-1 px-1 rounded bg-slate-100 text-[10px] font-normal text-slate-500">
            static
          </span>
        )}
      </div>
      <table className="w-full">
        <tbody>
          {!m.isWall && (
            <tr>
              <td className="text-slate-500 pr-3">mass</td>
              <td className="text-right font-mono">{m.mass === null ? '—' : `${fmt(m.mass)} kg`}</td>
            </tr>
          )}
          <tr>
            <td className="text-slate-500 pr-3">friction µ</td>
            <td className="text-right font-mono">{fmt(m.friction)}</td>
          </tr>
          <tr>
            <td className="text-slate-500 pr-3">restitution e</td>
            <td className="text-right font-mono">{fmt(m.restitution)}</td>
          </tr>
        </tbody>
      </table>
      {m.isWall && (
        <p className="mt-1 text-[10px] text-slate-500 leading-snug">
          Walls carry no material — a body's own µ and e govern its contact with them.
        </p>
      )}
    </div>
  );
}

function InteractionBox({ a, b }: { a: Material; b: Material }) {
  const row = (label: string, symbol: string, va: number, vb: number) => {
    const eff = Math.max(va, vb);
    const governs = va === vb ? 'equal' : va > vb ? a.name : b.name;
    return (
      <tr>
        <td className="text-slate-500 pr-3">{label}</td>
        <td className="text-right font-mono whitespace-nowrap">
          max({fmt(va)}, {fmt(vb)}) = <span className="font-semibold text-slate-900">{fmt(eff)}</span>
        </td>
        <td className="pl-2 text-[10px] text-slate-500 whitespace-nowrap">
          {governs === 'equal' ? 'tie' : `${governs} governs`}
          <span className="sr-only"> for {symbol}</span>
        </td>
      </tr>
    );
  };
  return (
    <div className={`${BOX_CLASS} border-amber-300`} style={{ borderLeft: '3px solid #f59e0b' }}>
      <div className="font-semibold text-slate-800 mb-1">
        {a.name} ↔ {b.name}
      </div>
      <table>
        <tbody>
          {row('contact µ', 'µ', a.friction, b.friction)}
          {row('contact e', 'e', a.restitution, b.restitution)}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-slate-500 leading-snug">
        The engine uses the LARGER of the pair's coefficients for a contact.
      </p>
    </div>
  );
}

interface InfoBoxesProps {
  objects: readonly ExpandedObjectConfig[];
  objRefs: RefObject<Record<string, PhysicsBody>>;
  /** Pinned boxes (0, 1 or 2). */
  pins: readonly InfoAnchor[];
  /** Transient hover target while ⇧ is held with one pin. */
  hover: InfoAnchor | null;
  /** Plain hover over a body with nothing pinned: where to draw the ⇧ⓘ hint. */
  hint: { x: number; y: number } | null;
}

function clampPos(x: number, y: number, w = 260, h = 140) {
  return {
    left: Math.min(x + 14, window.innerWidth - w),
    top: Math.min(y + 14, window.innerHeight - h),
  };
}

export default function InfoBoxes({ objects, objRefs, pins, hover, hint }: InfoBoxesProps) {
  // Re-read live body values ~10×/s while anything is showing. Cheap, and it
  // keeps a friction/mass slider drag visible in the box without wiring the
  // boxes into the render loop.
  const [, setTick] = useState(0);
  const active = pins.length > 0 || hover !== null;
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 100);
    return () => window.clearInterval(id);
  }, [active]);

  const first = pins[0] ?? null;
  const second = pins[1] ?? hover;
  const mA = first ? readMaterial(first.target, objects, objRefs) : null;
  const mB = second ? readMaterial(second.target, objects, objRefs) : null;

  return (
    <>
      {hint && !first && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-800/90 text-white rounded px-2 py-1 text-[11px] flex items-center gap-1"
          style={{ left: hint.x + 14, top: hint.y + 14 }}
        >
          <span className="font-mono text-sm leading-none">⇧</span>
          <span>-click</span>
          <span
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-white/80 text-[9px] font-serif italic leading-none"
            aria-label="info"
          >
            i
          </span>
        </div>
      )}
      {first && mA && (
        <div className="fixed z-50" style={clampPos(first.x, first.y)}>
          <MaterialBox m={mA} accent="#2563eb" />
        </div>
      )}
      {second && mB && !sameInfoTarget(first?.target ?? null, second.target) && (
        <div className="fixed z-50 flex flex-col gap-1" style={clampPos(second.x, second.y, 300, 260)}>
          <MaterialBox m={mB} accent="#16a34a" />
          {mA && <InteractionBox a={mA} b={mB} />}
        </div>
      )}
    </>
  );
}
