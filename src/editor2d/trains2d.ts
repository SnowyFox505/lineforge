import { OPERATORS } from '../model/constants'
import type { CityDoc, OperatorId, Pt } from '../model/types'
import type { SimTrain } from '../view3d/trainSim'

// ---------------------------------------------------------------------------
// Trains on the 2D map
//
// The trains are the ones of the world simulation (sim/world.ts), the same that drive in 3D. The map only reads their
// state (which leg, how far along it) and puts them on the drawn lines (the bundled lane paths of the map): every train
// shows as a row of rectangles, one per car. The longer the real train, the more and the longer cars.
// ---------------------------------------------------------------------------

interface TrainKind {
  cars: number
  /** length of one car in cells */
  car: number
}

export const TRAIN_KINDS: Record<OperatorId, TrainKind> = {
  tram: { cars: 2, car: 0.42 },
  ubahn: { cars: 3, car: 0.5 },
  sbahn: { cars: 4, car: 0.55 },
  regional: { cars: 5, car: 0.6 },
  fernverkehr: { cars: 6, car: 0.66 },
}

const GAP = 0.08

/** A line as the trains see it: the path with running arc lengths and the arc length of every stop. */
export interface RunPath {
  pts: Pt[]
  cum: number[]
  total: number
  stops: number[]
}

/** A train as the map shows it: between two stops of its line (`u` = how far along, 0 at `from`), heading `dir`. */
export interface TrainView {
  id: string
  lineId: string
  op: OperatorId
  color: string
  from: number
  to: number
  u: number
  dir: 1 | -1
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
export function carsOf(tr: TrainView, run: RunPath, scale: number): CarShape[] {
  const kind = TRAIN_KINDS[tr.op]
  const a = run.stops[tr.from]
  const b = run.stops[tr.to]
  const s0 = a + (b - a) * tr.u
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
    const off = ((kind.cars - 1) / 2 - i) * pitch * tr.dir
    const p = poseAt(run, sc + off)
    out.push({ x: p.x, y: p.y, tx: p.tx * tr.dir, ty: p.ty * tr.dir, len: car, head: i === 0 })
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

const ease = (u: number) => u * u * (3 - 2 * u)

/** The trains of the world simulation as the map shows them. Trains whose line does not match the drawn one are left out. */
export function viewsOf(sim: { trains: SimTrain[] }, runs: Record<string, RunPath>): TrainView[] {
  const out: TrainView[] = []
  for (const tr of sim.trains) {
    const run = runs[tr.net.line.id]
    const n = tr.net.stops.length
    if (!run || run.stops.length !== n || n < 2) continue
    const legs = tr.legs
    const leg = legs[tr.leg % legs.length]
    out.push({
      id: tr.id,
      lineId: tr.net.line.id,
      op: tr.op,
      color: tr.color,
      from: leg.from,
      to: leg.to,
      // standing at a stop, a train is at the start of the leg it will drive next
      u: tr.phase === 'dwell' ? 0 : ease(Math.min(1, tr.t)),
      dir: tr.dir,
    })
  }
  return out
}

/** Paint all trains. `ox`/`oy`/`s` are the map view (pixels, pixels per cell). */
export function drawTrains(ctx: CanvasRenderingContext2D, trains: TrainView[], runs: Record<string, RunPath>, ox: number, oy: number, s: number, w: number, h: number) {
  for (const tr of trains) {
    const run = runs[tr.lineId]
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
