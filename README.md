# Generative (Physics) Simulations

Enter in a prompt and an interactive simulation with controls, objects, outputs, and graphs will appear! Currently, only very basic simulations are possible, and our goal is to expand the possibilities.

We run physics through a `PhysicsAdapter` abstraction (`src/physics/`) with two engines behind it: [Rapier](https://rapier.rs/) (WASM, SI-native, deterministic — default) and [Planck.js](https://piqnt.com/planck.js/) (pure-JS port of Box2D). [Matter.js](https://brm.io/matter-js/) was used as an early exploration and removed in May 2026.

We use [Recharts](https://recharts.github.io/) for graphing output.

## External API calls with Modal

We use [Modal](https://modal.com/) for server-less functions (mostly just calling to AI). All Modal functions are specified [here](https://github.com/DuncanAJohnson/gist/tree/main/modal_functions).

## AI Priming

Our LLM priming can be found [here](https://github.com/DuncanAJohnson/gist/blob/main/modal_functions/gist_instructions.py). If you would like, you can take this prompt and put it into your LLM of choice, generate json, and paste the json into the simulation.

## [Simulation Components](https://github.com/DuncanAJohnson/gist/tree/main/src/components/simulation_components)

An upcoming task is adding new Simulation Components. A few ideas we have:
- Composite bodies made up of more than one object
- Friction/air resistance (likely will just edit [Object.tsx](https://github.com/DuncanAJohnson/gist/blob/main/src/components/simulation_components/Object.tsx))
- A grid for showing units

