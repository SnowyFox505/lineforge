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
  /** car parks and multi-storey garages on the landside of the terminal */
  parking: Rect[]
  garages: Rect[]
  /** the tower of a big airport is taller */
  towerScale: number
}

/** Longest runway (cells) and most parallel runways: a bigger area gets more of everything else instead */
const MAX_RUNWAY = 34
const MAX_RUNWAYS = 4

/**
 * Bounding boxes of all airport areas of a city. Only the biggest connected piece of an area counts:
 * single cells left over from erasing (or a stray dab) must not keep the runway long.
 */
export function airportBoxes(doc: CityDoc): AirportBox[] {
  const { size, zoneGrid, zones } = doc
  if (!zoneGrid || !zones) return []
  const out: AirportBox[] = []
  const seen = new Uint8Array(size * size)
  const stack: number[] = []
  for (const z of zones) {
    if (z.kind !== 'airport') continue
    let best: { n: number; x0: number; y0: number; x1: number; y1: number } | null = null
    for (let start = 0; start < size * size; start++) {
      if (zoneGrid[start] !== z.id || seen[start]) continue
      const c = { n: 0, x0: size, y0: size, x1: -1, y1: -1 }
      stack.push(start)
      seen[start] = 1
      while (stack.length) {
        const i = stack.pop()!
        const x = i % size
        const y = (i - x) / size
        c.n++
        c.x0 = Math.min(c.x0, x)
        c.y0 = Math.min(c.y0, y)
        c.x1 = Math.max(c.x1, x + 1)
        c.y1 = Math.max(c.y1, y + 1)
        // 8 neighbours: the soft brush edge can touch only at a corner
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
            const j = ny * size + nx
            if (zoneGrid[j] === z.id && !seen[j]) {
              seen[j] = 1
              stack.push(j)
            }
          }
        }
      }
      if (!best || c.n > best.n) best = c
    }
    if (best) out.push({ zoneId: z.id, name: z.name, ...trimForeign(zoneGrid, size, z.id, best) })
  }
  return out
}

/** The share of other areas (a town painted over the edge) the box of an airport may still hold */
const FOREIGN_TOLERANCE = 0.02
/** An airport box is never cut smaller than this (cells) */
const MIN_SIDE = 6

/**
 * Cut the box of an airport back where other areas were painted over it: the side strip with the largest share of
 * foreign cells goes first, until (almost) nothing else lies inside. The runways and buildings then stay on the
 * airport's own ground instead of reaching into the neighbouring town.
 */
export function trimForeign(grid: ArrayLike<number>, size: number, id: number, box: { x0: number; y0: number; x1: number; y1: number }) {
  let { x0, y0, x1, y1 } = box
  const foreign = (x: number, y: number) => {
    const v = grid[y * size + x]
    return v !== 0 && v !== id
  }
  const col = (x: number) => {
    let n = 0
    for (let y = y0; y < y1; y++) if (foreign(x, y)) n++
    return n
  }
  const row = (y: number) => {
    let n = 0
    for (let x = x0; x < x1; x++) if (foreign(x, y)) n++
    return n
  }
  let total = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (foreign(x, y)) total++
  while (total > (x1 - x0) * (y1 - y0) * FOREIGN_TOLERANCE) {
    const h = y1 - y0
    const w = x1 - x0
    const sides = [
      { s: 'l', n: col(x0), len: h, ok: w > MIN_SIDE },
      { s: 'r', n: col(x1 - 1), len: h, ok: w > MIN_SIDE },
      { s: 't', n: row(y0), len: w, ok: h > MIN_SIDE },
      { s: 'b', n: row(y1 - 1), len: w, ok: h > MIN_SIDE },
    ].filter((c) => c.ok && c.n > 0)
    if (!sides.length) break
    const cut = sides.reduce((a, c) => (c.n / c.len > a.n / a.len ? c : a))
    total -= cut.n
    if (cut.s === 'l') x0++
    else if (cut.s === 'r') x1--
    else if (cut.s === 't') y0++
    else y1--
  }
  return { x0, y0, x1, y1 }
}

/**
 * Layout for an area of the given bounds. Everything grows with the room it gets: a small area only gets a runway, a
 * bigger one a terminal, apron and tower, a large one up to four parallel runways, a long terminal with many piers,
 * rows of hangars and cargo sheds, a car park and a garage on the landside. Runways stay at a sensible length: the room
 * a huge area has beyond that goes to the terminal and the buildings, not to a runway many times longer than the rest.
 */
export function airportLayout(b: Pick<AirportBox, 'x0' | 'y0' | 'x1' | 'y1'>): AirportLayout {
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  const horiz = w >= h
  const long = horiz ? w : h
  const short = horiz ? h : w
  const runwayLength = Math.min(long * 0.9, MAX_RUNWAY)
  const rw = short > 20 ? Math.min(1.6, short * 0.07) : Math.min(1.3, Math.max(0.5, short * 0.1))
  const big = short >= 11 && long >= 14
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
    parking: [],
    garages: [],
    towerScale: 1,
  }
  if (!big) {
    base.runways = [{ v: short > 8 ? -short * 0.18 : 0, w: rw }]
    return base
  }
  const half = short / 2
  // parallel runways side by side, as many as fit into the band on the runway side
  const spacing = Math.max(2.6, rw * 2.2)
  const n = Math.max(1, Math.min(MAX_RUNWAYS, Math.floor((short * 0.5) / spacing)))
  if (n === 1) base.runways = [{ v: -short * 0.22, w: rw }]
  else {
    const vc = -short * 0.26
    base.runways = Array.from({ length: n }, (_, i) => ({ v: vc + (i - (n - 1) / 2) * spacing, w: rw }))
  }
  const runwayEdge = Math.max(...base.runways.map((r) => r.v + r.w / 2))
  // the landside (car park, garage) behind the terminal, only when there is room for it
  const landside = short >= 20 ? Math.min(0.14 * short, 6) : 0
  const tDepth = Math.min(3, Math.max(1.1, short * 0.1))
  const aV0 = Math.max(short * 0.14, runwayEdge + 1.2)
  const aD = Math.max(1.5, Math.min(0.22 * short, 8, half - landside - tDepth - 1.3 - aV0))
  const apronHalf = Math.min(0.16 * long, 13)
  const apron: Rect = { u0: -apronHalf, u1: apronHalf, v0: aV0, v1: aV0 + aD }
  base.taxiV = Math.min((runwayEdge + aV0) / 2, short * 0.03 + (n > 1 ? 0.5 : 0))
  const tc = Math.min(half - landside - tDepth / 2 - 0.4, apron.v1 + 0.9 + tDepth / 2)
  const tHalfLen = Math.min(0.2 * long, 16)
  const terminal: Rect = { u0: -tHalfLen, u1: tHalfLen, v0: tc - tDepth / 2, v1: tc + tDepth / 2 }
  base.apron = apron
  base.terminal = terminal
  // jet bridges from the terminal across the apron, one more for every few cells of terminal
  const np = Math.max(2, Math.min(7, Math.round(tHalfLen / 3.2)))
  for (let k = 0; k < np; k++) {
    const u = tHalfLen * 0.55 * ((2 * k) / (np - 1) - 1)
    base.piers.push({ u0: u - 0.22, u1: u + 0.22, v0: apron.v0 + 0.5, v1: terminal.v0 })
  }
  base.tower = { u: tHalfLen + 1.7, v: tc }
  base.towerScale = 1 + Math.min(0.7, long / 90)
  // hangars and cargo sheds in a row on both sides of the terminal, as far as there is room
  const place = (side: 1 | -1) => {
    let u = side > 0 ? base.tower!.u + 2.6 : -(tHalfLen + 3.2)
    for (let i = 0; i < 4; i++) {
      if (Math.abs(u) + 1.4 >= long / 2 - 0.5) break
      base.hangars.push({ u0: u - 1.3, u1: u + 1.3, v0: tc - 0.7, v1: tc + 0.7 })
      u += side * 3
    }
  }
  place(1)
  place(-1)
  // landside: car park in front of the terminal and a multi-storey garage beside it
  if (landside >= 3.5) {
    const v0 = terminal.v1 + 0.35
    const v1 = half - 0.3
    base.parking.push({ u0: -tHalfLen * 0.75, u1: tHalfLen * 0.2, v0, v1 })
    base.garages.push({ u0: tHalfLen * 0.3, u1: Math.min(tHalfLen * 0.9, tHalfLen * 0.3 + 4), v0, v1 })
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
