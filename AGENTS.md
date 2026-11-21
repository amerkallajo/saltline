# Saltline: guide for AI agents

Saltline is a browser first-person shooter (three.js). It ships as ONE html file. This repo splits that file into parts so several agents can work in parallel.

## Run and build
- Dev: open `index.html` in a browser (loads files from `src/`). Add `?noaudio=1` to mute, `?time=night` or `?time=dusk` to pick the time of day.
- Build: `node tools/build.mjs` writes `dist/saltline.html` (single file, this is what gets published) and refreshes `index.html`.
- `original/saltline-original.html` is the untouched export. `dist/saltline.html` was verified byte-identical to it right after the split.
- Always run the build and open the result before saying a task is done.

## File map (load order matters)
| File | What it is | Safe to edit? |
|---|---|---|
| `src/css/00-host.css` | host page style | no |
| `src/css/ui.css` | HUD, menus, touch controls | yes |
| `src/js/01-time-of-day.js` | reads dusk/night setting into `window.__SL_NIGHT` | yes |
| `src/js/02-engine.bundle.js` | MINIFIED engine: three.js + core game (player, enemies, level, menus). No sources exist. | only small, surgical patches; prefer an add-on |
| `src/js/03-addon-laser-grenades.js` + `src/css/addon-laser.css` | laser gun (key 3), frag grenades (G), sprint-slide, unlimited ammo | yes |
| `src/js/04-addon-firefight.js` + `src/css/addon-firefight.css` | Firefight mode: soldiers, respawns, kill counter, radar, health drops, soldier-count picker | yes |
| `src/js/05-addon-night.js` + `src/css/addon-menu-tweaks.css` | night mode (moon, floodlights, stars, flashlight), Dusk/Night picker | yes |
| `src/legacy/legacy-v8.b64` | embedded old snapshot used by the engine's fallback | never |
| `src/index.template.html` | page skeleton; `{{file:...}}` marks where each file is inlined | only to add files |

## How to add a feature
Do NOT edit the engine bundle if you can avoid it. Write a new add-on file `src/js/NN-addon-<name>.js` (and optional css), as an IIFE that waits for the game, then uses the runtime API on `window.__G`. Register the files in `src/index.template.html` as `<script>{{file:src/js/NN-addon-name.js}}</script>` after the existing add-ons, then build.
Existing add-ons are the best examples of the pattern; read `03-addon-laser-grenades.js` first.

`window.__G` exposes: `THREE`, `level` (playerStart, enemySpawns, coverPoints, zones), `physics` (boxes, bounds), `hud`, `game` (mode, difficulty), `fx`, `combat`, `enemies`, `audio`. Wait for `window.__ready` before using it.

## Rules for parallel work
1. One agent owns one add-on file. Do not edit another agent's file; ask the owner (the user) instead.
2. Only one agent at a time may touch `02-engine.bundle.js` or `index.template.html`.
3. No duplicated logic, UI elements or files: search before creating anything new.
4. Do exactly one task at a time, finish and verify it, then start the next. Read this whole file before starting.
5. Never hand-edit `dist/` or `index.html`; they are generated.
