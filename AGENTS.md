# AGENTS.md — open-pacman

Repo-specific context for OpenCode sessions.

## What this is

A browser Pac-Man clone built with **vanilla JS, HTML canvas, and CSS**. No build system, package manager, test runner, or CI.

- Entrypoint: `src/index.html`
- UI strings and code comments are in **Spanish**.

## How to run

Open `src/index.html` directly in a browser, or serve `src/` statically:

```bash
cd src && python3 -m http.server 8080
# open http://localhost:8080
```

There is no build step.

## Code layout

| File | Responsibility |
|------|----------------|
| `src/js/maze.js` | Level geometry: `MAZE`, `TUNNEL_ROW`, `PACMAN_START`, `GHOST_STARTS`. Parsed from `MAZE_STR`. Exposes globals on `window`. |
| `src/js/game.js` | Core rules: `createGame()`, `update()`. Uses globals from `maze.js`; exposes `createGame`, `update`, `DIRS`. |
| `src/js/render.js` | Canvas drawing. Exposes `draw`. |
| `src/js/main.js` | Animation loop, keyboard input, overlay flow. Depends on the globals above. |
| `src/css/style.css` | Arcade styling and overlay states. |

Script load order in `index.html` matters:

```html
maze.js → game.js → render.js → main.js
```

## Architecture notes

- Coordinate system is **tile grid**, origin top-left. Positions are float cell coordinates; actors only change direction when aligned to a cell (`aligned()`).
- The source maze (`MAZE`) is read-only. Each game copies it into `game.grid` so eaten dots mutate only the copy.
- Tunnel wrapping is hard-coded for row `TUNNEL_ROW` (14).
- Ghost collision is checked every frame; on collision a life is lost and positions reset.
- Tile values: `0` empty, `1` wall, `2` dot, `3` ghost-pen door.

## Spec-driven workflow

This repo uses the spec-driven development skills installed under `.agents/skills/`:

- `/spec <feature>` (skill `spec`) designs a spec and saves it to `specs/NN-slug.md`. It also creates `specs/.spec-config.yml` if missing.
- `/spec-impl <NN-slug>` (skill `spec-impl`) only proceeds if the spec's status means **Approved** (`Approved` / `Aprobado` / equivalent). It creates and switches to a branch named `spec-NN-slug` (unless `AutoCreateBranch: false` in `specs/.spec-config.yml`) and implements the spec step by step.
- Reference: `.agents/skills/spec/SKILL.md` and `.agents/skills/spec-impl/SKILL.md`.

**Gotcha:** the `/spec-impl` skill assumes a git repository for branch creation. This workspace is not currently a git repo, so `/spec-impl` will fail unless git has been initialized.

## Conventions

- Match the language of existing files when adding specs or comments (Spanish is the current default).
- Keep modules loaded as plain `<script>` tags; do not introduce modules/bundlers without an explicit spec.
- Verify changes manually in the browser; there is no automated test suite.
