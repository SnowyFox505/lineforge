import type { CityDoc, Pt } from '../model/types'

/**
 * Line badges at the ends of the lines on the map (like the ones on the network plan): at every station where a line ends
 * a small tag with the line's name sits beyond the end, away from the line. Several lines that end at one station stand in a
 * row, and a badge steps aside for the name of a station and for other badges.
 */

export interface LineEnd {
  station: string
  line: string
  /** unit vector pointing away from the line at its end (map space) */
  dx: number
  dy: number
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** Where the lines end: the station and the direction in which the line leaves it (a ring has no ends). */
export function lineEnds(doc: CityDoc, paths: Record<string, Pt[]>): LineEnd[] {
  const out: LineEnd[] = []
  for (const line of Object.values(doc.lines)) {
    const pts = paths[line.id]
    if (!pts || pts.length < 2 || line.loop || line.stations.length < 2) continue
    const ends: [string, 1 | -1][] = [
      [line.stations[0], 1],
      [line.stations[line.stations.length - 1], -1],
    ]
    for (const [station, side] of ends) {
      if (!doc.stations[station]) continue
      const end = side === 1 ? pts[0] : pts[pts.length - 1]
      // look a little way into the line: the very last piece of a curve can point anywhere
      let inner = side === 1 ? pts[pts.length - 1] : pts[0]
      for (let k = 1; k < pts.length; k++) {
        const p = side === 1 ? pts[k] : pts[pts.length - 1 - k]
        if (dist(p, end) >= 1) {
          inner = p
          break
        }
      }
      const l = dist(end, inner) || 1
      out.push({ station, line: line.id, dx: (end.x - inner.x) / l, dy: (end.y - inner.y) / l })
    }
  }
  return out
}

export interface BadgeIn {
  key: string
  station: string
  /** screen position of the station */
  px: number
  py: number
  dx: number
  dy: number
  /** width of the badge in pixels */
  w: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface BadgePlaced {
  key: string
  /** centre */
  cx: number
  cy: number
  w: number
  h: number
}

const clash = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/**
 * Screen places for the badges. `r` is the radius of a station mark, `occupied` the rectangles that are taken already (names
 * of stations); the places of the badges are added to it.
 */
export function placeBadges(items: BadgeIn[], r: number, occupied: Rect[], h = 18, gap = 3): BadgePlaced[] {
  const groups = new Map<string, BadgeIn[]>()
  for (const it of items) {
    const g = groups.get(it.station)
    if (g) g.push(it)
    else groups.set(it.station, [it])
  }
  const placed: BadgePlaced[] = []
  for (const group of groups.values()) {
    // the direction of the group: the mean of the way its lines leave the station
    let mx = 0
    let my = 0
    for (const g of group) {
      mx += g.dx
      my += g.dy
    }
    const ml = Math.hypot(mx, my)
    const base = ml > 0.2 ? { x: mx / ml, y: my / ml } : { x: 0, y: -1 }
    const { px, py } = group[0]
    const reach = r + 8
    /** the group laid out towards (ux, uy): sideways ones stack up, up and down ones stand in a row */
    const layout = (ux: number, uy: number): BadgePlaced[] => {
      const out: BadgePlaced[] = []
      if (Math.abs(ux) >= Math.abs(uy)) {
        const sign = ux >= 0 ? 1 : -1
        const total = group.length * h + (group.length - 1) * gap
        group.forEach((g, i) => out.push({ key: g.key, cx: px + sign * (reach + g.w / 2), cy: py - total / 2 + h / 2 + i * (h + gap), w: g.w, h }))
      } else {
        const sign = uy >= 0 ? 1 : -1
        const total = group.reduce((a, g) => a + g.w, 0) + (group.length - 1) * gap
        let x = px - total / 2
        for (const g of group) {
          out.push({ key: g.key, cx: x + g.w / 2, cy: py + sign * (reach + h / 2), w: g.w, h })
          x += g.w + gap
        }
      }
      return out
    }
    const free = (list: BadgePlaced[]) => list.every((b) => {
      const rect = { x: b.cx - b.w / 2, y: b.cy - b.h / 2, w: b.w, h: b.h }
      return !occupied.some((o) => clash(rect, o))
    })
    // the way the line leaves first, then the other sides
    const tries: [number, number][] = [
      [base.x, base.y],
      [-base.y, base.x],
      [base.y, -base.x],
      [-base.x, -base.y],
    ]
    let chosen = layout(base.x, base.y)
    for (const [ux, uy] of tries) {
      const l = layout(ux, uy)
      if (free(l)) {
        chosen = l
        break
      }
    }
    for (const b of chosen) {
      placed.push(b)
      occupied.push({ x: b.cx - b.w / 2, y: b.cy - b.h / 2, w: b.w, h: b.h })
    }
  }
  return placed
}
