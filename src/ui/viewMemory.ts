/**
 * Where the player last looked at a city: the zoom and centre of the map, and the 3D camera. Kept on the device (per city),
 * so a city opens the way it was left instead of framed from scratch.
 */
export interface MapView {
  /** pixels per cell */
  s: number
  /** the cell in the middle of the free area of the screen */
  cx: number
  cy: number
}

export interface CamView {
  p: [number, number, number]
  t: [number, number, number]
}

interface Remembered {
  map?: MapView
  cam?: CamView
}

const KEY = 'lineforge-views'
const MAX = 40

function read(): Record<string, Remembered> {
  try {
    const raw = localStorage.getItem(KEY)
    const v = raw ? JSON.parse(raw) : {}
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

const finite = (...n: number[]) => n.every((x) => Number.isFinite(x))

export function loadView(cityId: string): Remembered {
  const r = read()[cityId] ?? {}
  const m = r.map
  const c = r.cam
  return {
    map: m && finite(m.s, m.cx, m.cy) && m.s > 0 ? m : undefined,
    cam: c && Array.isArray(c.p) && Array.isArray(c.t) && finite(...c.p, ...c.t) ? c : undefined,
  }
}

function patch(cityId: string, part: Remembered) {
  try {
    const all = read()
    const mine = { ...(all[cityId] ?? {}), ...part }
    // newest last, so the oldest cities fall out first
    delete all[cityId]
    all[cityId] = mine
    const ids = Object.keys(all)
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX))) delete all[id]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // no storage (private window): the city simply opens framed as before
  }
}

export const saveMapView = (cityId: string, map: MapView) => patch(cityId, { map })
export const saveCamView = (cityId: string, cam: CamView) => patch(cityId, { cam })
