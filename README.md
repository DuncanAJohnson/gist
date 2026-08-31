# Generative (Physics) Simulations

Enter in a prompt and an interactive simulation with controls, objects, outputs, and graphs will appear! Currently, only very basic simulations are possible, and our goal is to expand the possibilities.

We run physics through a `PhysicsAdapter` abstraction (`src/physics/`) with two engines behind it: [Rapier](https://rapier.rs/) (WASM, SI-native, deterministic — default) and [Planck.js](https://piqnt.com/planck.js/) (pure-JS port of Box2D). [Matter.js](https://brm.io/matter-js/) was used as an early exploration and removed in May 2026.

We use [Recharts](https://recharts.github.io/) for graphing output.

## External API calls with Modal

We use [Modal](https://modal.com/) for server-less functions (mostly just calling to AI). All Modal functions are specified [here](https://github.com/DuncanAJohnson/gist/tree/main/modal_functions).

## Deployments

Two independent deployments, split by branch. **They do not share a backend** —
each front end points at the Modal account named below, so a sim generated on one
is not exercising the other's endpoints or budget.

| branch | front end | generate / remix backend |
|---|---|---|
| `main` | Duncan's Vercel project (Git-connected — pushes auto-build) | Duncan's Modal |
| `bill_dev` | <https://gist-bill-dev.vercel.app> (CLI snapshot deploys) | Bill's Modal |

`update-changes` is on Duncan's Modal account for both, since the `gist-supabase`
secret lives there.

The `bill_dev` deployment exists so others can try in-progress work without
building it locally. It is published by running `vercel --prod` from Bill's
working tree rather than from a git push, which means:

- **It is a snapshot of a working tree, not of a commit.** It tracks
  `origin/bill_dev` by commit hygiene, not by any mechanism, so it can be
  slightly ahead of or behind what is on GitHub. Deployments are stamped with the
  commit they were built from.
- **Only Bill can publish it.** Deliberate, so there is no deploy branch to keep
  in sync and nothing auto-builds off shared branches. If someone else ever needs
  to publish, that is the point to switch it to a Git connection.
- The production URL is public and has no password, so it can be forwarded
  freely.

Endpoint URLs are read from env (`VITE_SIMULATION_AI_URL`,
`VITE_SIMULATION_REMIX_URL`, `VITE_UPDATE_CHANGES_MADE_MODAL_URL`), never
hardcoded. Note they are inlined at **build** time — changing one requires a
rebuild, and Vite will not fail the build if a value is missing, so a green build
does not prove the env is correct.

## AI Priming

Our LLM priming can be found [here](https://github.com/DuncanAJohnson/gist/blob/main/modal_functions/gist_instructions.py). If you would like, you can take this prompt and put it into your LLM of choice, generate json, and paste the json into the simulation.

## [Simulation Components](https://github.com/DuncanAJohnson/gist/tree/main/src/components/simulation_components)

An upcoming task is adding new Simulation Components. A few ideas we have:
- Composite bodies made up of more than one object
- Friction/air resistance (likely will just edit [Object.tsx](https://github.com/DuncanAJohnson/gist/blob/main/src/components/simulation_components/Object.tsx))
- A grid for showing units

