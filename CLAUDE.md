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

TypeScript is strict with `erasableSyntaxOnly` (no constructor parameter properties, no enums) and `noUnusedLocals`. Pushing to `main` deploys to Vercel. Since 2026-11-15 the owner wants finished work committed and pushed without asking, but only when tests, lint and build are green. The public address `lineforge-app.vercel.app` always works after a deploy; the owner needs no reminder about aliases.

## Architecture

State lives in one Zustand+Immer store (`src/store/editorStore.ts`: screen, doc, tools, undo/redo via `commit`). The document (`CityDoc`, `src/model/types.ts`) holds terrain, zones, stations and lines; it is persisted locally with Dexie (`src/persistence/db.ts`) and optionally synced to Firestore (`src/cloud/`, gzip codec). `src/ui/Editor.tsx` switches between three views of the same document: `editor2d/MapEditor.tsx` (canvas), `plan/PlanView.tsx` (SVG) and the lazy-loaded `view3d/Scene3D.tsx` (react-three-fiber).

### Line geometry: three layers (the part that needs several files to understand)
1. **Geography** (map, 3D): `line.via[k]` are the *control points* (float lattice coordinates) of the leg between `stations[k]` and `stations[k+1]`; `model/geo.ts` `lineCurve` builds ONE centripetal Catmull-Rom spline per line through stations and control points (cached per Line object). Stations stay on integer cells. Empty `via` = leg not routed yet. Drawing/editing (`model/lineEdit.ts`: strokes, split, move station) and the A* router (`model/routing.ts`, converts routes into control points via `pointsFromRoute`) both write `via`. Tram legs are the exception: `model/streetNet.ts` builds a graph of the generated city streets (`editor2d/streets.ts` `streetSegments`: main and side streets, neighbourhood borders, avenues, ring) and routes trams over it (`streetViaPoints`), falling back to the grid router outside the towns. `CityDoc.geoV` + `migrateGeo` upgrade old cities on open/import. `line.segs` is only a derived octilinear route, now used mainly on plan documents.
2. **Bundling** (`plan/layout.ts` `layoutLines(doc, gap, {source:'geo'|'grid', smooth, share})`; map and 3D pass `smooth` so lane changes are gradual, 3D passes `share` so lines of one kind on the same stretch use the same rails; legs between the same two stations of one kind reuse the same `via`, see `sharedVia` in `model/routing.ts`): lines sharing a corridor are detected by proximity (`geo.ts` `mergeCorridors`, eps 1.0), then lane order and side-by-side offsets are computed. Map, thumbnail and 3D all use `source: 'geo'`.
3. **Network plan** (`plan/schematic.ts` `schematize(doc)`): only places stations on an octilinear grid (hill climbing; hand-set positions are `Station.planPin`), then runs the normal router + `layoutLines` on a terrain-less copy of the doc. PlanView renders that copy.

### Station types
When building, the player picks only a rail stop (`standard`) or a tram stop (`tramstop`, `BUILD_TYPES` in `model/stationType.ts`). Everything else follows: a stop served by two lines is shown as an interchange (`effectiveTypes` in `plan/glyphs.ts`, only the symbol changes), a rail stop on the airport grounds is the airport station (`stationTypeAt`, also applied when a station is moved), and the one main station of the city is set with a button on the station (map card in `ui/ToolDock.tsx` and header of the 3D station editor; `setMainStation` in the store keeps it unique). `interchange` and `airport` stay in `StationType` for old cities.

### Stops, links and points of interest
- `Line.passes` (station ids) = the line runs through without stopping (`model/stops.ts` `stopsAt`/`stopIds`; always use these instead of `line.stations.includes`). In 3D such a line gets a bypass track beside the platforms (`layoutStation(..., bypass)`, `bypassFor`, `StationGroup.passIds`, `LineNet.through`; `LineNet.stops` holds only real stops, so the sim never halts there). A passing metro line stays underground.
- Side-platform stations with 3+ tracks get island platforms between the inner tracks (`trackPositions`).
- `CityDoc.links` joins two stations (e.g. a tram stop `type: 'tramstop'` next to a station) without merging them (`model/links.ts`: shared name, one label, a dashed connector in 2D/plan only: in 3D they are simply the same station). There is no landmark station type any more: `migrateLandmarks` turns old ones into a stop plus a landmark POI. `Poi.radius` is the catchment and `Poi.stations` the stations that serve it (default: the nearest one; `model/poi.ts`), drawn on the map; `Poi.model` picks the 3D model (`view3d/Pois3D.tsx`). The tool dock (`FadingDock` in `ui/Editor.tsx`) fades with the mouse distance, hides while drawing and stays visible 5 s after it was used or something was selected.

### Airports
`model/airport.ts` `airportLayout` grows with the painted area (up to 4 runways of at most 34 cells, more piers, hangars, car park and garage for bigger areas); 2D (`terrainRender.ts`) and 3D (`view3d/Airport3D.tsx`) draw the same layout.

### Simulation
Game time (`sim/clock.ts`, `gameTime.minutes`): one real minute is one game hour, it follows the pause and speed of the world, a new city starts at 08:00 and `CityDoc.clock` saves it (saveCity / exportCityJson stamp `gameTime`); the clock tower (`view3d/Pois3D.tsx`) shows it. `sunAt(minutes)` (sunrise 06:00, sunset 18:00, smooth twilight) drives day and night in 3D: `view3d/DayNight.tsx` sets sky gradient (div behind the transparent canvas), light colours/intensities, sun, moon and stars every frame (dev hook `window.__gt` = the clock it reads). Night lights (`view3d/night.ts`, `NightGlow.tsx`): `night.value` is a shared uniform; `windowsCompile` lights windows on the instanced building boxes (`Boxes windows`), `glowEmissives` boosts every emissive material (lamps, headlights, signs) and `NightGlow` lays a warm additive pool under each station above ground. No real point lights (they would make every material costlier). Lit windows are anti-aliased in the shader (smoothed by `fwidth`, fading to a flat glow far away; per-building integer seed) so nothing shimmers while the camera moves; trains light their glass (`carGlassCompile`, vertex colour = glass) and throw a warm `trainSpill` plane on the ground. The top bar of the editor shows the game time as a digital clock (`GameClock` in `ui/Editor.tsx`). One world simulation (`src/sim/world.ts`, driven by `WorldSim.tsx` mounted in the editor) runs while a city is open, in every view. `view3d/trainSim.ts` `Sim` is the only train model (track reservation, dwell, terminal reversal); `Trains3D` only places cars on the rails, `editor2d/TrainLayer.tsx` reads the same state onto the 2D lines. `netFor(doc)` caches the 3D network per document; the sim keeps trains when the network is rebuilt (`carryOver`).

### 3D
`view3d/network3d.ts` (pure, no three.js import) builds one geometry per line (axis + forward/return tracks as samples) from `layoutLines`; rails, bridges and trains all read the same arrays. Stations (`model/stationDesign.ts`, `stationGroups.ts`) are built at design size and scaled by `model/scale.ts` `railOf(operator)` (`RAIL` for trains, the much smaller `TRAM` for trams, so a tram fits into a street). A metro line (`ubahn`) never surfaces: at a station that is not underground (and has no hand-set `Station.underground`) it gets its own platform group at `UG_LIFT` below the surface groups. A station served only by trams is a plain halt (`StationGroup.halt`: shelter and sign, no hall or building). Curved stations bend through `Bend.tsx` (a vertex shader); materials must chain `onBeforeCompile` instead of replacing it. Following a train: every car has an invisible tap box (`HIT_*` in `Trains3D.tsx`, at least 1.5 world units wide) and the train under the pointer is remembered on press (`trainPick` in `follow.ts`), because the train has moved on by the time the finger lifts; `LegPicker` asks `takeTrainPick()` before it opens a stretch of track. Besides chase, side and cockpit there is a free view (`FollowMode` `free`): the orbit controls stay on, the target follows the train; dragging in a fixed view switches to it (`FollowCam`), and a new follow starts in chase again. A train that changes ends at a terminal leaves on the other track: it takes a short crossover with its own rails right behind the platform (`addCrossovers`, `LineNet.crossovers`, `Stop.cross`; `carPoses` blends along the same shape), never a drift across the bed between the tracks. The follow camera uses an x-ray shader (`view3d/xray.ts`) so trains stay visible underground and inside station halls.

## Versions and patch notes
The game has a version (`package.json` `version`, shown as "Beta 0.8.0" in the menu; `APP_STAGE` in `src/version.ts` drops "Beta" when the base game with normal mode is solid). With every update that players can notice: raise the version (new features: minor, fixes only: patch) and add a release at the top of `RELEASES` in `src/changelog.ts` in plain words (what is new, how it works, what it brings; `changelog.test.ts` fails when the top entry and `package.json` differ). `vite.config.ts` gives every build an id (`__APP_BUILD__`) and writes `version.json`; the menu (`ui/updates.ts` `useUpdateAvailable`) compares it with the server and puts a dot on "Aktualisieren" when they differ; after an update the menu opens `ui/WhatsNew.tsx` for all releases newer than `lineforge.seenVersion` in localStorage (the first start shows the welcome first). Test the dot with `pnpm build`, the `lineforge-preview` launch config and a changed `dist/version.json`.

## Local to-do list and link preview

- `TODO.md` (project root, gitignored, never pushed) is the owner's running to-do list in German: add wishes, tick finished ones `[x]` and move them under "Erledigt"; never delete entries.
- The link preview (WhatsApp, iMessage ...) comes from the Open Graph tags in `index.html` and `public/og-preview.png` (1200x630, name, logo and tagline in the middle 630 px because some apps show only a square piece of the middle; the file name changes when the picture changes, because WhatsApp caches previews by address). The tags need the absolute address `https://lineforge-app.vercel.app`; change title, text and picture there.

## Gotchas

- On Windows, write Python patch scripts to files (heredocs with mixed quotes break) and open files with `encoding='utf-8'`.
- Headless browser tests (puppeteer scripts in the session scratchpad) need the LoadingScreen hidden (`div[role=status]{display:none!important}`), otherwise it swallows pointer events.
- Cloud sync serializes the whole document: new `CityDoc`/`Station` fields must survive `cloud/codec.ts` and `importCityJson`.
- Reference images from the owner live in `Bilder von mir für dich/` (gitignored); check there when asked to "match the picture".
