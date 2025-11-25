# Claude Development Branch

## ⚠️ IMPORTANT: Branch Management

**DO NOT CREATE A PULL REQUEST FROM MAIN INTO THIS BRANCH**

This is a collaborative development branch for working with Claude Code. Changes should flow FROM this branch TO other branches (like `bill_dev` or `main`), not the other way around.

---

## Development Guidelines

### Branch Purpose
The `claude` branch is dedicated to collaborative development between the developer and Claude Code. This allows for:
- Experimental features without affecting main development
- Iterative AI-assisted coding
- Easy rollback if needed
- Clean separation of AI-assisted work

### Workflow
1. Make changes on the `claude` branch
2. Test and validate changes locally
3. When ready, create a PR from `claude` → `bill_dev` or `claude` → `main`
4. Review and merge into the target branch

### Best Practices
- Keep commits focused and well-documented
- Test changes before merging
- Communicate context when switching between sessions
- Document significant architectural decisions

---

## Project Context

**Project**: GIST (Generative Interactive Simulations for Teaching)
**Tech Stack**: React 19 + TypeScript + Vite + Matter.js + Supabase
**Purpose**: Educational physics simulations with AI-powered generation

### Key Areas of Development
- Physics simulation features (Matter.js integration)
- AI-powered simulation generation (OpenAI integration)
- Interactive controls and real-time visualization
- Database persistence and version tracking
- UI/UX improvements

---

## Session Documentation

### Session Files
Detailed session notes are stored in `./claude_sessions/`:
- `Nov_24_2025.md` - Force implementation and physics timing fixes
- `Nov_25_2025.md` - Added friction, frictionStatic, and inertia parameters

### Planning Files
Implementation plans are stored in `~/.claude/plans/`:
- Plans are created during planning mode
- Each plan includes objective, approach, and implementation details
- Plans are automatically archived after completion

---

## Current Session Notes

_Use this section to track ongoing work, blockers, or next steps between sessions_

### Active Tasks
- Testing momentum.json simulation for conservation of momentum

### Recent Work (Nov 25, 2025)
- Added friction, frictionStatic, and inertia parameters to Object component
- Created momentum.json for 1D conservation of momentum testing
- Fixed JSON parse issue (used 1e10 instead of Infinity for inertia)
- All changes maintain backward compatibility

### Notes
- Branch created: 2025-11-24
- Based on: `bill_dev` branch

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

### Environment Variables
Stored in `.env.local` (not tracked in git)
