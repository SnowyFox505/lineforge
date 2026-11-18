import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Munich S-Bahn, the new generation (Siemens ET 1420, photos "S-Bahn Muenchen / Zug 2"): graphite body, light grey lower
 * body with a thin stripe in the line colour, a tall tapered windscreen in a silver frame whose top holds the destination
 * display, white LED head lights low in the frame with the DB logo and the green S between them, ribbed vent blocks and
 * the coupler cover below. Doors: dark double leaves in a silver frame with a small display above, cab door behind the nose.
 * Overhead-line train: one single-arm pantograph on the middle car.
 */

const SILVER = '#bcc2ca'
const SILVER_DARK = '#8f969f'
const GRAPHITE = '#262b32'
const INK = '#0b0e12'

const FRAME_BOTTOM = 0.165
const FRAME_TOP_GAP = 0.03

/** Silver frame of the windscreen: bottom, top, centre height, height, width at the bottom and the top. */
function screen(m: FrontMetrics) {
  const y0 = FRAME_BOTTOM
  const y1 = m.capTop - FRAME_TOP_GAP
  const wb = 2 * m.capHW - 0.008
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, wb, wt: wb * 0.86 }
}

export const sbahnMuc2Sign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 - 0.034, w: s.wt * 0.58, h: 0.027, x: 0.0122 }
}
export const sbahnMuc2Logo = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y0 + 0.019, z: -0.03, w: 0.04, h: 0.0225, x: 0.0098 }
}
export const sbahnMuc2Lamp = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y0 + 0.019, z: 0.1, w: 0.07, h: 0.011 }
}

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
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 5 })
  g.rotateY(Math.PI / 2)
  g.translate(x, y, z)
  g.deleteAttribute('uv') // ExtrudeGeometry is already non-indexed with normals
  return paint(g, hex)
}

/** A thin bar between two points in the x-y plane (pantograph arms). */
function bar(x0: number, y0: number, x1: number, y1: number, z: number, t: number, d: number, hex: string): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, y1 - y0)
  return box(len, t, d, (x0 + x1) / 2, (y0 + y1) / 2, z, hex, Math.atan2(y1 - y0, x1 - x0))
}

/** The green S-Bahn disc with a white S made of bars, standing proud of a plane. `side`: on a side wall (x along the car), else on the front. */
function sBadge(x: number, y: number, z: number, r: number, dir: 1 | -1, side: boolean, disc = true): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const t = 0.0035
  const a = r * (disc ? 0.34 : 0.5) // half width of the S
  const b = r * (disc ? 0.62 : 0.78) // half height
  const bt = r * (disc ? 0.24 : 0.3) // stroke
  if (disc) {
    if (side) out.push(cylZ(r, t, x, y, z + (dir * t) / 2, '#16a24a', 16))
    else out.push(cylX(r, t, x + t / 2, y, z, '#16a24a', 16))
  }
  // the S: a sine curve from top to bottom, drawn as short bars (u across the badge, v up)
  const N = disc ? 10 : 16
  const pt = (i: number): [number, number] => {
    const k = i / N
    return [-a * Math.sin(2 * Math.PI * k), b * (1 - 2 * k)]
  }
  for (let i = 0; i < N; i++) {
    const [u0, v0] = pt(i)
    const [u1, v1] = pt(i + 1)
    const len = Math.hypot(u1 - u0, v1 - v0) + bt * 0.6
    const mu = (u0 + u1) / 2
    const mv = (v0 + v1) / 2
    if (side) out.push(box(len, bt, 0.0015, x + mu * dir, y + mv, z + dir * (t + 0.0008), '#ffffff', Math.atan2(v1 - v0, (u1 - u0) * dir)))
    else out.push(box(0.0015, bt, len, x + t + 0.0008, y + mv, z - mu, '#ffffff', 0, Math.atan2(-(v1 - v0), -(u1 - u0))))
  }
  return out
}

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const s = screen(m)
  const lamp = sbahnMuc2Lamp(m)
  const sign = sbahnMuc2Sign(m)
  const parts: THREE.BufferGeometry[] = []

  // silver frame wrapping the windscreen, a dark glass panel inside it, a deeper recess for the destination display
  parts.push(frontShape(taper(s.wb, s.wt, s.h, 0.02, 0.06), x, s.cy, 0, 0.007, SILVER))
  parts.push(frontShape(taper(s.wb - 0.05, s.wt - 0.058, s.h - 0.062, 0.02, 0.06), x + 0.007, s.cy + 0.002, 0, 0.0025, INK))
  // a faint reflection across the glass
  parts.push(frontShape(taper(0.075, 0.045, s.h - 0.07, 0.008, 0.008), x + 0.0095, s.cy + 0.002, -s.wb * 0.2, 0.0006, '#1b2b39'))
  parts.push(frontShape(taper(0.02, 0.012, s.h - 0.07, 0.004, 0.004), x + 0.0095, s.cy + 0.002, -s.wb * 0.04, 0.0006, '#1b2b39'))
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.01, x + 0.0095, sign.y, 0, 0.0015, '#06080a'))
  // wipers parked across the lower edge of the glass
  const a = 1.3
  for (const zp of [-0.095, 0.01]) {
    const L = 0.105
    parts.push(box(0.0025, L, 0.0045, x + 0.0105, s.y0 + 0.058 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#040506', 0, a))
  }
  // lower rim of the frame: dark strip carrying head lights, logo and S
  parts.push(frontPlate(s.wb - 0.05, 0.03, 0.01, x + 0.0066, s.y0 + 0.019, 0, 0.0014, '#2c3138'))
  // head light housings (the lit lamps themselves are separate meshes, see CarMesh)
  for (const sz of [-1, 1]) parts.push(frontPlate(lamp.w + 0.014, lamp.h + 0.012, 0.005, x + 0.0095, lamp.y, sz * lamp.z, 0.0015, '#06080a'))
  parts.push(...sBadge(x + 0.0066, lamp.y, 0.034, 0.0135, 1, false))
  // top marker light and a small camera/sensor dome above the glass
  parts.push(box(0.004, 0.006, 0.05, x + 0.002, c.capTop - 0.011, 0, '#f6f8fb'))
  parts.push(cylX(0.006, 0.005, x + 0.003, c.capTop - 0.012, 0.075, '#1a1f25', 10))

  // ribbed vent blocks at the lower corners, left and right of the coupler
  for (const sz of [-1, 1]) {
    const vz = sz * Math.min(0.112, c.capHW - 0.05)
    parts.push(frontPlate(0.075, 0.07, 0.01, x - 0.001, 0.085, vz, 0.011, '#171b20'))
    for (let k = 0; k < 6; k++) parts.push(box(0.004, 0.0032, 0.062, x + 0.0108, 0.058 + k * 0.0105, vz, '#4a525c'))
  }
  // coupler cover and the coupler head
  parts.push(box(0.026, 0.075, 0.1, x + 0.007, 0.068, 0, '#2a3037'))
  parts.push(box(0.01, 0.03, 0.07, x + 0.017, 0.092, 0, '#3a424b'))
  parts.push(cylX(0.021, 0.03, x + 0.024, 0.066, 0, '#737b86'))
  parts.push(cylX(0.009, 0.014, x + 0.04, 0.066, 0, '#14181c'))
  // air hoses beside the coupler
  for (const sz of [-1, 1]) parts.push(cylX(0.004, 0.02, x + 0.016, 0.04, sz * 0.045, '#d7b52a', 6))
  // apron / buffer beam and a step plate
  parts.push(box(0.03, 0.03, c.capHW * 2 * 0.94, x + 0.004, 0.015, 0, '#1b2026'))
  parts.push(box(0.012, 0.006, c.capHW * 1.5, x + 0.016, 0.03, 0, '#3a424b'))
  return rakeParts(parts, c.rake, c.h)
}

/** The cab door and the little cab window on the side wall behind a nose (the last window of the car is replaced by it). */
function cabDoor(c: CarCtx, x0: number, x1: number, sz: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  const cx = (x0 + x1) / 2
  const w = x1 - x0
  const h = c.h
  const z = (d: number) => sz * (zw + d)
  // silver frame, then the leaf: silver lower body, line stripe, graphite upper part
  out.push(box(w + 0.012, h * 0.76, 0.006, cx, h * 0.43, z(0.0015), SILVER_DARK))
  out.push(box(w - 0.004, h * 0.225, 0.007, cx, h * 0.18, z(0.002), SILVER))
  out.push(box(w - 0.004, h * 0.04, 0.0075, cx, h * 0.31, z(0.002), c.line))
  out.push(box(w - 0.004, h * 0.48, 0.007, cx, h * 0.57, z(0.002), GRAPHITE))
  // small cab window and the door handle
  out.push(box(w * 0.62, h * 0.24, 0.0085, cx + w * 0.04, h * 0.62, z(0.0025), GLASS))
  out.push(box(0.016, 0.005, 0.009, cx - w * 0.34, h * 0.42, z(0.003), '#e6e9ed'))
  return out
}

export const sbahnMuc2: ModelDef = {
  sign: sbahnMuc2Sign,
  logo: sbahnMuc2Logo,
  lamp: sbahnMuc2Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    // floor, side skirts and the equipment under it: transformer, converters, battery boxes, air tanks
    out.push(box(c.len * 0.82, 0.05, c.w * 0.72, 0, -0.03, 0, '#1f242a'))
    for (const sz of [-1, 1]) out.push(box(c.len * 0.5, 0.034, 0.006, 0, -0.012, sz * (c.w * 0.36 + 0.002), '#2b3138'))
    out.push(box(c.len * 0.17, 0.052, c.w * 0.54, -c.len * 0.1, -0.044, 0, '#313840'))
    out.push(box(c.len * 0.11, 0.046, c.w * 0.46, c.len * 0.12, -0.04, 0, '#2c3239'))
    out.push(box(c.len * 0.06, 0.04, c.w * 0.4, c.len * 0.21, -0.038, 0, '#394049'))
    out.push(cylX(0.02, c.len * 0.15, c.len * 0.0, -0.058, 0.07, '#3a4149'))
    out.push(cylX(0.016, c.len * 0.1, c.len * 0.0, -0.056, -0.07, '#3a4149'))
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
          // primary spring above each axle box
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
    const wy0 = c.h * 0.38
    const wy1 = c.h * 0.79
    // the blue-white livery (photos 1 and 3): doors and the front section in the line colour, a big white S on the front cars
    const blue = c.spec.model === '1420b'
    const isCab = (x0: number, x1: number) => (c.nF > 0 && x1 > c.len / 2 - c.nF - 0.07) || (c.nR > 0 && x0 < -c.len / 2 + c.nR + 0.07)
    for (const s of [-1, 1] as const) {
      for (const [x0, x1] of c.wins) {
        if (isCab(x0, x1)) {
          out.push(...cabDoor(c, x0, x1, s))
          continue
        }
        // windows: dark rim, glass pane proud of the wall
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.012, wy1 - wy0 + 0.012, 0.006, cx, (wy0 + wy1) / 2, s * (zw + 0.0015), '#10141a'))
        out.push(box(x1 - x0, wy1 - wy0, 0.008, cx, (wy0 + wy1) / 2, s * (zw + 0.002), GLASS))
      }
      // doors: silver frame, dark panel, two glass leaves with the seam between them, a display above and a green push button beside
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        out.push(box(dw + 0.014, c.h * 0.76, 0.006, cx, c.h * 0.43, s * (zw + 0.0015), blue ? '#dfe3e8' : SILVER_DARK))
        out.push(box(dw, c.h * 0.73, 0.008, cx, c.h * 0.43, s * (zw + 0.002), blue ? c.line : '#14181c'))
        for (const sl of [-1, 1]) out.push(box(dw / 2 - 0.014, c.h * 0.52, 0.0095, cx + sl * (dw / 4 + 0.0015), c.h * 0.5, s * (zw + 0.0026), GLASS))
        out.push(box(0.005, c.h * 0.7, 0.0105, cx, c.h * 0.43, s * (zw + 0.003), '#090b0d'))
        out.push(box(dw * 0.5, 0.011, 0.005, cx, c.h * 0.82, s * (zw + 0.002), '#3f86c9'))
        out.push(box(0.012, 0.018, 0.008, x1 + 0.016, c.h * 0.42, s * (zw + 0.003), '#3f9a4b'))
      }
      // the green S next to the first door of the car, on the light lower body
      const d0 = c.doors[0]
      if (d0 && !blue) out.push(...sBadge(d0[1] + 0.07, c.h * 0.17, s * zw, 0.022, s, true))
      if (blue && c.nF > 0) out.push(...sBadge(c.len / 2 - c.nF - 0.56, c.h * 0.5, s * (zw + 0.0048), 0.12, s, true, false))
      if (blue && c.nR > 0) out.push(...sBadge(-(c.len / 2 - c.nR - 0.56), c.h * 0.5, s * (zw + 0.0048), 0.12, s, true, false))
    }

    // roof: two air conditioning units with grilles, a cable duct; the middle car carries the single-arm pantograph
    for (const f of [-0.28, 0.2]) {
      out.push(box(c.len * 0.17, 0.016, 0.15, c.len * f, c.h + 0.003, 0, '#a2a9b2'))
      out.push(box(c.len * 0.18, 0.006, 0.158, c.len * f, c.h - 0.002, 0, '#7e858e'))
      for (const k of [-1, 0, 1]) out.push(box(c.len * 0.12, 0.004, 0.012, c.len * f, c.h + 0.012, k * 0.045, '#6f767f'))
    }
    out.push(box(c.len * 0.34, 0.005, 0.02, c.len * -0.04, c.h + 0.002, 0, '#6a717a'))
    if (c.role === 'mid' || c.role === 'single') {
      const px = c.len * 0.04
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(cylX(0.006, 0.02, px + sx * 0.05, c.h + 0.012, sz * 0.05, '#c9ced5', 8))
      out.push(box(0.16, 0.012, 0.13, px, c.h + 0.008, 0, '#2a313b'))
      const jx = px + 0.055
      out.push(bar(px - 0.05, c.h + 0.016, jx, c.h + 0.088, 0.0, 0.007, 0.014, '#9aa1aa'))
      out.push(bar(jx, c.h + 0.088, px - 0.045, c.h + 0.15, 0.0, 0.006, 0.012, '#9aa1aa'))
      out.push(box(0.018, 0.006, 0.17, px - 0.045, c.h + 0.153, 0, '#d7dce2'))
      out.push(box(0.012, 0.004, 0.17, px - 0.045, c.h + 0.158, 0, '#1b2026'))
    }
    if (c.nF > 0) out.push(box(0.05, 0.02, 0.006, c.len / 2 - c.nF - 0.22, c.h + 0.008, 0, '#d9dde2', -0.35))

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
