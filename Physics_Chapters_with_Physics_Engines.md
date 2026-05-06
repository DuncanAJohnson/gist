# Physics Chapters with Physics Engines

What Planck and Rapier offer natively for the introductory-physics units we want to support, and what the `PhysicsAdapter` would need to expose to actually use it. Matter is intentionally omitted (deprioritized).

Scope: 1D kinematics, free fall, 2D kinematics, projectile motion, dynamics (Newton's laws), conservation of momentum, conservation of energy.

---

## Cross-cutting affordances (both engines)

These are the building blocks every unit below leans on:

- **Body types**: Dynamic, Static (Rapier "Fixed"), Kinematic — Rapier splits kinematics into `KinematicPositionBased` / `KinematicVelocityBased`, useful for "scripted" motion that ignores forces.
- **Gravity**: world-level vector + per-body `gravityScale` (Planck `body.setGravityScale`, Rapier `rigidBody.setGravityScale`).
- **Forces & impulses**: `applyForce`/`addForce`, `applyForceAtPoint`/`addForceAtPoint`, `applyImpulse`, `applyTorque`/`addTorque`, `applyTorqueImpulse`.
- **Damping**: `setLinearDamping`, `setAngularDamping` (the hook the air-resistance refactor builds on).
- **Material**: `density`, `friction`, `restitution` on collider/fixture.
- **Mass**: derived from collider density; both have an override (Planck `setMassData`, Rapier `setAdditionalMass(Properties)`).
- **Sensors**: non-colliding fixtures/colliders → trigger zones (Planck `fixture.setSensor`, Rapier `colliderDesc.setSensor`).
- **Contact callbacks**: Planck `beginContact` / `endContact` / `preSolve` / `postSolve`; Rapier `EventQueue` with collision events + `ContactForceEvent` (opt-in via `ActiveEvents.CONTACT_FORCE_EVENTS`).
- **CCD**: Planck `body.setBullet(true)`; Rapier `rigidBody.enableCcd(true)`.
- **Solver iterations**: Planck `world.step(dt, velocityIterations, positionIterations)`; Rapier `integrationParameters.numSolverIterations` / `numAdditionalFrictionIterations`.
- **Spatial queries**: raycasts and AABB queries on both.
- **Position/velocity getters** for trajectory sampling and live energy/momentum readouts.

### Differentiators that matter for these units

- **Axis locking**: Rapier has clean `setEnabledTranslations(x, y)` / `setEnabledRotations()`. Planck uses `fixedRotation` + a prismatic joint (or a kinematic body) to constrain motion to one axis.
- **Springs**: Rapier exposes a literal Hooke's-law joint via `JointData.spring(restLength, stiffness, damping, anchor1, anchor2)` — `k` and `c` are first-class. Planck has `DistanceJoint` with `frequencyHz` / `dampingRatio` (Box2D's soft-constraint formulation — equivalent but less direct mapping to a textbook `k`; conversion is `k = m · (2π · f)²`).
- **Joint catalog**: Planck has the full Box2D set — Distance, Revolute, Prismatic, Rope, Weld, Wheel, Pulley, Gear, Friction, Motor, **Mouse**. Rapier 2D has Revolute, Prismatic, Fixed, **Spring**, **Rope** (`Generic` is 3D-only). The pulley, gear, wheel, mouse, and friction joints are Planck-only.
- **Determinism + snapshot**: Rapier emphasizes deterministic stepping and exposes `world.takeSnapshot()` / `World.restoreSnapshot(bytes)` — repeatable energy/momentum plots and "rewind" demos. Planck is generally deterministic in practice but doesn't ship a built-in snapshot serializer; the project's manual snapshot path is the workaround.
- **Postsolve impulse readout**: Planck's `postSolve(contact, impulse)` gives `normalImpulses[]` and `tangentImpulses[]` directly — `Δp` per collision is one read. Rapier needs `CONTACT_FORCE_EVENTS` and gives `totalForce` / `maxForceMagnitude`, or you diff `linvel` across the step yourself.

---

## Per-unit mapping

### 1) 1D kinematics — `x(t), v(t), a(t)` along a line

- Constrain to one axis: **Rapier** `setEnabledTranslations(true, false)` + `lockRotations()` (one line each). **Planck**: prismatic joint to ground, or `fixedRotation` + manually zero the off-axis component, or a `Kinematic` body with scripted position.
- Constant velocity: set `linvel` on a `KinematicVelocityBased` body (Rapier) or kinematic body (Planck).
- Constant `a`: `addForce` / `applyForce` of constant magnitude → `F = m · a`.
- Time-varying `a(t)`: same call, recomputed per step.
- Position/velocity logging: getters straight into Recharts.
- Sensors at finish lines / waypoints for time-stamp callbacks.

### 2) Free fall

- World gravity (already wired). Per-body `gravityScale` for "what if g were Mars?"-style toggles without mutating the world.
- Air resistance: `linearDamping` (current model) → in-flight quadratic `(k/m)·|v|` from the air-resistance refactor (per-body, mass-dependent).
- Bouncing floors: `restitution` on the floor collider/fixture.
- Fast falls / thin floors: enable CCD (`bullet` / `enableCcd`) so the body doesn't tunnel.
- Terminal velocity demos fall naturally out of the new drag model.

### 3) 2D kinematics — independent x and y components

- Native 2D vectors throughout — no constraints needed.
- Set `world.gravity = (0, 0)` for inertial-frame demos.
- Independent components: `setLinearVelocity({ x, y })`; trajectory plotting via `position` over time.
- For "x and y are independent" pedagogically: two debug overlays sampling `body.position.x` and `body.position.y` separately into Recharts works on either engine.

### 4) Projectile motion

- Initial velocity + gravity + (optional) drag — pure superposition of (2) and (3).
- Launch: `setLinearVelocity({ vx, vy })` once.
- Range / apex: contact callbacks for ground impact, sensor regions for "hits target".
- Drag-on / drag-off side-by-side: the Phase-1 quadratic toggle from the air-resistance refactor already supports A/B comparisons in the debug panel.
- **Rapier-specific bonus**: deterministic replay → identical trajectories every run for "predict the landing spot" exercises. Snapshot/restore lets you bookmark an apex and rewind.

### 5) Dynamics — Newton's laws

- **F = ma**: vary mass (`setMassData` / `setAdditionalMass`), vary applied force, plot `a` from velocity differences. The recently-fixed Rapier mass setter ([RapierAdapter.ts:219-227](src/physics/rapier/RapierAdapter.ts#L219-L227)) makes mass sliders trustworthy.
- **Off-center forces** = linear + torque from one call: `applyForce(force, point)` (Planck), `addForceAtPoint(force, point)` (Rapier).
- **Newton's 3rd law**: contact impulses are equal-and-opposite by construction in the constraint solver. Both engines' contact callbacks let you read those impulses and visualize the action/reaction pair.
- **Friction**: per-fixture/per-collider `friction`, plus Rapier's `frictionCombineRule` and Planck's `Contact.setFriction` for runtime overrides.
- **Inclined plane**: trivial — angled static body + dynamic block.
- **Atwood machine / pulleys**: **Planck-only** native `PulleyJoint`. In Rapier, fake it with two ropes through a fixed point (works, but more setup).
- **Hooke's law / spring carts**: **Rapier-native** `JointData.spring(restLength, k, c)`. Planck's `DistanceJoint` with `frequencyHz` / `dampingRatio` is equivalent physics but the textbook `k` mapping is awkward for an LLM-generated sim.
- **Interactive "drag-and-feel-the-force"**: Planck's **MouseJoint** is purpose-built — mouse position drives a soft target with reaction force. Rapier has no direct equivalent; build it from a kinematic body + a spring joint.

### 6) Conservation of momentum

- 1D and 2D collisions are first-class — `restitution = 1` for elastic, `0` for perfectly inelastic, anything in between for partial.
- **Per-collision impulse readout**:
  - Planck: `postSolve(contact, impulse)` → `impulse.normalImpulses[i]` is exactly `Δp` along the contact normal — graph it directly.
  - Rapier: enable `ActiveEvents.CONTACT_FORCE_EVENTS` on colliders; `ContactForceEvent.totalForce()` gives the integrated force; or diff `linvel` across the step.
- **Mass ratio "wall" collisions**: Rapier `setDominanceGroup`, or just very large mass — both engines handle it fine.
- **Conservation accuracy**: bump solver iterations for tighter results. Be honest about the limit — both engines do position correction (Baumgarte / split-impulse) that introduces small non-conservation, mostly invisible in pairwise collisions, more visible in stacks.

### 7) Conservation of energy

- **KE**: `½ m v² + ½ I ω²` — both engines expose mass, linear velocity, angular velocity, and angular inertia (Planck `getInertia`, Rapier `principalAngularInertia` / `effectiveAngularInertia`). Compute and plot.
- **Gravitational PE**: `m · g · h` from `world.gravity` and `body.position.y` (sign per the y-axis convention).
- **Spring PE**: cleanest with **Rapier's `JointData.spring`** — `k`, `restLength`, and the live distance are all available, so `½ k (L − L₀)²` is a one-liner. Planck's distance-joint version requires converting `frequencyHz` back to a stiffness.
- **Pendulum** (PE↔KE swap): revolute joint to a static anchor on either engine. Set damping = 0, restitution irrelevant (no contacts), gravity on → reasonable energy conservation over many swings.
- **Closed-system demos** need: `linearDamping = 0`, `angularDamping = 0`, `restitution = 1`, `friction = 0`, and ideally bumped solver iterations. Both engines support all of these. Energy will still drift slowly from solver position correction; for educational time scales this is negligible.
- **Replay / rewind for energy bookkeeping**: Rapier's built-in `takeSnapshot` / `restoreSnapshot` makes "step back, change one thing, rerun" trivial. The project already has a manual snapshot/restore path that works for both.

---

## Adapter-level gaps (what's not yet exposed)

A lot of this is in the libraries but not yet surfaced through `PhysicsAdapter` ([src/physics/types.ts](src/physics/types.ts)). What's already wired: bodies, gravity + scale, forces/impulses, mass, velocity, position, restitution, linear damping, solver/position iterations.

What would need to be surfaced to unlock more units:

- **Joints** (especially spring + revolute) — biggest gap; gates Hooke's law, pendulums, pulleys, and anything beyond ballistics + collisions.
- **Contact-impulse readout in callbacks** — needed for momentum/energy plots that show `Δp` per collision.
- **Sensors** — clean trigger zones for "ball reaches goal" / lap timing / target hits.
- **Axis-locking helper** that maps to Rapier's `setEnabledTranslations` and Planck's prismatic-joint workaround.
- **Mouse joint** (Planck) or its Rapier equivalent (kinematic body + spring) for direct-manipulation sims.

## Engine-choice cheat sheet

| Need                                    | Lean toward                              |
|-----------------------------------------|------------------------------------------|
| Hooke's-law springs with explicit `k`   | Rapier (`JointData.spring`)              |
| Atwood machine / pulleys                | Planck (`PulleyJoint`)                   |
| Click-to-drag-and-feel-force            | Planck (`MouseJoint`)                    |
| Deterministic replay / rewind           | Rapier (`takeSnapshot` / `restoreSnapshot`) |
| Per-collision `Δp` for momentum plots   | Planck (`postSolve` impulses are direct) |
| Clean per-axis motion locking           | Rapier (`setEnabledTranslations`)        |
| Anything else                           | Either — pick whichever is the project default |

---

## Sources

- [Joints | Rapier](https://rapier.rs/docs/user_guides/javascript/joints/)
- [JointData | Rapier 2D JS API](https://rapier.rs/javascript2d/classes/JointData.html)
- [Rigid bodies | Rapier](https://rapier.rs/docs/user_guides/javascript/rigid_bodies)
- [Joint constraints | Rapier](https://rapier.rs/docs/user_guides/javascript/joint_constraints/)
- [rapier.js CHANGELOG (spring/rope joint additions)](https://github.com/dimforge/rapier.js/blob/master/CHANGELOG.md)
- [Planck.js docs](https://piqnt.github.io/planck.js/docs/)
- [The Rapier physics engine 2025 review and 2026 goals](https://dimforge.com/blog/2026/01/09/the-year-2025-in-dimforge/)
