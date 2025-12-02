# Claude Development Branch (bill_dev)

## ⚠️ IMPORTANT: Branch Architecture

**This branch has a significantly different architecture than the `claude` branch**

The `claude` branch contains force implementation work but uses an older architecture. This branch (bill_dev) has been refactored with:
- Zod schema-based type system
- Plugin registry architecture
- Enhanced JSON configuration structure
- AI-optimized schema export

Changes should flow FROM this branch TO `main`, not the other way around.

---

## Development Guidelines

### Branch Purpose
The `bill_dev` branch is the primary development branch with Duncan's architectural improvements. This branch includes:
- Modern plugin-based architecture for extensibility
- Zod schemas for type safety and AI integration
- Registry pattern for controls, objects, and graphs
- Enhanced simulation configuration system

### Workflow
1. Make changes on the `bill_dev` branch
2. Work with user to test and validate changes locally

### Best Practices
- Keep commits focused and well-documented
- Test changes before pushing to remote branch (bill_dev)
- Communicate context when switching between sessions
- Document significant architectural decisions
- Update session files in `./claude_sessions/`

---

## Project Context

**Project**: GIST (Generative Interactive Simulations for Teaching)
**Tech Stack**: React 19 + TypeScript + Vite + Matter.js + Supabase + Zod
**Purpose**: Educational physics simulations with AI-powered generation

### Key Architecture Components

#### 1. Zod Schema System (`src/schemas/simulation.ts`)
- Single source of truth for simulation configuration
- Runtime validation of JSON configs
- Automatic TypeScript type generation
- AI-optimized descriptions for GPT prompting
- JSON schema export for Modal API

#### 2. Plugin Registry Pattern
**Objects** (`src/components/simulation_components/objects/`)
- Registry maps body type → factory function
- Supported bodies: Rectangle, Circle, Polygon, Vertex (custom shapes)
- Easy to extend with new body types

**Controls** (`src/components/simulation_components/controls/`)
- Registry maps control type → React component
- Supported controls: Slider, Toggle
- Add new control types by creating variant + registering

**Graphs** (`src/components/simulation_components/graphs/`)
- Registry maps graph type → React component
- Supported graphs: LineGraph
- Extensible for future graph types (scatter, bar, etc.)

#### 3. JSON Configuration Structure
Simulations defined by JSON files in `src/simulations/`:
```json
{
  "title": "Simulation Name",
  "description": "Educational description",
  "environment": {
    "walls": ["left", "right", "bottom"],
    "gravity": 0.001
  },
  "objects": [
    {
      "id": "ball",
      "x": 400,
      "y": 500,
      "body": { "type": "circle", "radius": 30 },
      "velocity": { "x": 0, "y": -20 }
    }
  ],
  "controls": [...],
  "outputs": [...],
  "graphs": [...]
}
```

### Key Areas of Development on Bill_Dev branch
- Physics simulation features (Matter.js integration)
- Wait for Duncan's updates to test AI-powered simulation generation (OpenAI integration via Modal)
- Interactive controls and real-time visualization
- UI/UX exploration
- Fixed time step physics engine
- Plugin architecture for extensibility

---

## Session Documentation

### Session Files
Detailed session notes are stored in `./claude_sessions/`:
- `Dec_01_2025.md` - Fixed duplicate key error, implemented fixed time step

### Current Session Notes

_Use this section to track ongoing work, blockers, or next steps between sessions_

### Active Tasks
- Add debugging messages to track simulation state during runtime

### Recent Work (Dec 01, 2025)
- Reviewed Duncan's architectural changes (Zod schema, registry pattern)
- Fixed duplicate key error in controls rendering
- Implemented fixed time step (60 FPS) with accumulator pattern
- Added delta capping to prevent initial frame glitching

### Notes
- Branch: `bill_dev` (primary development branch)
- Architecture significantly different from `claude` branch
- Force implementation from `claude` branch NOT present here (needs porting)

---

## Quick Reference

### Run Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Run Linter
```bash
npm run lint
```

### Generate Schema JSON (for AI)
```bash
npm run generate-schema
```

### Environment Variables
Stored in `.env.local` (not tracked in git)

---

## Architecture Patterns

### Adding a New Body Type
1. Create file in `src/components/simulation_components/objects/bodies/MyBody.ts`
2. Import registry: `import { registerBody } from '../registry'`
3. Create factory function: `function createMyBody(x, y, config) { ... }`
4. Register: `registerBody('mytype', createMyBody)`
5. Add to Zod schema in `src/schemas/simulation.ts`
6. Import in `src/components/simulation_components/objects/bodies/index.ts`

### Adding a New Control Type
1. Create file in `src/components/simulation_components/controls/variants/MyControl.tsx`
2. Import registry: `import { registerControl } from '../registry'`
3. Create React component: `function MyControl({ control, value, onChange }) { ... }`
4. Register: `registerControl('mytype', MyControl)`
5. Add to Zod schema in `src/schemas/simulation.ts`
6. Export from `src/components/simulation_components/controls/variants/index.ts`

### Adding a New Graph Type
1. Create file in `src/components/simulation_components/graphs/variants/MyGraph.tsx`
2. Import registry: `import { registerGraph } from '../registry'`
3. Create React component: `function MyGraph({ graph, data }) { ... }`
4. Register: `registerGraph('mytype', MyGraph)`
5. Add to Zod schema in `src/schemas/simulation.ts`
6. Export from `src/components/simulation_components/graphs/variants/index.ts`

---

## Physics Engine Details

### Fixed Time Step (60 FPS)
- `FIXED_TIME_STEP = 16.67ms` (BaseSimulation.tsx:84)
- Accumulator pattern handles variable frame rates
- Delta capping prevents large time jumps (max 50ms)
- Deterministic physics across all machines
- Needs console logging to better understand timing issues such as skipped animation frames at the beginning of a simulation.  See next section ('Updatae Timing')

### Update Timing
- `onUpdate` called **BEFORE** physics step
- Ensures forces/controls applied in same frame
- Prevents race conditions

### Matter.js Properties
All standard Matter.js body properties supported:
- Position, velocity, acceleration
- Restitution (bounciness)
- Friction, frictionStatic, frictionAir
- Inertia (rotational resistance)
- isStatic (immovable objects)

---

## Coordinate System

- **Origin (0,0)**: Top-left corner
- **X-axis**: 0-800 pixels, increases rightward
- **Y-axis**: 0-600 pixels, increases **DOWNWARD**
- **Velocity**: Negative Y = upward motion

---

## Dependencies

### Core
- React 19.1.1
- TypeScript 5.x
- Vite 7.1.7

### Physics & Visualization
- Matter.js 0.20.0
- Recharts 2.15.0
- poly-decomp 0.3.0 (for custom vertex bodies)

### Validation & Types
- Zod 3.24.1

### Backend
- Supabase client 2.49.1

### UI
- TailwindCSS 4.x
- Lucide React (icons)

---

## AI Integration

### Schema Export
Run `npm run generate-schema` to generate `modal_functions/simulation_schema.json`

This schema is used by:
- Modal API functions for AI-powered simulation generation
- OpenAI function calling for structured outputs
- AI prompting with embedded examples

### Best Practices for AI Generation
- Keep simulations simple (1-3 objects)
- Focus on 1-2 physics concepts
- Always include at least one control
- Match graph colors to object colors
- Use clear, educational descriptions
