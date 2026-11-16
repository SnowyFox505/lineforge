import { produce, setAutoFreeze } from 'immer'
import { create } from 'zustand'
import { LINE_COLORS, OPERATORS } from '../model/constants'
import { createCity, newId } from '../model/factory'
import { farDestination, outsideBlockers } from '../model/outside'
import { addCounty as addCountyTo, divideIntoCounties } from '../model/counties'
import { applyMap } from '../model/mapGen'
import type { MapPreset } from '../model/mapGen'
import { LAND, WATER } from '../model/types'
import type { FollowMode } from '../view3d/follow'
import { migrateGeo } from '../model/geo'
import { migrateLandmarks } from '../model/migrate'
import { shrinkDoc } from '../model/shrink'
import { freePoiSpot, poiOnStation, separatePois } from '../model/poi'
import { dropLinks, renameLinked, toggleLink } from '../model/links'
import { addStationOnLines, applyStroke, closeRing, moveStationTo, openRing, rebuildLeg, removeLeg, smoothLeg, smoothLine, splitLegAt } from '../model/lineEdit'
import { endExpress, flipBranch, makeBranch, makeExpress } from '../model/lineKinds'
import { stationName, stationTypeAt } from '../model/stationType'
import { poolFor, takeName } from '../model/names'
import { nameWaterAt, removeWaterName as removeWaterOf, renameWater as renameWaterOf, rerollWaterName as rerollWater, setWaterKind as setWaterKindOf } from '../model/waters'
import { addWaypoint, appendStation, moveWaypoint, popStation, removeStationEverywhere, removeWaypoint, healHooks, resetRoute, withRoutes } from '../model/routing'
import type { CityDoc, GameMode, LegSettings, Line, OperatorId, Poi, PoiKind, Pt, Station, StationType, StreetStyle, WaterKind, Zone, ZoneKind } from '../model/types'

// Terrain is a typed array; keep immer from trying to freeze document internals.
setAutoFreeze(false)

export type Tab = 'map' | 'plan' | 'view3d'
export type Screen = 'menu' | 'editor'
export type Tool = 'pan' | 'water' | 'erase' | 'station' | 'link' | 'line' | 'city' | 'suburb' | 'airport' | 'zoneErase' | 'poi' | 'waterName' | 'forest' | 'mountain' | 'county' | 'legSmooth' | 'legRebuild'
/** Line tool: draw strokes with the finger, or connect existing stations one after the other. */
export type LineMode = 'draw' | 'connect'
export type ToolGroup = 'move' | 'terra' | 'infra' | 'area' | 'poi'

/** Which toolbox a tool belongs to. */
export function groupOf(tool: Tool): ToolGroup {
  switch (tool) {
    case 'water':
    case 'erase':
    case 'waterName':
    case 'forest':
    case 'mountain':
      return 'terra'
    case 'line':
    case 'station':
    case 'link':
    case 'legSmooth':
    case 'legRebuild':
      return 'infra'
    case 'city':
    case 'suburb':
    case 'airport':
    case 'zoneErase':
    case 'county':
      return 'area'
    case 'poi':
      return 'poi'
    default:
      return 'move'
  }
}

const ZONE_DEFAULT_NAME: Record<ZoneKind, string> = { city: 'Bezirk', suburb: 'Vorort', airport: 'Flughafen', forest: 'Wald', mountain: 'Gebirge' }

const HISTORY_LIMIT = 60

interface EditorState {
  doc: CityDoc
  past: CityDoc[]
  future: CityDoc[]
  screen: Screen
  /** Incremented to ask the 2D editor to re-fit the map into the view. */
  fitTick: number
  tab: Tab
  tool: Tool
  brush: number
  stationType: StationType
  activeLineId: string | null
  lineMode: LineMode
  selectedStationId: string | null
  /** Waypoint of a line: k = segment, j = index in that segment's list */
  selectedWaypoint: { lineId: string; k: number; j: number } | null
  /** Zone that the area tools currently paint with, per kind (0 = none yet) */
  activeZone: Record<ZoneKind, number>
  /** the county painted with (0 = none yet) and whether the brush takes counties away */
  activeCounty: number
  countyErase: boolean
  /** the area picker is on: the next tap on the map chooses the area under it to paint with */
  pickZone: boolean
  poiKind: PoiKind
  selectedPoiId: string | null
  /** id of the named body of water that is selected (tool 'waterName') */
  selectedWaterId: string | null
  /** Station currently open in the 3D station editor */
  editStationId: string | null
  /** selected leg of a line in the 3D view (stretch between two stations) */
  selectedLeg: { lineId: string; leg: number } | null
  /** the stretch that was drawn last (the smoothing button works on it) */
  lastLeg: { lineId: string; leg: number } | null
  /** the line a branch (Auslaeufer) is being started on: the next tap on a station of it is where the branch leaves */
  branchPick: string | null
  /** train the 3D camera follows (null: free camera) and how */
  followId: string | null
  followMode: FollowMode

  requestFit: () => void
  setScreen: (screen: Screen) => void
  /** Load a city and switch to the editor. */
  openCity: (doc: CityDoc) => void
  setTab: (tab: Tab) => void
  setTool: (tool: Tool) => void
  setBrush: (brush: number) => void
  setStationType: (type: StationType) => void
  setActiveLine: (id: string | null) => void
  setLineMode: (mode: LineMode) => void
  selectStation: (id: string | null) => void
  selectWaypoint: (w: { lineId: string; k: number; j: number } | null) => void
  setEditStation: (id: string | null) => void
  selectLeg: (leg: { lineId: string; leg: number } | null) => void
  setFollow: (id: string | null) => void
  setFollowMode: (mode: FollowMode) => void
  updateLeg: (lineId: string, leg: number, patch: LegSettings) => void
  /** Smooth one stretch a bit more; false when there is nothing to smooth */
  smoothLegAt: (lineId: string, leg: number) => boolean
  /** The Smooth button: the stretch drawn last, else the whole active line */
  smoothActive: () => boolean
  /** Throw away the waypoints of a stretch and route it again */
  rebuildLegAt: (lineId: string, leg: number) => boolean
  /** Remove a stretch (shortens the line or cuts it in two); false when the line has only this one */
  removeLegAt: (lineId: string, leg: number) => boolean
  /** Tap on a line or a crossing: a station on every line of that kind there. Null when none is close. */
  addStationOnLine: (p: Pt, reach: number) => string | null
  /** Close a line into a ring or open the ring again. Returns a problem as a message, null when it worked. */
  toggleRing: (lineId: string) => string | null
  /** Make a line an express line (skips the unimportant stations) or a normal one again. Returns a problem, null when it worked. */
  toggleExpress: (lineId: string) => string | null
  setBranchPick: (lineId: string | null) => void
  /** The branch leaves its parent at this station: a new line is made and chosen. Returns a problem, null when it worked. */
  makeBranchAt: (stationId: string) => string | null
  /** A bare branch takes the other part of its parent */
  flipBranchOf: (lineId: string) => boolean

  loadDoc: (doc: CityDoc) => void
  /** `nameQueues`: names the player wants for the next districts, suburbs, waters and landscapes */
  newCity: (name: string, mode: GameMode, size?: number, nameQueues?: CityDoc['nameQueues'], map?: { preset: MapPreset; seed: number }) => void
  setNameQueues: (queues: NonNullable<CityDoc['nameQueues']>) => void
  /** Enlarge the map around its centre; terrain and stations keep their place. */
  resizeMap: (newSize: number) => void
  renameCity: (name: string) => void
  setMode: (mode: GameMode) => void

  /** Push the current document on the undo stack (call once per user gesture). */
  checkpoint: () => void
  undo: () => void
  /** throws away the stroke that was just started (back to the last checkpoint) without leaving a redo step */
  cancelStroke: () => void
  redo: () => void

  paint: (cx: number, cy: number, value: number) => void
  /** Start a zone stroke: records history and makes sure the tool's zone exists. Returns the zone id (0 = erasing). */
  beginZonePaint: () => number
  paintZone: (cx: number, cy: number, zoneId: number) => void
  addZone: (kind: ZoneKind) => number
  renameZone: (id: number, name: string) => void
  /** A new name for a district or suburb: the next wish of the player, else a random one */
  rerollZoneName: (id: number) => void
  /** The street layout of a district or suburb: another style and/or another number (= another town of that style) */
  setZoneStreet: (id: number, patch: { style?: StreetStyle; seed?: number }) => void
  /** A new random number for the street layout of the area: the same style, a different town */
  rerollZoneStreet: (id: number) => void
  removeZone: (id: number) => void
  setActiveZone: (kind: ZoneKind, id: number) => void
  setPickZone: (on: boolean) => void
  setActiveCounty: (id: number) => void
  setCountyErase: (on: boolean) => void
  /** Start a county stroke: records history and makes sure there is a county to paint with. Returns its id (0 = erasing). */
  beginCountyPaint: () => number
  paintCounty: (cx: number, cy: number, countyId: number) => void
  /** A new county (with a wished-for or made-up name), chosen as the one to paint with */
  addCounty: () => number
  renameCounty: (id: number, name: string) => void
  recolorCounty: (id: number, color: string) => void
  rerollCountyName: (id: number) => void
  removeCounty: (id: number) => void
  /** Cut the land into this many counties of similar size (replaces the existing ones) */
  divideCounties: (n: number) => void
  /** Chooses the area at this cell: its tool is switched on and it becomes the one painted with. False when no area is there. */
  pickZoneAt: (x: number, y: number) => boolean
  setPoiKind: (kind: PoiKind) => void
  selectPoi: (id: string | null) => void
  /** Tap on the map with the water-name tool: names the water at the cell (if it has no name yet) and selects it; on land it selects nothing. */
  tapWater: (x: number, y: number) => void
  setWaterKind: (id: string, kind: WaterKind) => void
  rerollWaterName: (id: string) => void
  renameWater: (id: string, name: string) => void
  removeWaterName: (id: string) => void
  addPoi: (x: number, y: number) => string | null
  updatePoi: (id: string, patch: Partial<Omit<Poi, 'id'>>) => void
  /** The size the map is being cut down to (the player looks at what would be lost, then confirms or cancels), or null */
  shrinkTo: number | null
  startShrink: (size: number) => void
  cancelShrink: () => void
  confirmShrink: () => void
  /** Move a point of interest to a cell (call checkpoint() once before a drag; this does not touch the undo stack) */
  movePoi: (id: string, x: number, y: number) => void
  removePoi: (id: string) => void
  addStation: (x: number, y: number) => string | null
  updateStation: (id: string, patch: Partial<Omit<Station, 'id'>>) => void
  /** Make a station the main station of the city (there is only one); the same station again, or null, takes the mark away. */
  setMainStation: (id: string | null) => void
  /** Make the station a connection to the outside world (a far-away destination) or take it away again */
  setStationOutside: (id: string, on: boolean) => void
  removeStation: (id: string) => void
  /** link two stations as one interchange (or unlink them again) */
  toggleLink: (a: string, b: string) => void
  addLine: (operator: OperatorId) => string
  updateLine: (id: string, patch: Partial<Omit<Line, 'id'>>) => void
  removeLine: (id: string) => void
  appendToLine: (lineId: string, stationId: string) => void
  popFromLine: (lineId: string) => void
  addWaypoint: (lineId: string, p: Pt) => void
  /** Move a waypoint (call checkpoint() once before a drag; this does not touch the undo stack) */
  moveWaypoint: (lineId: string, k: number, j: number, p: Pt) => void
  removeWaypoint: (lineId: string, k: number, j: number) => void
  resetRoute: (lineId: string) => void
  /** A stroke drawn on the map becomes part of the line. `snap` = reach (cells) for joining stations. Returns false when it fitted nowhere. */
  drawStroke: (lineId: string, pts: Pt[], snap: number) => boolean
  /** Tap on the curve of a line: a new station there. */
  splitLeg: (lineId: string, p: Pt, maxDist: number) => boolean
  /** Move a station (call checkpoint() once before a drag; this does not touch the undo stack) */
  moveStation: (id: string, x: number, y: number) => void
  /** Fix a station at a place of the network plan (call checkpoint() once before a drag; this does not touch the undo stack) */
  pinStation: (id: string, p: Pt) => void
  unpinStation: (id: string) => void
  /** Let the plan place every station by itself again */
  clearPins: () => void
}

export const useEditor = create<EditorState>((set, get) => {
  /** Apply a change to the document and record it in the undo history. */
  const mutate = (fn: (doc: CityDoc) => void, extra?: Partial<EditorState>) => {
    const { doc, past } = get()
    const next = produce(doc, fn)
    set({ doc: next, past: [...past, doc].slice(-HISTORY_LIMIT), future: [], ...extra })
  }

  /** Replace the document with a computed one and record the old one in the undo history. */
  const commit = (next: CityDoc, extra?: Partial<EditorState>) => {
    const { doc, past } = get()
    if (next === doc) return
    set({ doc: next, past: [...past, doc].slice(-HISTORY_LIMIT), future: [], ...extra })
  }

  return {
    doc: createCity('Neue Stadt', 'normal'),
    past: [],
    future: [],
    screen: 'menu',
    fitTick: 0,
    tab: 'map',
    tool: 'pan',
    brush: 2,
    stationType: 'standard',
    activeLineId: null,
    lineMode: 'draw',
    selectedStationId: null,
    selectedWaypoint: null,
    activeZone: { city: 0, suburb: 0, airport: 0, forest: 0, mountain: 0 },
    pickZone: false,
    shrinkTo: null,
    activeCounty: 0,
    countyErase: false,
    poiKind: 'stadium',
    selectedPoiId: null,
    selectedWaterId: null,
    editStationId: null,
    selectedLeg: null,
    lastLeg: null,
    branchPick: null,
    followId: null,
    followMode: 'chase',

    requestFit: () => set((s) => ({ fitTick: s.fitTick + 1 })),
    setScreen: (screen) => set({ screen }),
    openCity: (doc) =>
      set({ doc: separatePois(migrateGeo(migrateLandmarks(healHooks(withRoutes(doc))))), past: [], future: [], activeLineId: null, selectedStationId: null, selectedWaypoint: null, selectedPoiId: null, selectedWaterId: null, activeZone: { city: 0, suburb: 0, airport: 0, forest: 0, mountain: 0 }, activeCounty: 0, countyErase: false, editStationId: null, selectedLeg: null, lastLeg: null, followId: null, screen: 'editor', tab: 'map', tool: 'pan' }),
    setTab: (tab) => set({ tab }),
    setTool: (tool) => set({ tool, selectedLeg: null, branchPick: null }),
    setBrush: (brush) => set({ brush }),
    setStationType: (stationType) => set({ stationType }),
    setActiveLine: (activeLineId) => set({ activeLineId, branchPick: null }),
    setLineMode: (lineMode) => set({ lineMode }),
    selectStation: (selectedStationId) => set({ selectedStationId }),
    selectWaypoint: (selectedWaypoint) => set({ selectedWaypoint }),
    setEditStation: (editStationId) => set({ editStationId }),
    selectLeg: (selectedLeg) => set({ selectedLeg }),
    // the free view is what a drag makes of a fixed one: a new follow starts in the chase view again
    setFollow: (followId) => set((s) => ({ followId, selectedLeg: null, followMode: followId && !s.followId && s.followMode === 'free' ? 'chase' : s.followMode })),
    setFollowMode: (followMode) => set({ followMode }),
    updateLeg: (lineId, leg, patch) =>
      mutate((d) => {
        const l = d.lines[lineId]
        if (!l) return
        l.legs = { ...(l.legs ?? {}), [leg]: { ...(l.legs?.[leg] ?? {}), ...patch } }
      }),

    smoothLegAt: (lineId, leg) => {
      const next = smoothLeg(get().doc, lineId, leg)
      if (!next) return false
      commit(next, { lastLeg: { lineId, leg } })
      return true
    },
    smoothActive: () => {
      const { doc, activeLineId, lastLeg } = get()
      const line = lastLeg ? doc.lines[lastLeg.lineId] : undefined
      if (lastLeg && line && lastLeg.leg < line.stations.length - 1) {
        const next = smoothLeg(doc, lastLeg.lineId, lastLeg.leg)
        if (!next) return false
        commit(next)
        return true
      }
      if (!activeLineId) return false
      const next = smoothLine(doc, activeLineId)
      if (!next) return false
      commit(next)
      return true
    },
    rebuildLegAt: (lineId, leg) => {
      const next = rebuildLeg(get().doc, lineId, leg)
      if (!next) return false
      commit(next)
      return true
    },
    removeLegAt: (lineId, leg) => {
      const out = removeLeg(get().doc, lineId, leg)
      if (!out) return false
      commit(out.doc, { selectedLeg: null, lastLeg: null, activeLineId: get().activeLineId === lineId ? lineId : get().activeLineId })
      return true
    },
    toggleRing: (lineId) => {
      const line = get().doc.lines[lineId]
      if (!line) return null
      const next = line.loop ? openRing(get().doc, lineId) : closeRing(get().doc, lineId)
      if (!next) return 'Ein Ring braucht mindestens drei verschiedene Stationen.'
      commit(next, { selectedWaypoint: null, lastLeg: null })
      return null
    },
    toggleExpress: (lineId) => {
      const line = get().doc.lines[lineId]
      if (!line) return null
      const next = line.express ? endExpress(get().doc, lineId) : makeExpress(get().doc, lineId)
      if (!next) return 'Hier gibt es nichts zu überspringen: Alle Stationen sind Endstationen oder Umsteigebahnhöfe.'
      commit(next)
      return null
    },
    setBranchPick: (branchPick) => set({ branchPick }),
    makeBranchAt: (stationId) => {
      const { doc, branchPick } = get()
      const parent = branchPick ? doc.lines[branchPick] : undefined
      if (!parent) return 'Wähle erst eine Linie.'
      const out = makeBranch(doc, parent.id, stationId)
      if (!out) {
        if (parent.branch) return 'Von einem Ausläufer zweigt kein weiterer ab: Wähle die Hauptlinie.'
        if (parent.loop) return 'Von einem Ring zweigt kein Ausläufer ab.'
        return 'Dort kann kein Ausläufer abzweigen: Tippe eine Station zwischen den Enden an, an der die Linie hält (höchstens zehn Ausläufer je Linie).'
      }
      commit(out.doc, { branchPick: null, activeLineId: out.lineId, lineMode: 'draw', selectedStationId: stationId, selectedWaypoint: null })
      return null
    },
    flipBranchOf: (lineId) => {
      const next = flipBranch(get().doc, lineId)
      if (!next) return false
      commit(next)
      return true
    },
    addStationOnLine: (p, reach) => {
      const out = addStationOnLines(get().doc, p, reach)
      if (!out) return null
      commit(out.doc, { selectedStationId: out.created[0] ?? null })
      return out.created[0] ?? null
    },

    loadDoc: (doc) =>
      set({ doc: separatePois(migrateGeo(migrateLandmarks(healHooks(withRoutes(doc))))), past: [], future: [], activeLineId: null, selectedStationId: null, selectedWaypoint: null }),
    resizeMap: (newSize) => {
      const old = get().doc.size
      if (newSize <= old) return
      const off = Math.floor((newSize - old) / 2)
      mutate((d) => {
        const terrain = new Uint8Array(newSize * newSize)
        for (let y = 0; y < old; y++) {
          terrain.set(d.terrain.subarray(y * old, (y + 1) * old), (y + off) * newSize + off)
        }
        d.terrain = terrain
        d.size = newSize
        for (const s of Object.values(d.stations)) {
          s.x += off
          s.y += off
        }
        if (d.countyGrid) {
          const cg = new Uint8Array(newSize * newSize)
          for (let y = 0; y < old; y++) cg.set(d.countyGrid.subarray(y * old, (y + 1) * old), (y + off) * newSize + off)
          d.countyGrid = cg
        }
        if (d.zoneGrid) {
          const zg = new Uint16Array(newSize * newSize)
          for (let y = 0; y < old; y++) zg.set(d.zoneGrid.subarray(y * old, (y + 1) * old), (y + off) * newSize + off)
          d.zoneGrid = zg
        }
        for (const poi of d.pois ?? []) {
          poi.x += off
          poi.y += off
        }
        for (const line of Object.values(d.lines)) {
          for (const seg of line.segs ?? []) for (const p of seg ?? []) {
            p.x += off
            p.y += off
          }
          for (const list of line.via ?? []) for (const p of list) {
            p.x += off
            p.y += off
          }
        }
      })
    },
    newCity: (name, mode, size, nameQueues, map) =>
      set({
        doc: applyMap({ ...createCity(name, mode, size), ...(nameQueues ? { nameQueues } : {}) }, map?.preset ?? 'leer', map?.seed ?? 1),
        past: [],
        future: [],
        activeLineId: null,
        selectedStationId: null,
        screen: 'editor',
        tab: 'map',
        tool: 'pan',
      }),
    setNameQueues: (queues) => commit({ ...get().doc, nameQueues: queues }),
    renameCity: (name) => set((s) => ({ doc: { ...s.doc, name } })),
    setMode: (mode) => set((s) => ({ doc: { ...s.doc, mode } })),

    checkpoint: () => {
      const { doc, past } = get()
      set({ past: [...past, doc].slice(-HISTORY_LIMIT), future: [] })
    },
    cancelStroke: () => {
      const { past } = get()
      if (!past.length) return
      set({ doc: past[past.length - 1], past: past.slice(0, -1) })
    },
    undo: () => {
      const { past, doc, future } = get()
      if (!past.length) return
      const prev = past[past.length - 1]
      set({
        doc: prev,
        past: past.slice(0, -1),
        future: [doc, ...future],
        selectedStationId: null,
        selectedPoiId: null,
      })
    },
    redo: () => {
      const { future, doc, past } = get()
      if (!future.length) return
      const [next, ...rest] = future
      set({ doc: next, past: [...past, doc], future: rest })
    },

    // Painting mutates a terrain copy without touching history; the caller
    // calls checkpoint() once at the start of a stroke.
    paint: (cx, cy, value) => {
      const { doc, brush } = get()
      const { size } = doc
      const terrain = new Uint8Array(doc.terrain)
      const occupied = new Set(Object.values(doc.stations).map((s) => s.y * size + s.x))
      const r = brush - 1
      let changed = false
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= size || y >= size) continue
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r + r) continue
          const i = y * size + x
          if (value === WATER && occupied.has(i)) continue
          if (terrain[i] !== value) {
            terrain[i] = value
            changed = true
          }
        }
      }
      if (changed) set({ doc: { ...doc, terrain } })
    },

    beginZonePaint: () => {
      const st = get()
      st.checkpoint()
      if (st.tool === 'zoneErase') return 0
      const kind = st.tool as ZoneKind
      let id = get().activeZone[kind]
      if (!id || !get().doc.zones?.some((z) => z.id === id)) id = get().addZone(kind)
      return id
    },
    paintZone: (cx, cy, zoneId) => {
      const { doc, brush } = get()
      const { size } = doc
      const grid = new Uint16Array(doc.zoneGrid ?? new Uint16Array(size * size))
      // forests and mountains grow on land only
      const kind = doc.zones?.find((z) => z.id === zoneId)?.kind
      const landOnly = kind === 'forest' || kind === 'mountain'
      const r = brush - 1
      let changed = false
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= size || y >= size) continue
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r + r) continue
          const i = y * size + x
          if (landOnly && doc.terrain[i] === WATER) continue
          if (grid[i] !== zoneId) {
            grid[i] = zoneId
            changed = true
          }
        }
      }
      if (changed) set({ doc: { ...doc, zoneGrid: grid } })
    },
    setActiveCounty: (activeCounty) => set({ activeCounty }),
    setCountyErase: (countyErase) => set({ countyErase }),
    beginCountyPaint: () => {
      const st = get()
      st.checkpoint()
      if (st.countyErase) return 0
      let id = st.activeCounty
      if (!id || !st.doc.counties?.some((c) => c.id === id)) id = get().addCounty()
      return id
    },
    paintCounty: (cx, cy, countyId) => {
      const { doc, brush } = get()
      const { size } = doc
      const grid = new Uint8Array(doc.countyGrid ?? new Uint8Array(size * size))
      const r = brush - 1
      let changed = false
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= size || y >= size) continue
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r + r) continue
          const i = y * size + x
          if (grid[i] !== countyId) {
            grid[i] = countyId
            changed = true
          }
        }
      }
      if (changed) set({ doc: { ...doc, countyGrid: grid } })
    },
    addCounty: () => {
      const made = addCountyTo(get().doc)
      if (!made) return 0
      set({ doc: made.doc, activeCounty: made.id, countyErase: false })
      return made.id
    },
    renameCounty: (id, name) => {
      const { doc } = get()
      commit({ ...doc, counties: (doc.counties ?? []).map((c) => (c.id === id ? { ...c, name } : c)) })
    },
    recolorCounty: (id, color) => {
      const { doc } = get()
      commit({ ...doc, counties: (doc.counties ?? []).map((c) => (c.id === id ? { ...c, color } : c)) })
    },
    rerollCountyName: (id) => {
      const { doc } = get()
      const county = (doc.counties ?? []).find((c) => c.id === id)
      if (!county) return
      // the old name is free again, so the new one differs from it
      const others = { ...doc, counties: (doc.counties ?? []).map((c) => (c.id === id ? { ...c, name: '' } : c)) }
      const taken = takeName(others, 'county', poolFor('county'), county.name)
      commit({ ...others, counties: others.counties!.map((c) => (c.id === id ? { ...c, name: taken.name } : c)), nameQueues: taken.queues })
    },
    removeCounty: (id) => {
      const { doc, activeCounty } = get()
      const grid = doc.countyGrid ? new Uint8Array(doc.countyGrid) : undefined
      if (grid) for (let i = 0; i < grid.length; i++) if (grid[i] === id) grid[i] = 0
      const counties = (doc.counties ?? []).filter((c) => c.id !== id)
      commit({ ...doc, counties, countyGrid: grid }, { activeCounty: activeCounty === id ? 0 : activeCounty })
    },
    divideCounties: (n) => {
      const { doc } = get()
      const next = divideIntoCounties(doc, n, 1 + Math.floor(Math.random() * 9999))
      commit(next, { activeCounty: next.counties?.[0]?.id ?? 0, countyErase: false })
    },
    addZone: (kind) => {
      const { doc } = get()
      const zones = doc.zones ?? []
      const id = zones.reduce((m, z) => Math.max(m, z.id), 0) + 1
      const n = zones.filter((z) => z.kind === kind).length + 1
      const plain = kind === 'airport' && n === 1 ? 'Flughafen' : `${ZONE_DEFAULT_NAME[kind]} ${n}`
      // districts and suburbs: first a name the player wished for, else a random one that is not in use
      let name = plain
      let nameQueues = doc.nameQueues
      if (kind === 'city' || kind === 'suburb') {
        const nk = kind === 'city' ? 'district' : 'suburb'
        const taken = takeName(doc, nk, poolFor(nk), plain)
        name = taken.name
        nameQueues = taken.queues
      } else if (kind === 'forest' || kind === 'mountain') {
        const taken = takeName(doc, 'landscape', poolFor('landscape', kind), plain)
        name = taken.name
        nameQueues = taken.queues
      }
      const zone: Zone = { id, kind, name }
      set({ doc: { ...doc, zones: [...zones, zone], nameQueues }, activeZone: { ...get().activeZone, [kind]: id } })
      return id
    },
    renameZone: (id, name) => {
      const { doc } = get()
      commit({ ...doc, zones: (doc.zones ?? []).map((z) => (z.id === id ? { ...z, name } : z)) })
    },
    setZoneStreet: (id, patch) => {
      const { doc } = get()
      commit({
        ...doc,
        zones: (doc.zones ?? []).map((z) => {
          if (z.id !== id || (z.kind !== 'city' && z.kind !== 'suburb')) return z
          const style = patch.style ?? z.street?.style ?? 'gewachsen'
          const seed = patch.seed ?? z.street?.seed ?? 0
          const { street: _old, ...rest } = z
          void _old
          // the default look is stored as "nothing", so old towns and new ones stay the same file
          return style === 'gewachsen' && seed === 0 ? rest : { ...rest, street: { style, seed } }
        }),
      })
    },
    rerollZoneStreet: (id) => {
      const zone = (get().doc.zones ?? []).find((z) => z.id === id)
      if (!zone) return
      let seed = 1 + Math.floor(Math.random() * 999)
      if (seed === (zone.street?.seed ?? 0)) seed++
      get().setZoneStreet(id, { seed })
    },
    rerollZoneName: (id) => {
      const { doc } = get()
      const zone = (doc.zones ?? []).find((z) => z.id === id)
      if (!zone || zone.kind === 'airport') return
      const nk = zone.kind === 'city' ? 'district' : zone.kind === 'suburb' ? 'suburb' : 'landscape'
      // the old name is free again, so the new one differs from it
      const others = { ...doc, zones: (doc.zones ?? []).map((z) => (z.id === id ? { ...z, name: '' } : z)) }
      const taken = takeName(others, nk, poolFor(nk, zone.kind === 'forest' || zone.kind === 'mountain' ? zone.kind : undefined), zone.name)
      commit({ ...others, zones: others.zones!.map((z) => (z.id === id ? { ...z, name: taken.name } : z)), nameQueues: taken.queues })
    },
    removeZone: (id) => {
      const { doc, activeZone } = get()
      const grid = doc.zoneGrid ? new Uint16Array(doc.zoneGrid) : undefined
      if (grid) for (let i = 0; i < grid.length; i++) if (grid[i] === id) grid[i] = 0
      commit({ ...doc, zones: (doc.zones ?? []).filter((z) => z.id !== id), zoneGrid: grid }, { activeZone: Object.fromEntries(Object.entries(activeZone).map(([k, v]) => [k, v === id ? 0 : v])) as Record<ZoneKind, number> })
    },
    setActiveZone: (kind, id) => set({ activeZone: { ...get().activeZone, [kind]: id } }),
    setPickZone: (on) => set({ pickZone: on }),
    pickZoneAt: (x, y) => {
      const { doc, activeZone } = get()
      if (x < 0 || y < 0 || x >= doc.size || y >= doc.size) return false
      const id = doc.zoneGrid?.[y * doc.size + x]
      const zone = id ? doc.zones?.find((z) => z.id === id) : undefined
      if (!zone) return false
      set({ activeZone: { ...activeZone, [zone.kind]: zone.id }, tool: zone.kind, pickZone: false })
      return true
    },
    setPoiKind: (poiKind) => set({ poiKind }),
    selectPoi: (selectedPoiId) => set({ selectedPoiId }),
    tapWater: (x, y) => {
      const out = nameWaterAt(get().doc, x, y)
      if (!out) return set({ selectedWaterId: null })
      if (out.doc !== get().doc) commit(out.doc, { selectedWaterId: out.id })
      else set({ selectedWaterId: out.id })
    },
    setWaterKind: (id, kind) => commit(setWaterKindOf(get().doc, id, kind)),
    rerollWaterName: (id) => commit(rerollWater(get().doc, id)),
    renameWater: (id, name) => commit(renameWaterOf(get().doc, id, name)),
    removeWaterName: (id) => commit(removeWaterOf(get().doc, id), { selectedWaterId: null }),
    addPoi: (x, y) => {
      const { doc, poiKind } = get()
      if (x < 0 || y < 0 || x >= doc.size || y >= doc.size) return null
      const pois = doc.pois ?? []
      const n = pois.filter((p) => p.kind === poiKind).length + 1
      const label = poiKind === 'stadium' ? 'Stadion' : poiKind === 'landmark' ? 'Wahrzeichen' : 'Attraktion'
      const id = newId()
      // on a station (or its platforms) the model would stand in the way: take the free spot next to it
      const spot = poiOnStation(doc, { x, y }) ? freePoiSpot(doc, x, y) : null
      commit({ ...doc, pois: [...pois, { id, kind: poiKind, name: `${label} ${n}`, x: spot?.x ?? x, y: spot?.y ?? y }] }, { selectedPoiId: id })
      return id
    },
    startShrink: (size) => {
      if (size >= get().doc.size) return
      // the 3D view shows what would go
      set({ shrinkTo: size, tab: 'view3d', editStationId: null, followId: null })
    },
    cancelShrink: () => set({ shrinkTo: null }),
    confirmShrink: () => {
      const { doc, shrinkTo } = get()
      if (!shrinkTo || shrinkTo >= doc.size) return
      commit(shrinkDoc(doc, shrinkTo), { shrinkTo: null, selectedStationId: null, selectedPoiId: null, activeLineId: null, selectedWaypoint: null, selectedLeg: null, lastLeg: null })
    },
    movePoi: (id, x, y) => {
      const { doc } = get()
      if (x < 0 || y < 0 || x >= doc.size || y >= doc.size || doc.terrain[y * doc.size + x] !== LAND) return
      const p = (doc.pois ?? []).find((q) => q.id === id)
      if (!p || (p.x === x && p.y === y)) return
      set({ doc: { ...doc, pois: (doc.pois ?? []).map((q) => (q.id === id ? { ...q, x, y } : q)) } })
    },
    updatePoi: (id, patch) => {
      const { doc } = get()
      commit({ ...doc, pois: (doc.pois ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)) })
    },
    removePoi: (id) => {
      const { doc } = get()
      commit({ ...doc, pois: (doc.pois ?? []).filter((p) => p.id !== id) }, { selectedPoiId: null })
    },

    addStation: (x, y) => {
      const { doc, stationType } = get()
      if (x < 0 || y < 0 || x >= doc.size || y >= doc.size) return null
      if (doc.terrain[y * doc.size + x] !== LAND) return null
      if (Object.values(doc.stations).some((s) => s.x === x && s.y === y)) return null
      const id = newId()
      const count = Object.keys(doc.stations).length + 1
      // the airport station follows from the place (on the airport grounds), the main station is set on the station later
      const type = stationTypeAt(doc, x, y, stationType)
      const name = stationName(type, count)
      mutate(
        (d) => {
          d.stations[id] = { id, name, x, y, type }
        },
        { selectedStationId: id },
      )
      return id
    },
    setStationOutside: (id, on) => {
      const { doc } = get()
      const st = doc.stations[id]
      if (!st || st.type === 'tramstop') return
      if (on && outsideBlockers(doc, id).length) return
      commit(produce(doc, (d) => {
        if (on) d.stations[id].outside = farDestination(d)
        else delete d.stations[id].outside
      }))
    },
    setMainStation: (id) => {
      const { doc } = get()
      const st = id ? doc.stations[id] : undefined
      if (id && (!st || st.type === 'tramstop')) return
      const next = produce(doc, (d) => {
        // there is one main station: a new one takes over, the old one is a plain stop again
        for (const s of Object.values(d.stations)) if (s.type === 'hauptbahnhof' && s.id !== id) s.type = stationTypeAt(d, s.x, s.y, 'standard')
        if (id && d.stations[id]) d.stations[id].type = d.stations[id].type === 'hauptbahnhof' ? stationTypeAt(d, d.stations[id].x, d.stations[id].y, 'standard') : 'hauptbahnhof'
      })
      commit(next)
    },
    updateStation: (id, patch) => {
      const { doc } = get()
      if (!doc.stations[id]) return
      let next = produce(doc, (d) => {
        Object.assign(d.stations[id], patch)
      })
      // linked stations share their name
      if (patch.name !== undefined) next = renameLinked(next, id, patch.name)
      commit(next)
    },
    removeStation: (id) => commit(dropLinks(removeStationEverywhere(get().doc, id), id), { selectedStationId: null, editStationId: null }),
    toggleLink: (a, b) => commit(toggleLink(get().doc, a, b)),

    addLine: (operator) => {
      const id = newId()
      const { doc } = get()
      const prefix = OPERATORS[operator].prefix
      const used = Object.values(doc.lines).filter((l) => l.operator === operator).length
      // Next palette colour that no line uses yet; wrap around when all are taken.
      const taken = new Set(Object.values(doc.lines).map((l) => l.color))
      const color =
        LINE_COLORS.find((c) => !taken.has(c)) ??
        LINE_COLORS[Object.keys(doc.lines).length % LINE_COLORS.length]
      mutate(
        (d) => {
          d.lines[id] = { id, name: `${prefix}${used + 1}`, operator, color, stations: [] }
        },
        { activeLineId: id },
      )
      return id
    },
    updateLine: (id, patch) =>
      mutate((d) => {
        if (d.lines[id]) Object.assign(d.lines[id], patch)
      }),
    removeLine: (id) =>
      mutate(
        (d) => {
          delete d.lines[id]
        },
        { activeLineId: get().activeLineId === id ? null : get().activeLineId },
      ),
    appendToLine: (lineId, stationId) => commit(appendStation(get().doc, lineId, stationId)),
    popFromLine: (lineId) => commit(popStation(get().doc, lineId), { selectedWaypoint: null }),
    addWaypoint: (lineId, p) => commit(addWaypoint(get().doc, lineId, p)),
    moveWaypoint: (lineId, k, j, p) => set({ doc: moveWaypoint(get().doc, lineId, k, j, p) }),
    removeWaypoint: (lineId, k, j) => commit(removeWaypoint(get().doc, lineId, k, j), { selectedWaypoint: null }),
    resetRoute: (lineId) => commit(resetRoute(get().doc, lineId), { selectedWaypoint: null }),
    drawStroke: (lineId, pts, snap) => {
      const { doc, stationType } = get()
      const out = applyStroke(doc, lineId, pts, { snap, stationType })
      if (!out) return false
      commit(out.doc, { selectedStationId: out.created.length ? out.created[out.created.length - 1] : get().selectedStationId, selectedWaypoint: null, lastLeg: out.leg === undefined ? null : { lineId, leg: out.leg } })
      return true
    },
    splitLeg: (lineId, p, maxDist) => {
      const { doc, stationType } = get()
      const out = splitLegAt(doc, lineId, p, maxDist, stationType)
      if (!out) return false
      commit(out.doc, { selectedStationId: out.created[0] ?? null })
      return true
    },
    pinStation: (id, p) => {
      const { doc } = get()
      const st = doc.stations[id]
      if (!st || (st.planPin?.x === p.x && st.planPin?.y === p.y)) return
      set({ doc: { ...doc, stations: { ...doc.stations, [id]: { ...st, planPin: p } } } })
    },
    unpinStation: (id) => {
      const { doc } = get()
      const st = doc.stations[id]
      if (!st?.planPin) return
      const { planPin: _gone, ...rest } = st
      void _gone
      commit({ ...doc, stations: { ...doc.stations, [id]: rest } })
    },
    clearPins: () => {
      const { doc } = get()
      if (!Object.values(doc.stations).some((s) => s.planPin)) return
      const stations = Object.fromEntries(
        Object.entries(doc.stations).map(([id, st]) => {
          const { planPin: _gone, ...rest } = st
          void _gone
          return [id, rest]
        }),
      )
      commit({ ...doc, stations })
    },
    moveStation: (id, x, y) => {
      const { doc } = get()
      const next = moveStationTo(doc, id, x, y)
      if (next !== doc) set({ doc: next })
    },
  }
})

// Dev-only handle for scripted testing in the browser console
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __lf: typeof useEditor }).__lf = useEditor
