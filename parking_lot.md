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
- `env.physicsEngine: "matter"` → `"rapier"`. Schema preprocess in [simulation.ts:218](src/schemas/simulation.ts#L218). Single-site. ~~If Supabase-loaded sims ever hit a code path that switches on `physicsEngine` literally, they'd silently mis-engine.~~ **Confirmed worse (2026-07-04):** they'd **throw** — the value flows uncoerced to `createPhysicsAdapter`'s exhaustive switch ([physics/index.ts:27](src/physics/index.ts#L27)), which errors on unknown kinds. The shim is dead code on every runtime path.

---

**UPDATE 2026-07-04 — scope widened; reframed as "runtime ingestion boundary (parse, don't validate)". Stage: wishlist (architectural).** Surfaced during vector-representation Phase 2 / close-out; recorded here because this entry already owns the topic.

**The stronger fact.** The 2026-05-20 entry blamed the DB path. The reality: **nothing in the frontend runs Zod `.parse()` at runtime, ever.** The schema is consumed as `import type` (erased at compile) plus the `generate:schema` build step — Zod isn't even in the shipped bundle. So ALL THREE ingestion paths arrive unparsed:

1. **Static dev sims** — `src/simulations/*.json` imported with `as SimulationConfig`-style casts (symptom was 6 tolerated `tsc` wrapper errors from JSON literal-widening on `environment.unit`; fixed 2026-07-04 by consolidating all six into ONE documented cast — `asLocalSimConfig` in [src/simulations/localSimConfig.ts](src/simulations/localSimConfig.ts) — which is now the ready-made static-path parse hook if this boundary lands).
2. **LLM generate/remix** — validated against `simulation_schema.json` backend-side only; arrives via `DynamicSimulation` unparsed. Zod-side preprocesses/refinements don't translate to JSON schema, so they run **nowhere**.
3. **Supabase saved sims** — as originally recorded.

**Where the boundary wants to live.** All three paths already converge on ONE choke point: the config→SI boundary (`scaleObjectToSI`, called from `JsonSimulation`'s `siObjects` memo). Vector-rep Phase 2 deliberately placed its polar→cartesian normalization there — that is the **embryo** of the ingestion boundary. The full item: one `ingestSimulation(raw)` at that choke point — `safeParse` → migrations/coercions (matter→rapier, `showForceArrows`→`showVectors`) → defaults (`angleUnit: 'deg'`) → normalizations (polar→cartesian moves inside) → warnings — with everything downstream trusting the genuinely-inferred type (kills the duplicate local `SimulationConfig` interfaces in `JsonSimulation` / `DynamicSimulation` and the wrapper casts).

**Costs found in the 2026-07-04 pro/con** (add to the fix-path calculus above): Zod enters the runtime bundle (~13 kB gz); Zod strips unknown keys by default (audit what runtime reads outside the schema before turn-on); fail-loud needs a designed error surface (a ZodError wall on a teacher's saved sim is worse UX than limping — lean `safeParse` + warn + best-effort). The existing fix paths and the Supabase-corpus diagnostic stand, with one amendment: the parse site should be the **choke point shared by all three paths**, not just `DynamicSimulation.loadSimulation` (fix path 1 as written would still miss static sims and editor-paste).

**Diagnostic addition:** grep the Supabase corpus for `"physicsEngine": "matter"` — if any exist, this item promotes from wishlist to scoped immediately (those sims crash on load today).

---

**UPDATE 2026-07-07 — unit semantics RATIFIED ("preservation"); unit-switch migration joins this item's scope. Stage: still wishlist (architectural), scope grown.** Surfaced by driving a unit flip (m → cm) on `projectile-launch-polar` during the exhaustive-deps verification.

**The decision (Bill, 2026-07-07).** `env.unit` / `env.angleUnit` are *descriptions of the diorama, never knobs on it*. Changing a unit must preserve the physical scene — same SI world, same picture, same physics; only the description (and therefore the numbers) changes: a 35 m world re-described in cm is 3500 cm, 10 m/s becomes 1000 cm/s. The rejected alternative ("reinterpretation": numbers keep values, now mean cm) silently shrinks the SI world 100× — invisible in the picture but real in drag behavior and engine tolerances. Recorded as the sharpened invariant #10 in CLAUDE.md.

**Operational split.** The JSON always means what it says (numbers are in the declared unit — schema stays the contract, no special cases). Therefore **raw JSON editing is not the sanctioned way to change an existing sim's unit** — a teacher flipping `"m"` → `"cm"` without converting every value silently rebuilds a different world. The sanctioned path is a future **UI unit switch that migrates**: rewrite every dimensional value (positions, sizes, velocities, gravity, `pixelsPerUnit`, control min/max/step/defaults, per-arrow scale overrides, experimental data) so the new JSON describes the *same* scene. Same rule covers `angleUnit` (flipping deg→rad in raw JSON reinterprets authored angles identically).

**Why it lives HERE.** The migration needs a complete list of dimensional fields, and that list must never fork from the ingestion seam's knowledge — `scaleObjectToSI` *is* that list in code form, and the migration is essentially ingest-to-SI ∘ re-emit-in-new-unit. One source of truth: when the ingestion boundary lands, the unit-switch migration is a consumer of it, not a parallel table.

**New exhibit for "parse, don't validate":** the sprite-dimension bug (FIXED 2026-07-07). `synthesizeBodyRenderable` put config-unit `width`/`height` into the renderable while the drawer scales via `WorldToCanvas.dimension` (m → px) — config units masquerading as SI, benign only at `unit: "m"` where the factor is 1. Fix: sprites now synthesize from `siObjects` (JsonSimulation `pixelRenderables` memo). Sibling issue found same day, NOT fixed: vector-arrow default scales are px-per-SI-unit (`vectorTheme.ts` `VECTOR_DEFAULT_SCALES`) — arrows shrink 100× in a cm sim; recorded in the vector-arrows workstream (`Notes_on_Applied_Forces_Refactor.md`, Findings 2026-07-07), fix deferred to arrow-scale work (Phase 5 adjacency).

**Drive-confirmed 2026-07-10 (Bill, projectile-launch-polar):** sprite fix holds (ball pixel-identical under m→cm AND m→km); arrow issue confirmed both directions (invisible at cm, huge at km); reinterpretation behaves as ratified (grid relabels; authored numbers/text sit still). The drive sharpened the **migration list into two classes**:

1. **Dimensional numbers** — positions, sizes, velocities, gravity, `pixelsPerUnit`, control `min`/`max`/`step`/`defaultValue`, graph `yAxisRange`, per-arrow scale overrides, experimental data. Mechanically migratable via the ingestion seam.
2. **Unit-bearing authored TEXT** — `output.unit` strings (`"m/s"`), control `label`s (`"Launch Speed (m/s)"`), graph `yAxisLabel`s, description prose. NOT reliably migratable (free text). Mitigation: auto-generated labels that follow `env.unit`, shrinking class 2 to whatever the author explicitly hard-coded.

**Sub-finding (2026-07-10) — output unit auto-generation is a dead promise.** The schema (`simulation.ts` OutputValue `unit` `.describe()`) and therefore the prompt say "Leave blank to auto-generate based on property and environment unit" — but `Output.tsx:9` defaults `unit = ''`; no auto-generation code exists anywhere. Three-places violation in reverse: schema + prompt promise, code missing. LLM-authored sims that trust the description render unitless outputs today. Small, self-contained fix candidate (derive label from property family + `env.unit`/`env.angleUnit` in Output.tsx); landing it needs NO schema/prompt motion (they already describe it) and is a prerequisite-shaped step for the class-2 mitigation above.

---

## Environment-ground semantics + contact-friction authoring conventions (2026-07-10)

**Context (what just shipped).** The S2.1 cup-catch drive exposed that walls
carried engine-default friction (Rapier 0.5, silently) while the Max combine
rule promised "the body's own friction dominates the contact." Fixed
2026-07-10 in BOTH adapters: walls are explicit `friction: 0, restitution: 0`,
and PlanckAdapter overrides Box2D's `sqrt(fA·fB)` friction mixing with a
begin-contact Max hook (Box2D restitution already mixes as max). Cross-engine
harness: a µ=0.5 box's slide distance matches `v²/2µg` in both engines
(0.918 / 0.915 vs analytic 0.918); µ=0 glides in both. **Decision (Bill,
2026-07-10): for now, ground-contact friction derives from the OBJECT — the
environment ground is a zero-material collision boundary.**

**Deferred decision #1 — is the environment ground a collision boundary or a
real ground?** Current state: env walls are pure boundaries (zero material);
any ground "feel" is authored per-object. Alternative someday: authors
specify a real ground (env-level material, or a ground object). Schema motion
either way → three-places. Revisit when a curriculum sim needs an authored
ground surface.

**Deferred decision #2 — object-object contact-material conventions.**
Post-fix, contact friction = max(two bodies) everywhere, both engines.
Before hardening this as THE authoring semantics, research what PhET and
other physics-ed systems do (e.g. PhET's friction models are often per-PAIR
µ, not per-body coefficients combined at contact).

**Gotcha to carry:** `ObjectRenderer` defaults `friction` to **0**, and only
the ballIntoCup pair sets 0.5 explicitly — so most existing sim objects,
which used to inherit the walls' phantom 0.5, now sit on genuinely
frictionless ground. Correct per the documented semantics, but visible
(landed projectiles glide instead of skidding to a stop). Authors set
per-object friction for ground feel.

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

---

## `polarSlider` compound control — seed of a future UI-refactor track (2026-07-04)

**What it is.** A paired magnitude+angle control: two stacked sliders + a live
direction-arrow preview presented as one UI item, bound to a vector (e.g.
`velocity`), not a scalar leaf. Designed (never built) as Phase 3 of the
vector-representation refactor; moved here at that refactor's close-out
(2026-07-04, Bill's disposition: "a cool UI exploration … the start of a UI
refactor effort").

**Why parked.** It's a *control-composition* question, not a vector question —
the general form is "compound controls" (paired min/max sliders, XY pads, any
multi-binding control presented as one item). No UI-refactor track exists yet;
this entry is its seed. Not blocking: two separate sliders (shipped, Phase 1)
cover the pedagogy today.

**What's already in place when this starts.** The held polar state is keyed
BY VECTOR (`${targetObj}.${base}`, JsonSimulation `heldVectorStateRef`),
precisely so a paired control shares one direction with zero extra plumbing.
Design sketch (JSON shape, rendering) preserved in
`Notes_on_Vector_Representation_Refactor.md` → "Optional: a paired polar
control". Note: the arrow-preview half should reuse the vector-arrows
infrastructure (`vectorTheme.ts`), NOT grow its own renderer.

**Lifecycle.** When a UI-refactor track opens, this entry moves into its
`Notes_on_UI_Refactor.md` and is deleted from here.

---

## Angle-wrap toggle for angle graphs (2026-07-04)

**What it is.** Per-graph option: plot `velocity.angle`-style series wrapped to
`(-180°, 180°]` (atan2 native, the current behavior) or unwrapped/continuous
(a spinning vector traces a monotone line instead of sawtooth jumps). Phase 4
of the vector-representation refactor; moved here at close-out (never built).

**Why parked.** Explicitly conditional in the original plan: "only worth doing
if a sim makes the default look wrong." No sim has. The known candidate:
any rotational-mechanics sim where direction crosses ±180° repeatedly.

**Trigger / diagnostic.** When a sim's angle graph shows sawtooth artifacts
that confuse the pedagogy, build it then — as a `GraphConfig` per-line or
per-graph boolean (`unwrapAngle`), default off (wrapped).

---

## Lint repair & maintenance queue (2026-07-04)

**What happened.** `npm run lint` had never worked since the TS migration
(commit `b4feaff`): eslint 9's config loader failed on `eslint.config.ts`
(stale transitive `jiti@1`), and behind that, `typescript-eslint` was never
installed (config referenced its rules; package absent). Fixed 2026-07-04:
config renamed → `eslint.config.js` (file was already pure JS);
`typescript-eslint@8.62.1` installed as devDep (vetted: official repo, no
lifecycle hooks, stable published 2026-06-29); core `no-unused-vars` swapped
for the TS-aware `@typescript-eslint/no-unused-vars` (core rule false-flagged
96 declaration-file params); 2 stale disable-directives auto-fixed. Same
session, all 8 non-locale `tsc` errors fixed (typed accumulator in
JsonSimulation `dataSources`; contained cast in LineGraph; six wrapper casts
consolidated into `src/simulations/localSimConfig.ts` → `asLocalSimConfig`,
the static-path hook for the ingestion-boundary item above).

**DONE 2026-07-05 — `npm audit fix`** (was item 1 below). Split into two
commits on `bill_dev` for bisectability: `ddc19b6` bumps `react-router-dom`
7.9.4 → 7.18.1 alone (the runtime-facing one; Bill hand-verified routes,
back/forward, deep-link refresh, dynamic route, a driven sim, clean console),
then `e575979` runs `npm audit fix` for the remaining 13 (lockfile-only:
vite 7.3.6, rollup, esbuild 0.28.1, ws, mermaid 11.16 — drops its old
chevrotain/langium parser stack, dompurify, babel, misc glob/matchers).
`npm audit` now reports 0 vulnerabilities. Post-checks all at known baseline:
build passes, tsc errors are exclusively the `da.ts` bucket, lint shows only
the 4 react-refresh errors + the exhaustive-deps warning queued below.

**Decision (2026-07-05): npm's `allowScripts` gate stays ON; the pending
esbuild/fsevents install scripts stay UNapproved.** Verified the gate costs
nothing: both esbuild `bin/esbuild` copies are already the native Mach-O
arm64 binaries (the postinstall's only job) and `fsevents.node` ships
prebuilt in the tarball, loads, and exposes `watch()` — build 5.2s, Vite
ready in 223ms, all with scripts gated. Rationale: zero third-party code
execution at install time, per the npm-safety threat model. Standing
practice: when approval is ever needed, `npm approve-scripts <pkg>`
per-package after reading the script — never blanket
`--allow-scripts-pending`; and treat any NEW name appearing in the
allow-scripts warning list as a review trigger, not wallpaper.

**Remaining, queued (Bill, 2026-07-04):**

1. **`react-hooks/exhaustive-deps` warning** (JsonSimulation ~line 744, the
   per-frame sampling callback missing `readDisplayValue`). Works today only
   because every config edit also replaces `objects`/`graphs` identities.
   Fix DELIBERATELY: wrap `readDisplayValue` in `useCallback([unitScale,
   angleScale])`, add to deps, then re-drive `projectile-launch-polar` (unit
   conversion is exactly what it touches). Hot-path callback — no reflex fixes,
   no `--fix`.

**Not queued (fix opportunistically):** 4 `react-refresh/only-export-components`
errors (three contexts + ExperimentalDataModal export hooks/constants beside
components → full page reload instead of HMR when editing those files; DX-only).
Split the non-component exports out next time each file is touched anyway.

**Also visible now (separate, unqueued):** the `da.ts` locale bucket — dozens
of `tsc` errors because the Danish strings are typed against the English
literal types; wants `Record<keyof typeof en, string>`. Cosmetic; excluded
from the 8-error fix by scope.

---

## Playback-speed presets don't honor their promised rates (2026-07-15)

**Symptom.** In replay, ¼× and ½× barely slow playback down (if at all), and
2× / 4× never speed it up — on graph-heavy sims all five presets converge on
roughly the same wall-clock speed. Reported by Bill from testing; traced in
code 2026-07-15 (not yet instrumented — see Diagnostic).

**Cause — three interacting mechanisms.**

1. **One-frame-per-tick paint cap.** The replay branch paints at most ONE
   recorded frame per rAF tick, then `break`s
   ([BaseSimulation.tsx:238-259](src/components/BaseSimulation.tsx#L238-L259)).
   Deliberate (protects one-frame-wide events from being clobbered between
   paints — see the comment there and the vector-arrow decay entry above),
   but it makes every speed ≥ 1 identical to 1× by construction: 2×/4× have
   never done anything.
2. **Unbounded accumulator banking.** Pacing is
   `accumulator += delta × playbackSpeed`
   ([BaseSimulation.tsx:233](src/components/BaseSimulation.tsx#L233)), and
   each painted frame drains only 16.67 ms. The accumulator is never clamped
   in replay, so speeds > 1 bank "credit" (~10 s at 4× banks ~40 s of
   full-rate playback); switching to ¼×/½× mid-replay then plays at full
   one-frame-per-tick rate until the bank drains. `startReplay` zeroes the
   accumulator; a speed change does not. This alone reproduces "¼× does
   nothing" for anyone who toggles through the presets while playing.
3. **Render-bound ticks flatten the remaining differences.** Every painted
   frame runs [handleReplayFrame](src/components/JsonSimulation.tsx#L397):
   restores bodies AND fires three React state setters —
   `setGraphData` spread-appends to a growing array and re-renders the
   Recharts line graphs over the full series. If a tick stretches to ~33 ms,
   ½× adds one frame's worth per tick → indistinguishable from 1×; at the
   50 ms `MAX_DELTA` clamp ([BaseSimulation.tsx:61](src/components/BaseSimulation.tsx#L61)),
   ½×–4× are identical and ¼× is only ~25 % slower. Corollary: "1×" itself
   is slower than wall clock on graph-heavy sims (frames are never dropped,
   so jank stretches the replay).

**NON-NEGOTIABLE (Bill, 2026-07-15): replay never drops recorded frames.**
Dropping frames drops one-frame physics events — collision F<sub>net</sub>
spikes, direction flips — which are precisely the teachable moments.
The one-frame-per-tick paint cap stays; any speed feature must work within
it. (Recorded as CLAUDE.md invariant #12. Same constraint the vector-arrow
decay entry above builds on — and note that entry's diagnostic, "watch a
collision frame at 0.25×," presupposes slow-mo actually works, so it
depends on this entry's fix path 1.)

**Design direction (Bill, 2026-07-15) — stop promising numbers the loop
can't honor.**

- **Reframe the speed UI from numeric promises to symbols.** Replace
  ¼×/½×/1× ([SimulationControls.tsx:27-33](src/components/simulation_components/SimulationControls.tsx#L27-L33))
  with the standard play symbol plus "slow" / "slower" glyphs — an ordinal
  promise, not a ratio. Slow playback is honestly deliverable: it never
  violates the no-drop rule and paints *fewer* frames per second, easing
  render pressure rather than fighting it.
- **2× / 4×: ON HOLD, candidate for elimination.** Fast-forward under the
  no-drop rule would require painting > 60 frames/s (rAF can't) or
  batch-advancing the index (drops paints — forbidden). Preferred teacher
  workflow instead: **scrub the timeline** (already shipped — `seekReplay` +
  the scrub bar) to the interesting moment, then play through at
  slow/slower.

**Why parked.** Not blocking the concave-collider ship gate. The fix bundles
a pacing correction with a UI reframe and deserves its own small pass; no
refactor track owns replay/playback UI yet (the `polarSlider` entry above is
the seed of a UI track — this item would join it).

**Suggested fix paths**, ranked by scope:

1. **Clamp the accumulator in replay** (cap banked credit at one frame's
   worth, and/or reset on speed change). A few lines in BaseSimulation;
   kills mechanism 2 outright and makes slow/slower honest whenever ticks
   run near 60 fps. Prerequisite for the vector-arrow decay diagnostic.
2. **UI reframe:** symbols for play/slow/slower; remove the 2×/4× buttons
   (per the hold). Pure SimulationControls change.
3. **Reduce per-frame render cost** — buffer graph points in a ref and
   flush to state every N frames; memoize `GraphRenderer`. The biggest
   lever (mechanism 3) and what makes normal-speed playback true to wall
   clock; bigger scope, adjacent to the graphs workstream.

**Diagnostic to run before fixing.** Log `delta` inside the replay branch on
a graph-heavy sim. If ticks are consistently well above 16.7 ms, mechanism 3
is confirmed and sizes fix path 3. Deferred by decision (2026-07-15):
document first, instrument when the fix pass opens.

---

## No error boundary around the sim canvas (2026-07-15, residual of the dup-id entry — retired 2026-07-20)

**What it is.** Fix path 2 of the "Duplicate object ids crash the page"
entry (2026-07-15), which was otherwise **RESOLVED 2026-07-20** and retired
into [Notes_on_Concave_Colliders_Refactor.md](Notes_on_Concave_Colliders_Refactor.md)
→ Findings 2026-07-20 (two-layer fix: commit boundaries reject duplicate
ids like a parse error; the runtime seam renames as a bus-badged backstop —
the reject-at-commit choice supersedes the auto-rename preference recorded
here at parking time; rationale in the findings entry).

**Symptom class.** Any uncaught throw from an adapter or renderer effect
(the dup-id adapter throw was the live specimen) unmounts the whole React
tree — dead white page instead of a degraded sim. No error boundary exists
anywhere in the app.

**Why parked.** The live specimen is now guarded at its seams, so nothing
currently reproduces it; the boundary is broad-payoff robustness (catches
the *class*, not an instance) with no driving exhibit. Pick up alongside
editor-robustness work or the next unexplained white page.

**Suggested fix.** An error boundary around the sim canvas (roughly
`BaseSimulation`'s children) degrading to an inline error card naming the
thrown error; pairs naturally with the seam diagnostics bus for visibility.

**Diagnostic.** None needed — any forced throw inside a body-build effect
reproduces the class.

---

## Edit-mode undo (cmd-Z), surfaced by Delete (2026-07-15)

**What it is.** Bill (ship-gate drive, using the debug Delete tool): "we
should have an undo cmd-Z/ctrl-Z as well." Delete is currently
irreversible within the session — same for edit-drags, resizes, and Tweak
JSON commits.

**Shape of the fix.** All edits already funnel through one state
(`editedConfig`, [JsonSimulation.tsx:163](src/components/JsonSimulation.tsx#L163)
— "source of truth for everything downstream"), so undo is a bounded
history stack of config snapshots + a keydown handler, restoring via the
existing edit-commit path (which already handles physics rebuild +
`recaptureInitialSnapshot`). Care points: don't capture keystrokes inside
the JSON editor modal; decide whether slider/control changes are
undo-steps or excluded (lean excluded — they're sim inputs, not scene
edits).

**Why parked.** UX feature, not blocking; belongs to the future UI-refactor
track (see the `polarSlider` seed above — this is its second seed, along
with the playback-speed UI reframe). Move all of these into
`Notes_on_UI_Refactor.md` when that track opens.

---

## Decomposition sanity guard — CC7, the "second fence" (2026-07-18)

**What it is.** A load-time robustness guard on `decomposePolygonShape`
([shapeHelpers.ts](src/physics/shapeHelpers.ts)) for outline defects the
CC2 >12-vertex warn (SHIPPED 2026-07-18, same file) does NOT cover:
- **Self-intersection** — `poly-decomp`'s `quickDecomp` requires a *simple*
  (non-self-intersecting) closed ring; a self-intersecting outline makes it
  throw or emit garbage parts with no attribution.
- **Part-count cap** — a sloppy outline exploding into dozens of fixtures
  (perf drag + a signal the outline is bad data).
- **Winding is NOT part of this** — `decomp.makeCCW` already normalizes winding
  before `quickDecomp`, so there is nothing to guard. Roadmap CC7's original
  "winding" leg is moot; only self-intersection + part-count remain.

**Why parked (no live specimen).** Unlike CC2 — which shipped against a known
silent failure with a live specimen (`bird`) — CC7's failure modes aren't
currently biting. The 2026-07-18 full-manifest sweep (152 polygon/convex
colliders run through the real `poly-decomp` with an error trap; see
`Notes_on_Concave_Colliders_Refactor.md` Findings 2026-07-18) found ZERO
decomposition failures and a max of ~11 parts (duck/pumpkin). Nothing
self-intersects or explodes. Building guards for absent problems is premature.

**Why it still matters (the second fence).** The icon-repo
(`../physics_sim_icon_dev`) is adding its own poly-decomp pass to flag these at
*authoring* time — the right place for the fix, exactly as CC2's >12 fix lives
upstream. But gist should still reject bad geometry at *load* time as a second
fence: collider outlines don't come from sim JSON (the schema has no parametric
shape authoring — colliders resolve only from `svg` manifest lookup), but they
DO come from the hand-edited on-disk `manifest.json` and from Import Object's
imported manifest, and a future generator could regress. Upstream cleanliness
is a strong default, not a guarantee.

**Trigger to un-park.** A manifest/imported outline that self-intersects or
explodes into fixtures and produces a wrong/janky collider in a drive. When
that shows up, the self-intersection guard is a ~20-line addition next to the
CC2 warn.

**Home when it lands: the runtime ingestion boundary** (see "Saved sims bypass
schema validation" / "runtime ingestion boundary (parse, don't validate)"
above — 2026-05-20, updated 2026-07-04). Collider sanity is a natural
`ingestSimulation(raw)` check at the same `scaleObjectToSI` choke point where
decomposition is already reached — build it there once, alongside the other
parse-don't-validate checks (id uniqueness, matter→rapier migration, defaults),
not as a standalone pass. Another exhibit for that item, like the
duplicate-object-ids entry above (whose fix-path 3 is the same tie-in).

**Diagnostic.** The 2026-07-18 census script (real `poly-decomp` over the whole
manifest, error-trapped) re-runs headlessly; it is both CC2's re-author
worklist and this guard's future test corpus.

## Initial-overlap contact coupling between dynamic bodies (2026-07-22)

**What it is.** When two DYNAMIC bodies are authored so they interpenetrate at
t=0, the physics engine's contact solver couples their motion in ways that look
like an invisible joint — one body "drags" the other, trajectories get
corrupted, and the effect is position-sensitive and sometimes non-reproducible.
Observed by Bill 2026-07-22 in a "Cannon Projectile Motion" sim: a `cannonball`
(mass 5, launched 20 m/s @ 45°) authored overlapping the lower-right corner of a
`dynamics_cart` `launcher` (mass 50). AABB check confirms the overlap at spawn
(ball x≈6.37→9.37, y≈24.25→27.25 vs cart x≈3.08→9.08, y≈24.75→27.75 — ~1.2 m × 2 m
into the cart's corner).

**Mechanism (not a bug — expected engine behavior).** At t=0 the bodies are
interpenetrating, so Rapier applies penetration-recovery (position correction /
Baumgarte) impulses to push them apart, PLUS normal + frictional contact
impulses through the persistent contact manifold. A 20 m/s ball embedded in a
50 kg body launches INTO a stiff contact, so momentum + friction couple the two.
That is the "attached with a joint" feel — a stiff contact, not a constraint.

**Why the position-sensitivity fits.**
- Ball centered above the wheels, NO overlap → no initial contact → ball flies
  free (correct projectile motion). ✓
- Ball dropped slightly → shallow overlap → intermittent, shallow contact →
  "dragged," and NON-reproducibly. ✓ Shallow penetration makes contact-manifold
  generation and the recovery impulse hypersensitive to exact depth and
  first-few-frame timing (the observed non-determinism is real, not imagined).

**Why it matters (authoring footgun).** Nothing — LLM generation, remix, or
hand-authoring — currently prevents spawning visually-touching dynamic bodies,
and the coupling surprise is invisible in the JSON. A "cannon + cannonball"
prompt naturally wants the ball AT the cannon's muzzle, i.e. overlapping.

**Where the fix lives — the diagnostics bus (strong fit).** Dynamic–dynamic
overlap at load is exactly "LIVE config-state truth" (a property of the loaded
config, cleared on every re-expansion) — the ratified diagnostics-bus semantic
([diagnosticsBus.ts](src/lib/diagnosticsBus.ts), shipped 2026-07-20). Natural
future fix: an ingestion-seam AABB (or collider) overlap check that fires an
amber diagnostic at load ("projectile overlaps launcher at spawn — expect
contact coupling"). Same choke point as the parked "runtime ingestion boundary"
item (`scaleObjectToSI` / container expansion), same live-truth home as the
grounded-without-floor and >12-vert diagnostics.

**Systematic exploration to do before deciding the fix.** Build a small matrix
and drive it: overlap depth (none → deep) × mass ratio (light-into-heavy vs
heavy-into-light) × friction (both engines mix differently — Rapier default 0.5,
Planck begin-contact max rule) × engine (rapier vs planck; #4 says Planck is
more energetic). Open questions: (a) is a WARN enough, or should the seam nudge
bodies apart (unsanctioned reinterpretation of authored positions — cf. invariant
#10, probably NO)? (b) should the prompt carry an authoring rule "don't spawn
overlapping dynamic bodies; place the projectile just clear of the launcher"?
(c) does a muzzle-placed projectile need a spawn-offset convention instead?

**Trigger to un-park.** Returning to cannon/launcher-style sims (projectile
emerging from a body), or the FBD workstream surfacing contact forces (the same
initial-overlap impulses would pollute an engine-readback FBD validator).

## Rotated coordinate basis for component decomposition — incline-plane sims (2026-07-22)

**What it is.** Component decomposition (`components: true` on a `showVectors`
entry, SHIPPED 2026-07-22 — see `Notes_on_Applied_Forces_Refactor.md` Findings
2026-07-22) currently splits a vector along HORIZONTAL/VERTICAL only. Incline-
plane physics wants the basis rotated to along-incline (∥) and perpendicular-to-
incline (⊥) — decompose weight into the component that drives sliding vs. the
component the normal force cancels. This is the natural next increment.

**Why it's already half-designed (the door was left open on purpose).** The
shipped schema field is a BARE boolean, which is additively forward-compatible
(no break to widen or add a sibling). The renderer's internal discriminator is
`axis: 'x' | 'y'` ([VectorArrow.ts](src/components/simulation_components/renderables/visuals/VectorArrow.ts),
[types.ts](src/components/simulation_components/renderables/types.ts)); it
generalizes to `'parallel' | 'perp'` + a basis angle, with leg directions
becoming (cosθ, sinθ) / (−sinθ, cosθ) dot-products. Axis-aligned is exactly the
θ=0 case, so nothing shipped precludes this.

**The open fork (NOT decided — this is why it's parked, not built).** Where does
the basis angle live?
- **Per-arrow** (`componentAxisAngle` on the config entry): most flexible, but
  verbose and the author/LLM must repeat it on every decomposed arrow in the
  scene.
- **Env-level** (a tilted global coordinate frame on `environment`): DRY — an
  incline defines ONE basis the whole scene shares; matches the physics ("tilt
  the coordinate system"). But it's a bigger feature: a rotated basis probably
  also wants rotated grid lines and rotated `.x`/`.y` readouts/graphs to stay
  coherent, and it brushes invariant #10 (units/frames describe the diorama —
  a global frame rotation is a description change, migrate don't reinterpret).
  **Current lean: env-level**, since an incline tilts the whole coordinate system
  — but this needs scoping against the grid/readout ripple before committing.

**Suggested fix paths, ranked.**
1. Decide the fork as part of scoping the first incline-plane sim (curriculum:
   PHYSICS_SHAPES ramp/incline rungs; `WagonStop`'s ramp-seating seed is a
   nearby anchor). Don't decide it in the abstract — let a real incline sim force
   the grid/readout coherence questions into the open.
2. If env-level: prototype a `environment.coordinateAngle` (name TBD) that a
   single ingestion-seam knows about, and have component decomposition read it —
   one source of truth, same seam as the other frame/unit knowledge (parked
   "runtime ingestion boundary" item).
3. If per-arrow: add `componentAxisAngle?` (env angleUnit, CCW from +X, default
   0) next to `components`; smallest change, revisit DRY later.

**Trigger to un-park.** Scoping the first incline-plane / ramp sim, or the FBD
workstream (`Notes_on_Applied_Forces_Refactor.md` Goal 1) reaching step 5's
"incline decomposition" follow-on — whichever comes first. Both want ∥/⊥ legs.

---

## Loupe as a general visualization primitive — what else it could hold (2026-08-08)

**What it is.** The force loupe was scoped for FBDs (`Notes_on_Applied_Forces_Refactor.md`
Findings 2026-08-08; design views + SVG mockups live in `/docs/vector-arrows`).
Working through *what else* it could show surfaced a broader read of the tool.
Parked deliberately as a SURVEY, not a plan: Bill's instruction is that **no line
gets drawn yet** — see "Why no line" below.

**The reframe that generated the survey.** The particle-dot decision (body inside
the loupe drawn as a point, the FBD convention) was made for honesty — it kills
the spatial-zoom implication. But once the body is a point and the scale is
disclosed, the loupe stops being "the scene, bigger" and becomes **a bounded
region where you can do geometry that doesn't fit on the scene, and then say
truthfully how it relates back.** That is what textbooks have always done: the
free-body diagram is drawn *beside* the ramp; the Δv triangle is drawn *beside*
the circular path. The loupe is the sim's version of **the diagram in the
margin**. "Too small to see" is only one reason a construction can't be drawn in
place; "too cramped" (overlapping, collinear, needs vectors moved tail-to-tail,
needs a different basis) is the other, and the same machinery serves both.

**The organizing axis — modes of invisibility.** Physics content is the wrong
axis; perceptual failure modes are the right one, because the loupe addresses a
class of problem, not a class of topic.

| mode | what it looks like | example |
|---|---|---|
| magnitude too small | arrow under the render floor | feather's 0.098 N weight (the shipped case) |
| difference too small vs. its terms | two large quantities nearly cancel; the residual IS the physics | F_net at terminal velocity; E_total drift; Σp unchanged across a collision |
| construction doesn't fit in place | overlap, collinearity, tail-to-tail moves, rotated basis | F_g and F_N on a resting block, exactly cancelling and exactly superimposed |
| increment too small to perceive | the per-step change, not the value | Δv per frame — acceleration intuition |
| no natural geometry at all | real quantity, no on-canvas shape | momentum, impulse, torque |
| too fast | one-frame events | collision impulse spike (probably a DIFFERENT tool — a time axis, not a scale axis) |

**The survey, mapped to B-IDs.**

- **Δv construction (acceleration intuition)** — Bill's seed, from a colleague
  conversation. Draw v(t) and v(t−Δt) tail-to-tail inside the loupe with Δv
  spanning their tips: literally a = Δv/Δt made into a picture. **Convergence
  worth noting: Δv is ITSELF sub-threshold** — at a 60 Hz step in free fall
  Δv = 9.8/60 = 0.163 m/s → 3.3 px at 20 px per m/s, under the same 14 px floor,
  for the same reason. Not a bolt-on; the identical problem with a different
  quantity. Payoffs: **B19** Δv constant frame-to-frame is what "constant
  acceleration" LOOKS like; **B1** at the apex v_y reverses while Δv doesn't
  change (a top-tier projectile misconception); **B4/B13** Δv points at the
  CENTER — that is the derivation of centripetal acceleration and is currently
  unshowable; **B6** Δv changes the instant friction engages; **B10** two loupes
  showing *identical* Δv on very different masses = the monkey-and-apple sag
  comparison, which is inexpressible in the per-object graph model.
- **Rotated basis on an incline (B6)** — F_g decomposed along ∥/⊥ incline axes
  inside the loupe while the canvas keeps world axes. This is the parked
  "Rotated coordinate basis" item above, and the loupe may be a better home than
  schema authoring: a rotated basis is a *local representation change*, exactly
  the loupe's primitive, and as a VIEW rather than authoring it sidesteps that
  entry's env-level-vs-per-arrow fork entirely.
- **Equilibrium as active cancellation (B5, B6)** — a block at rest has F_g and
  F_N equal and exactly superimposed; students read that as "no forces." Separate
  them in the loupe and draw F_net explicitly as zero. Well-documented PER
  misconception target.
- **Momentum vs velocity (B2)** — p = mv is parallel to v but scales differently;
  a heavy slow body and a light fast one can share p while looking nothing alike.
  Two arrows, two scale bars.
- **Conservation residuals (B2 Σp, B3 E_total drift)** — compelling, and B3's
  drift trace is a stated GIST Exceed claim over PhET. But these are SYSTEM
  quantities and the loupe is body-anchored; energy is also scalar, so the arrow
  idiom doesn't fit. Likely wants the proposed vector/bar PANEL instead.

**Promoted for design work (three, NOT a boundary).** FBD (in flight), **Δv**,
**rotated basis**. These three share vector-quantity/one-body/one-instant, which
is why they're the cheapest next experiments — Δv especially, as the deliberate
test of whether the loupe generalizes at all: if it needs nothing beyond a second
scale bar (m/s instead of N) and a caption, the pattern is real; if it needs
special-casing, that's the signal the loupe is an FBD tool and should stay one.

**Why no line — explicitly (Bill, 2026-08-08).** A definition written now would
foreclose ideation later. Concrete example Bill raised the same day: game UIs
present options in a **radial menu centred on the player** — which suggests
**multiple loupes arranged radially around one body**, each holding a different
construction (forces here, Δv there, components there). A "one loupe, one body,
one instant" rule would have quietly killed that before it was examined, and it
is not obviously wrong: a radial arrangement solves the anchoring/occlusion
problem the single-loupe placement design is still wrestling with, and it makes
"which construction am I looking at" positional rather than modal. So: **the
three promoted items are promoted, nothing is excluded**, and the survey stays
here rather than hardening into a scope statement.

**What would force a decision (i.e. when to un-park).**
1. Δv ships and either generalizes cleanly or doesn't — that is the real
   evidence, and it settles more than argument will.
2. The proposed vector/bar PANEL gets scoped. Panel and loupe overlap on the
   quantitative read; shipping both without naming one primary leaves a student
   two answers to "how big is this force." That tension needs resolving before
   BOTH exist, not after.
3. Mode count grows past ~2. The real cost of a general loupe isn't features, it
   is **modes** — the student must know which construction they're looking at.
   Mitigations already identified: show ONE construction at a time; name it in a
   caption beside the scale bar; and note the scale bar's units already
   half-answer it (newtons vs m/s tells you which construction you're in).

---

## Cross-repo vocabulary drift: gist ↔ generator name the same things differently (2026-08-07)

**Symptom.** GIST and the SVG-generator repo (`../physics_sim_icon_dev`)
implement the *identical* Planck over-cap check — same pinned `poly-decomp@0.3.0`,
same `makeCCW`+`quickDecomp`, same 12-vertex cap, same per-decomposed-part
metric — under different names on each side, with no shared glossary. Bill,
2026-08-07: *"It's important that the two repos talk the same language."*

**Cause / concrete drifts.**

| concept | generator | gist |
|---|---|---|
| the cap | `MAX_CONVEX_VERTICES = 12` (colliderSchema.js:42) | `PLANCK_MAX_POLYGON_VERTS = 12` (shapeHelpers.ts:18) |
| the check | `planckReadiness()` → `{level: ok\|warn\|fail}` | `warnOnOverCapParts()` |
| surfacing | `⚠P` / `✖P` card badges, `PlanckVerdict` line | diagnostics bus key `collider-overcap:*`; red parts under `?colliders=1` |
| remediation | `fix` status + bulk move + auto-coarsen | none — gist is consume-only; the dev warn is a backstop |

Plus three more:
- **`convex` vs `polygon`.** The generator's internal `COLLIDER_TYPES` still says
  `"convex"` (the "accepted-concave misnomer" — a `convex`-typed collider MAY be
  concave), while manifest_version 2 exports `type: "polygon"`. gist accepts both
  as one union member, so nothing breaks; the two repos simply name one thing two
  ways in their own source.
- **Stale comment**, colliderSchema.js:33 — still annotates `"convex"` as
  "(≤ 8 vertices)". The cap moved to 12 on 2026-07-17; the constant below it is
  right, only the comment lags.
- **`MAX_CONVEX_VERTICES` does double duty** in the generator (Planck cap AND
  save-gate / editor add-vertex cap / hull-tool target — Bill's "12 everywhere"
  call). gist's constant means *only* the Planck cap. Same number, different
  scope, which will matter the moment either one moves.

**How this actually caused harm (the motivating incident).** Asked whether the
generator's "0 approved SVGs concave after decomp" was the same number as gist's
post-decomposition census, an agent answered **no — different metric (convexity,
not vertex count)**. That was wrong: `planckReadiness` became an exact per-part
vertex check on 2026-07-17 (generator Task 15). The wrong answer came from
reasoning about the *pre-2026-07-17 heuristic* (`convex >8` fail / `concave >8`
warn) — which really was a different metric — with nothing in either repo
signalling that the vocabulary had moved on. **Reading
`../physics_sim_icon_dev/Dev_Tasks.md` first is the fix for the incident; a
shared glossary is the fix for the class.**

**Why parked.** Not blocking: both repos are correct today and the census is
clean. It is a naming/legibility problem whose cost is paid in agent-hours and
cross-repo confusion, not in wrong colliders. Bill's ruling 2026-08-07: *"keep
the language discrepancy an open issue"* — record it, don't fix it yet.

**Suggested fix paths, ranked.**
1. **Standardize one term for the metric and use it on both sides.** Candidate:
   **over-cap** (gist's diagnostics key already says `collider-overcap`), because
   it names the property rather than the engine — which stays honest when a third
   adapter appears and "Planck" stops being the reason.
2. **A short shared glossary block**, duplicated verbatim in gist's
   `Notes_on_Concave_Colliders_Refactor.md` and the generator's `Dev_Tasks.md`
   (they already cross-link by relative path), listing the term pairs above.
   Cheaper than renaming code and captures most of the value.
3. **Rename toward the wire format** — generator `convex` → `polygon` internally,
   matching manifest v2. Touches the generator's schema, validators, editor and
   LLM system prompt; do it only if the misnomer bites again.
4. **Fix the stale ≤8 comment** (colliderSchema.js:33) whenever that file is next
   opened — a one-line no-risk cleanup.

**Related.** A gist-side assertion that every consumed manifest entry is
`status === "approved"` would let gist *detect* an export-invariant violation
instead of assuming it; entries already carry `status`. Small, and it belongs
with the parked ingestion-boundary work.

---

## Force-arrow labels collide when two arrows are collinear (2026-08-10)

**Symptom.** On a body in 1D vertical motion with both `force-net` and
`force-gravity` drawn, the two labels overprint into an unreadable smudge —
observed as a literal `FF_ng_t` glyph pile on the bowling ball in
`/simulation/bowling-ball-and-feather` while capturing stills for a
collaborator write-up. The arrows themselves render correctly; only the labels
are illegible.

**Cause.** Labels default to `labelPlacement: "midpoint"` with a fixed
perpendicular offset to the arrow's left
(`src/schemas/simulation.ts:71`). That offset resolves collisions between
arrows pointing in *different* directions, which is the common case and why
this has not bitten before. When two arrows are collinear AND similar in
length — F_net and F_g on a body whose only other force is small drag — both
labels land on the same point. The synthesizer already indexes multiple arrows
of the same KIND to avoid exactly this
(`synthesize.ts:148-149`), but nothing deduplicates across different kinds.

**Why parked.** A manual escape hatch already exists and is authorable per
arrow: `labelPlacement: 'tail' | 'midpoint' | 'head'` plus `labelFontSize`. Any
sim that hits this can fix itself today by moving one of the two labels to
`head`. So it is a polish defect, not a blocker — and it is most visible in
exactly the 1D vertical scenes that are otherwise well served. It also has
obvious overlap with the still-open FBD step-4 primary-representation call:
if that lands an analytical display model, label layout gets revisited anyway
and a fix built now may be thrown away.

**Suggested fix paths, ranked.**
1. **Collision-aware auto-offset in the synthesizer** — after building the
   arrow list for a body, detect labels whose anchor points fall within some
   px threshold and fan them along the arrow (tail / midpoint / head) or step
   the perpendicular offset. Purely presentational, no schema change, and it
   fixes every sim including LLM-authored ones that will never set
   `labelPlacement` by hand. Preferred.
2. **Author around it in the affected fixtures** — set `labelPlacement: 'head'`
   on one of the pair in the sims that show it. Zero risk, fixes nothing
   generally, and the LLM won't know to do it.
3. **Suppress the redundant arrow** — on a body where F_net and F_g are
   collinear the pair is arguably over-drawing anyway. Rejected as a default:
   deciding an arrow is redundant is a pedagogical call, not a rendering one,
   and the whole point of the FBD is that the student checks closure.

**Diagnostic.** `/simulation/bowling-ball-and-feather`, play to ~frame 26 and
look at the bowling ball. Any 1D vertical sim drawing both `force-net` and
`force-gravity` reproduces it.

---

## General temporal / event layer — element duration, sim sequencing, event detection (2026-08-13)

**Symptom.** `appliedForce` (applied-forces Phase 2) is constant for the whole
run. A large fraction of natural force prompts are not: "push the crate for two
seconds and let go", "cut the engine at the top of the arc", "stop pushing when
it hits the wall". The same gap shows up elsewhere the moment you look for it —
a sim that should run a staged sequence, an initial velocity that should be
imparted as a kick rather than a state, a graph annotation that should fire at
an event.

**Cause.** There is no time or event vocabulary in the schema at all. Every
authored quantity is either an initial condition (applied once at t = 0) or a
constant (applied every frame forever). Nothing can start, stop, or react.

**Why parked — and this is a scoping decision, not an omission.** Bill,
2026-08-13: *"I want to add that in when we work on it as a general feature for
element duration (like applied force), sim sequence, and event detection. The
latter enables us to stop an applied force when we hit the simulation walls for
instance."* A one-off `duration` field on `appliedForce` would have shipped the
weakest possible version of this and pre-empted the general design — and it
would have had to be repeated, differently, on every future field that wants a
lifetime. The three capabilities named are one feature seen from three angles:

1. **Element duration** — any authored element carries an optional lifetime
   (start/stop), of which a timed applied force is the first instance.
2. **Sim sequence** — staged scenes: this, then that. The container for
   multi-step lessons.
3. **Event detection** — the interesting half. A force that stops **on a wall
   contact** is qualitatively better than one that stops at t = 2.0 s, because
   the condition is physical rather than clairvoyant. Wall/body contact is the
   obvious first predicate; the adapters already surface contacts
   (`getContactForces`, and Planck's `begin-contact` hook), so the engine-side
   input exists.

Until then, the authoring answer for a varying force is a SLIDER — the student's
hand is the time dependence, which is also how PhET's *Forces and Motion* does
it. Both the schema `.describe()` and the prompt say the force is constant and
point at a slider, and the prompt explicitly forbids inventing a time-varying
field.

**Suggested fix paths, ranked.**
1. **Design the temporal layer as its own refactor note** before any field grows
   a time knob, with event detection scoped in from the start (not bolted on).
   Determinism is the constraint that shapes it: precompute→replay means every
   trigger must be a pure function of simulation state, and anything that
   changes trajectories joins the frame-cache key (invariant #13). Preferred.
2. **A minimal `duration` on `appliedForce` alone**, as a stopgap if a benchmark
   needs it before the general design exists. Explicitly rejected for Phase 2 —
   recorded here so the rejection is visible rather than relitigated.
3. **Do nothing; sliders only.** Viable for B5 and PhET-parity work, which is
   why this is parked rather than blocking.

**Diagnostic.** `/simulation/applied-force-2d` — the pull runs forever; there is
no authoring way to stop it. Any prompt of the form "push it for N seconds"
currently has to be re-scoped to "let the student push it".

---

## `body.velocity = {...}` silently breaks the accessor (2026-08-13)

**Symptom.** Assigning a whole vector to a `PhysicsBody` — `body.velocity = {x: 0, y: v.y}`
— appears to work, but from then on **every read returns the frozen assigned
value while the body keeps moving**. Hit while writing the 2D breakaway harness:
a block visibly travelled 2.5 m with `body.velocity.x` reading 0.0000 the whole
way, which read as a physics bug for a good few minutes.

**Cause.** `position` and `velocity` are live `Vec2Accessor` instances created
once per body (`RapierAdapter.ts:179,189`; `PlanckAdapter.ts:117,127`) whose
`.x`/`.y` getters and setters route through the engine. Assigning a plain object
replaces the instance property outright, so the accessor — and its engine
connection — is gone. The concrete wrapper classes declare `readonly velocity`,
which would catch it, but the **`PhysicsBody` INTERFACE declares
`velocity: Vec2` (mutable)** (`types.ts:65-66`), so through the interface the
assignment type-checks cleanly.

**Why parked.** **No live bug: nothing in `src/` assigns a whole vector** —
every call site writes components (`body.velocity.x = …`), which is the correct
pattern and the one the controls layer, `handleUpdate`, and the seam all use.
This is a latent trap for the next person writing adapter-level code (harnesses
especially), not a defect in shipped behaviour.

**Suggested fix paths, ranked.**
1. **Mark the interface members `readonly`** (`readonly position: Vec2`,
   `readonly velocity: Vec2`), matching what the implementations already declare.
   The assignment then fails to compile, which is exactly when you want to hear
   about it. Cheap; needs a check that no caller legitimately reassigns.
   Preferred.
2. **Document it on the interface** — a docstring warning next to the fields.
   Weaker (docstrings do not fail builds) but zero risk.
3. **Make the setter work** — define `velocity` as an accessor property whose
   setter writes components through. Most forgiving, most machinery, and it
   rewards a pattern we do not otherwise want.

**Diagnostic.** Against either adapter: create a dynamic body, step it, then
`body.velocity = {x: 0, y: 0}`; apply an impulse and step. `body.position.x`
advances while `body.velocity.x` stays 0.
