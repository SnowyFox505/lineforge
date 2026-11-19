import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * DB ICE 1 (class 401, photos "ICE / ICE 1"): white body, a broad red stripe (the line colour) over a thin light-grey line, a grey
 * skirt, a long blunt nose whose sloped windscreen runs down the roof curve, round head lights with the grille between them and
 * the coupler flap and apron below. The red stripe sweeps down over the nose to the apron. Power cars have small separate
 * windows, a cab door, the big "ICE" letters and a single-arm pantograph; the middle cars have two doors and a row of large
 * windows. The destination display sits in a small visor on the roof curve above the windscreen.
 */

// the shell of this model (style `fernverkehrice1` in vehicles3d.tsx); the windscreen is laid onto the roof curve of the nose
const NOSE = 0.95
const DROP = 0.42
const NARROW = 0.28
const POW = 1.35
const ROOF_ROUND = 0.16
const STEPS = 7
/** where the windscreen starts, as a share of the nose */
const TA = 1 / STEPS

const GLASS_WS = '#0f151c'
const RIM = '#1a2128'
const WHITE_DOOR = '#e3e6ea'
const GREY_LETTER = '#bfc5cc'
const ROOF_A = '#c4c9d0'
const ROOF_B = '#a6adb7'
const SKIRT = '#4d5763'

const ARC = [Math.PI, (5 * Math.PI) / 6, (2 * Math.PI) / 3, Math.PI / 2]

interface Dims {
  h: number
  w: number
}
interface RoofPt {
  p: THREE.Vector3
  n: THREE.Vector3
}

/** The eight vertices of the roof arc of the shell at position t (0..1) along the nose: left wall top ... right wall top. */
function ringAt(d: Dims, t: number) {
  const top = d.h * (1 - DROP * t ** POW)
  const wf = 1 - NARROW * t * t
  const hw = (d.w / 2) * wf
  const rr = Math.min(ROOF_ROUND * d.w * wf, top * 0.4)
  const left = ARC.map((th) => ({ y: top - rr + rr * Math.sin(th), z: -hw + rr + rr * Math.cos(th), ny: Math.sin(th), nz: Math.cos(th) }))
  const right = left.map((p) => ({ y: p.y, z: -p.z, ny: p.ny, nz: -p.nz })).reverse()
  return [...left, ...right]
}

/** A point on the roof curve of the nose (exactly on the shell's faces): t along the nose, j across (0 = left wall top, 3.5 = middle, 7 = right wall top). */
function roofPt(d: Dims, hl: number, t: number, j: number): RoofPt {
  const k = Math.min(t * STEPS, STEPS - 1e-9)
  const k0 = Math.floor(k)
  const f = k - k0
  const j0 = Math.min(Math.floor(j), 6)
  const jf = j - j0
  const at = (r: ReturnType<typeof ringAt>) => {
    const a = r[j0]
    const b = r[j0 + 1]
    return { y: a.y + (b.y - a.y) * jf, z: a.z + (b.z - a.z) * jf, ny: a.ny + (b.ny - a.ny) * jf, nz: a.nz + (b.nz - a.nz) * jf }
  }
  const a = at(ringAt(d, k0 / STEPS))
  const b = at(ringAt(d, (k0 + 1) / STEPS))
  const x = hl - NOSE + NOSE * t
  const n = new THREE.Vector3(0, a.ny + (b.ny - a.ny) * f, a.nz + (b.nz - a.nz) * f).normalize()
  return { p: new THREE.Vector3(x, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f), n }
}

type Hint = [number, number, number]

/** Collects quads (four points in order) with a hint for which side is outside, turns them into one flat-shaded piece. */
class Quads {
  private pos: number[] = []
  add(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hint: Hint) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
    const flip = n.x * hint[0] + n.y * hint[1] + n.z * hint[2] < 0
    const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) => this.pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z)
    if (flip) {
      tri(a, c, b)
      tri(a, d, c)
    } else {
      tri(a, b, c)
      tri(a, c, d)
    }
  }
  geo(hex: string): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3))
    g.computeVertexNormals()
    return paint(g, hex)
  }
}

/** A patch of the roof curve of the nose: rows of t, columns of j, lifted off the surface by `lift` along its normal. */
function roofPatch(d: Dims, hl: number, ts: number[], js: number[], lift: number, hex: string): THREE.BufferGeometry {
  const rows = ts.map((t) => js.map((j) => {
    const r = roofPt(d, hl, t, j)
    return r.p.addScaledVector(r.n, lift)
  }))
  const q = new Quads()
  for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < js.length - 1; c++) q.add(rows[r][c], rows[r + 1][c], rows[r + 1][c + 1], rows[r][c + 1], [0.2, 1, 0])
  return q.geo(hex)
}

/** A solid vertical cylinder (insulators, vents). */
function cylY(r: number, len: number, x: number, y: number, z: number, hex: string, seg = 10): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg).toNonIndexed()
  g.deleteAttribute('uv')
  g.translate(x, y, z)
  return paint(g, hex)
}

/** A thin bar between two points in the x-y plane (pantograph arms). */
function bar(x0: number, y0: number, x1: number, y1: number, z: number, t: number, dz: number, hex: string): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, y1 - y0)
  return box(len, t, dz, (x0 + x1) / 2, (y0 + y1) / 2, z, hex, Math.atan2(y1 - y0, x1 - x0))
}

/** A flat polygon (u along the car, v up) on a side wall, standing `depth` proud of it. */
function sidePoly(pts: [number, number][], z: number, depth: number, hex: string): THREE.BufferGeometry {
  const s = new THREE.Shape()
  pts.forEach(([u, v], i) => (i ? s.lineTo(u, v) : s.moveTo(u, v)))
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false })
  g.translate(0, 0, z)
  g.deleteAttribute('uv')
  return paint(g, hex)
}

const frontH = (m: FrontMetrics) => m.capTop / (1 - DROP)
const apexX = -NOSE + NOSE * TA

export const ice1Sign = (m: FrontMetrics) => {
  const h = frontH(m)
  return { y: h * (1 - DROP * TA ** POW) + 0.0115, w: 0.125, h: 0.02, x: apexX + 0.0024 }
}
export const ice1Logo = (m: FrontMetrics) => ({ y: 0.053, z: -m.capHW * 0.72, w: 0.036, h: 0.02, x: 0.0098 })
export const ice1Lamp = (m: FrontMetrics) => ({ y: 0.105, z: m.capHW * 0.64, w: 0.034, h: 0.034, round: true })

/** The red stripe (and the grey line under it) that follows the nose down to the apron: wall of the nose, front face, other wall. */
function noseStripes(c: CarCtx, rear: boolean): THREE.BufferGeometry[] {
  const hl = c.len / 2
  const k = c.h
  const path: { x: number; z: number; tt: number; eps: number }[] = []
  const hwAt = (tt: number) => (c.w / 2) * (1 - NARROW * tt * tt)
  for (let i = 0; i <= STEPS; i++) path.push({ x: hl - NOSE + (NOSE * i) / STEPS, z: -hwAt(i / STEPS), tt: i / STEPS, eps: i === 0 ? 0 : 0.0024 })
  path.push({ x: hl, z: c.capHW, tt: 1, eps: 0.0024 })
  for (let i = STEPS - 1; i >= 0; i--) path.push({ x: hl - NOSE + (NOSE * i) / STEPS, z: hwAt(i / STEPS), tt: i / STEPS, eps: i === 0 ? 0 : 0.0024 })
  // outward normals of the segments in plan (x, z)
  const nrm = path.slice(0, -1).map((p, i) => {
    const q = path[i + 1]
    const dx = q.x - p.x
    const dz = q.z - p.z
    const l = Math.hypot(dx, dz) || 1
    return [dz / l, -dx / l] as [number, number]
  })
  const off = path.map((p, i) => {
    const a = nrm[Math.max(0, i - 1)]
    const b = nrm[Math.min(nrm.length - 1, i)]
    const nx = a[0] + b[0]
    const nz = a[1] + b[1]
    const l = Math.hypot(nx, nz) || 1
    return { x: p.x + (nx / l) * p.eps, z: p.z + (nz / l) * p.eps }
  })
  const ease = (tt: number) => tt ** 1.7
  const lo = (tt: number) => 0.17 * k + (0.034 - 0.17 * k) * ease(tt)
  const hi = (tt: number) => 0.3 * k + (0.072 - 0.3 * k) * ease(tt)
  const red = new Quads()
  const line = new Quads()
  for (let i = 0; i < path.length - 1; i++) {
    const a = off[i]
    const b = off[i + 1]
    const ta = path[i].tt
    const tb = path[i + 1].tt
    const hint: Hint = [nrm[i][0], 0, nrm[i][1]]
    red.add(new THREE.Vector3(a.x, lo(ta), a.z), new THREE.Vector3(a.x, hi(ta), a.z), new THREE.Vector3(b.x, hi(tb), b.z), new THREE.Vector3(b.x, lo(tb), b.z), hint)
    const wa = 0.0105 * (1 - ta)
    const wb = 0.0105 * (1 - tb)
    if (wa > 0.0006 || wb > 0.0006) line.add(new THREE.Vector3(a.x, lo(ta) - wa, a.z), new THREE.Vector3(a.x, lo(ta), a.z), new THREE.Vector3(b.x, lo(tb), b.z), new THREE.Vector3(b.x, lo(tb) - wb, b.z), hint)
  }
  const out = [red.geo(c.line), line.geo('#b8c0cb')]
  // the DB logo sits on a white plate on the stripe (the red logo itself is the decal, see `logo`)
  const lz = (rear ? 1 : -1) * c.capHW * 0.72
  out.push(frontPlate(0.042, 0.027, 0.004, hl + 0.0034, 0.053, lz, 0.0042, '#f6f7f8'))
  return out
}

/** Windscreen, wipers, visor and everything on the front face of a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx, rear: boolean): THREE.BufferGeometry[] {
  const hl = c.len / 2
  const d: Dims = { h: c.h, w: c.w }
  const parts: THREE.BufferGeometry[] = []
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const lamp = ice1Lamp(m)

  parts.push(...noseStripes(c, rear))

  // windscreen: dark frame and a big dark pane following the roof curve, with two faint reflections
  const tsRim = [TA, TA + 0.05, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7, 1]
  const tsGlass = [TA + 0.03, TA + 0.07, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7, 1]
  parts.push(roofPatch(d, hl, tsRim, [1.55, 2, 3, 4, 5, 5.45], 0.0022, RIM))
  parts.push(roofPatch(d, hl, tsGlass, [2, 2.5, 3, 3.5, 4, 4.5, 5], 0.0034, GLASS_WS))
  for (const [j0, j1] of [
    [2.25, 2.75],
    [3.35, 3.5],
  ]) {
    const rows = [0.3, 0.45, 0.6, 0.75, 0.9]
    const q = new Quads()
    const pt = (t: number, j: number, lift: number) => {
      const r = roofPt(d, hl, t, j)
      return r.p.addScaledVector(r.n, lift)
    }
    for (let i = 0; i < rows.length - 1; i++) {
      const s0 = (rows[i] - 0.3) * 0.6
      const s1 = (rows[i + 1] - 0.3) * 0.6
      q.add(pt(rows[i], j0 + s0, 0.0041), pt(rows[i + 1], j0 + s1, 0.0041), pt(rows[i + 1], j1 + s1, 0.0041), pt(rows[i], j1 + s0, 0.0041), [0.2, 1, 0])
    }
    parts.push(q.geo('#1c2b3a'))
  }
  // wipers parked across the lower edge of the pane
  {
    const t = 0.93
    const a = roofPt(d, hl, t, 3.5)
    const b = roofPt(d, hl, 1, 3.5)
    const slope = Math.atan2(b.p.y - a.p.y, b.p.x - a.p.x)
    for (const [zc, len] of [
      [-0.045, 0.092],
      [0.052, 0.082],
    ]) {
      parts.push(box(0.005, 0.0028, len, a.p.x + 0.002, a.p.y + 0.0054, zc, '#050607', slope))
      parts.push(box(0.003, 0.0034, 0.008, a.p.x + 0.002, a.p.y + 0.0056, zc > 0 ? zc + len / 2 - 0.006 : zc + len / 2 - 0.006, '#14181c', slope))
    }
  }

  // visor on the roof curve above the windscreen: it holds the destination display (the sign plane is drawn by CarMesh)
  if (!rear) {
    const sg = ice1Sign(m)
    const xa = hl + apexX
    const ya = sg.y - 0.0115
    parts.push(box(0.045, 0.036, 0.158, xa - 0.0225, ya + 0.008, 0, '#d4d9df'))
    parts.push(box(0.045, 0.004, 0.14, xa - 0.0225, ya + 0.0275, 0, '#bcc2ca'))
    parts.push(frontPlate(sg.w + 0.01, sg.h + 0.008, 0.005, xa, sg.y, 0, 0.0012, '#05070a'))
  }

  // centre marker lamp under the windscreen
  parts.push(box(0.004, 0.012, 0.03, hl + 0.002, c.capTop - 0.03, 0, '#fdf6df'))
  parts.push(box(0.0025, 0.016, 0.036, hl + 0.001, c.capTop - 0.03, 0, '#2a3037'))

  // head lights (the lit lamps themselves are separate meshes, see CarMesh): black ring and a chrome rim
  for (const sz of [-1, 1]) {
    parts.push(cylX(lamp.w * 0.5 + 0.0065, 0.008, hl + 0.004, lamp.y, sz * lamp.z, '#06080a', 18))
    parts.push(cylX(lamp.w * 0.5 + 0.0035, 0.0092, hl + 0.0046, lamp.y, sz * lamp.z, '#8c949e', 18))
  }
  // grille between the lights, with slats
  parts.push(frontPlate(0.066, 0.03, 0.006, hl, lamp.y, 0, 0.0066, '#171b20'))
  for (let k = 0; k < 4; k++) parts.push(box(0.003, 0.0026, 0.056, hl + 0.0074, lamp.y - 0.0105 + k * 0.007, 0, '#59616b'))
  // grilles beside the lights low on the nose
  for (const sz of [-1, 1]) parts.push(frontPlate(0.022, 0.012, 0.004, hl, lamp.y, sz * (lamp.z + 0.03), 0.004, '#1a1e23'))

  // coupler flap in the middle of the stripe: grey seam, hinge and handle
  const fz = 0.046
  parts.push(box(0.0035, 0.0026, fz * 2, hl + 0.0036, 0.0295, 0, '#7b838d'))
  parts.push(box(0.0035, 0.0026, fz * 2, hl + 0.0036, 0.0765, 0, '#7b838d'))
  for (const sz of [-1, 1]) parts.push(box(0.0035, 0.049, 0.0026, hl + 0.0036, 0.053, sz * fz, '#7b838d'))
  parts.push(box(0.004, 0.006, 0.02, hl + 0.0042, 0.0555, 0, '#2a3037'))
  parts.push(cylX(0.0045, 0.006, hl + 0.005, 0.0555, 0.026, '#9aa1aa', 8))
  parts.push(cylX(0.0045, 0.006, hl + 0.005, 0.0555, -0.026, '#9aa1aa', 8))

  // apron (dark nose skirt), rail guards and air hoses
  parts.push(box(0.026, 0.026, c.capHW * 2 * 0.97, hl + 0.003, 0.014, 0, '#3a424b'))
  parts.push(box(0.012, 0.01, c.capHW * 2 * 0.8, hl + 0.014, 0.0085, 0, '#262b32'))
  for (const sz of [-1, 1]) {
    parts.push(box(0.03, 0.03, 0.006, hl + 0.01, -0.012, sz * 0.078, '#1a1e23', 0.5))
    parts.push(cylX(0.0045, 0.022, hl + 0.016, 0.026, sz * 0.058, '#d7b52a', 6))
  }
  return parts
}

/** The flexible gangway between two cars: a dark rubber frame reaching to the middle of the gap. Built facing +x at x = len / 2. */
function gangway(c: CarCtx): THREE.BufferGeometry[] {
  const gap = c.spec.gap
  const out: THREE.BufferGeometry[] = []
  const x = c.len / 2 - 0.005
  out.push(frontPlate(c.w * 0.93, c.h * 0.82, 0.07, x, c.h * 0.47, 0, gap / 2 + 0.005, '#2b3138'))
  out.push(frontPlate(c.w * 0.86, c.h * 0.74, 0.06, x + 0.0009, c.h * 0.47, 0, gap / 2 + 0.0055, '#1b2026'))
  // a pale roof cover over the bellows
  out.push(box(gap / 2 + 0.005, 0.008, c.w * 0.5, x + (gap / 2 + 0.005) / 2, c.h * 0.885, 0, '#9aa2ac'))
  return out
}

/** A window: dark rim and a glass pane, proud of the wall. */
function windowAt(c: CarCtx, x0: number, x1: number, y0: number, y1: number, s: number): THREE.BufferGeometry[] {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const zw = c.w / 2
  return [box(x1 - x0 + 0.007, y1 - y0 + 0.007, 0.005, cx, cy, s * (zw + 0.001), RIM), box(x1 - x0, y1 - y0, 0.0065, cx, cy, s * (zw + 0.0016), GLASS)]
}

/** A passenger door: seams, a slightly proud white leaf over the stripe, a small window, the handle and a door button. */
function doorAt(c: CarCtx, cx: number, w: number, s: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  const h = c.h
  for (const dx of [-1, 1]) out.push(box(0.0035, h * 0.78, 0.004, cx + (dx * w) / 2, h * 0.49, s * (zw + 0.001), '#7e8791'))
  out.push(box(w - 0.004, h * 0.58, 0.004, cx, h * 0.58, s * (zw + 0.0012), WHITE_DOOR))
  out.push(box(w, 0.006, 0.005, cx, h * 0.88, s * (zw + 0.0013), '#79828c'))
  out.push(...windowAt(c, cx - w * 0.28, cx + w * 0.28, h * 0.5, h * 0.8, s))
  out.push(box(0.006, h * 0.18, 0.006, cx + w * 0.4, h * 0.46, s * (zw + 0.002), '#9aa2ac'))
  out.push(box(0.01, 0.014, 0.005, cx + w * 0.62 + 0.01, h * 0.42, s * (zw + 0.0016), '#35a04a'))
  // lower recess: step lamp strip
  out.push(box(w * 0.7, 0.006, 0.004, cx, h * 0.095, s * (zw + 0.0012), '#2a3037'))
  return out
}

/** The big "ICE" letters in light grey (reading left to right as seen from the outside). */
function iceLetters(c: CarCtx, cx: number, s: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  const y0 = 0.178
  const ht = 0.112
  const st = 0.0155
  const seg = (u0: number, u1: number, v0: number, v1: number) =>
    out.push(box(Math.abs(u1 - u0), v1 - v0, 0.0035, cx + (s * (u0 + u1)) / 2, y0 + (v0 + v1) / 2, s * (zw + 0.0016), GREY_LETTER))
  // I
  seg(-0.088, -0.088 + st, 0, ht)
  // C
  const c0 = -0.052
  const cw = 0.056
  seg(c0, c0 + st, 0, ht)
  seg(c0, c0 + cw, ht - st, ht)
  seg(c0, c0 + cw, 0, st)
  seg(c0 + cw - st, c0 + cw, ht - 0.03, ht)
  seg(c0 + cw - st, c0 + cw, 0, 0.03)
  // E
  const e0 = 0.022
  const ew = 0.052
  seg(e0, e0 + st, 0, ht)
  seg(e0, e0 + ew, ht - st, ht)
  seg(e0, e0 + ew, 0, st)
  seg(e0, e0 + ew * 0.86, ht / 2 - st / 2, ht / 2 + st / 2)
  return out
}

/** Side of a power car (nose towards +x): cab window, windows, cab door, "ICE" letters and number plate. */
function powerSide(c: CarCtx, s: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  const h = c.h
  const r = (v: number) => -c.len / 2 + v // distance from the rear end of the car
  const y0 = h * 0.54
  const y1 = h * 0.8
  // two small windows at the rear
  out.push(...windowAt(c, r(0.17), r(0.235), y0, y1, s), ...windowAt(c, r(0.25), r(0.315), y0, y1, s))
  // "ICE" and the number plate on the stripe
  out.push(...iceLetters(c, r(0.62), s))
  out.push(box(0.04, 0.0185, 0.004, r(0.4), h * 0.235, s * (zw + 0.0012), '#f3f4f6'))
  out.push(box(0.03, 0.006, 0.0045, r(0.4), h * 0.235, s * (zw + 0.0014), '#59616b'))
  // cab door: seams, white leaf, handle, a small window
  const dc = r(0.905)
  const dw = 0.125
  for (const dx of [-1, 1]) out.push(box(0.0035, h * 0.78, 0.004, dc + (dx * dw) / 2, h * 0.49, s * (zw + 0.001), '#7e8791'))
  out.push(box(dw - 0.004, h * 0.58, 0.004, dc, h * 0.58, s * (zw + 0.0012), WHITE_DOOR))
  out.push(box(dw, 0.006, 0.005, dc, h * 0.88, s * (zw + 0.0013), '#79828c'))
  out.push(box(0.006, h * 0.2, 0.006, dc + dw * 0.36, h * 0.5, s * (zw + 0.002), '#9aa2ac'))
  out.push(...windowAt(c, dc - 0.026, dc + 0.026, y0, y1, s))
  // two small windows in front of the door
  out.push(...windowAt(c, r(1.0), r(1.07), y0, y1, s), ...windowAt(c, r(1.085), r(1.155), y0, y1, s))
  // the little cab window at the start of the nose: trapezoid, slanted towards the nose
  const xn = r(1.275)
  out.push(sidePoly([[xn - 0.004, y0 - 0.004], [xn + 0.162, y0 - 0.004], [xn + 0.122, y1 + 0.004], [xn - 0.004, y1 + 0.004]], s > 0 ? zw + 0.0005 : -zw - 0.0055, 0.005, RIM))
  out.push(sidePoly([[xn, y0], [xn + 0.156, y0], [xn + 0.118, y1], [xn, y1]], s > 0 ? zw + 0.0012 : -zw - 0.0062, 0.0055, GLASS))
  // vent louvres at the rear on the lower wall
  for (let k = 0; k < 4; k++) out.push(box(0.1, 0.004, 0.004, r(0.26), h * 0.36 + k * 0.0085 - 0.0, s * (zw + 0.0012), '#c9ced4'))
  return out
}

/** Side of a middle car: a door near each end and large windows between them. */
function midSide(c: CarCtx, s: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const h = c.h
  const dx = c.len / 2 - 0.36
  const dw = 0.15
  out.push(...doorAt(c, dx, dw, s), ...doorAt(c, -dx, dw, s))
  const a = -dx + dw / 2 + 0.05
  const b = dx - dw / 2 - 0.05
  const n = Math.max(1, Math.round((b - a + 0.03) / 0.33))
  const w = (b - a - 0.03 * (n - 1)) / n
  for (let i = 0; i < n; i++) out.push(...windowAt(c, a + i * (w + 0.03), a + i * (w + 0.03) + w, h * 0.48, h * 0.8, s))
  // a narrow window at each car end behind the door
  for (const e of [-1, 1]) {
    const xc = e * (dx + dw / 2 + 0.085)
    out.push(...windowAt(c, xc - 0.035, xc + 0.035, h * 0.52, h * 0.8, s))
  }
  return out
}

/** Roof of a power car: pantograph with its insulators, breaker, cable duct and vents (nose towards +x). */
function powerRoof(c: CarCtx): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const h = c.h
  const xp = -c.len / 2 + 0.62
  // base frame, insulators
  out.push(box(0.3, 0.008, 0.17, xp, h + 0.004, 0, '#2a313b'))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(cylY(0.0075, 0.02, xp + sx * 0.1, h + 0.017, sz * 0.06, '#c8cdd4'))
  for (const sz of [-1, 1]) out.push(box(0.23, 0.008, 0.012, xp, h + 0.031, sz * 0.06, '#1d232a'))
  // arms: lower arm up to the knee, upper arm back to the collector
  const kx = xp + 0.07
  const kz = 0.0
  out.push(bar(xp - 0.09, h + 0.04, kx, h + 0.118, kz + 0.025, 0.008, 0.012, '#8e969f'))
  out.push(bar(xp - 0.09, h + 0.04, kx, h + 0.118, kz - 0.025, 0.008, 0.012, '#8e969f'))
  out.push(bar(kx, h + 0.118, xp - 0.07, h + 0.19, 0, 0.0075, 0.014, '#a2a9b2'))
  out.push(bar(xp - 0.03, h + 0.04, xp + 0.03, h + 0.085, 0, 0.004, 0.004, '#59616b'))
  out.push(cylZ(0.006, 0.07, kx, h + 0.118, 0, '#59616b', 8))
  // collector with its two carbon strips and the horns
  out.push(box(0.03, 0.007, 0.235, xp - 0.07, h + 0.194, 0, '#2a313b'))
  out.push(box(0.008, 0.005, 0.22, xp - 0.07 + 0.009, h + 0.2, 0, '#0c0e10'))
  out.push(box(0.008, 0.005, 0.22, xp - 0.07 - 0.009, h + 0.2, 0, '#0c0e10'))
  for (const sz of [-1, 1]) out.push(box(0.03, 0.007, 0.01, xp - 0.07, h + 0.198, sz * 0.12, '#8e969f', 0, 0))
  // main circuit breaker and roof cable duct towards the rear
  out.push(cylY(0.0105, 0.03, xp + 0.22, h + 0.016, 0.03, '#d8dde3'))
  out.push(cylY(0.0125, 0.007, xp + 0.22, h + 0.033, 0.03, '#8e969f'))
  out.push(box(0.2, 0.01, 0.018, xp + 0.12, h + 0.011, -0.045, '#2f353d'))
  out.push(box(c.len * 0.2, 0.01, 0.018, xp - 0.3, h + 0.005, 0, '#59616b'))
  // roof hoods in front of the pantograph
  for (const hx of [-0.13, 0.07]) {
    out.push(box(0.16, 0.014, 0.17, hx, h + 0.004, 0, ROOF_A))
    for (const k of [-2, -1, 0, 1, 2]) out.push(box(0.12, 0.004, 0.009, hx, h + 0.012, k * 0.03, ROOF_B))
  }
  return out
}

/** Roof of a middle car: two air-conditioning modules with grilles, a cable duct, antennas. */
function midRoof(c: CarCtx): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const h = c.h
  for (const f of [-0.62, 0.62]) {
    out.push(box(0.45, 0.012, 0.17, f, h + 0.004, 0, ROOF_A))
    for (const k of [-2, -1, 0, 1, 2]) out.push(box(0.38, 0.004, 0.011, f, h + 0.011, k * 0.032, ROOF_B))
  }
  out.push(box(c.len * 0.44, 0.007, 0.022, 0, h + 0.002, 0, '#aeb5be'))
  out.push(box(0.05, 0.012, 0.03, 0.2, h + 0.006, 0.075, '#c9ced4'))
  out.push(box(0.05, 0.012, 0.03, -0.2, h + 0.006, -0.075, '#c9ced4'))
  return out
}

/** Bogie centres along the car. */
function bogieXs(c: CarCtx): number[] {
  if (c.nF > 0 && c.nR > 0) return [-c.len * 0.3, c.len * 0.3]
  if (c.nF > 0) return [c.len / 2 - c.nF * 0.85, -c.len / 2 + 0.6]
  if (c.nR > 0) return [-c.len / 2 + c.nR * 0.85, c.len / 2 - 0.6]
  return [-c.len * 0.36, c.len * 0.36]
}

export const ice1: ModelDef = {
  sign: ice1Sign,
  logo: ice1Logo,
  lamp: ice1Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    const power = c.nF > 0 || c.nR > 0
    const bxs = bogieXs(c)
    const xa = -c.len / 2 + (c.nR > 0 ? c.nR * 0.85 : 0.12)
    const xb = c.len / 2 - (c.nF > 0 ? c.nF * 0.85 : 0.12)
    out.push(box(xb - xa, 0.04, c.w * 0.68, (xa + xb) / 2, -0.024, 0, '#262c33'))
    // underfloor equipment: transformer / converter boxes, battery boxes, air tanks
    const mid = (bxs[0] + bxs[1]) / 2
    out.push(box(c.len * 0.2, 0.052, c.w * 0.56, mid - 0.1, -0.046, 0, power ? '#343b44' : '#313840'))
    out.push(box(c.len * 0.12, 0.046, c.w * 0.5, mid + c.len * 0.14, -0.043, 0, '#2c3239'))
    out.push(box(c.len * 0.07, 0.04, c.w * 0.44, mid - c.len * 0.2, -0.04, 0, '#3a424b'))
    out.push(cylX(0.019, c.len * 0.15, mid + 0.06, -0.056, 0.07, '#3a4149'))
    out.push(cylX(0.015, c.len * 0.1, mid + 0.08, -0.054, -0.07, '#3a4149'))
    // side skirts between the bogies
    const sk0 = Math.min(...bxs) + 0.25
    const sk1 = Math.max(...bxs) - 0.25
    if (sk1 > sk0) for (const sz of [-1, 1]) out.push(box(sk1 - sk0, 0.04, 0.007, (sk0 + sk1) / 2, -0.02, sz * (c.w / 2 - 0.006), SKIRT))
    // bogies: frame, two axles with wheels on the rails (rails stand 0.085 either side of the centre line), brake discs, springs
    for (const bx of bxs) {
      out.push(box(0.36, 0.022, 0.2, bx, -0.026, 0, '#13171b'))
      out.push(box(0.1, 0.05, 0.09, bx, -0.034, 0, '#2b3137'))
      out.push(box(0.05, 0.02, 0.17, bx, -0.018, 0, '#222830'))
      if (power) {
        // traction motors and gearboxes of the power car
        for (const dx of [-0.075, 0.075]) out.push(cylZ(0.025, 0.1, bx + dx, -0.04, 0, '#262c33', 10))
        for (const dx of [-0.15, 0.15]) for (const sz of [-1, 1]) out.push(box(0.045, 0.036, 0.03, bx + dx, -0.03, sz * 0.045, '#343b44'))
      }
      for (const dx of [-0.15, 0.15]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        out.push(cylZ(0.024, 0.008, bx + dx, -0.027, 0.04, '#5a626c', 10))
        out.push(cylZ(0.024, 0.008, bx + dx, -0.027, -0.04, '#5a626c', 10))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#4c545e', 14))
          out.push(cylZ(0.022, 0.02, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
          out.push(cylZ(0.007, 0.014, bx + dx, -0.012, sz * 0.1, '#6b7580', 6))
        }
      }
      for (const sz of [-1, 1]) {
        out.push(box(0.36, 0.012, 0.012, bx, -0.02, sz * 0.1, '#1e2328'))
        out.push(cylX(0.005, 0.07, bx + 0.08, -0.012, sz * 0.045, '#8a929c', 6))
        out.push(cylX(0.006, 0.05, bx - 0.09, -0.016, sz * 0.085, '#8a929c', 6))
      }
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const frontNose = c.nF > 0
    const rearNose = c.nR > 0
    if (frontNose || rearNose) {
      // a power car is built with its nose towards +x; the one at the rear end is turned round afterwards
      const car: THREE.BufferGeometry[] = []
      const tailOnly = rearNose && !frontNose
      // the nose of this car is `nF` (head) or `nR` (tail) long; both are the model's nose
      const cc: CarCtx = tailOnly ? { ...c, nF: c.nR, nR: 0 } : c
      for (const s of [-1, 1]) car.push(...powerSide(cc, s))
      car.push(...powerRoof(cc))
      car.push(...endFace(cc, tailOnly))
      car.push(...toRear(gangway(cc)))
      if (frontNose && rearNose) car.push(...toRear(endFace(c, true)))
      out.push(...(tailOnly ? toRear(car) : car))
    } else {
      for (const s of [-1, 1]) out.push(...midSide(c, s))
      out.push(...midRoof(c))
      out.push(...gangway(c), ...toRear(gangway(c)))
    }
    return out
  },
}
