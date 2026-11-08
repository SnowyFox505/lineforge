import { OPERATORS } from '../model/constants'
import type { CityDoc, OperatorId, Pt } from '../model/types'

// ---------------------------------------------------------------------------
// Trains on the 2D map
//
// A light simulation on the drawn lines (the bundled lane paths of the map): every train shuttles between the two
// ends of its line, calls at every station and shows as a row of rectangles (one per car). The longer the real train,
// the more and the longer cars: a tram is short, an ICE is long.
// ---------------------------------------------------------------------------

interface TrainKind {
  cars: number
  /** length of one car in cells */
  car: number
  /** cruising speed in cells per second */
  speed: number
}

export const TRAIN_KINDS: Record<OperatorId, TrainKind> = {
  tram: { cars: 2, car: 0.42, speed: 3.2 },
  ubahn: { cars: 3, car: 0.5, speed: 5 },
  sbahn: { cars: 4, car: 0.55, speed: 6 },
  regional: { cars: 5, car: 0.6, speed: 8 },
  fernverkehr: { cars: 6, car: 0.66, speed: 11 },
}

const DWELL = 1.6
const DWELL_TERMINAL = 2.6
const GAP = 0.08
const ease = (u: number) => u * u * (3 - 2 * u)

/** A line as the trains see it: the path with running arc lengths and the arc length of every stop. */
export interface RunPath {
  pts: Pt[]
  cum: number[]
  total: number
  stops: number[]
}

export interface Train {
  id: string
  lineId: string
  op: OperatorId
  color: string
  /** index into the back-and-forth list of legs, and what the train does on it */
  leg: number
  phase: 'dwell' | 'move'
  /** dwell time left (seconds), or progress 0..1 of the leg */
  t: number
  duration: number
}

/** Arc length at every vertex of the path. */
function cumulative(pts: Pt[]): number[] {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  return cum
}

/** Where along `pts` each station of the line lies: the nearest vertex in driving order (so loops work). */
export function stopsAlong(pts: Pt[], cum: number[], stations: Pt[]): number[] {
  const out: number[] = []
  let from = 0
  for (const st of stations) {
    let best = from
    let bd = Infinity
    for (let i = from; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - st.x, pts[i].y - st.y)
      if (d < bd - 1e-9) {
        bd = d
        best = i
      }
    }
    out.push(cum[best])
    from = best
  }
  return out
}

export function buildRunPaths(doc: CityDoc, paths: Record<string, Pt[]>): Record<string, RunPath> {
  const out: Record<string, RunPath> = {}
  for (const line of Object.values(doc.lines)) {
    const pts = paths[line.id]
    if (!pts || pts.length < 2) continue
    const sts = line.stations.map((id) => doc.stations[id]).filter(Boolean)
    if (sts.length < 2) continue
    const cum = cumulative(pts)
    const total = cum[cum.length - 1]
    if (total < 1) continue
    // the path passes the cell centres: stations sit on the same lattice coordinates
    out[line.id] = { pts, cum, total, stops: stopsAlong(pts, cum, sts) }
  }
  return out
}

/** Legs of a round trip: out to the last stop and back again. */
function legCount(stopCount: number) {
  return Math.max(1, (stopCount - 1) * 2)
}

function legEnds(stopCount: number, leg: number): { from: number; to: number; dir: 1 | -1 } {
  const n = stopCount - 1
  const k = ((leg % (n * 2)) + n * 2) % (n * 2)
  return k < n ? { from: k, to: k + 1, dir: 1 } : { from: 2 * n - k, to: 2 * n - k - 1, dir: -1 }
}

/** How many trains a line gets: longer lines are busier. */
export function trainsOnLine(total: number): number {
  return Math.min(3, 1 + Math.floor(total / 45))
}

export class TrainSim {
  trains: Train[] = []
  runs: Record<string, RunPath> = {}

  /** Takes new paths (the network changed) and keeps every train that is still on a line where it was. */
  setPaths(runs: Record<string, RunPath>, meta: Map<string, { op: OperatorId; color: string }>) {
    this.runs = runs
    const old = new Map(this.trains.map((t) => [t.id, t]))
    const next: Train[] = []
    let order = 0
    for (const [lineId, run] of Object.entries(runs)) {
      const line = meta.get(lineId)
      if (!line) continue
      const legs = legCount(run.stops.length)
      const count = trainsOnLine(run.total)
      for (let i = 0; i < count; i++) {
        const id = `${lineId}#${i}`
        const prev = old.get(id)
        if (prev) {
          prev.op = line.op
          prev.color = line.color
          prev.leg %= legs
          next.push(prev)
        } else {
          next.push({
            id,
            lineId,
            op: line.op,
            color: line.color,
            leg: Math.floor((i * legs) / count),
            phase: 'dwell',
            t: 0.4 + order++ * 0.9,
            duration: 0,
          })
        }
      }
    }
    this.trains = next
  }

  update(dt: number) {
    for (const tr of this.trains) {
      const run = this.runs[tr.lineId]
      if (!run) continue
      const stopCount = run.stops.length
      const leg = legEnds(stopCount, tr.leg)
      if (tr.phase === 'dwell') {
        tr.t -= dt
        if (tr.t > 0) continue
        const dist = Math.abs(run.stops[leg.to] - run.stops[leg.from])
        tr.duration = Math.max(1.6, dist / TRAIN_KINDS[tr.op].speed + 1.1)
        tr.phase = 'move'
        tr.t = 0
        continue
      }
      tr.t += dt / tr.duration
      if (tr.t >= 1) {
        tr.leg = (tr.leg + 1) % legCount(stopCount)
        tr.phase = 'dwell'
        const next = legEnds(stopCount, tr.leg)
        tr.t = next.dir !== leg.dir ? DWELL_TERMINAL : DWELL
      }
    }
  }
}

/** Operator and colour of every line (what the trains need to know besides the path). */
export function lineMetaOf(doc: CityDoc): Map<string, { op: OperatorId; color: string }> {
  return new Map(Object.values(doc.lines).map((l) => [l.id, { op: l.operator, color: l.color }]))
}

/** Point and direction on a path at an arc length. */
export function poseAt(run: RunPath, s: number): { x: number; y: number; tx: number; ty: number } {
  const { pts, cum, total } = run
  const d = Math.min(total, Math.max(0, s))
  let lo = 0
  let hi = cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= d) lo = mid
    else hi = mid
  }
  const a = pts[lo]
  const b = pts[hi]
  const len = cum[hi] - cum[lo] || 1
  const u = (d - cum[lo]) / len
  // direction from a window around the point: a little smoother than the single segment
  const p = pts[Math.max(0, lo - 1)]
  const q = pts[Math.min(pts.length - 1, hi + 1)]
  const dx = q.x - p.x
  const dy = q.y - p.y
  const l = Math.hypot(dx, dy) || 1
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, tx: dx / l, ty: dy / l }
}

export interface CarShape {
  /** centre in cell coordinates and heading */
  x: number
  y: number
  tx: number
  ty: number
  /** length in cells */
  len: number
  head: boolean
}

/** Where the cars of a train are (head first), given how many pixels one cell has. */
export function carsOf(tr: Train, run: RunPath, scale: number): CarShape[] {
  const kind = TRAIN_KINDS[tr.op]
  const stopCount = run.stops.length
  const leg = legEnds(stopCount, tr.leg)
  const a = run.stops[leg.from]
  const b = run.stops[leg.to]
  // dwelling, a train stands at the stop it arrived at (the end of the previous leg = start of this one)
  const s0 = tr.phase === 'dwell' ? a : a + (b - a) * ease(Math.min(1, tr.t))
  // cars never get tiny: when zoomed out the train grows in cells so a car stays at least ~6 px long
  const grow = Math.max(1, 6 / (kind.car * scale))
  const car = kind.car * grow
  const gap = GAP * grow
  const pitch = car + gap
  const half = (pitch * kind.cars) / 2
  const total = run.total
  const sc = total > half * 2 ? Math.min(total - half, Math.max(half, s0)) : total / 2
  const out: CarShape[] = []
  for (let i = 0; i < kind.cars; i++) {
    const off = ((kind.cars - 1) / 2 - i) * pitch * leg.dir
    const p = poseAt(run, sc + off)
    out.push({ x: p.x, y: p.y, tx: p.tx * leg.dir, ty: p.ty * leg.dir, len: car, head: i === 0 })
  }
  return out
}

export function lineWidthPx(op: OperatorId, scale: number) {
  return Math.min(22, Math.max(3, (OPERATORS[op].width / 10) * scale))
}

/** Mix a #rrggbb colour towards white. */
export function lighten(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`
}

/** Paint all trains. `ox`/`oy`/`s` are the map view (pixels, pixels per cell). */
export function drawTrains(ctx: CanvasRenderingContext2D, sim: TrainSim, ox: number, oy: number, s: number, w: number, h: number) {
  for (const tr of sim.trains) {
    const run = sim.runs[tr.lineId]
    if (!run) continue
    const cars = carsOf(tr, run, s)
    const first = cars[0]
    const px0 = ox + (first.x + 0.5) * s
    const py0 = oy + (first.y + 0.5) * s
    if (px0 < -60 || py0 < -60 || px0 > w + 60 || py0 > h + 60) continue
    const wid = Math.max(lineWidthPx(tr.op, s) + 3.5, 6.5)
    const fill = lighten(tr.color, 0.18)
    for (const c of cars) {
      const lenPx = c.len * s
      const px = ox + (c.x + 0.5) * s
      const py = oy + (c.y + 0.5) * s
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(Math.atan2(c.ty, c.tx))
      const r = Math.min(wid * 0.32, lenPx * 0.3)
      // dark casing, body, light edge
      ctx.beginPath()
      ctx.roundRect(-lenPx / 2 - 1.6, -wid / 2 - 1.6, lenPx + 3.2, wid + 3.2, r + 1.6)
      ctx.fillStyle = 'rgba(4,7,11,0.78)'
      ctx.fill()
      ctx.beginPath()
      ctx.roundRect(-lenPx / 2, -wid / 2, lenPx, wid, r)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.lineWidth = 1.1
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'
      ctx.stroke()
      // windows: a darker band along the car
      if (wid >= 8 && lenPx >= 8) {
        ctx.fillStyle = 'rgba(8,14,22,0.42)'
        ctx.fillRect(-lenPx / 2 + lenPx * 0.14, -wid * 0.2, lenPx * 0.72, wid * 0.4)
      }
      // the head car shows where the train is going
      if (c.head) {
        ctx.fillStyle = '#ffffff'
        const nose = Math.max(1.6, Math.min(3.2, wid * 0.28))
        ctx.fillRect(lenPx / 2 - nose - 0.6, -wid * 0.3, nose, wid * 0.6)
      }
      ctx.restore()
    }
  }
}
