import type { CityDoc } from './types'

/**
 * Layout of an airport inside its painted area. One description for the 2D map and the 3D view.
 * Local frame: u runs along the long side of the area, v across it (v = 0 in the middle); lengths are in cells.
 */
export interface AirportBox {
  zoneId: number
  name: string
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Rect {
  u0: number
  u1: number
  v0: number
  v1: number
}

export interface AirportLayout {
  /** centre of the area in cells */
  cx: number
  cy: number
  /** the long side runs along x (true) or along y */
  horiz: boolean
  long: number
  short: number
  runwayLength: number
  runways: { v: number; w: number }[]
  taxiV: number
  taxiW: number
  apron: Rect | null
  terminal: Rect | null
  /** jet bridges from the terminal to the apron */
  piers: Rect[]
  tower: { u: number; v: number } | null
  hangars: Rect[]
  /** parking positions for planes, nose towards the terminal */
  stands: { u: number; v: number }[]
}

/** Bounding boxes of all airport areas of a city. */
export function airportBoxes(doc: CityDoc): AirportBox[] {
  const { size, zoneGrid, zones } = doc
  if (!zoneGrid || !zones) return []
  const out: AirportBox[] = []
  for (const z of zones) {
    if (z.kind !== 'airport') continue
    let x0 = size
    let y0 = size
    let x1 = -1
    let y1 = -1
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (zoneGrid[y * size + x] !== z.id) continue
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x + 1)
        y1 = Math.max(y1, y + 1)
      }
    }
    if (x1 > 0) out.push({ zoneId: z.id, name: z.name, x0, y0, x1, y1 })
  }
  return out
}

/** Layout for an area of the given bounds. Small areas only get a runway; bigger ones a terminal, apron and tower. */
export function airportLayout(b: Pick<AirportBox, 'x0' | 'y0' | 'x1' | 'y1'>): AirportLayout {
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  const horiz = w >= h
  const long = horiz ? w : h
  const short = horiz ? h : w
  const runwayLength = long * 0.9
  const rw = Math.min(1.3, Math.max(0.5, short * 0.1))
  const big = short >= 11 && long >= 14
  const two = short >= 15 && long >= 22
  const base: AirportLayout = {
    cx: (b.x0 + b.x1) / 2,
    cy: (b.y0 + b.y1) / 2,
    horiz,
    long,
    short,
    runwayLength,
    runways: [],
    taxiV: 0,
    taxiW: Math.max(0.3, rw * 0.4),
    apron: null,
    terminal: null,
    piers: [],
    tower: null,
    hangars: [],
    stands: [],
  }
  if (!big) {
    base.runways = [{ v: short > 8 ? -short * 0.18 : 0, w: rw }]
    return base
  }
  base.runways = two ? [{ v: -short * 0.34, w: rw }, { v: -short * 0.14, w: rw }] : [{ v: -short * 0.22, w: rw }]
  base.taxiV = short * 0.03
  const aD = Math.min(0.22 * short, 4)
  const aV0 = short * 0.14
  const apron: Rect = { u0: -long * 0.16, u1: long * 0.16, v0: aV0, v1: aV0 + aD }
  const half = short / 2
  const tDepth = Math.min(1.7, Math.max(1.1, short * 0.1))
  const tc = Math.min(half - tDepth / 2 - 0.4, apron.v1 + 0.9 + tDepth / 2)
  const tHalfLen = Math.min(0.2 * long, 7)
  const terminal: Rect = { u0: -tHalfLen, u1: tHalfLen, v0: tc - tDepth / 2, v1: tc + tDepth / 2 }
  base.apron = apron
  base.terminal = terminal
  // two piers reach from the terminal across the apron
  for (const f of [-0.55, 0.55]) {
    const u = f * tHalfLen
    base.piers.push({ u0: u - 0.22, u1: u + 0.22, v0: apron.v0 + 0.5, v1: terminal.v0 })
  }
  base.tower = { u: tHalfLen + 1.7, v: tc }
  // hangars next to the tower, as far as there is room
  const hu = base.tower.u + 2.6
  if (hu + 1.4 < long / 2 - 0.5) {
    base.hangars.push({ u0: hu - 1.3, u1: hu + 1.3, v0: tc - 0.7, v1: tc + 0.7 })
  }
  const hu2 = -(tHalfLen + 3.2)
  if (-hu2 + 1.4 < long / 2 - 0.5) {
    base.hangars.push({ u0: hu2 - 1.3, u1: hu2 + 1.3, v0: tc - 0.7, v1: tc + 0.7 })
  }
  // planes parked at the piers
  const stands = base.piers.flatMap((p) => [(p.u0 + p.u1) / 2 - 0.9, (p.u0 + p.u1) / 2 + 0.9])
  base.stands = stands.map((u) => ({ u, v: (apron.v0 + apron.v1) / 2 - 0.1 }))
  return base
}

/** Local (u, v) of an airport to map cell coordinates. */
export function airportToCell(l: AirportLayout, u: number, v: number): { x: number; y: number } {
  return l.horiz ? { x: l.cx + u, y: l.cy + v } : { x: l.cx - v, y: l.cy + u }
}
