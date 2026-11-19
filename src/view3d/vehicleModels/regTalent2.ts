import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Bombardier Talent 2 (DB class 442 / 442 and relatives, photos "Bombardier Talent 2"): single-deck articulated regional EMU in
 * DB red with a thin white stripe over a dark skirt, a continuous band of dark windows, red double doors with glass and a strongly
 * raked, rounded nose. The front is a grey frame with a tall tapered black windscreen (destination display at its top), round LED
 * head lights with a tail light below, the DB logo and number between them, small vent slits, ribbed grey vent blocks at the
 * lower corners and the open Scharfenberg coupler. Grey roof with air conditioning units, one single-arm pantograph on the
 * first middle car. A short yellow stripe marks the cab side wall.
 */

const FRAME = '#8e949c'
const FRAME_LIGHT = '#aeb4bb'
const INK = '#0c1116'
const HOUSING = '#14181d'
const ROOF_UNIT = '#b9bec5'
const ROOF_DARK = '#7d838c'
const YELLOW = '#f1c40f'

const WS_BOTTOM = 0.58 // windscreen bottom as a share of the face height
const WS_TOP_GAP = 0.012

/** Windscreen frame: bottom, top, centre height, height, width at the bottom and the top. */
function screen(m: FrontMetrics) {
  const y0 = m.capTop * WS_BOTTOM
  const y1 = m.capTop - WS_TOP_GAP
  const wb = 2 * m.capHW - 0.026
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, wb, wt: wb * 0.8 }
}

export const talent2Sign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 - 0.034, w: s.wt * 0.66, h: 0.03, x: 0.0122 }
}
export const talent2Logo = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y0 - 0.034, z: 0, w: 0.052, h: 0.029, x: 0.0098 }
}
export const talent2Lamp = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y0 - 0.024, z: m.capHW * 0.66, w: 0.03, h: 0.03, round: true }
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

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const s = screen(m)
  const lamp = talent2Lamp(m)
  const logo = talent2Logo(m)
  const sign = talent2Sign(m)
  const parts: THREE.BufferGeometry[] = []

  // grey frame wrapping the windscreen (thicker at the top), black glass, recess for the destination display
  parts.push(frontShape(taper(s.wb, s.wt, s.h, 0.03, 0.06), x, s.cy, 0, 0.006, FRAME))
  parts.push(frontShape(taper(s.wb - 0.03, s.wt - 0.034, s.h - 0.05, 0.022, 0.045), x + 0.006, s.cy - 0.004, 0, 0.0025, INK))
  // reflections across the glass
  parts.push(frontShape(taper(0.07, 0.04, s.h - 0.08, 0.008, 0.008), x + 0.0085, s.cy - 0.006, -s.wb * 0.2, 0.0006, '#1b2a37'))
  parts.push(frontShape(taper(0.018, 0.01, s.h - 0.08, 0.004, 0.004), x + 0.0085, s.cy - 0.006, -s.wb * 0.04, 0.0006, '#1b2a37'))
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.01, x + 0.0095, sign.y, 0, 0.0015, '#06080a'))
  // wipers parked across the lower edge of the glass
  const a = 1.3
  for (const zp of [-0.1, 0.01]) {
    const L = 0.105
    parts.push(box(0.0025, L, 0.0045, x + 0.0105, s.y0 + 0.045 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#040506', 0, a))
  }
  // lighter lower edge of the frame
  parts.push(frontPlate(s.wb - 0.03, 0.008, 0.003, x + 0.0045, s.y0 + 0.005, 0, 0.0018, FRAME_LIGHT))

  // head light housings with the tail light below (the lit lamps themselves are separate meshes, see CarMesh)
  for (const sz of [-1, 1]) {
    parts.push(frontPlate(0.054, 0.066, 0.02, x, lamp.y - 0.013, sz * lamp.z, 0.0068, HOUSING))
    parts.push(cylX(0.0075, 0.003, x + 0.0075, lamp.y - 0.031, sz * lamp.z, '#a8232a', 10))
  }
  // DB logo on a white plate, the number below it, vent slits
  parts.push(frontPlate(logo.w + 0.01, logo.h + 0.01, 0.006, x, logo.y, 0, 0.0085, '#f3f3f3'))
  for (let k = 0; k < 7; k++) parts.push(box(0.0022, 0.0055, 0.0042, x + 0.0035, logo.y - 0.03, (k - 3) * 0.0068, '#f1f1f1'))
  for (const dy of [-0.044, -0.052, -0.06]) parts.push(box(0.003, 0.0032, 0.074, x + 0.0028, logo.y + dy, 0, '#7e1017'))

  // ribbed grey vent blocks at the lower corners
  for (const sz of [-1, 1]) {
    const vz = sz * (c.capHW - 0.034)
    parts.push(frontPlate(0.05, 0.072, 0.008, x - 0.001, 0.097, vz, 0.008, '#5d636b'))
    for (let k = 0; k < 6; k++) parts.push(box(0.003, 0.0034, 0.042, x + 0.0085, 0.069 + k * 0.011, vz, '#2a2f36'))
  }
  // open coupler: dark housing, Scharfenberg head, air hoses
  parts.push(box(0.022, 0.07, 0.108, x + 0.004, 0.078, 0, '#14181c'))
  parts.push(box(0.012, 0.028, 0.07, x + 0.012, 0.097, 0, '#2b3138'))
  parts.push(cylX(0.021, 0.03, x + 0.02, 0.068, 0, '#7b838d'))
  parts.push(cylX(0.011, 0.012, x + 0.036, 0.068, 0, '#262b31'))
  parts.push(box(0.02, 0.012, 0.03, x + 0.022, 0.092, 0, '#656d77'))
  for (const sz of [-1, 1]) parts.push(cylX(0.004, 0.022, x + 0.016, 0.045, sz * 0.042, '#d7b52a', 6))
  // apron / buffer beam with a step plate
  parts.push(box(0.03, 0.03, c.capHW * 2 * 0.94, x + 0.004, 0.015, 0, '#1b2026'))
  parts.push(box(0.012, 0.006, c.capHW * 1.5, x + 0.016, 0.03, 0, '#3a424b'))
  // marker light and sensor on the frame top, grille on the roof behind it
  parts.push(box(0.004, 0.005, 0.044, x + 0.002, c.capTop - 0.008, 0, '#f6f8fb'))
  parts.push(cylX(0.0055, 0.005, x + 0.004, c.capTop - 0.012, 0.07, '#1a1f25', 10))
  return rakeParts(parts, c.rake, c.h)
}

/** The cab door behind the nose (replaces the last window of an end car): red leaf, small window, handle. */
function cabDoor(c: CarCtx, x0: number, x1: number, sz: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  const cx = (x0 + x1) / 2
  const w = x1 - x0
  const h = c.h
  const z = (d: number) => sz * (zw + d)
  out.push(box(w + 0.012, h * 0.76, 0.006, cx, h * 0.46, z(0.0015), '#2a2f36'))
  out.push(box(w - 0.004, h * 0.72, 0.0075, cx, h * 0.46, z(0.002), c.body))
  out.push(box(w * 0.62, h * 0.3, 0.0085, cx + w * 0.04, h * 0.64, z(0.0026), GLASS))
  out.push(box(0.016, 0.005, 0.009, cx - w * 0.34, h * 0.42, z(0.003), '#d9dde2'))
  return out
}

/** The single-arm pantograph, raised, on the roof at x. */
function pantograph(x: number, roofY: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(cylX(0.006, 0.02, x + sx * 0.055, roofY + 0.012, sz * 0.05, '#c9ced5', 8))
  out.push(box(0.17, 0.012, 0.13, x, roofY + 0.008, 0, '#2a313b'))
  const jx = x + 0.06
  out.push(bar(x - 0.05, roofY + 0.016, jx, roofY + 0.092, 0, 0.007, 0.014, '#9aa1aa'))
  out.push(bar(jx, roofY + 0.092, x - 0.045, roofY + 0.158, 0, 0.006, 0.012, '#9aa1aa'))
  out.push(box(0.018, 0.006, 0.17, x - 0.045, roofY + 0.161, 0, '#d7dce2'))
  out.push(box(0.012, 0.004, 0.17, x - 0.045, roofY + 0.166, 0, '#1b2026'))
  return out
}

export const regTalent2: ModelDef = {
  sign: talent2Sign,
  logo: talent2Logo,
  lamp: talent2Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    const L = c.len
    // floor and the equipment under it: transformer, converters, air tanks, batteries
    out.push(box(L * 0.82, 0.05, 0.13, 0, -0.03, 0, '#20252b'))
    out.push(box(L * 0.17, 0.054, c.w * 0.54, -L * 0.1, -0.044, 0, '#313840'))
    out.push(box(L * 0.1, 0.048, c.w * 0.46, L * 0.12, -0.04, 0, '#2c3239'))
    out.push(box(L * 0.07, 0.04, c.w * 0.4, L * 0.24, -0.038, 0, '#394049'))
    out.push(cylX(0.02, L * 0.15, L * 0.02, -0.058, 0.07, '#3a4149'))
    out.push(cylX(0.016, L * 0.1, L * 0.02, -0.056, -0.07, '#3a4149'))
    // dark side skirts hanging below the body, cut out around the bogies
    const bogieXs: number[] = []
    if (c.role !== 'tail') bogieXs.push(-L / 2 - c.spec.gap / 2)
    if (c.nF > 0) bogieXs.push(L / 2 - c.nF - 0.1)
    if (c.nR > 0) bogieXs.push(-L / 2 + c.nR + 0.1)
    bogieXs.sort((p, q) => p - q)
    const lo = -L / 2 + (c.nR > 0 ? c.nR : 0.02)
    const hi = L / 2 - (c.nF > 0 ? c.nF : 0.02)
    let from = lo
    for (const bx of [...bogieXs, Infinity]) {
      const to = Math.min(hi, bx - 0.19)
      if (to - from > 0.05) for (const sz of [-1, 1]) out.push(box(to - from, 0.026, 0.006, (from + to) / 2, -0.011, sz * (c.w / 2 - 0.004), '#3b4148'))
      from = Math.max(from, bx + 0.19)
    }

    // bogies: Jakobs bogie in every joint (drawn by the car in front of it), plus one under each cab end
    const bogie = (bx: number) => {
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
      for (const sz of [-1, 1]) out.push(box(0.31, 0.012, 0.012, bx, -0.02, sz * 0.1, '#1e2328'))
    }
    if (c.role !== 'tail') bogie(-L / 2 - c.spec.gap / 2)
    if (c.nF > 0) bogie(L / 2 - c.nF - 0.1)
    if (c.nR > 0) bogie(-L / 2 + c.nR + 0.1)
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const h = c.h
    const wy0 = h * 0.42
    const wy1 = h * 0.8
    const isCab = (x0: number, x1: number) => (c.nF > 0 && x1 > c.len / 2 - c.nF - 0.07) || (c.nR > 0 && x0 < -c.len / 2 + c.nR + 0.07)
    for (const s of [-1, 1] as const) {
      for (const [x0, x1] of c.wins) {
        if (isCab(x0, x1)) {
          out.push(...cabDoor(c, x0, x1, s))
          continue
        }
        // windows: near black rim, glass pane proud of the wall
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.012, wy1 - wy0 + 0.012, 0.006, cx, (wy0 + wy1) / 2, s * (zw + 0.0015), '#0f1317'))
        out.push(box(x1 - x0, wy1 - wy0, 0.008, cx, (wy0 + wy1) / 2, s * (zw + 0.002), GLASS))
      }
      // doors: dark frame, two red leaves with a glass pane, the seam, a step strip and a green push button
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        out.push(box(dw + 0.012, h * 0.78, 0.006, cx, h * 0.46, s * (zw + 0.0015), '#2a2f36'))
        for (const sl of [-1, 1]) {
          const lx = cx + sl * (dw / 4 + 0.0015)
          out.push(box(dw / 2 - 0.006, h * 0.72, 0.0075, lx, h * 0.46, s * (zw + 0.002), c.body))
          out.push(box(dw / 2 - 0.03, h * 0.4, 0.0088, lx, h * 0.6, s * (zw + 0.0026), GLASS))
        }
        out.push(box(0.004, h * 0.72, 0.0095, cx, h * 0.46, s * (zw + 0.003), '#090b0d'))
        out.push(box(dw - 0.01, 0.01, 0.008, cx, h * 0.095, s * (zw + 0.0025), '#7d838c'))
        out.push(box(0.012, 0.018, 0.008, x1 + 0.014, h * 0.42, s * (zw + 0.003), '#3f9a4b'))
        // small blue info plate next to the door
        out.push(box(0.02, 0.02, 0.006, x0 - 0.02, h * 0.33, s * (zw + 0.0015), '#3566a8'))
      }
    }

    // yellow stripe on the side wall of the cab, just under the roof edge
    for (const [n, sg] of [[c.nF, 1], [c.nR, -1]] as [number, 1 | -1][]) {
      if (n <= 0) continue
      const cx = sg * (c.len / 2 - n - 0.32)
      for (const s of [-1, 1]) out.push(box(0.5, 0.007, 0.006, cx, h * 0.865, s * (zw + 0.0015), YELLOW))
    }

    // roof: air conditioning units with grilles and a cable bridge to the next car; the first middle car carries the pantograph
    const m = c.nR > 0 ? -1 : 1
    const acs = c.role === 'mid' ? [-0.3, 0.3] : [-0.3, 0.1]
    for (const f of acs) {
      const ax = c.len * f * m
      out.push(box(c.len * 0.2, 0.014, 0.16, ax, h + 0.002, 0, ROOF_UNIT))
      out.push(box(c.len * 0.19, 0.006, 0.145, ax, h + 0.012, 0, '#cfd3d9'))
      for (const k of [-1, 0, 1]) out.push(box(c.len * 0.14, 0.004, 0.012, ax, h + 0.016, k * 0.04, ROOF_DARK))
    }
    out.push(box(c.len * 0.3, 0.006, 0.026, c.len * -0.1 * m, h + 0.001, 0, '#6a717a'))
    if (c.nF > 0 || c.nR > 0) {
      const gx = (c.nF > 0 ? 1 : -1) * (c.len / 2 - Math.max(c.nF, c.nR) - 0.16)
      out.push(box(0.14, 0.012, 0.13, gx, h + 0.0, 0, ROOF_DARK))
      for (const k of [-2, -1, 0, 1, 2]) out.push(box(0.1, 0.004, 0.008, gx, h + 0.008, k * 0.023, '#4f565e'))
      out.push(box(0.05, 0.02, 0.006, c.len * 0.08 * m, h + 0.012, 0, '#d9dde2', -0.35))
    }
    if (c.role !== 'tail') out.push(box(0.08, 0.01, 0.028, -c.len / 2 - 0.025, h + 0.003, 0, '#14181c'))
    if (c.role === 'mid' && c.index === 1) out.push(...pantograph(0.02, h))

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
