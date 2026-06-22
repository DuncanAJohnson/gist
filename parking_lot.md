# Parking lot

Issues surfaced during development that:
- don't cleanly fit any active refactor track (see [refactor roadmap](src/pages/docs/RefactorRoadmap.tsx)),
- aren't blocking the work currently in flight,
- but are worth holding onto so they don't get re-investigated from scratch later.

Often these are cross-cutting concerns that bump into broader design decisions — page layout, build pipeline, recording/replay infrastructure, browser quirks — rather than physics or schema work.

**Format per entry.** Symptom, cause (or hypothesis), why parked, suggested fix path, diagnostic to run before fixing. Date discovered in the heading so the oldest entries are visible at a glance.

**Lifecycle.** Once an entry has a clear refactor home, move it into that refactor's notes (or open a roadmap doc for it) and delete from here. The parking lot is a holding pen, not a permanent index.

---

## Canvas "blink" at precompute → first replay transition (2026-05-15)

**Symptom.** When the user changes a sim input value and presses play (forcing a fresh precompute rather than using the cached replay), the canvas / sim playback area shifts horizontally for ~1 frame as replay begins, then settles back. A "blink." Subsequent plays — which reuse the cached recording and skip precompute — don't reproduce it.

**Cause (high-confidence hypothesis, not yet confirmed by browser inspection).** Grid-column reflow at the precompute→ready state transition.

The outer layout in [BaseSimulation.tsx:387](src/components/BaseSimulation.tsx#L387) is `grid-cols-[1fr_minmax(0,880px)_1fr]`. The canvas sits in `col-start-2`, capped at 880px. The SimulationControls panel sits in `col-start-1`. **`1fr` is shorthand for `minmax(auto, 1fr)`**, so a column whose min-content exceeds its 1fr allocation expands and pushes siblings.

[SimulationControls.tsx:72-95](src/components/simulation_components/SimulationControls.tsx#L72-L95) renders a narrow 260px progress bar during precompute, then [SimulationControls.tsx:100-204](src/components/simulation_components/SimulationControls.tsx#L100-L204) renders the full transport once `precomputeState === 'ready'`: play/reset buttons, a *conditional* scrub bar (`showScrub = precomputeState === 'ready' && totalFrames > 0`), a duration field, and a `flex-wrap` row of speed-preset buttons. The two layouts have different intrinsic min-widths, so col-1 reflows on transition.

The "shift right and back" pattern (rather than "shift right and stay") points specifically at the scrub-bar's conditional rendering. The transport row paints once at one min-width before `setReplayTotalFrames(N)` lands, then re-flows once `totalFrames > 0` reveals the scrub bar. Two renders, two widths, one blink.

**Why parked.** This bumps into the whole-page grid architecture. The fix shapes range from band-aid (pin a width on one wrapper) to refactor (rework the 1fr/880px/1fr grid so side columns are clamped rather than flexible). None of those is on the current refactor plan, and the blink is cosmetic — not a correctness issue. Worth picking up alongside any broader page-layout work (e.g., when the recording library UI from [/docs/recordings-and-cameras](src/pages/docs/RecordingsAndCameras.tsx) needs a home, the side panels will need rethinking anyway).

**Suggested fix paths**, ranked by scope:

1. **Reserve the controls-panel width.** Pin `min-w-[…]` on the SimulationControls outer wrapper at [JsonSimulation.tsx:1051](src/components/JsonSimulation.tsx#L1051) so all internal layout swaps happen inside a fixed-width box. One line; doesn't address the underlying grid brittleness.
2. **Reserve the scrub-bar slot.** Render its container unconditionally with a fixed height matching the input + label, and fill contents only when `showScrub`. Cleaner per-element fix; doesn't generalize to future control-row additions.
3. **Replace the `1fr / 880px / 1fr` grid with a fixed-size approach** where the canvas column is hard-pinned and the side columns clamp on the outside. Generalizes the whole page against this class of bug. Touches more files, deserves its own design pass — it would also make the wider rethink for recordings/cameras UI easier.

**Diagnostic to confirm before fixing.** Open DevTools → Rendering → "Layout Shift regions" before pressing play. If the canvas-area parent flashes (vs only the canvas interior), grid reflow is confirmed. Or temporarily apply fix #1 as a diagnostic — if the blink disappears, hypothesis confirmed; revert and apply the real fix.

---

## Saved sims bypass schema validation at load time (2026-05-20)

**Symptom.** Schema migrations that rely on Zod's `z.preprocess` to translate legacy fields (e.g. VA Phase 2's `showForceArrows: true` → `showVectors: ["force-net"]` shim) silently fail to fire on sims loaded from Supabase. New authoring works fine; previously-saved sims keep showing the legacy behavior — or, worse, no behavior at all, because the legacy field no longer has a runtime consumer. Surfaced when the bowling-ball-and-feather sim loaded with `showForceArrows: true` after Phase 2 shipped and rendered no F_net arrow until a runtime fallback was added to `synthesizeVectorArrowRenderables`.

**Cause.** `DynamicSimulation` loads saved sims via [DynamicSimulation.tsx:39](src/pages/DynamicSimulation.tsx#L39) (`getSimulation(id) → setConfig(rawJson)`) and passes the raw object straight into `JsonSimulation` as a TypeScript-cast `SimulationConfig`. There is no runtime `SimulationConfigSchema.parse(...)` step anywhere in this path. The Zod schema is used to *generate* the JSON Schema for the LLM (and to type-derive `SimulationConfig`), but never to validate or preprocess incoming data. Same risk in the editor-paste path inside `JsonSimulation` (raw JSON edits get committed to `editedConfig` directly).

**Why parked.** Two reasons. First, adding a `.parse()` call at the load site has nonzero blast radius — every currently-stored sim that violates the current schema (extra fields silently stripped, missing required fields throwing, enum drift) will fail to load. We don't have an audit of what's in Supabase, so the failure mode of "validation throws on a previously-working sim" needs a survey of the corpus first. Second, the narrow inline-shim workaround used in Phase 2 ([synthesize.ts:132-141](src/components/simulation_components/renderables/synthesize.ts#L132-L141)) is one extra line per legacy field — manageable for the next handful of migrations, even if it's not architecturally clean. Worth picking up alongside any broader sim-loading work, or when the next two or three legacy-field migrations make the inline-shim pattern feel like duplication.

**Suggested fix paths**, ranked by scope:

1. **Parse-on-load.** Add `SimulationConfigSchema.parse(simulationConfig)` to `DynamicSimulation.loadSimulation` (and a parse step in `JsonSimulation`'s editor-paste handler). Catches all preprocess shims for free; catches malformed sims at load time instead of mid-render. Needs a Supabase audit first — list all sims that would fail `.parse()` against the current schema, decide per-failure whether to migrate the stored JSON or relax the schema. Likely 1–2 days of corpus inspection + targeted data migrations.
2. **Parse-then-write-back.** Same as above, but if `.parse()` succeeds with preprocess transformations applied, write the normalized JSON back to Supabase. One-time migration sweep; afterwards the data store and the schema converge and the inline shims can be deleted. Higher implementation cost (write path needs care, e.g. don't clobber sims the user is actively editing), but pays back the schema-drift debt permanently.
3. **Status quo + audit checklist.** Keep the inline-shim pattern, but maintain a checklist in this file (or a dedicated `legacy_fields.md`) of every field that has a back-compat shim and where the shim lives. Cheapest; pure documentation; doesn't fix anything but keeps the surface area visible.

**Diagnostic to confirm before fixing.** Pull a sample of saved sims from Supabase, run each through `SimulationConfigSchema.safeParse(...)`, and tally the failure reasons. If the failure rate is <5% and the failures cluster on one or two known-deprecated fields, parse-on-load is safe with targeted data migrations. If the failure rate is high or scattered, the schema is more out-of-sync with the corpus than the inline-shim pattern is hiding, and option 2 is the only honest fix.

**Known back-compat shims today** (kept here as the seed of the checklist for option 3):

- `obj.showForceArrows: true` → `obj.showVectors: ["force-net"]`. Lives in: schema preprocess at [simulation.ts:81-91](src/schemas/simulation.ts#L81-L91) (fires on `.parse()`), runtime fallback at [synthesize.ts:132-141](src/components/simulation_components/renderables/synthesize.ts#L132-L141) (fires for Supabase-loaded sims). Two-site shim because of the parse-bypass.
- `env.physicsEngine: "matter"` → `"rapier"`. Schema preprocess in [simulation.ts](src/schemas/simulation.ts). Single-site (only matters when configs go through `.parse()`; if Supabase-loaded sims ever hit a code path that switches on `physicsEngine` literally, they'd silently mis-engine).

---

## Vector-arrow decay for sub-perceptual spikes (2026-05-15)

**Symptom.** One-frame-wide vector-arrow events — collision F<sub>net</sub> spikes most prominently, but also any future single-frame impulse, manual angle-slider snap, or polar-projection direction flip — are borderline-perceivable for humans even when they paint correctly. At 60 fps a single-frame spike is ~16 ms on screen, around the visual-detection threshold. Students viewing a sim may miss the moment of a collision's net-force reversal even though the arrow physically renders.

**Cause.** Display-rate physics. Nothing pathological — just the duration of a discrete one-frame event in human perception.

**Why parked.** Not a bug; a UX-readability polish. The structural fix already shipped (replay branch advances one frame per paint, so the spike at least *paints* every time — see [BaseSimulation.tsx:207-235](src/components/BaseSimulation.tsx#L207-L235)). What's left is making single-frame events comfortably readable. Most natural to land alongside VA Phase 3 when the rest of the force-kind family (`force-applied`, `force-friction`, `force-drag`) goes in, so the decay rule applies uniformly across kinds. Also independent of the underlying refactor track — a polish layer in the visual.

**Suggested fix path.** Per-kind visual-layer decay: when a vector's magnitude exceeds its recent baseline (or some "spike" threshold), the visual layer holds the peak magnitude for N ms (~200–300 ms feels right pedagogically) then fades linearly back to the live value. State lives on the `VectorArrow` visual instance, not on the body — purely a render-side affordance, doesn't touch physics or Frame data. PhET does this for collision impulses; it's the canonical pattern for making instantaneous events teachable.

**Open design questions** (defer until implementation):

- Per-kind tuning. The "right" decay window for `force-net` (collision spikes, sharp) probably differs from a held-direction polar-slider snap (slower, intentional). Default per-kind constants in `vectorTheme.ts`, override per-arrow if needed.
- Should the decay be visually distinguishable from the live value? E.g., a slight opacity drop during the decay tail. Possibly noisy; default to "no, just hold-and-fade."
- Interaction with `force-net = 0` (resting body). After a spike, fading down to 0 may pass through visible-but-shrinking territory before disappearing. Right behavior; worth verifying it doesn't look glitchy.

**Diagnostic to confirm value before building.** Record-and-replay the bowling-ball-and-feather sim, watch a collision frame at slow playback speed (0.25×). If the spike is clearly visible at slow speed but not at 1× speed, decay is the right answer. If even at slow speed the spike is fleeting, the decay window needs to be longer than the natural visual persistence (~100 ms).
