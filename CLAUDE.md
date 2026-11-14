# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

LineForge is a PWA (iPhone first, also desktop) for building fictional cities and drawing their transit networks: a 2D map, an automatic network plan (Liniennetzplan) and a 3D view of the same network. The owner speaks German and wants German replies; UI texts are German, code and comments are English.

## Commands

Single package, pnpm.

```bash
pnpm dev                                   # Vite on :5173 (dev-only hooks: window.__lf store, __sim, __world, __net, __cam)
pnpm test                                  # vitest run (all)
pnpm vitest run src/model/geo.test.ts      # one file; add -t "name" for one test
pnpm lint                                  # oxlint (some react-compiler warnings are pre-existing)
pnpm build                                 # tsc -b && vite build; check the exit code before pushing
```

TypeScript is strict with `erasableSyntaxOnly` (no constructor parameter properties, no enums) and `noUnusedLocals`. Pushing to `main` deploys to Vercel; push only when the owner says so. `lineforge-app.vercel.app` is a manual alias that must be re-pointed after each deploy (the old `lineforge-seven.vercel.app` follows automatically).

## Architecture

State lives in one Zustand+Immer store (`src/store/editorStore.ts`: screen, doc, tools, undo/redo via `commit`). The document (`CityDoc`, `src/model/types.ts`) holds terrain, zones, stations and lines; it is persisted locally with Dexie (`src/persistence/db.ts`) and optionally synced to Firestore (`src/cloud/`, gzip codec). `src/ui/Editor.tsx` switches between three views of the same document: `editor2d/MapEditor.tsx` (canvas), `plan/PlanView.tsx` (SVG) and the lazy-loaded `view3d/Scene3D.tsx` (react-three-fiber).

### Line geometry: three layers (the part that needs several files to understand)
1. **Geography** (map, 3D): `line.via[k]` are the *control points* (float lattice coordinates) of the leg between `stations[k]` and `stations[k+1]`; `model/geo.ts` `lineCurve` builds ONE centripetal Catmull-Rom spline per line through stations and control points (cached per Line object). Stations stay on integer cells. Empty `via` = leg not routed yet. Drawing/editing (`model/lineEdit.ts`: strokes, split, move station) and the A* router (`model/routing.ts`, converts routes into control points via `pointsFromRoute`) both write `via`. `CityDoc.geoV` + `migrateGeo` upgrade old cities on open/import. `line.segs` is only a derived octilinear route, now used mainly on plan documents.
2. **Bundling** (`plan/layout.ts` `layoutLines(doc, gap, {source:'geo'|'grid'})`): lines sharing a corridor are detected by proximity (`geo.ts` `mergeCorridors`, eps 1.0), then lane order and side-by-side offsets are computed. Map, thumbnail and 3D all use `source: 'geo'`.
3. **Network plan** (`plan/schematic.ts` `schematize(doc)`): only places stations on an octilinear grid (hill climbing; hand-set positions are `Station.planPin`), then runs the normal router + `layoutLines` on a terrain-less copy of the doc. PlanView renders that copy.

### Simulation
One world simulation (`src/sim/world.ts`, driven by `WorldSim.tsx` mounted in the editor) runs while a city is open, in every view. `view3d/trainSim.ts` `Sim` is the only train model (track reservation, dwell, terminal reversal); `Trains3D` only places cars on the rails, `editor2d/TrainLayer.tsx` reads the same state onto the 2D lines. `netFor(doc)` caches the 3D network per document; the sim keeps trains when the network is rebuilt (`carryOver`).

### 3D
`view3d/network3d.ts` (pure, no three.js import) builds one geometry per line (axis + forward/return tracks as samples) from `layoutLines`; rails, bridges and trains all read the same arrays. Stations (`model/stationDesign.ts`, `stationGroups.ts`) are built at design size and scaled by `model/scale.ts` `RAIL`. The follow camera uses an x-ray shader (`view3d/xray.ts`) so trains stay visible underground and inside station halls.

## Gotchas

- On Windows, write Python patch scripts to files (heredocs with mixed quotes break) and open files with `encoding='utf-8'`.
- Headless browser tests (puppeteer scripts in the session scratchpad) need the LoadingScreen hidden (`div[role=status]{display:none!important}`), otherwise it swallows pointer events.
- Cloud sync serializes the whole document: new `CityDoc`/`Station` fields must survive `cloud/codec.ts` and `importCityJson`.
- Reference images from the owner live in `Bilder von mir für dich/` (gitignored); check there when asked to "match the picture".
