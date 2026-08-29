# Notes on Engine Upgrades Refactor

**Opened 2026-08-26.** The workstream for keeping GIST's two physics engines
current: what a version bump costs, what it silently changes, and what has to be
re-measured before we trust it.

This is a *maintenance* track, not a capability track — the curriculum does not
lead here (invariant #6 is about what to build; this is about not rotting). It
exists because both engines have moved while we were building on top of them,
and because one of those moves fixed a bug we are currently exposed to.

Genre note: the **present-tense** facts (the Planck COM bug, the Rapier
correction-factor trap) also live as entries in
[GIST_Physics_System_Topics.md](GIST_Physics_System_Topics.md) → "Engine version
currency", because they are true of the system today whether or not we ever run
these upgrades. This note owns the *plan*; the tracker owns the *state*.

---

## Background — how this came up

Raised by Bill 2026-08-26 as an ecosystem question: Erin Catto (Box2D) has been
publishing heavily, and "a rising tide lifts all ships" — is that stirring
development in Planck and Rapier? Answer, after pulling both changelogs: **the
tide is real but it is lifting exactly one of our two engines.** Investigating
also turned up an ecosystem relocation and a live bug, which is why this became
a workstream rather than a one-line version bump.

### Ecosystem finding — the Rapier JS bindings moved house

`dimforge/rapier.js` was **archived 2026-07-12** and merged into the main Rapier
monorepo under `typescript/`. The old repo's `CHANGELOG.md` is frozen at 0.19.3
and **looks current** to anyone who lands on it. Live changelog is now
`dimforge/rapier` → `typescript/CHANGELOG.md`.

Practical consequence: any future "check the Rapier changelog" instinct points
at a dead repo whose last entry matches the version we happen to be running,
which reads as "we're up to date." Corrected in the tracker.

---

## Current state (measured 2026-08-26)

| package | installed | latest | published | our range | picked up by `npm update`? |
|---|---|---|---|---|---|
| `planck` | 1.4.2 | **1.5.0** | 2026-04-07 | `^1.4.2` | **YES** — only the lockfile pins us |
| `@dimforge/rapier2d-compat` | 0.19.3 | **0.20.0** | 2026-08-08 | `^0.19.3` | **NO** — caret on `0.x` excludes `0.20.x` |
| `poly-decomp` | 0.3.0 | 0.3.0 | 2022-06-24 | `^0.3.0` | current; upstream is dead |

The asymmetry in that last column matters and is *backwards* from the risk:
the upgrade that needs care (Rapier) cannot land by accident, and the one that is
safe (Planck) can drift in on someone's next `npm update` without a decision.
Land Planck deliberately so it isn't landed carelessly.

Rapier release cadence is worth noting: 0.19.3 (2025-11-05) → **nine months of
silence** → 0.20.0 (2026-08-08). A long quiet followed by one minor bump means a
large batched release, not maintenance drift.

---

## Findings — 2026-08-26

### §A — Rapier 0.20.0 wraps core 0.35.0: the API is fine, the *numbers* are the risk

Core 0.35.0 brings a **rewritten sleeping system** (persistent islands — an
island sleeps and wakes strictly as a unit), a **sweep-based CCD rewrite now
enabled by default against fixed colliders**, a reworked narrow-phase/solver
around a persistent contact graph, and a broad phase tuned for large
mostly-static worlds.

**Method note:** the four breaking changes below were checked by diffing the
0.19.3 and 0.20.0 `.d.ts` trees directly (npm tarball vs `node_modules`), not by
reading the changelog prose. The prose overstates our exposure.

| Listed breaking change | Hits us? |
|---|---|
| `NarrowPhase.contactPair` gains a `RigidBodySet` argument | **No.** We call `world.contactPair` at [RapierAdapter.ts:323](src/physics/rapier/RapierAdapter.ts#L323); the `World` wrapper's signature is byte-identical across both versions and supplies `this.bodies` internally. Only the `NarrowPhase` method changed. |
| `solverContactFriction` / `solverContactRestitution` → `friction()` / `restitution()` | **No.** Not called. |
| `IntegrationParameters.minIslandSize` removed | **No.** Unused. `numSolverIterations` survives, so the debug-panel solver-iterations knob is unaffected. |
| `-compat` files relocated to `dist/` | **No.** We do a plain package import, no deep imports. |

Confirmed still present in 0.20.0: `manifold.normal()`, `numContacts()`,
`contactImpulse()`, `contactTangentImpulse()`, and
`RigidBodyDesc.setCanSleep()`. So the **contact-force seam and the global
sleep-disable (invariant #4) compile unchanged.**

#### ⚠️ The real hazard: our empirical correction factor is on a fuse

[RapierAdapter.ts:316-317](src/physics/rapier/RapierAdapter.ts#L316-L317) carries

```ts
const iters = world.integrationParameters.numSolverIterations;
const corr = iters / (iters + 1);
```

derived empirically (step-3 harness probe, 2026-08-06) because
`contactImpulse()` accumulated **one substep too many**. Upstream has now fixed
exactly that, in core **0.35.2**: *"the impulses reported on contacts (and the
contact-force events derived from them) are now the total impulse applied during
the step, instead of one substep too many."*

**0.20.0 wraps 0.35.0, not 0.35.2.** So:

- **Upgrading to 0.20.0** — the correction is probably still required, but the
  solver was *reworked underneath it*, so the ratio must be **re-derived on the
  harness**, never assumed to still be `i/(i+1)`.
- **The next JS release** (whenever it wraps ≥ 0.35.2) — the correction becomes
  actively **wrong**, silently scaling every contact force by `i/(i+1)`. Nothing
  throws. The FBD would still close (both normal and friction scale together),
  so invariant #14's double-count alarm **would not fire** — this is a failure
  mode our existing safety net does not catch.

That last point is the reason this note exists at all, and the reason Phase 0
below is worth doing even if both upgrades are deferred indefinitely.

#### Other 0.20.0 items to handle

- **CCD default-on against fixed colliders changes trajectories** for fast bodies
  meeting ground and ramps. Not a code change — a benchmark re-drive. Note this
  partially closes the 🔴 CCD adapter feature gap *by default*, without us asking.
- **Sleeping rewritten (persistent islands).** Our global disable should still
  dominate, but re-verify: the whole point of the 2026-08-09 decision was that a
  sleeping body's impulses flatten and empty the FBD on below-breakaway scenes.
- **`console.warn` suppression** at
  [RapierAdapter.ts:41-49](src/physics/rapier/RapierAdapter.ts#L41-L49) targets a
  0.19.x `-compat` init bug that 0.20.0's changelog claims to fix. Verify, then
  delete rather than leaving a suppressor over a warning that no longer fires.
- **Stale version references in comments** at
  [RapierAdapter.ts:220](src/physics/rapier/RapierAdapter.ts#L220) and
  [RapierAdapter.ts:427](src/physics/rapier/RapierAdapter.ts#L427) both say
  "0.19.3" and must be re-dated or re-verified.
- New exports in 0.20.0 (informational): `JointAxis`, `scratchBuffer`,
  and `SphericalImpulseJoint` motors — relevant to the 🔴 joints gap, not to this
  upgrade.

### §B — Planck 1.5.0 has no solver work, but fixes a bug we are running today

Source diff 1.4.2 → 1.5.0: three shape files, `common/Matrix.ts`,
`dynamics/Body.ts`, `dynamics/World.ts`, `dynamics/joint/DistanceJoint.ts`, and
the serializer schema. **Zero files matching solver / contact / island /
TimeStep.** The changelog is `add-body` / `add-fixture` / `add-joint` events plus
serialization fixes — purely additive API, no breaking changes.

Buried under the innocuous line *"Bug fix addVec2"* is a real math bug, in
`planck/src/common/Matrix.ts:63`:

```js
export function addVec2(out, v, w) {
  out.x = v.x + w.x;
  out.y = v.x + w.y;   // ← 1.4.2: v.x. Should be v.y.
}
```

One internal caller, `PolygonShape.computeMass` line 491:
`matrix.addVec2(massData.center, center, s)` — the final step converting the
area centroid back into shape coordinates. **Every polygon body in Planck 1.4.2
therefore gets a displaced centre of mass**, and `massData.I` is then shifted
using that wrong centre, so rotational inertia is off too.

**When it cancels:** `s` is the *vertex average*, `center` is the area centroid
*relative to s*. For symmetric shapes (a centred or offset box, any triangle) the
area centroid equals the vertex average, so `center` is `(0,0)`, the swapped
component is zero, and the result is correct by accident. This is why the bug
survived — the common cases are clean.

**When it bites:** irregular convex polygons, where area centroid ≠ vertex
average. Measured across the 173 polygon colliders in
`public/renderables/manifest.json`, y-error as a fraction of shape extent:
**median 4.8%, worst ≈29%** (`orange_fruit`, `metronome`, `fishing_boat`,
`office_chair`).

> **Caveat on that magnitude, stated so nobody over-reads it.** Those figures are
> computed on **raw outlines**. Planck actually sees *decomposed convex parts*
> (invariant #7) — each smaller and more regular, so per-part error is likely
> lower, though a body's composite COM is the mass-weighted sum of individually
> displaced part centres. **The direction and the existence are certain; the
> magnitude needs a per-part re-measure.** Do that before quoting a number.

**We do not shield ourselves from it.** Both `setMassData` call sites —
[PlanckAdapter.ts:160-164](src/physics/planck/PlanckAdapter.ts#L160-L164) and
[PlanckAdapter.ts:364-368](src/physics/planck/PlanckAdapter.ts#L364-L368) — read
`body.getLocalCenter()` and hand it straight back, faithfully *preserving* the
wrong centre rather than correcting it. Rapier computes mass properties in Rust
and is unaffected.

**Candidate explanation for a known open divergence.** `CLAUDE.md` invariant #4
and the Topics tracker both record that Planck is "parity-checked but dynamically
divergent — more energetic; marginal tips differ." A displaced COM is *exactly* a
tipping-threshold error. This is the first mechanical hypothesis we have had for
that divergence — **but it is a hypothesis**, untested, and it does not explain
"more energetic." Phase 1 is the experiment that would confirm or kill it. Do not
promote it to an explanation in the invariant until it is measured.

### §C — Ecosystem read: the tide is not lifting Planck

Planck is a port of Box2D **v2.4**. Catto's recent work is the **v3** rewrite
(SIMD solver, TGS Soft constraints) — a from-scratch redesign, not a series of
patches anyone can cherry-pick downstream. Absorbing it would be a re-port, and
1.5.0's file-level diff shows no movement in that direction: the solver was not
touched at all.

Rapier, despite unrelated lineage (Rust, not a Box2D port), **has** absorbed
Box2D v3's soft-constraint ideas into its solver, and 0.35.0 continues that line
of work. So the honest answer to the framing question: the rising tide is
lifting Rapier — our default — and leaving Planck at anchor. That is a mild
argument for Rapier remaining the default, and a mild argument against ever
investing in Planck-specific physics fidelity beyond parity-checking.

---

## Recommended approach — split the two, opposite risk profiles

Do **not** bundle these into one "update the engines" commit. They are different
kinds of change and want different amounts of scepticism.

- **Planck is cheap and near-term.** Additive API, no solver changes, fixes a real
  COM bug on a parity-checked engine, and may sharpen a documented mystery.
- **Rapier is near-zero code and high re-validation.** Sleeping, CCD and the
  solver were all rewritten beneath us. The diff we would write is trivial; the
  measurement we owe is not.

---

## Phased rollout

### Phase 0 — annotate the correction factor (do this first, independent of both)
No behaviour change. Add a comment at
[RapierAdapter.ts:316-317](src/physics/rapier/RapierAdapter.ts#L316-L317)
recording that core 0.35.2 fixes the extra-substep impulse upstream, that the
factor must be **re-measured on any Rapier bump**, and that it must be **deleted**
once the wrapped core is ≥ 0.35.2. Cheapest possible guard against the one
failure mode invariant #14 cannot detect. Worth landing even if both upgrades
are deferred forever.

### Phase 1 — Planck 1.4.2 → 1.5.0
1. Bump, regenerate lockfile, **show Bill the lockfile diff** before commit
   (global npm-safety rule 5).
2. Re-measure the COM error on **decomposed parts**, not raw outlines, to replace
   the caveated magnitude in §B with a real number.
3. Drive a marginal-tipping sim on Planck **before and after** — the experiment
   that tests the §B hypothesis against the "marginal tips differ" divergence.
4. Record the outcome in the Topics entry either way. A negative result (the
   divergence doesn't move) is worth as much as a positive one and must not be
   silently dropped.

### Phase 2 — Rapier 0.19.3 → 0.20.0 (its own session)
1. Bump the range explicitly (`^0.19.3` will not do it).
2. **Re-derive `corr` on the step-3 harness** at several iteration counts. If the
   measured ratio is no longer `i/(i+1)`, that is the finding, and it lands here.
3. Re-verify the global sleep-disable still empties nothing on a below-breakaway
   static-friction scene (the scenario the 2026-08-09 decision protects).
4. Re-drive the benchmark sims most exposed to CCD-by-default: fast falls onto
   ground, projectiles, anything meeting a ramp at speed.
   - **If Recordings R1 has shipped by then, capture these runs BEFORE the bump**
     and re-run after. Same config, same `controlValues`, different
     `engineVersion` — that is a direct A/B on what the upgrade did, and
     compare-mode's ghost overlay makes the divergence visible rather than
     inferred from screenshots. See the sequencing dependency below.
5. Confirm component force arrows still close onto the derived net (invariant
   #14) — closure is the validation, and it is what would catch a solver-side
   surprise.
6. Delete the `console.warn` suppressor if the underlying warning is gone;
   re-date the two "0.19.3" comments.

### Phase 3 — conditional, on the next Rapier release wrapping core ≥ 0.35.2
**Delete `corr` entirely** and re-verify contact forces read `m·a` directly.
Blocked until such a release exists; as of 2026-08-26 npm `latest` is 0.20.0 and
the `canary` tag is same-day, so there is nothing newer to wait on yet.

---

## Sequencing dependency — Recordings R1 before Phase 2 (agreed 2026-08-26)

These two tracks were independent until the provenance question linked them. The
agreed order is **Recordings R1 → Rapier Phase 2**, for two reasons that point the
same way:

1. **So the upgrade is visible in the data.** If R1 ships first, every recording
   made before the bump is stamped `engineVersion: '0.19.3'` and every one after
   is stamped `0.20.0`. The upgrade becomes an honest, legible discontinuity in
   the artifact history instead of an invisible one. The order to avoid is R1
   shipping *without* the provenance fields and the upgrade following — that
   produces a population of recordings nobody can attribute, and it cannot be
   repaired after the fact.
2. **So recordings can MEASURE the upgrade.** This is the reframe (Bill,
   2026-08-26) and it is the more valuable half: a recording is sealed frames, so
   a pre-upgrade run and a post-upgrade run of the same config and the same
   `controlValues` differ *only* by the engine build. Compare-mode is then a
   purpose-built instrument for exactly the re-validation Phase 2 owes — CCD
   trajectory changes, sleeping-rewrite effects, solver differences — shown as a
   ghost overlay rather than argued from two screenshots. Recordings stop being a
   thing exposed to engine upgrades and become the way we assess them.

**Consequence for the mismatch policy** (open question in
[RecordingsAndCameras.tsx](src/pages/docs/RecordingsAndCameras.tsx)): an
`engineVersion` mismatch is a *warning* in the student lab context and the
*entire point* in the dev-validation context. So compare-mode must **never refuse**
to overlay across versions — it must label the comparison. A policy that blocks
mismatched overlays would break the instrument this section just argued for.

Phase 1 (Planck) carries no such dependency and can go at any time.

## Out of scope

- Adopting Box2D v3 or any third engine. Recorded in §C only as context.
- `poly-decomp` — current at 0.3.0, upstream dead since 2022. GIST-owned
  decomposition usage is stable; replacing an unmaintained dependency is its own
  question and does not belong to this note.
- Any engine-version surface in the schema, the prompt, or the UI. Engine version
  is not authorable and must not become so.

## Open questions

1. **Does the COM fix actually move the marginal-tip divergence?** Phase 1 step 3
   answers it. If yes, invariant #4's parenthetical needs rewording and the
   Topics entry on tipping needs a cross-link.
2. ~~**Should engine versions join the frame-cache key?**~~ **RESOLVED 2026-08-26
   — no, and the reasoning moved sideways to Recordings.** Verified: `frameCacheRef`
   is a `useRef` ([JsonSimulation.tsx:694](src/components/JsonSimulation.tsx#L694)),
   in-memory only, cleared on every config edit
   ([1446](src/components/JsonSimulation.tsx#L1446),
   [1555](src/components/JsonSimulation.tsx#L1555),
   [1643](src/components/JsonSimulation.tsx#L1643)) and destroyed with the
   component. Engine version can only change via install → rebuild → reload, each
   of which kills the ref first, so **no reachable state holds frames from a
   different engine build**. Adding it would be a permanent constant in the key.
   - **Why `engine` belongs but `engineVersion` doesn't:** `engineOverride` is a `useState` driven by the debug panel ([JsonSimulation.tsx:631-634](src/components/JsonSimulation.tsx#L631-L634)) — a user can flip Rapier↔Planck while the cache is live. Invariant #13's operative test is *physics-affecting **and mutable within the cache's lifetime***. Widening it to immutable build-time constants would dilute the rule until WASM build flags and `poly-decomp`'s version "belong" too.
   - **Where the concern is real — Recordings.** R1 persists to IndexedDB and R4 to Supabase with share-by-URL, so recordings cross exactly the boundary the cache cannot. Replay never re-simulates, so a run captured under one engine build and reloaded under another is silently a different experiment, and R3 compare-mode would happily ghost-overlay a pre- and post-upgrade run as one. The proposed `Recording` type carried `version: 1` (artifact format) but **no engine identity at all**. Spun out 2026-08-26: `metadata.engine` + `metadata.engineVersion` are now specified at **R1** in [RecordingsAndCameras.tsx](src/pages/docs/RecordingsAndCameras.tsx) — R1 specifically, because once recordings are on disk the build that made them is gone and provenance can never be back-filled. Mismatch *policy* is an open question there, not here.
3. **Do we want a standing currency check?** Both engines drifted a full release
   without anyone noticing, and the archived-repo trap actively conceals it. A
   quarterly `npm outdated` glance at just these two packages would have caught
   both. Not proposing tooling — proposing a habit, if Bill wants one.

## Audiences touched (per the audience model)

- **Dev team** — this note, the Topics tracker entries, the roadmap source list.
  ✅ landed.
- **The contract** (`simulation.ts` + generated JSON schema) — unaffected. No
  field moves; engine version is not authorable.
- **The LLM** (`.describe()` + `gist_instructions.py`) — unaffected, deliberately.
  Nothing in the prompt names an engine version, and adding one would spend
  per-stage prompt budget on a fact the LLM cannot act on.
- **The teacher** and **the student** — unaffected *provided the upgrades preserve
  trajectories*, which is exactly what Phase 1 step 3 and Phase 2 steps 3–5 exist
  to establish. If a benchmark sim visibly moves, these audiences re-enter and it
  becomes a B-ID note.
