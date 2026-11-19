import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Deutsche Bahn ICE 4 (class 412/812, photos "ICE / ICE 4"): clean white body, one red stripe low on the side that swoops down on
 * the nose and runs across the front apron, a dark window band, the smooth wedge nose with a big raked windscreen (white
 * frame, wipers parked), vertical LED head lights with a louvre block above, the DB logo between them and a rounded chin with
 * the coupler slot. Flush double-leaf plug doors, light grey roof with air conditioning units, a single-arm pantograph on the
 * middle car, bogies with brake discs. The destination display sits in a thin strip above the windscreen.
 */

const FRAME = '#1b2128'
const SCREEN = '#22323f'
const SCREEN_HI = '#35495a'

/** Side stripe: centre height and thickness on the straight wall; on the front apron. */
const STRIPE_Y = 0.157
const STRIPE_T = 0.027
const FRONT_Y = 0.062
const FRONT_T = 0.034
/** Height and reach of the chin / apron in front of the lower nose. */
const APRON_H = 0.088
const APRON_D = 0.034
const APRON_R = 0.055
/** Layers on the side wall (distance from the shell wall) */
const Z_RIM = 0.0025
const Z_GLASS = 0.0035
const Z_LEAF = 0.003
const Z_STRIPE = 0.0042

const WS_TOP_GAP = 0.04
const WS_H = 0.104

/** Windscreen: bottom, top, centre height, height, widths at the bottom and the top. */
function screen(m: FrontMetrics) {
  const y1 = m.capTop - WS_TOP_GAP
  const y0 = y1 - WS_H
  return { y0, y1, cy: (y0 + y1) / 2, h: WS_H, wb: 2 * m.capHW - 0.02, wt: 2 * m.capHW - 0.052 }
}

export const ice4Sign = (m: FrontMetrics) => ({ y: m.capTop - 0.02, w: Math.min(0.17, 2 * m.capHW * 0.68), h: 0.02, x: 0.0122 })
export const ice4Logo = (m: FrontMetrics) => ({ y: ice4Lamp(m).y + 0.014, z: 0, w: 0.06, h: 0.034, x: 0.0035 })
export const ice4Lamp = (m: FrontMetrics) => ({ y: 0.112, z: m.capHW * 0.6, w: 0.022, h: 0.022, round: true })

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

/** A raised panel of any outline on the front face (like `frontPlate`). */
function frontShape(shape: THREE.Shape, x: number, y: number, z: number, depth: number, hex: string): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 })
  g.rotateY(Math.PI / 2)
  g.translate(x, y, z)
  g.deleteAttribute('uv')
  return paint(g, hex)
}

/** A cylinder standing upright. */
function cylY(r: number, h: number, x: number, y: number, z: number, hex: string, seg = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, seg).toNonIndexed()
  g.deleteAttribute('uv')
  g.translate(x, y, z)
  return paint(g, hex)
}

/** A thin bar between two points in the x-y plane (pantograph arms). */
function bar(x0: number, y0: number, x1: number, y1: number, z: number, t: number, d: number, hex: string): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, y1 - y0)
  return box(len, t, d, (x0 + x1) / 2, (y0 + y1) / 2, z, hex, Math.atan2(y1 - y0, x1 - x0))
}

/** One point of a stripe that follows a path around the nose: plan position, height range, how far into the nose it is (for the rake). */
interface RP {
  x: number
  z: number
  y0: number
  y1: number
  t: number
}

/**
 * A ribbon along a path in plan (a vertical strip with a height range per point). The path runs right rear -> front -> left rear,
 * which makes the faces look outwards. Points are sheared like the nose of the shell (`rake`).
 */
function ribbon(pts: RP[], rake: number, h: number, hex: string): THREE.BufferGeometry {
  const pos: number[] = []
  const v = (p: RP, y: number) => [p.x - (rake * y * p.t) / h, y, p.z]
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    pos.push(...v(a, a.y0), ...v(b, b.y0), ...v(b, b.y1), ...v(a, a.y0), ...v(b, b.y1), ...v(a, a.y1))
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  g.computeVertexNormals()
  return paint(g, hex)
}

/** Move the points of a plan path outwards (to the left of the travelling direction as seen from above) by `d`. */
function offsetPath(path: { x: number; z: number }[], d: number): { x: number; z: number }[] {
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)]
    const b = path[Math.min(path.length - 1, i + 1)]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const l = Math.hypot(dx, dz) || 1
    return { x: p.x - (dz / l) * d, z: p.z + (dx / l) * d }
  })
}

const smooth = (u: number) => {
  const k = Math.min(1, Math.max(0, u))
  return k * k * (3 - 2 * k)
}

/** Shape of the nose in plan, right half (z > 0), at the 7 steps the shell uses; and the narrowing of the end face. */
function noseSteps(c: CarCtx, nose: number) {
  const hl = c.len / 2
  const narrow = 1 - c.capHW / (c.w / 2)
  const out: { x: number; z: number; t: number }[] = []
  for (let k = 0; k < 7; k++) {
    const t = k / 7
    out.push({ x: hl - nose + nose * t, z: (c.w / 2) * (1 - narrow * t * t), t })
  }
  return out
}

/** The red stripe from the right side wall over the nose and the apron to the left side wall. */
function noseStripe(c: CarCtx, nose: number): THREE.BufferGeometry {
  const hl = c.len / 2
  const aw = c.capHW + 0.0005
  const right = noseSteps(c, nose)
  const path: { x: number; z: number }[] = right.map((p) => ({ x: p.x, z: p.z }))
  const meta: { y: number; th: number; t: number }[] = right.map((p) => {
    const s = smooth((p.t - 0.04) / 0.96)
    return { y: STRIPE_Y + (FRONT_Y - STRIPE_Y) * s, th: STRIPE_T + (FRONT_T - STRIPE_T) * s, t: p.t }
  })
  const apron: { x: number; z: number }[] = [{ x: hl, z: aw }]
  const fx = hl + APRON_D
  apron.push({ x: fx - APRON_R, z: aw })
  const Q = 6
  for (let i = 1; i <= Q; i++) {
    const u = i / Q
    apron.push({ x: (1 - u) * (1 - u) * (fx - APRON_R) + 2 * (1 - u) * u * fx + u * u * fx, z: (1 - u) * (1 - u) * aw + 2 * (1 - u) * u * aw + u * u * (aw - APRON_R) })
  }
  const left = apron.map((p) => ({ x: p.x, z: -p.z })).reverse()
  const all = [...path, ...apron, ...left, ...[...right].reverse().map((p) => ({ x: p.x, z: -p.z }))]
  const metaAll = [...meta, ...apron.map(() => ({ y: FRONT_Y, th: FRONT_T, t: 1 })), ...left.map(() => ({ y: FRONT_Y, th: FRONT_T, t: 1 })), ...[...meta].reverse()]
  const off = offsetPath(all, Z_STRIPE)
  const pts: RP[] = off.map((p, i) => ({ x: p.x, z: p.z, y0: metaAll[i].y - metaAll[i].th / 2, y1: metaAll[i].y + metaAll[i].th / 2, t: metaAll[i].t }))
  return ribbon(pts, c.rake, c.h, c.line)
}

/** The windscreen wraps round the corners of the nose: a dark glass strip on each side wall behind the end face. */
function cabGlass(c: CarCtx, nose: number, yLow: number, yHigh: number): THREE.BufferGeometry[] {
  const steps = noseSteps(c, nose)
  const hl = c.len / 2
  const pick = [5, 6].map((k) => steps[k])
  const grow = [0.2, 0.7]
  const right: RP[] = pick.map((p, i) => ({ x: p.x, z: p.z + 0.0025, y0: yLow - 0.004 * i, y1: yLow + (yHigh - yLow) * grow[i] + 0.002, t: p.t }))
  right.push({ x: hl, z: c.capHW + 0.0025, y0: yLow - 0.012, y1: yHigh, t: 1 })
  const left = [...right].reverse().map((p) => ({ ...p, z: -p.z }))
  return [ribbon(right, c.rake, c.h, SCREEN), ribbon(left, c.rake, c.h, SCREEN)]
}

/** The chin: a rounded slab in front of the lower nose. */
function apron(c: CarCtx): THREE.BufferGeometry {
  const hl = c.len / 2
  const aw = c.capHW + 0.0005
  const x0 = hl - 0.04
  const fx = hl + APRON_D
  const s = new THREE.Shape()
  s.moveTo(x0, -aw)
  s.lineTo(fx - APRON_R, -aw)
  s.quadraticCurveTo(fx, -aw, fx, -aw + APRON_R)
  s.lineTo(fx, aw - APRON_R)
  s.quadraticCurveTo(fx, aw, fx - APRON_R, aw)
  s.lineTo(x0, aw)
  s.lineTo(x0, -aw)
  const g = new THREE.ExtrudeGeometry(s, { depth: APRON_H, bevelEnabled: false, curveSegments: 6 })
  g.rotateX(-Math.PI / 2)
  g.deleteAttribute('uv')
  return paint(g, c.body)
}

/** Everything on the front (or, turned round, the rear) end of a car with a nose. Built facing +x at x = len / 2, already leaning with the rake. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const hl = c.len / 2
  const nose = c.nF > 0 ? c.nF : c.nR
  const s = screen(m)
  const lamp = ice4Lamp(m)
  const sign = ice4Sign(m)
  const face: THREE.BufferGeometry[] = []

  // windscreen: dark frame, glass, a couple of reflections
  face.push(frontShape(taper(s.wb, s.wt, s.h, 0.014, 0.045), hl, s.cy, 0, 0.004, FRAME))
  face.push(frontShape(taper(s.wb - 0.014, s.wt - 0.014, s.h - 0.014, 0.011, 0.04), hl + 0.004, s.cy, 0, 0.0025, SCREEN))
  face.push(frontShape(taper(0.05, 0.034, s.h - 0.03, 0.006, 0.006), hl + 0.0065, s.cy, -s.wb * 0.22, 0.0006, SCREEN_HI))
  face.push(frontShape(taper(0.016, 0.01, s.h - 0.03, 0.003, 0.003), hl + 0.0065, s.cy, -s.wb * 0.06, 0.0006, SCREEN_HI))
  // destination display: dark recess in the strip above the glass
  face.push(frontPlate(sign.w + 0.01, sign.h + 0.006, 0.006, hl + 0.0095, sign.y, 0, 0.0015, '#06080a'))
  // wipers parked across the lower edge of the glass
  const a = 1.3
  for (const zp of [-0.085, 0.006]) {
    const L = 0.1
    face.push(box(0.0025, L, 0.0045, hl + 0.0075, s.y0 + 0.022 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#040506', 0, a))
  }

  // head lights: a louvre block above and a light unit below on each side; the lit lamp itself is a separate mesh (see CarMesh)
  for (const sz of [-1, 1]) {
    const z = sz * lamp.z
    face.push(frontPlate(0.04, 0.058, 0.008, hl + 0.0005, lamp.y + 0.01, z, 0.009, '#161b21'))
    face.push(frontPlate(0.036, 0.02, 0.004, hl + 0.0005, lamp.y + 0.05, z, 0.006, '#9aa1aa'))
    for (let k = 0; k < 3; k++) face.push(box(0.003, 0.0024, 0.031, hl + 0.0065, lamp.y + 0.043 + k * 0.0067, z, '#3b424b'))
    // second, smaller light above the main one
    face.push(cylX(0.0075, 0.004, hl + 0.0098, lamp.y + 0.027, z, '#dfe6ec', 10))
  }
  // seam where the front meets the chin
  face.push(box(0.003, 0.003, c.capHW * 2 - 0.008, hl + 0.001, APRON_H + 0.001, 0, '#7e858d'))

  // the chin with its coupler slot and the rail guard below
  face.push(apron(c))
  face.push(box(0.004, 0.04, 0.01, hl + APRON_D + 0.0005, 0.034, 0, '#0b0e12'))
  face.push(box(0.03, 0.026, c.capHW * 1.2, hl + 0.01, -0.012, 0, '#20252b'))

  const out = rakeAll(face, c)
  out.push(noseStripe(c, nose))
  out.push(...cabGlass(c, nose, s.y0 + 0.006, s.y1 - 0.034))
  return out
}

/** Lean the face parts back with the nose (x shifts with height; the chin is part of the face). */
function rakeAll(parts: THREE.BufferGeometry[], c: CarCtx): THREE.BufferGeometry[] {
  if (!c.rake) return parts
  for (const g of parts) {
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) - (c.rake * pos.getY(i)) / c.h)
    pos.needsUpdate = true
  }
  return parts
}

/** Single-arm pantograph on a roof, seen from the side: base on insulators, a lower and an upper arm, the contact strip. */
function pantograph(c: CarCtx, px: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const y = c.h
  out.push(box(0.2, 0.01, 0.15, px, y + 0.005, 0, '#2a313b'))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(cylY(0.007, 0.02, px + sx * 0.065, y + 0.02, sz * 0.055, '#d9dde2', 8))
  out.push(box(0.17, 0.008, 0.12, px, y + 0.034, 0, '#394150'))
  const kx = px - 0.07
  out.push(bar(px + 0.055, y + 0.04, kx, y + 0.1, 0, 0.007, 0.016, '#9aa1aa'))
  out.push(bar(kx, y + 0.1, px + 0.03, y + 0.17, 0, 0.006, 0.014, '#9aa1aa'))
  out.push(box(0.012, 0.01, 0.026, kx, y + 0.1, 0, '#6d747d'))
  // contact strip with the horns
  out.push(box(0.016, 0.005, 0.2, px + 0.03, y + 0.175, 0, '#cfd4da'))
  out.push(box(0.01, 0.004, 0.2, px + 0.03, y + 0.18, 0, '#1b2026'))
  for (const sz of [-1, 1]) out.push(box(0.012, 0.012, 0.006, px + 0.03, y + 0.18, sz * 0.1, '#9aa1aa', 0.5))
  // the cable from the pantograph over the roof
  out.push(box(c.len * 0.6, 0.006, 0.012, px, y + 0.003, 0.05, '#20262d'))
  return out
}

export const ice4: ModelDef = {
  sign: ice4Sign,
  logo: ice4Logo,
  lamp: ice4Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    // floor and the equipment under it: transformer, converters, battery and air tank boxes
    out.push(box(c.len * 0.82, 0.05, c.w * 0.74, 0, -0.03, 0, '#1f242a'))
    // side skirts: between the bogies and from the bogies towards the car ends (not under the nose)
    const sk = (x0: number, x1: number) => {
      for (const sz of [-1, 1]) out.push(box(x1 - x0, 0.034, 0.005, (x0 + x1) / 2, -0.015, sz * (c.w * 0.5 - 0.012), '#b3b9c1'))
    }
    sk(-c.len * 0.3 + 0.17, c.len * 0.3 - 0.17)
    sk(c.nR > 0 ? -c.len / 2 + c.nR * 0.6 : -c.len / 2 + 0.03, -c.len * 0.3 - 0.17)
    sk(c.len * 0.3 + 0.17, c.nF > 0 ? c.len / 2 - c.nF * 0.6 : c.len / 2 - 0.03)
    out.push(box(c.len * 0.17, 0.056, c.w * 0.56, -c.len * 0.11, -0.046, 0, '#313840'))
    out.push(box(c.len * 0.11, 0.05, c.w * 0.48, c.len * 0.1, -0.042, 0, '#2c3239'))
    out.push(box(c.len * 0.06, 0.044, c.w * 0.42, c.len * 0.2, -0.04, 0, '#394049'))
    out.push(cylX(0.02, c.len * 0.15, 0, -0.06, 0.07, '#3a4149'))
    out.push(cylX(0.016, c.len * 0.1, 0, -0.058, -0.07, '#3a4149'))
    // bogies: frame, motor, brake discs, two axles with wheels on the rails (rails stand 0.085 either side of the centre line)
    for (const sx of [-1, 1]) {
      const bx = sx * c.len * 0.3
      out.push(box(0.31, 0.022, 0.2, bx, -0.026, 0, '#13171b'))
      out.push(box(0.1, 0.05, 0.09, bx, -0.034, 0, '#2b3137'))
      out.push(box(0.05, 0.02, 0.17, bx, -0.018, 0, '#222830'))
      for (const dx of [-0.115, 0.115]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        out.push(cylZ(0.024, 0.008, bx + dx, -0.027, 0.04, '#5a626c', 10))
        out.push(cylZ(0.024, 0.008, bx + dx, -0.027, -0.04, '#5a626c', 10))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#4c545e', 12))
          out.push(cylZ(0.022, 0.02, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
          out.push(cylZ(0.007, 0.014, bx + dx, -0.012, sz * 0.1, '#6b7580', 6))
        }
      }
      for (const sz of [-1, 1]) {
        out.push(box(0.31, 0.012, 0.012, bx, -0.02, sz * 0.1, '#1e2328'))
        out.push(cylX(0.005, 0.07, bx + 0.07, -0.012, sz * 0.045, '#8a929c', 6))
      }
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.46
    const wy1 = c.h * 0.77
    const wm = (wy0 + wy1) / 2
    const dy0 = 0.024
    const dy1 = wy1 - 0.002
    const dh = dy1 - dy0
    const dm = (dy0 + dy1) / 2
    const hl = c.len / 2
    const xa = c.nR > 0 ? -hl + c.nR : -hl
    const xb = c.nF > 0 ? hl - c.nF : hl
    for (const s of [-1, 1]) {
      // windows: dark rim, glass pane proud of the wall
      for (const [x0, x1] of c.wins) {
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.008, wy1 - wy0 + 0.008, 0.004, cx, wm, s * (zw + Z_RIM - 0.002), '#12161a'))
        out.push(box(x1 - x0, wy1 - wy0, 0.006, cx, wm, s * (zw + Z_GLASS - 0.003), GLASS))
      }
      // doors: dark seal, two white leaves with a narrow window each, the seam, a push button and a display above
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        out.push(box(dw + 0.006, dh + 0.004, 0.004, cx, dm, s * (zw + Z_LEAF - 0.002), '#46505a'))
        out.push(box(dw, dh, 0.004, cx, dm, s * (zw + Z_LEAF - 0.002 + 0.0005), c.body))
        for (const sl of [-1, 1]) {
          out.push(box(dw * 0.2, 0.165, 0.005, cx + sl * dw * 0.17, 0.262, s * (zw + Z_GLASS - 0.002), GLASS))
          out.push(box(0.006, dh * 0.64, 0.003, cx + sl * dw * 0.4, dm, s * (zw + Z_LEAF - 0.0008), '#c9ced4'))
        }
        out.push(box(0.003, dh * 0.96, 0.004, cx, dm, s * (zw + Z_GLASS - 0.0015), '#1a1f24'))
        out.push(box(0.01, 0.014, 0.006, x1 + 0.014, c.h * 0.4, s * (zw + Z_LEAF - 0.001), '#3f9a4b'))
        out.push(box(dw * 0.5, 0.008, 0.004, cx, wy1 + 0.014, s * (zw + 0.0015), '#161b20'))
      }
      // red stripe along the straight wall, over the doors
      out.push(box(xb - xa, STRIPE_T, 0.002, (xa + xb) / 2, STRIPE_Y, s * (zw + Z_STRIPE - 0.001), c.line))
    }

    // roof: air conditioning units with grilles; the middle car carries the pantograph; head and tail cars a few antennas
    for (const f of [-0.28, 0.2]) {
      out.push(box(c.len * 0.16, 0.012, 0.13, c.len * f, c.h + 0.003, 0, '#aab1ba'))
      out.push(box(c.len * 0.17, 0.006, 0.136, c.len * f, c.h - 0.002, 0, '#858c95'))
      for (const k of [-1, 0, 1]) out.push(box(c.len * 0.12, 0.003, 0.012, c.len * f, c.h + 0.01, k * 0.04, '#6f767f'))
    }
    if (c.role === 'mid' && c.index === Math.floor(c.spec.lens.length / 2)) out.push(...pantograph(c, -c.len * 0.03))
    for (const end of [1, -1] as const) {
      const nose = end > 0 ? c.nF : c.nR
      if (nose <= 0) continue
      out.push(box(0.05, 0.02, 0.006, end * (hl - nose - 0.2), c.h + 0.008, 0, '#d9dde2', -0.35))
      out.push(box(0.035, 0.012, 0.03, end * (hl - nose - 0.38), c.h + 0.006, 0.03, '#2c3239'))
    }

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}

