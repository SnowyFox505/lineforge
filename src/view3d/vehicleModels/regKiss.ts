import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Stadler KISS as DB IC 2 (class 4110, photos "IC 2 KISS"): white double-deck body, a red stripe that runs along the side and sweeps
 * down over the nose to the lower front, dark grey hood with a big windscreen (destination display above the glass, amber marker
 * lamp on top), white cheek pillars with a dark cab side window, light clusters (amber + round white) with the DB logo between
 * them, ribbed crash blocks and the coupler recess below. Side: two window rows, white doors with narrow slit windows and a yellow
 * top strip, louvre hatch, grilles and the big grey IC letters behind the cab. Articulated: Jakobs bogies in the car joints.
 */

const INK = '#12161a'
const HOOD = '#363c44'
const FRAME = '#272c32'
const LETTER = '#8c9aa8'
/** shape of the nose, must equal the style `regionalkiss` in vehicles3d.tsx */
const POW = 1.6
/** the stripe leaves its flat level this far (distance from the nose tip) before it reaches the front */
const DESCENT = 0.95
const STRIPE_Y = 0.235
const STRIPE_FRONT = 0.105
const STRIPE_TH = 0.032
/** the first door stands this far behind the nose tip, doors at a joint this far from the car end */
const DOOR_NOSE = 1.0
const DOOR_JOINT = 0.3
const DOOR_W = 0.17

type V = [number, number, number]

export const kissSign = (m: FrontMetrics) => ({ y: m.capTop * 0.851, w: 0.145, h: 0.024, x: 0.0122 })
export const kissLogo = (m: FrontMetrics) => ({ y: m.capTop * 0.338, z: 0, w: 0.04, h: 0.027, x: 0.0098 })
export const kissLamp = (m: FrontMetrics) => ({ y: m.capTop * 0.355, z: m.capHW * 0.53, w: 0.021, h: 0.021, round: true })

/** Outline of a tapered, rounded panel centred on the origin: `wb` wide at the bottom, `wt` at the top, `h` high. */
function taper(wb: number, wt: number, h: number, rb: number, rt: number): THREE.Shape {
  const s = new THREE.Shape()
  const b = wb / 2
  const t = wt / 2
  const y = -h / 2
  s.moveTo(-b + rb, y)
  s.lineTo(b - rb, y)
  s.quadraticCurveTo(b, y, b, y + rb)
  s.lineTo(t, y + h - rt)
  s.quadraticCurveTo(t, y + h, t - rt, y + h)
  s.lineTo(-t + rt, y + h)
  s.quadraticCurveTo(-t, y + h, -t, y + h - rt)
  s.lineTo(-b, y + rb)
  s.quadraticCurveTo(-b, y, -b + rb, y)
  return s
}

function frontShape(shape: THREE.Shape, x: number, y: number, z: number, depth: number, hex: string): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 5 })
  g.rotateY(Math.PI / 2)
  g.translate(x, y, z)
  g.deleteAttribute('uv')
  return paint(g, hex)
}

/** A thin bar between two points in the x-y plane (pantograph arms). */
function bar(x0: number, y0: number, x1: number, y1: number, z: number, t: number, d: number, hex: string): THREE.BufferGeometry {
  return box(Math.hypot(x1 - x0, y1 - y0), t, d, (x0 + x1) / 2, (y0 + y1) / 2, z, hex, Math.atan2(y1 - y0, x1 - x0))
}

/** A surface patch from a grid of points; every triangle is turned so that it faces the `outward` direction. */
function skin(grid: V[][], outward: V, hex: string): THREE.BufferGeometry {
  const pos: number[] = []
  const tri = (a: V, b: V, d: V) => {
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = d[0] - a[0]
    const vy = d[1] - a[1]
    const vz = d[2] - a[2]
    const dot = (uy * vz - uz * vy) * outward[0] + (uz * vx - ux * vz) * outward[1] + (ux * vy - uy * vx) * outward[2]
    if (dot < 0) pos.push(...a, ...d, ...b)
    else pos.push(...a, ...b, ...d)
  }
  for (let i = 0; i < grid.length - 1; i++)
    for (let j = 0; j < grid[i].length - 1; j++) {
      tri(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1])
      tri(grid[i][j], grid[i + 1][j + 1], grid[i][j + 1])
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return paint(g, hex)
}

/** The shape of the shell at x0 along a nose (mirrors `shell` in vehicles3d.tsx); `xm` measures towards the nose tip at +hl. */
interface Nose {
  hl: number
  n: number
  h: number
  w: number
  drop: number
  narrow: number
  roundR: number
  rake: number
  e: 1 | -1
}
const noseOf = (c: CarCtx, e: 1 | -1): Nose => ({ hl: c.len / 2, n: e > 0 ? c.nF : c.nR, h: c.h, w: c.w, drop: 1 - c.capTop / c.h, narrow: 1 - c.capHW / (c.w / 2), roundR: c.roofR, rake: c.rake, e })
function sect(g: Nose, xm: number) {
  const t = g.n > 0 ? Math.min(1, Math.max(0, (xm - (g.hl - g.n)) / g.n)) : 0
  const top = g.h * (1 - g.drop * t ** POW)
  const wf = 1 - g.narrow * t * t
  return { t, top, hw: (g.w / 2) * wf, rr: Math.min(g.roundR * wf, top * 0.4) }
}
/** A point on the side wall (offset `off` outwards) at car x `x0`, height y, side s. */
function wall(g: Nose, x0: number, y: number, s: number, off: number): V {
  const xm = g.e * x0
  const q = sect(g, xm)
  return [g.e * (xm - ((g.rake * y) / g.h) * q.t), y, s * (q.hw + off)]
}

/** The red stripe along both sides: flat in the passenger area, sweeping down over the nose. */
function stripe(c: CarCtx): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const hl = c.len / 2
  const xsSet = new Set<number>([-hl, hl])
  for (const e of [1, -1] as const) {
    if ((e > 0 ? c.nF : c.nR) <= 0) continue
    for (let u = 0; u <= DESCENT + 0.001; u += 0.04) xsSet.add(+(e * (hl - u)).toFixed(4))
  }
  const xs = [...xsSet].sort((a, b) => a - b)
  const ease = (t: number) => t * t * (3 - 2 * t)
  for (const s of [-1, 1]) {
    const lo: V[] = []
    const hi: V[] = []
    for (const x0 of xs) {
      const e: 1 | -1 = c.nF > 0 && (c.nR <= 0 || x0 >= 0) ? 1 : c.nR > 0 ? -1 : 1
      const g = noseOf(c, e)
      const u = Math.min(c.nF > 0 ? hl - x0 : 9, c.nR > 0 ? hl + x0 : 9)
      const yc = STRIPE_Y + (STRIPE_FRONT - STRIPE_Y) * (1 - ease(Math.min(1, u / DESCENT)))
      lo.push(wall(g, x0, yc - STRIPE_TH / 2, s, 0.0025))
      hi.push(wall(g, x0, yc + STRIPE_TH / 2, s, 0.0025))
    }
    out.push(skin(lo.map((p, i) => [p, hi[i]]), [0, 0, s], c.line))
  }
  return out
}

/** Dark cab side window with its frame on the nose cheeks, plus the wing mirror. */
function cheek(c: CarCtx, e: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const g = noseOf(c, e)
  const hl = g.hl
  const span = (u0: number, u1: number, grow: number, hex: string, off: number, s: number) => {
    const grid: V[][] = []
    for (let i = 0; i <= 7; i++) {
      const u = u0 + ((u1 - u0) * i) / 7
      const k = (u - 0.04) / 0.26
      const yb = 0.215 - 0.02 * k - grow
      const yt = 0.31 + 0.03 * k + grow
      grid.push([wall(g, e * (hl - u), yb, s, off), wall(g, e * (hl - u), (yb + yt) / 2, s, off), wall(g, e * (hl - u), yt, s, off)])
    }
    return skin(grid, [0, 0, s], hex)
  }
  for (const s of [-1, 1]) {
    out.push(span(0.04, 0.3, 0.01, INK, 0.0022, s))
    out.push(span(0.05, 0.29, 0.0, '#1f2c38', 0.0032, s))
    // wing mirror
    const mx = e * (hl - 0.345)
    out.push(box(0.02, 0.06, 0.02, mx, 0.3, s * (g.w / 2 + 0.012), '#171b20'))
  }
  return out
}

/** Dark hood over the top of the nose. */
function hood(c: CarCtx, e: 1 | -1): THREE.BufferGeometry[] {
  const g = noseOf(c, e)
  const grid: V[][] = []
  const eps = 0.0025
  for (let i = 0; i <= 8; i++) {
    const xm = g.hl - g.n * 0.5 + ((g.n * 0.5) * i) / 8
    const q = sect(g, xm)
    const row: V[] = []
    for (let j = 0; j <= 10; j++) {
      const z = (j / 5 - 1) * (q.hw - q.rr + q.rr * 0.45)
      const edge = q.hw - q.rr
      const az = Math.abs(z)
      let y = q.top
      let ny = 1
      let nz = 0
      if (az > edge) {
        const d = az - edge
        y = q.top - q.rr + Math.sqrt(Math.max(0, q.rr * q.rr - d * d))
        ny = (y - (q.top - q.rr)) / q.rr
        nz = (d / q.rr) * Math.sign(z)
      }
      y += ny * eps
      const zz = z + nz * eps
      row.push([e * (xm - ((g.rake * y) / g.h) * q.t), y, zz])
    }
    grid.push(row)
  }
  return [skin(grid, [0.3, 1, 0], HOOD)]
}

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx, rear: boolean): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const T = c.capTop
  const hw = c.capHW
  const lamp = kissLamp(m)
  const sign = kissSign(m)
  const p: THREE.BufferGeometry[] = []

  // hood, frame and glass of the windscreen
  p.push(frontShape(taper(hw * 1.7, hw * 1.42, T * 0.543, 0.035, 0.05), x, T * 0.72, 0, 0.006, HOOD))
  p.push(frontShape(taper(hw * 1.4, hw * 1.34, T * 0.403, 0.02, 0.018), x + 0.006, T * 0.681, 0, 0.002, FRAME))
  p.push(frontShape(taper(hw * 0.93, hw * 0.88, T * 0.264, 0.012, 0.012), x + 0.008, T * 0.662, 0, 0.002, '#3a4856'))
  // reflection streak and parked wipers
  p.push(frontShape(taper(0.03, 0.018, T * 0.22, 0.004, 0.004), x + 0.0098, T * 0.665, -hw * 0.3, 0.0005, '#4a5c6c'))
  const a = 1.2
  for (const zp of [-0.03, 0.02]) {
    const L = 0.09
    p.push(box(0.0025, L, 0.0045, x + 0.0105, T * 0.55 + 0.01 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#050607', 0, a))
  }
  // destination display recess and the amber marker lamp on top
  p.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.008, x + 0.0098, sign.y, 0, 0.0015, '#06080a'))
  p.push(box(0.004, 0.011, 0.04, x + 0.0075, T * 0.94, 0, rear ? '#d8231a' : '#f0a61c'))
  // number plate pocket
  p.push(frontPlate(0.072, 0.034, 0.01, x + 0.001, T * 0.41, 0.0, 0.002, '#d3d7dc'))
  // light clusters: housing, amber (red at the rear) lamp outside, round white one inside
  for (const sz of [-1, 1]) {
    const cz = sz * hw * 0.61
    p.push(frontPlate(0.087, 0.036, 0.013, x + 0.001, lamp.y, cz, 0.003, '#c9cdd2'))
    p.push(box(0.004, 0.02, 0.03, x + 0.0045, lamp.y, sz * hw * 0.69 + sz * 0.007, rear ? '#c8281f' : '#f0b81c'))
    p.push(cylX(0.0125, 0.004, x + 0.0045, lamp.y, sz * hw * 0.53, '#7a8088', 12))
  }
  // red band across the lower front (the stripe arrives here), the coupler recess is cut out of it
  p.push(frontPlate(hw * 2 * 0.998, STRIPE_TH, 0.002, x + 0.0005, STRIPE_FRONT, 0, 0.003, c.line))
  // ribbed crash blocks at the lower corners
  for (const sz of [-1, 1]) {
    const vz = sz * hw * 0.69
    p.push(box(0.022, 0.065, 0.066, x + 0.009, 0.075, vz, '#2a2e33'))
    for (let k = 0; k < 5; k++) p.push(box(0.003, 0.0045, 0.058, x + 0.0205, 0.052 + k * 0.0115, vz, '#4a5058'))
  }
  // coupler recess, coupler head, hoses
  p.push(box(0.012, 0.1, 0.15, x + 0.004, 0.09, 0, '#0f1215'))
  p.push(box(0.03, 0.05, 0.075, x + 0.016, 0.082, 0, '#3a4048'))
  p.push(cylX(0.021, 0.034, x + 0.03, 0.072, 0, '#767e89'))
  p.push(cylX(0.009, 0.014, x + 0.049, 0.072, 0, '#14181c'))
  for (const sz of [-1, 1]) {
    p.push(cylX(0.004, 0.024, x + 0.02, 0.045, sz * 0.05, '#d9b52b', 6))
    p.push(cylX(0.004, 0.02, x + 0.02, 0.105, sz * 0.045, '#2f6fb5', 6))
  }
  // apron
  p.push(box(0.034, 0.05, hw * 2 * 0.96, x + 0.006, 0.006, 0, '#434b55'))
  p.push(box(0.012, 0.01, hw * 1.5, x + 0.024, 0.026, 0, '#2c3239'))
  return rakeParts(p, c.rake, c.h)
}

/** One side-wall detail at distance `u` behind the nose tip (car x = e * (hl - u)). */
const sideX = (c: CarCtx, e: 1 | -1, u: number) => e * (c.len / 2 - u)

function letters(c: CarCtx, e: 1 | -1, u: number, s: number): THREE.BufferGeometry[] {
  const Hh = 0.09
  const dep = 0.0025
  const iBar = new THREE.ExtrudeGeometry(new THREE.Shape().moveTo(-0.008, -Hh / 2).lineTo(0.008, -Hh / 2).lineTo(0.008, Hh / 2).lineTo(-0.008, Hh / 2).closePath(), { depth: dep, bevelEnabled: false })
  iBar.translate(-0.05, 0, 0)
  const cs = new THREE.Shape()
  const R = Hh / 2
  const r = R - 0.016
  cs.absarc(0, 0, R, 0.55, Math.PI * 2 - 0.55, false)
  cs.absarc(0, 0, r, Math.PI * 2 - 0.55, 0.55, true)
  cs.closePath()
  const cGeo = new THREE.ExtrudeGeometry(cs, { depth: dep, bevelEnabled: false, curveSegments: 14 })
  cGeo.scale(0.85, 1, 1)
  cGeo.translate(0.005, 0, 0)
  return [iBar, cGeo].map((g) => {
    g.deleteAttribute('uv')
    if (s < 0) g.rotateY(Math.PI)
    g.translate(sideX(c, e, u), 0.125, s * (c.w / 2 + 0.002))
    return paint(g, LETTER)
  })
}

/** Louvre hatch / grille: raised frame, dark panel, slats. `y0`..`y1` high, `w` wide, centre at x. */
function grille(x: number, y0: number, y1: number, w: number, s: number, z0: number, slats: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const cy = (y0 + y1) / 2
  out.push(box(w, y1 - y0, 0.004, x, cy, s * (z0 + 0.0022), '#dde0e3'))
  out.push(box(w - 0.016, y1 - y0 - 0.016, 0.0045, x, cy, s * (z0 + 0.0027), '#7b8289'))
  for (let k = 0; k < slats; k++) out.push(box(w - 0.02, 0.0035, 0.005, x, y0 + 0.012 + ((y1 - y0 - 0.024) * (k + 0.5)) / slats, s * (z0 + 0.003), '#a9afb6'))
  return out
}

/** Side-wall equipment behind a nose: louvre hatch, round plate, narrow window, IC letters, roof-side grilles. */
function cabSide(c: CarCtx, e: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  for (const s of [-1, 1]) {
    out.push(...grille(sideX(c, e, 0.5), 0.085, 0.3, 0.1, s, zw, 9))
    out.push(box(0.06, 0.06, 0.003, sideX(c, e, 0.66), 0.29, s * (zw + 0.0016), '#d2d6da'))
    out.push(box(0.045, 0.12, 0.004, sideX(c, e, 0.8), 0.26, s * (zw + 0.002), INK))
    out.push(box(0.035, 0.108, 0.0045, sideX(c, e, 0.8), 0.26, s * (zw + 0.0026), '#3a2f28'))
    out.push(...letters(c, e, 0.66, s))
    out.push(...grille(sideX(c, e, 0.52), 0.37, 0.44, 0.13, s, zw, 4))
    out.push(...grille(sideX(c, e, 0.79), 0.37, 0.44, 0.26, s, zw, 5))
  }
  return out
}

/** The door positions (car x of the door centres), nose ends have their first door further inside. */
function doorsOf(c: CarCtx): number[] {
  const hl = c.len / 2
  return [-hl + (c.nR > 0 ? DOOR_NOSE : DOOR_JOINT), hl - (c.nF > 0 ? DOOR_NOSE : DOOR_JOINT)]
}

function windowRow(c: CarCtx, zones: [number, number][], y0: number, y1: number, pitch: number, gap: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  for (const s of [-1, 1]) {
    for (const [a, b] of zones) {
      const len = b - a
      if (len < pitch * 0.8) continue
      const n = Math.max(1, Math.round((len + gap) / (pitch + gap)))
      const w = (len - gap * (n - 1)) / n
      for (let k = 0; k < n; k++) {
        const cx = a + k * (w + gap) + w / 2
        out.push(box(w + 0.008, y1 - y0 + 0.008, 0.003, cx, (y0 + y1) / 2, s * (zw + 0.0016), INK))
        out.push(box(w, y1 - y0, 0.0036, cx, (y0 + y1) / 2, s * (zw + 0.0028), GLASS))
      }
    }
  }
  return out
}

function door(c: CarCtx, cx: number, s: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  const z = (d: number) => s * (zw + d)
  const y0 = 0.04
  const y1 = 0.285
  const cy = (y0 + y1) / 2
  out.push(box(DOOR_W + 0.01, y1 - y0 + 0.008, 0.004, cx, cy, z(0.002), '#1c2025'))
  for (const sl of [-1, 1]) {
    const lx = cx + sl * (DOOR_W / 4 + 0.001)
    out.push(box(DOOR_W / 2 - 0.004, y1 - y0 - 0.004, 0.0045, lx, cy, z(0.0026), '#e4e6e9'))
    out.push(box(0.02, 0.145, 0.005, lx, 0.163, z(0.0031), GLASS))
  }
  out.push(box(DOOR_W - 0.012, 0.02, 0.0052, cx, 0.263, z(0.0033), '#f1c41b'))
  out.push(box(0.003, y1 - y0, 0.005, cx, cy, z(0.0034), '#2a2f35'))
  return out
}

/** Jakobs bogie: frame, motors, two axles with wheels on the rails (rails stand 0.085 either side of the centre line). */
function bogie(bx: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  out.push(box(0.1, 0.05, 0.09, bx, -0.034, 0, '#2b3137'))
  out.push(box(0.05, 0.02, 0.19, bx, -0.022, 0, '#1b1f24'))
  for (const dx of [-0.115, 0.115]) {
    out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
    out.push(box(0.05, 0.036, 0.07, bx + dx * 0.6, -0.03, 0, '#262b31'))
    for (const sz of [-1, 1]) {
      out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#4c545e', 14))
      out.push(cylZ(0.022, 0.02, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
      out.push(cylZ(0.024, 0.008, bx + dx, -0.027, sz * 0.045, '#5a626c', 10))
      out.push(cylZ(0.007, 0.014, bx + dx, -0.01, sz * 0.1, '#7a838e', 6))
    }
  }
  for (const sz of [-1, 1]) out.push(box(0.3, 0.014, 0.014, bx, -0.02, sz * 0.1, '#1e2328'))
  return out
}

export const regKiss: ModelDef = {
  sign: kissSign,
  logo: kissLogo,
  lamp: kissLamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    const hl = c.len / 2
    out.push(box(c.len * 0.84, 0.02, c.w * 0.74, 0, -0.012, 0, '#252a30'))
    out.push(box(c.len * 0.18, 0.05, c.w * 0.5, -c.len * 0.09, -0.032, 0, '#343a42'))
    out.push(box(c.len * 0.12, 0.045, c.w * 0.44, c.len * 0.12, -0.03, 0, '#2d333a'))
    out.push(cylX(0.018, c.len * 0.14, c.len * 0.02, -0.048, 0.07, '#3a4149'))
    const gap = c.spec.gap
    const bogies: number[] = []
    if (c.nF > 0) bogies.push(hl - 0.55)
    if (c.nR > 0) bogies.push(-(hl - 0.55))
    else bogies.push(-hl - gap / 2)
    for (const bx of bogies) out.push(...bogie(bx))
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const hl = c.len / 2
    const zw = c.w / 2
    const gap = c.spec.gap
    // stripe over the white body
    out.push(...stripe(c))
    // windows
    const doors = doorsOf(c)
    const lower: [number, number][] = []
    for (let i = 0; i < doors.length - 1; i++) lower.push([doors[i] + DOOR_W / 2 + 0.05, doors[i + 1] - DOOR_W / 2 - 0.05])
    out.push(...windowRow(c, lower, 0.13, 0.215, 0.095, 0.035))
    const upper: [number, number][] = [[-hl + (c.nR > 0 ? 1.0 : 0.13), hl - (c.nF > 0 ? 1.0 : 0.13)]]
    out.push(...windowRow(c, upper, 0.358, 0.448, 0.125, 0.03))
    // doors
    for (const dx of doors) for (const s of [-1, 1]) out.push(...door(c, dx, s))
    // nose ends
    for (const e of [1, -1] as const) {
      if ((e > 0 ? c.nF : c.nR) <= 0) continue
      out.push(...cheek(c, e), ...hood(c, e), ...cabSide(c, e))
    }
    // wheel arches, dark recesses in the lower body over the bogies
    const arches: [number, number][] = []
    if (c.nF > 0) arches.push([hl - 0.55 - 0.15, hl - 0.55 + 0.15])
    if (c.nR > 0) arches.push([-(hl - 0.55) - 0.15, -(hl - 0.55) + 0.15])
    else arches.push([-hl, -hl + 0.15 - gap / 2])
    for (const [a, b] of arches) for (const s of [-1, 1]) out.push(box(b - a, 0.05, 0.004, (a + b) / 2, 0.026, s * (zw + 0.0015), '#22262b'))

    // roof: air conditioning units, the pantograph on the middle car, antennas
    for (const f of [-0.27, 0.27]) {
      out.push(box(c.len * 0.17, 0.014, 0.15, c.len * f, c.h + 0.003, 0, '#bfc4ca'))
      for (const k of [-1, 0, 1]) out.push(box(c.len * 0.13, 0.004, 0.012, c.len * f, c.h + 0.011, k * 0.045, '#8d949c'))
    }
    if (c.role === 'mid' || c.role === 'single' || (c.role === 'head' && c.spec.lens.length < 3)) {
      const px = c.role === 'head' ? -c.len * 0.1 : 0
      const y = c.h
      out.push(box(0.26, 0.01, 0.16, px, y + 0.004, 0, '#3a424b'))
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(cylX(0.008, 0.026, px + sx * 0.09, y + 0.02, sz * 0.06, '#c9ced5', 8))
      out.push(box(0.2, 0.01, 0.13, px, y + 0.036, 0, '#2a313b'))
      const k = px + 0.05
      out.push(bar(px - 0.08, y + 0.045, k, y + 0.13, 0, 0.009, 0.016, '#8f97a1'))
      out.push(bar(k, y + 0.13, px - 0.06, y + 0.23, 0, 0.008, 0.014, '#8f97a1'))
      out.push(bar(px - 0.06, y + 0.042, px - 0.02, y + 0.16, 0.05, 0.004, 0.006, '#6d757f'))
      out.push(box(0.03, 0.008, 0.2, px - 0.06, y + 0.236, 0, '#d7dce2'))
      out.push(box(0.016, 0.005, 0.2, px - 0.06, y + 0.242, 0, '#1b2026'))
    }
    for (const e of [1, -1] as const) if ((e > 0 ? c.nF : c.nR) > 0) out.push(box(0.05, 0.02, 0.006, e * (hl - 0.8), c.h + 0.008, 0.04, '#e3e6ea', 0, 0))
    // articulation: dark bellows with ribs between this car and the next one behind it
    if (c.nR <= 0) {
      const bx = -hl - gap / 2
      out.push(box(gap + 0.014, c.h * 0.93, c.w * 0.9, bx, c.h * 0.48, 0, '#272b30'))
      for (const k of [-0.3, 0, 0.3]) out.push(box(gap + 0.02, c.h * 0.93 + 0.004, 0.006, bx, c.h * 0.48, k * c.w, '#1a1d21'))
      out.push(box(gap + 0.02, 0.012, c.w * 0.5, bx, c.h * 0.96 + 0.004, 0, '#9aa1a9'))
    }

    if (c.nF > 0) out.push(...endFace(c, false))
    if (c.nR > 0) out.push(...toRear(endFace(c, true)))
    return out
  },
}
