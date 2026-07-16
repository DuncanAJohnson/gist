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

## Duplicate object ids crash the page (2026-07-15)

**Symptom.** Editing a sim's JSON (Tweak JSON) so two objects share an `id`
kills the whole page. The console names the cause (duplicate body id), but
the user gets a dead white screen instead of a rejected edit. Surfaced by
Bill during the concave-colliders ship-gate drive.

**Cause.** Both adapters correctly refuse duplicate body ids with a `throw`
([RapierAdapter.ts:308](src/physics/rapier/RapierAdapter.ts#L308),
[PlanckAdapter.ts:236](src/physics/planck/PlanckAdapter.ts#L236)) — but
nothing above the adapter catches it. The committed config
(`handleSaveTweakedJSON` → `editedConfig`,
[JsonSimulation.tsx:772](src/components/JsonSimulation.tsx#L772)) mounts one
`ObjectRenderer` per object; the second body-build effect throws, and an
uncaught effect throw unmounts the React tree — no error boundary anywhere.
(Duplicate ids would also collide as React `key`s and in `objRefs`, so the
config is genuinely unrenderable — the bug is the *blast radius*, not the
refusal.)

**Why parked.** Editor-robustness, not physics; surfaced mid-ship-gate and
doesn't gate it. Small enough to pick up as a standalone fix.

**Suggested fix paths**, ranked (1+2 compose; Bill's preference is the
auto-rename in 1):

1. **Validate at the commit boundary.** In `handleSaveTweakedJSON` (and the
   Import Object path), check id uniqueness before committing. On collision,
   auto-rename the *second* occurrence (`payload` → `payload-2`) and surface
   a visible warning. Renaming the second keeps property bindings
   (controls/outputs/graphs target objects by id) resolving to the first —
   matches "first wins" intuition; a silent rename with no warning would be
   worse than rejecting, since bindings meant for the renamed object now
   point elsewhere.
2. **Error boundary around the sim canvas.** Any adapter/renderer throw
   degrades to an inline error card instead of a dead page. Broader payoff:
   catches the whole class, not just this instance.
3. **Ingestion-boundary tie-in.** Id uniqueness is a natural Zod
   `superRefine` — but nothing runtime-parses (see the "runtime ingestion
   boundary" item above); this is another exhibit for it. When that boundary
   lands, this check moves there and fix 1 becomes its warning surface.

**Diagnostic.** None needed — deterministic repro (any sim, Tweak JSON,
duplicate an object's `id`).

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
