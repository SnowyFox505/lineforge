import { produce, setAutoFreeze } from 'immer'
import { create } from 'zustand'
import { LINE_COLORS, OPERATORS } from '../model/constants'
import { createCity, newId } from '../model/factory'
import { LAND, WATER } from '../model/types'
import type { FollowMode } from '../view3d/follow'
import { migrateGeo } from '../model/geo'
import { applyStroke, moveStationTo, splitLegAt } from '../model/lineEdit'
import { addWaypoint, appendStation, moveWaypoint, popStation, removeStationEverywhere, removeWaypoint, healHooks, resetRoute, withRoutes } from '../model/routing'
import type { CityDoc, GameMode, LegSettings, Line, OperatorId, Poi, PoiKind, Pt, Station, StationType, Zone, ZoneKind } from '../model/types'

// Terrain is a typed array; keep immer from trying to freeze document internals.
setAutoFreeze(false)

export type Tab = 'map' | 'plan' | 'view3d'
export type Screen = 'menu' | 'editor'
export type Tool = 'pan' | 'water' | 'erase' | 'station' | 'line' | 'city' | 'suburb' | 'airport' | 'zoneErase' | 'poi'
/** Line tool: draw strokes with the finger, or connect existing stations one after the other. */
export type LineMode = 'draw' | 'connect'
export type ToolGroup = 'move' | 'terra' | 'infra' | 'area' | 'poi'

/** Which toolbox a tool belongs to. */
export function groupOf(tool: Tool): ToolGroup {
  switch (tool) {
    case 'water':
    case 'erase':
      return 'terra'
    case 'line':
    case 'station':
      return 'infra'
    case 'city':
    case 'suburb':
    case 'airport':
    case 'zoneErase':
      return 'area'
    case 'poi':
      return 'poi'
    default:
      return 'move'
  }
}

const ZONE_DEFAULT_NAME: Record<ZoneKind, string> = { city: 'Bezirk', suburb: 'Vorort', airport: 'Flughafen' }

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
  poiKind: PoiKind
  selectedPoiId: string | null
  /** Station currently open in the 3D station editor */
  editStationId: string | null
  /** selected leg of a line in the 3D view (stretch between two stations) */
  selectedLeg: { lineId: string; leg: number } | null
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

  loadDoc: (doc: CityDoc) => void
  newCity: (name: string, mode: GameMode, size?: number) => void
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
  removeZone: (id: number) => void
  setActiveZone: (kind: ZoneKind, id: number) => void
  setPoiKind: (kind: PoiKind) => void
  selectPoi: (id: string | null) => void
  addPoi: (x: number, y: number) => string | null
  updatePoi: (id: string, patch: Partial<Omit<Poi, 'id'>>) => void
  removePoi: (id: string) => void
  addStation: (x: number, y: number) => string | null
  updateStation: (id: string, patch: Partial<Omit<Station, 'id'>>) => void
  removeStation: (id: string) => void
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
    activeZone: { city: 0, suburb: 0, airport: 0 },
    poiKind: 'stadium',
    selectedPoiId: null,
    editStationId: null,
    selectedLeg: null,
    followId: null,
    followMode: 'chase',

    requestFit: () => set((s) => ({ fitTick: s.fitTick + 1 })),
    setScreen: (screen) => set({ screen }),
    openCity: (doc) =>
      set({ doc: migrateGeo(healHooks(withRoutes(doc))), past: [], future: [], activeLineId: null, selectedStationId: null, selectedWaypoint: null, selectedPoiId: null, activeZone: { city: 0, suburb: 0, airport: 0 }, editStationId: null, selectedLeg: null, followId: null, screen: 'editor', tab: 'map', tool: 'pan' }),
    setTab: (tab) => set({ tab }),
    setTool: (tool) => set({ tool }),
    setBrush: (brush) => set({ brush }),
    setStationType: (stationType) => set({ stationType }),
    setActiveLine: (activeLineId) => set({ activeLineId }),
    setLineMode: (lineMode) => set({ lineMode }),
    selectStation: (selectedStationId) => set({ selectedStationId }),
    selectWaypoint: (selectedWaypoint) => set({ selectedWaypoint }),
    setEditStation: (editStationId) => set({ editStationId }),
    selectLeg: (selectedLeg) => set({ selectedLeg }),
    setFollow: (followId) => set({ followId, selectedLeg: null }),
    setFollowMode: (followMode) => set({ followMode }),
    updateLeg: (lineId, leg, patch) =>
      mutate((d) => {
        const l = d.lines[lineId]
        if (!l) return
        l.legs = { ...(l.legs ?? {}), [leg]: { ...(l.legs?.[leg] ?? {}), ...patch } }
      }),

    loadDoc: (doc) =>
      set({ doc: migrateGeo(healHooks(withRoutes(doc))), past: [], future: [], activeLineId: null, selectedStationId: null, selectedWaypoint: null }),
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
    newCity: (name, mode, size) =>
      set({
        doc: createCity(name, mode, size),
        past: [],
        future: [],
        activeLineId: null,
        selectedStationId: null,
        screen: 'editor',
        tab: 'map',
        tool: 'pan',
      }),
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
      const r = brush - 1
      let changed = false
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= size || y >= size) continue
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r + r) continue
          const i = y * size + x
          if (grid[i] !== zoneId) {
            grid[i] = zoneId
            changed = true
          }
        }
      }
      if (changed) set({ doc: { ...doc, zoneGrid: grid } })
    },
    addZone: (kind) => {
      const { doc } = get()
      const zones = doc.zones ?? []
      const id = zones.reduce((m, z) => Math.max(m, z.id), 0) + 1
      const n = zones.filter((z) => z.kind === kind).length + 1
      const name = kind === 'airport' && n === 1 ? 'Flughafen' : `${ZONE_DEFAULT_NAME[kind]} ${n}`
      const zone: Zone = { id, kind, name }
      set({ doc: { ...doc, zones: [...zones, zone] }, activeZone: { ...get().activeZone, [kind]: id } })
      return id
    },
    renameZone: (id, name) => {
      const { doc } = get()
      commit({ ...doc, zones: (doc.zones ?? []).map((z) => (z.id === id ? { ...z, name } : z)) })
    },
    removeZone: (id) => {
      const { doc, activeZone } = get()
      const grid = doc.zoneGrid ? new Uint16Array(doc.zoneGrid) : undefined
      if (grid) for (let i = 0; i < grid.length; i++) if (grid[i] === id) grid[i] = 0
      commit({ ...doc, zones: (doc.zones ?? []).filter((z) => z.id !== id), zoneGrid: grid }, { activeZone: Object.fromEntries(Object.entries(activeZone).map(([k, v]) => [k, v === id ? 0 : v])) as Record<ZoneKind, number> })
    },
    setActiveZone: (kind, id) => set({ activeZone: { ...get().activeZone, [kind]: id } }),
    setPoiKind: (poiKind) => set({ poiKind }),
    selectPoi: (selectedPoiId) => set({ selectedPoiId }),
    addPoi: (x, y) => {
      const { doc, poiKind } = get()
      if (x < 0 || y < 0 || x >= doc.size || y >= doc.size) return null
      const pois = doc.pois ?? []
      const n = pois.filter((p) => p.kind === poiKind).length + 1
      const label = poiKind === 'stadium' ? 'Stadion' : poiKind === 'landmark' ? 'Wahrzeichen' : 'Attraktion'
      const id = newId()
      commit({ ...doc, pois: [...pois, { id, kind: poiKind, name: `${label} ${n}`, x, y }] }, { selectedPoiId: id })
      return id
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
      const name =
        stationType === 'airport'
          ? `Flughafen ${count}`
          : stationType === 'hauptbahnhof'
            ? `Hauptbahnhof ${count}`
            : `Station ${count}`
      mutate(
        (d) => {
          d.stations[id] = { id, name, x, y, type: stationType }
        },
        { selectedStationId: id },
      )
      return id
    },
    updateStation: (id, patch) =>
      mutate((d) => {
        if (d.stations[id]) Object.assign(d.stations[id], patch)
      }),
    removeStation: (id) => commit(removeStationEverywhere(get().doc, id), { selectedStationId: null, editStationId: null }),

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
      commit(out.doc, { selectedStationId: out.created.length ? out.created[out.created.length - 1] : get().selectedStationId, selectedWaypoint: null })
      return true
    },
    splitLeg: (lineId, p, maxDist) => {
      const { doc, stationType } = get()
      const out = splitLegAt(doc, lineId, p, maxDist, stationType)
      if (!out) return false
      commit(out.doc, { selectedStationId: out.created[0] ?? null })
      return true
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
