import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * DB ICE 3 (class 403 / 406 / 407, Siemens Velaro D; photos "ICE / ICE 3"): white body with a grey-blue lower body, the red stripe
 * (the livery colour) running along the car at a third of the height and swooping down over the nose in a U below the DB logo,
 * one long band of dark tinted windows, white single-leaf doors with a small window, the pointed shark nose with a big flat
 * windscreen that lies on the sloping roof, two head lights beside the logo, the white coupler flap and a dark apron, a grey "ICE"
 * on the side behind the cab and single-arm pantographs on the second and the last-but-one car.
 *
 * The windscreen, cab side window and the stripe on the nose are built on the surface of the shell (`noseSkin` repeats the shell's
 * profile from vehicles3d.tsx, so POW and the style numbers there must stay the same).
 */

/** exponent of the roof drop towards the nose: the same number as `pow` of the style `fernverkehrice3` in vehicles3d.tsx */
const POW = 3

const WHITE = '#f2f4f6'
const LOWER = '#c3cbd5'
const SKIRT = '#68727e'

/** Layout of the front face (heights above the body underside; the face is the plane x = len / 2) */
const FACE = {
  beakBottom: 0.03,
  beakTop: 0.062,
  stripeCentre: 0.075,
  stripeEdge: 0.108,
  logo: 0.106,
  lamp: 0.138,
  marker: 0.178,
}

export const ice3Sign = (m: FrontMetrics) => ({ y: m.capTop - 0.024, w: Math.min(0.12, 2 * m.capHW - 0.034), h: 0.022, x: 0.0122 })
export const ice3Logo = () => ({ y: FACE.logo, z: 0, w: 0.04, h: 0.0225, x: 0.0098 })
export const ice3Lamp = () => ({ y: FACE.lamp, z: 0.056, w: 0.026, h: 0.0125 })

/** The outer skin of the nose, in the frame of the front end (+x forward): the same profile as the shell, so details can lie on it. */
function noseSkin(c: CarCtx) {
  const nose = c.nF > 0 ? c.nF : c.nR
  const hl = c.len / 2
  const drop = 1 - c.capTop / c.h
  const narrow = 1 - c.capHW / (c.w / 2)
  /** t = 0 where the nose starts, 1 at the end face */
  const prof = (t: number) => {
    const top = c.h * (1 - drop * t ** POW)
    const wf = 1 - narrow * t * t
    const hw = (c.w / 2) * wf
    const rr = Math.min(c.roofR * wf, top * 0.4)
    return { top, hw, rr }
  }
  const xOf = (t: number, y: number) => hl - nose + nose * t - c.rake * (y / c.h) * t
  /** a point on the roof / shoulder at lateral position z, `lift` above the skin */
  const roof = (t: number, z: number, lift: number) => {
    const { top, hw, rr } = prof(t)
    const a = Math.min(Math.abs(z), hw)
    const sg = z < 0 ? -1 : 1
    const flat = hw - rr
    let y = top
    let ny = 1
    let nz = 0
    let zz = a
    if (a > flat) {
      const s = Math.min(a - flat, rr * 0.999)
      const k = Math.sqrt(rr * rr - s * s)
      y = top - rr + k
      ny = k / rr
      nz = s / rr
      zz = flat + s
    }
    return new THREE.Vector3(xOf(t, y), y + lift * ny, sg * (zz + lift * nz))
  }
  /** a point on the side wall (y must stay below the roof shoulder) */
  const wall = (t: number, y: number, side: number, lift: number) => {
    const { hw } = prof(t)
    return new THREE.Vector3(xOf(t, y), y, side * (hw + lift))
  }
  return { nose, hl, prof, roof, wall }
}
type Skin = ReturnType<typeof noseSkin>

/** An indexed grid of points turned into a smooth, mergeable mesh facing `outward`. */
function grid(fn: (u: number, s: number) => THREE.Vector3, cols: number, rows: number, outward: THREE.Vector3, hex: string): THREE.BufferGeometry {
  const pos: number[] = []
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const p = fn(i / (cols - 1), j / (rows - 1))
      pos.push(p.x, p.y, p.z)
    }
  }
  const idx: number[] = []
  for (let i = 0; i < cols - 1; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j
      const b = (i + 1) * rows + j
      const c = (i + 1) * rows + j + 1
      const d = i * rows + j + 1
      idx.push(a, b, c, a, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  const nrm = g.attributes.normal
  let dot = 0
  for (let i = 0; i < nrm.count; i++) dot += nrm.getX(i) * outward.x + nrm.getY(i) * outward.y + nrm.getZ(i) * outward.z
  if (dot < 0) {
    for (let k = 0; k < idx.length; k += 3) {
      const t = idx[k + 1]
      idx[k + 1] = idx[k + 2]
      idx[k + 2] = t
    }
    g.setIndex(idx)
    g.computeVertexNormals()
  }
  const ng = g.toNonIndexed()
  g.dispose()
  ng.deleteAttribute('uv')
  return paint(ng, hex)
}

/** A rounded patch lying on the sloping roof of the nose (windscreen): t0..t1 along the nose, `k` of the local half width. */
function roofPatch(S: Skin, t0: number, t1: number, k: number, lift: number, hex: string, n = 3.2): THREE.BufferGeometry {
  const tc = (t0 + t1) / 2
  const ht = (t1 - t0) / 2
  return grid(
    (u01, s) => {
      const u = u01 * 2 - 1
      const v = Math.max(0.05, Math.pow(1 - Math.pow(Math.abs(u), n), 1 / n))
      const t = tc - ht * v + s * 2 * ht * v
      return S.roof(t, u * k * S.prof(t).hw, lift)
    },
    30,
    12,
    new THREE.Vector3(0.5, 0.85, 0),
    hex,
  )
}

/** A thin bar on the roof patch between two (t, z) points; width across it in t. */
function roofBar(S: Skin, t0: number, z0: number, t1: number, z1: number, wt: number, lift: number, hex: string): THREE.BufferGeometry {
  return grid(
    (u, s) => S.roof(t0 + (t1 - t0) * u + (s - 0.5) * wt, z0 + (z1 - z0) * u, lift),
    8,
    2,
    new THREE.Vector3(0.5, 0.85, 0),
    hex,
  )
}

/** The side window of the cab: a dark panel on the wall behind the tip of the nose, its upper edge follows the shoulder. */
function cabWindow(S: Skin, side: number, y0: number, hex: string, lift: number, ta: number, tb: number): THREE.BufferGeometry {
  return grid(
    (u, s) => {
      const t = ta + (tb - ta) * u
      const { top, rr } = S.prof(t)
      // the front edge is slanted: the panel is much shorter towards the tip
      const y1 = Math.min(top - rr - 0.012, y0 + 0.12 - 0.075 * u ** 1.2)
      const y = y0 + s * Math.max(0.012, y1 - y0)
      return S.wall(t, y, side, lift)
    },
    16,
    6,
    new THREE.Vector3(0, 0, side),
    hex,
  )
}

/**
 * The red stripe: along the left wall of the nose, over the face in a U below the logo and back along the right wall.
 * Continues the stripe of the car (centre height `y0`, thickness `th0`).
 */
function noseStripe(S: Skin, c: CarCtx, y0: number, th0: number): THREE.BufferGeometry {
  const hl = S.hl
  const pts: { p: THREE.Vector3; th: number }[] = []
  const thEnd = th0 * 0.72
  const N = 9
  const yAlong = (t: number) => y0 + (FACE.stripeEdge - y0) * (t * t * (3 - 2 * t))
  const thAt = (t: number) => th0 + (thEnd - th0) * t
  const eps = 0.0022
  for (const side of [-1, 1]) {
    const wallPts: { p: THREE.Vector3; th: number }[] = []
    for (let i = 0; i <= N; i++) {
      const t = i / N
      wallPts.push({ p: S.wall(t, yAlong(t), side, eps), th: thAt(t) })
    }
    if (side < 0) pts.push(...wallPts)
    else {
      // across the face first (left to right), then the right wall backwards
      const M = 14
      const yFace = (z: number) => FACE.stripeCentre + (FACE.stripeEdge - FACE.stripeCentre) * (Math.abs(z) / c.capHW) ** 2
      const face = (z: number) => {
        const y = yFace(z)
        return new THREE.Vector3(hl + eps - c.rake * (y / c.h), y, z)
      }
      // the corner of the face
      const yE = FACE.stripeEdge
      pts.push({ p: new THREE.Vector3(hl + eps - c.rake * (yE / c.h), yE, -(c.capHW + eps)), th: thEnd })
      for (let i = 0; i <= M; i++) {
        const z = -c.capHW + (2 * c.capHW * i) / M
        pts.push({ p: face(z), th: thEnd })
      }
      pts.push({ p: new THREE.Vector3(hl + eps - c.rake * (yE / c.h), yE, c.capHW + eps), th: thEnd })
      pts.push(...wallPts.reverse())
    }
  }
  const pos: number[] = []
  const push = (v: THREE.Vector3) => pos.push(v.x, v.y, v.z)
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const at = new THREE.Vector3(a.p.x, a.p.y + a.th / 2, a.p.z)
    const ab = new THREE.Vector3(a.p.x, a.p.y - a.th / 2, a.p.z)
    const bt = new THREE.Vector3(b.p.x, b.p.y + b.th / 2, b.p.z)
    const bb = new THREE.Vector3(b.p.x, b.p.y - b.th / 2, b.p.z)
    push(at)
    push(bt)
    push(ab)
    push(bt)
    push(bb)
    push(ab)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  g.computeVertexNormals()
  return paint(g, c.line)
}

/** Grey "ICE" letters in square block style, reading correctly for a viewer on side `s` (+1: the +z side). */
function iceLetters(x: number, y: number, z: number, s: number, hex: string, scale = 1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const H = 0.034 * scale
  const W = 0.024 * scale
  const T = 0.0058 * scale
  const D = 0.0035
  const gap = 0.011 * scale
  // u runs to the right for the viewer: +x on the +z side, -x on the -z side
  const bar = (u: number, v: number, w: number, h: number) => out.push(box(w, h, D, x + s * u, y + v, z + s * D * 0.5, hex))
  let u = 0
  // I
  bar(u + T / 2, 0, T, H)
  u += T + gap
  // C
  bar(u + T / 2, 0, T, H)
  bar(u + W / 2, H / 2 - T / 2, W, T)
  bar(u + W / 2, -H / 2 + T / 2, W, T)
  u += W + gap
  // E
  bar(u + T / 2, 0, T, H)
  for (const v of [H / 2 - T / 2, 0, -H / 2 + T / 2]) bar(u + W / 2, v, W, T)
  return out
}

/** Everything on the front (or, turned round, the rear) end of a car with a nose. Built facing +x. */
function nose(c: CarCtx): THREE.BufferGeometry[] {
  const S = noseSkin(c)
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const lamp = ice3Lamp()
  const sign = ice3Sign(m)
  const out: THREE.BufferGeometry[] = []

  // windscreen: dark frame, glass with a soft reflection, parked wipers
  out.push(roofPatch(S, 0.56, 0.996, 0.9, 0.0032, '#10161d'))
  out.push(roofPatch(S, 0.585, 0.988, 0.84, 0.0052, '#1c2a38'))
  out.push(roofPatch(S, 0.66, 0.94, 0.3, 0.0058, '#2a3d50', 3.5))
  for (const [z0, z1] of [
    [-0.07, -0.01],
    [0.0, 0.066],
  ]) out.push(roofBar(S, 0.972, z0, 0.88, z1, 0.0105, 0.0066, '#05070a'))
  // thin bright rim above the glass (the roof edge of the screen frame)
  out.push(roofPatch(S, 0.54, 0.558, 0.7, 0.0032, '#cfd5dc', 6))

  // cab side windows and the stripe sweeping down the nose
  for (const side of [-1, 1]) {
    out.push(cabWindow(S, side, 0.234, '#101820', 0.0022, 0.02, 0.34))
    out.push(cabWindow(S, side, 0.24, GLASS, 0.0034, 0.04, 0.32))
  }
  out.push(noseStripe(S, c, c.h * 0.33, c.h * 0.075))

  const face: THREE.BufferGeometry[] = []
  // face: destination display above the lights, head lights with housings, the DB logo recess, a small marker light
  face.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.01, x + 0.0095, sign.y, 0, 0.0015, '#06080a'))
  for (const sz of [-1, 1]) {
    face.push(frontPlate(lamp.w + 0.022, lamp.h + 0.016, 0.009, x + 0.0095, lamp.y, sz * lamp.z, 0.0015, '#0a0d11'))
    face.push(box(0.003, 0.0035, lamp.w + 0.014, x + 0.0098, lamp.y - lamp.h / 2 - 0.0075, sz * lamp.z, '#e9edf1'))
    // second, smaller lamp beside the main one (fog / driving light)
    face.push(cylX(0.0052, 0.004, x + 0.0104, lamp.y, sz * (lamp.z - lamp.w / 2 - 0.011), '#c9d0d8', 10))
  }
  face.push(frontPlate(0.05, 0.03, 0.007, x + 0.0083, FACE.logo, 0, 0.0008, '#0a0d11'))
  face.push(cylX(0.0075, 0.006, x + 0.003, FACE.marker, 0, '#eef2f6', 12))
  face.push(cylX(0.0095, 0.004, x + 0.0018, FACE.marker, 0, '#0a0d11', 12))

  // coupler flap (white, pointed) with its dark gap, and the apron below
  face.push(frontPlate(0.108, 0.04, 0.014, x - 0.0005, (FACE.beakBottom + FACE.beakTop) / 2 + 0.002, 0, 0.011, '#0d1115'))
  face.push(frontPlate(0.098, 0.034, 0.013, x + 0.0, (FACE.beakBottom + FACE.beakTop) / 2 + 0.002, 0, 0.016, '#eceff2'))
  face.push(frontPlate(0.07, 0.024, 0.011, x + 0.0, (FACE.beakBottom + FACE.beakTop) / 2 + 0.002, 0, 0.022, '#e4e8ec'))
  face.push(cylX(0.011, 0.012, x + 0.021, (FACE.beakBottom + FACE.beakTop) / 2 + 0.002, 0, '#9aa2ac', 10))
  face.push(box(0.032, 0.034, c.capHW * 2 * 0.98, x + 0.006, 0.006, 0, '#2a3037'))
  face.push(box(0.03, 0.012, c.capHW * 2 * 0.74, x + 0.02, -0.012, 0, '#1b2026'))
  for (const sz of [-1, 1]) {
    face.push(box(0.034, 0.03, 0.018, x + 0.014, -0.008, sz * c.capHW * 0.82, '#161a1f'))
    // air intakes in the lower corners of the face
    face.push(frontPlate(0.036, 0.018, 0.006, x - 0.001, 0.056, sz * (c.capHW - 0.026), 0.0055, '#15191e'))
    for (const k of [-1, 0, 1]) face.push(box(0.0035, 0.002, 0.03, x + 0.0045, 0.056 + k * 0.0048, sz * (c.capHW - 0.026), '#434b55'))
  }
  // a bright rim on the roof edge of the face, above the display
  face.push(box(0.003, 0.003, 2 * c.capHW * 0.78, x + 0.0012, c.capTop - 0.004, 0, '#cfd5dc'))
  return [...out, ...rakeParts(face, c.rake, c.h)]
}

/** The cab door / grab rails and the nose-side extras that are not part of the end face. */
function noseSide(c: CarCtx): THREE.BufferGeometry[] {
  const S = noseSkin(c)
  const out: THREE.BufferGeometry[] = []
  const t = 0.04
  for (const s of [-1, 1]) {
    const p = S.wall(t, 0.19, s, 0)
    out.push(...iceLetters(p.x, 0.19, p.z + s * 0.0018, s, '#8892a0'))
  }
  return out
}

/** Pantograph (single arm) on the roof, or its folded shape. */
function pantograph(c: CarCtx, px: number, raised: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const y0 = c.h
  const bar = (xa: number, ya: number, xb: number, yb: number, z: number, t: number, d: number, hex: string) =>
    box(Math.hypot(xb - xa, yb - ya), t, d, (xa + xb) / 2, (ya + yb) / 2, z, hex, Math.atan2(yb - ya, xb - xa))
  // base frame on four insulators
  out.push(box(0.2, 0.01, 0.13, px, y0 + 0.0065, 0, '#262c33'))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.0085, 0.0095, 0.02, 8).toNonIndexed()
    g.deleteAttribute('uv')
    g.translate(px + sx * 0.07, y0 + 0.0065 + 0.015, sz * 0.045)
    out.push(paint(g, '#b9885a'))
  }
  out.push(box(0.19, 0.008, 0.115, px, y0 + 0.0345, 0, '#2c333b'))
  if (raised) {
    const bx = px - 0.05
    const kx = px + 0.045
    const hx = px - 0.03
    out.push(bar(bx, y0 + 0.042, kx, y0 + 0.125, 0, 0.008, 0.018, '#aeb5bd'))
    out.push(bar(kx, y0 + 0.125, hx, y0 + 0.205, 0, 0.007, 0.016, '#aeb5bd'))
    // a second, thinner rod parallel to the lower arm and the coupling rod
    out.push(bar(bx + 0.02, y0 + 0.042, kx - 0.002, y0 + 0.105, 0.022, 0.004, 0.006, '#7c848e'))
    out.push(bar(px + 0.055, y0 + 0.042, hx + 0.03, y0 + 0.19, -0.022, 0.004, 0.006, '#7c848e'))
    out.push(cylZ(0.009, 0.026, kx, y0 + 0.125, 0, '#2a3038', 8))
    // collector head: carrier, two carbon strips and the horns
    out.push(box(0.014, 0.008, 0.2, hx, y0 + 0.209, 0, '#c4cad1'))
    for (const dx of [-0.007, 0.007]) out.push(box(0.006, 0.006, 0.17, hx + dx, y0 + 0.216, 0, '#16191d'))
    for (const sz of [-1, 1]) out.push(box(0.012, 0.005, 0.03, hx, y0 + 0.214, sz * 0.105, '#c4cad1', 0, sz * 0.5))
  } else {
    out.push(bar(px - 0.06, y0 + 0.042, px + 0.04, y0 + 0.056, 0, 0.007, 0.018, '#aeb5bd'))
    out.push(bar(px + 0.04, y0 + 0.056, px - 0.06, y0 + 0.064, 0, 0.006, 0.016, '#aeb5bd'))
    out.push(box(0.014, 0.008, 0.2, px - 0.06, y0 + 0.07, 0, '#c4cad1'))
    out.push(box(0.012, 0.005, 0.17, px - 0.06, y0 + 0.076, 0, '#16191d'))
  }
  return out
}

export const ice3: ModelDef = {
  sign: ice3Sign,
  logo: ice3Logo,
  lamp: ice3Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    const hl = c.len / 2
    // pivots: the car overhangs the bogies, more so under a nose
    const bf = c.nF > 0 ? hl - 0.6 : hl - 0.42
    const br = c.nR > 0 ? -hl + 0.6 : -hl + 0.42
    const mid = (bf + br) / 2
    out.push(box(bf - br + 0.2, 0.05, c.w * 0.72, mid, -0.028, 0, '#1f242a'))
    // underfloor equipment: transformer, converters, air tanks, battery boxes
    out.push(box(c.len * 0.2, 0.055, c.w * 0.58, mid - c.len * 0.06, -0.046, 0, '#323a42'))
    out.push(box(c.len * 0.13, 0.05, c.w * 0.5, mid + c.len * 0.1, -0.043, 0, '#2c333b'))
    out.push(box(c.len * 0.07, 0.042, c.w * 0.44, mid + c.len * 0.2, -0.04, 0, '#394049'))
    out.push(cylX(0.021, c.len * 0.16, mid - c.len * 0.02, -0.058, 0.075, '#3b434c'))
    out.push(cylX(0.017, c.len * 0.1, mid + c.len * 0.04, -0.057, -0.075, '#3b434c'))
    // belly of the head car below the cab
    if (c.nF > 0) out.push(box(0.5, 0.04, c.w * 0.5, hl - 0.3, -0.022, 0, '#2a3037'))
    if (c.nR > 0) out.push(box(0.5, 0.04, c.w * 0.5, -hl + 0.3, -0.022, 0, '#2a3037'))

    for (const bx of [bf, br]) {
      // bogie: frame, two motors/gearboxes, brake discs, axles with wheels (rails stand 0.085 either side of the centre line)
      out.push(box(0.31, 0.022, 0.19, bx, -0.026, 0, '#13171b'))
      out.push(box(0.08, 0.048, 0.1, bx, -0.036, 0, '#2b3137'))
      for (const dx of [-0.115, 0.115]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        out.push(box(0.05, 0.035, 0.07, bx + dx * 0.55, -0.034, 0, '#242a31'))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.024, 0.006, bx + dx, -0.027, sz * 0.045, '#59616b', 10))
          out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#4c545e', 14))
          out.push(cylZ(0.022, 0.02, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
          out.push(cylZ(0.0075, 0.014, bx + dx, -0.012, sz * 0.1, '#6b7580', 6))
        }
      }
      for (const sz of [-1, 1]) {
        out.push(box(0.31, 0.012, 0.012, bx, -0.02, sz * 0.1, '#1e2328'))
        out.push(cylX(0.005, 0.08, bx + 0.075, -0.012, sz * 0.05, '#8a929c', 6))
      }
      // the side skirts that cover the upper half of the wheels
      for (const sz of [-1, 1]) out.push(box(0.4, 0.026, 0.006, bx, -0.011, sz * (c.w / 2 - 0.012), SKIRT))
    }
    // long skirts along the underframe: between the bogies and out to the ends
    for (const sz of [-1, 1]) {
      const zs = sz * (c.w / 2 - 0.012)
      const mx0 = br + 0.22
      const mx1 = bf - 0.22
      if (mx1 > mx0) out.push(box(mx1 - mx0, 0.038, 0.006, (mx0 + mx1) / 2, -0.017, zs, '#7b858f'))
      const ex0 = c.nR > 0 ? -hl + 0.35 : -hl + 0.04
      const ex1 = br - 0.22
      if (ex1 > ex0) out.push(box(ex1 - ex0, 0.034, 0.006, (ex0 + ex1) / 2, -0.015, zs, '#7b858f'))
      const fx0 = bf + 0.22
      const fx1 = c.nF > 0 ? hl - 0.35 : hl - 0.04
      if (fx1 > fx0) out.push(box(fx1 - fx0, 0.034, 0.006, (fx0 + fx1) / 2, -0.015, zs, '#7b858f'))
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.47
    const wy1 = c.h * 0.76
    const hl = c.len / 2
    const lastIdx = c.spec.lens.length - 1
    for (const s of [-1, 1] as const) {
      // windows: dark rim and tinted glass pane
      for (const [x0, x1] of c.wins) {
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.01, wy1 - wy0 + 0.01, 0.004, cx, (wy0 + wy1) / 2, s * (zw + 0.001), '#151a20'))
        out.push(box(x1 - x0, wy1 - wy0, 0.006, cx, (wy0 + wy1) / 2, s * (zw + 0.0015), GLASS))
      }
      // doors: grey frame, leaf painted like the body (grey, red stripe, white), small window, seam, button
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        const z = (d: number) => s * (zw + d)
        out.push(box(dw + 0.012, c.h * 0.74, 0.004, cx, c.h * 0.43, z(0.001), '#79828c'))
        out.push(box(dw - 0.004, c.h * 0.22, 0.006, cx, c.h * 0.18, z(0.0018), LOWER))
        out.push(box(dw - 0.004, c.h * 0.08, 0.006, cx, c.h * 0.33, z(0.0018), c.line))
        out.push(box(dw - 0.004, c.h * 0.41, 0.006, cx, c.h * 0.575, z(0.0018), WHITE))
        out.push(box(dw * 0.56, c.h * 0.27, 0.0075, cx + dw * 0.04, c.h * 0.605, z(0.0024), GLASS))
        out.push(box(0.003, c.h * 0.72, 0.0075, cx, c.h * 0.43, z(0.0024), '#3c434b'))
        out.push(box(0.01, 0.015, 0.0065, x1 + 0.012, c.h * 0.46, z(0.0018), '#3f9a4b'))
        out.push(box(0.006, 0.02, 0.0065, x0 + 0.008, c.h * 0.36, z(0.0024), '#9aa2ab'))
      }
    }

    // roof equipment
    const xr0 = c.nR > 0 ? -hl + c.nR : -hl
    const xr1 = c.nF > 0 ? hl - c.nF : hl
    const span = xr1 - xr0
    const panCar = c.index === 1 || c.index === lastIdx - 1
    if (c.role === 'mid' || c.role === 'single') {
      // roof high-voltage line from the pantograph car to the other one
      out.push(box(c.len + 0.02, 0.005, 0.012, 0, c.h + 0.0035, 0, '#323840'))
      for (const f of [0.18, 0.82]) out.push(box(0.012, 0.016, 0.014, xr0 + span * f, c.h + 0.008, 0, '#b9885a'))
    }
    if (panCar && (c.role === 'mid' || c.role === 'single')) {
      const px = xr0 + span * 0.5
      out.push(box(span * 0.46, 0.008, 0.125, px, c.h + 0.003, 0, '#d4d9df'))
      out.push(...pantograph(c, px, c.index === 1))
    } else {
      // air conditioning units flush with the roof: a grille each
      const fs = c.role === 'mid' ? [0.25, 0.75] : [0.3]
      for (const f of fs) {
        const ax = xr0 + span * f
        out.push(box(0.22, 0.008, 0.11, ax, c.h + 0.003, 0, '#cfd4da'))
        for (const k of [-2, -1, 0, 1, 2]) out.push(box(0.17, 0.0035, 0.008, ax, c.h + 0.0085, k * 0.021, '#9aa2ab'))
      }
    }
    // antennas on the roof behind the cab
    if (c.nF > 0 || c.nR > 0) {
      out.push(box(0.05, 0.016, 0.007, xr1 - 0.1, c.h + 0.01, 0, '#d9dde2', -0.3))
      out.push(box(0.022, 0.012, 0.022, xr1 - 0.2, c.h + 0.008, 0.02, '#aab1ba'))
    }

    if (c.nF > 0) out.push(...nose(c), ...noseSide(c))
    if (c.nR > 0) out.push(...toRear([...nose(c), ...noseSide(c)]))
    return out
  },
}
