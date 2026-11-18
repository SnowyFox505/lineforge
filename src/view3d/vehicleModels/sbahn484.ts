import type * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Berlin S-Bahn class 484 (the new one, photos "S-Bahn Berlin / Zug 1"): cream upper body, red lower body (the line colour), a nearly
 * flat front with a big black windscreen whose top holds the destination display, white LED head lights low in the black
 * panel with the DB logo between them, two vents and the coupler cover below. Doors: dark double leaves in a black frame.
 */

const WS_BOTTOM = 0.39 // windscreen bottom as a share of the face height
const WS_TOP_GAP = 0.03

/** Black panel of the windscreen: centre height, height, width. */
function screen(m: FrontMetrics) {
  const y0 = m.capTop * WS_BOTTOM
  const y1 = m.capTop - WS_TOP_GAP
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, w: Math.min(2 * m.capHW - 0.04, 0.27) }
}

export const sbahn484Sign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 - 0.034, w: s.w * 0.78, h: 0.036, x: 0.0122 }
}
export const sbahn484Logo = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y0 + 0.03, z: 0, w: 0.044, h: 0.024, x: 0.0098 }
}
export const sbahn484Lamp = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y0 + 0.03, z: 0.088, w: 0.056, h: 0.012 }
}

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const s = screen(m)
  const lamp = sbahn484Lamp(m)
  const sign = sbahn484Sign(m)
  const parts: THREE.BufferGeometry[] = []

  // windscreen: black frame, glass, dark recess for the destination display
  parts.push(frontPlate(s.w, s.h, 0.05, x, s.cy, 0, 0.007, '#0c1013'))
  parts.push(frontPlate(s.w - 0.018, s.h - 0.018, 0.043, x + 0.007, s.cy, 0, 0.0025, '#1b2a37'))
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.012, x + 0.0095, sign.y, 0, 0.0015, '#06080a'))
  // wipers parked across the lower edge of the glass
  const a = 1.25
  for (const zp of [-0.105, -0.012]) {
    const L = 0.1
    parts.push(box(0.0025, L, 0.0045, x + 0.0105, s.y0 + 0.062 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#040506', 0, a))
  }
  // head light housings (the lit lamps themselves are separate meshes, see CarMesh) and the logo recess
  for (const sz of [-1, 1]) parts.push(frontPlate(lamp.w + 0.016, lamp.h + 0.012, 0.006, x + 0.0095, lamp.y, sz * lamp.z, 0.0015, '#06080a'))

  // vents left and right of the coupler, with slats
  for (const sz of [-1, 1]) {
    const vz = sz * Math.min(0.108, c.capHW - 0.05)
    parts.push(frontPlate(0.07, 0.044, 0.012, x - 0.001, 0.088, vz, 0.007, '#13171b'))
    for (const dy of [-0.012, 0, 0.012]) parts.push(box(0.004, 0.0035, 0.054, x + 0.0066, 0.088 + dy, vz, '#3c434c'))
  }
  // coupler cover and the coupler head
  parts.push(box(0.022, 0.072, 0.1, x + 0.006, 0.07, 0, '#2a3037'))
  parts.push(cylX(0.022, 0.03, x + 0.02, 0.07, 0, '#6d7580'))
  parts.push(cylX(0.009, 0.012, x + 0.036, 0.07, 0, '#14181c'))
  // apron / buffer beam
  parts.push(box(0.03, 0.03, c.capHW * 2 * 0.94, x + 0.004, 0.016, 0, '#1b2026'))
  return parts
}

/** Dark stripe behind the cab, at the end of the passenger area. */
function cabStripe(c: CarCtx, sign: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const nose = sign > 0 ? c.nF : c.nR
  if (nose <= 0) return out
  const x = sign * (c.len / 2 - nose - 0.022)
  for (const sz of [-1, 1]) out.push(box(0.02, 0.33, 0.006, x, 0.18, sz * (c.w / 2 + 0.0015), '#14181c'))
  return out
}

export const sbahn484: ModelDef = {
  sign: sbahn484Sign,
  logo: sbahn484Logo,
  lamp: sbahn484Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    out.push(box(c.len * 0.8, 0.05, c.w * 0.7, 0, -0.03, 0, '#20252b'))
    // equipment boxes and air tanks hanging under the floor
    out.push(box(c.len * 0.17, 0.05, c.w * 0.5, -c.len * 0.08, -0.04, 0, '#313840'))
    out.push(box(c.len * 0.1, 0.045, c.w * 0.42, c.len * 0.13, -0.038, 0, '#2c3239'))
    out.push(cylX(0.02, c.len * 0.16, c.len * 0.02, -0.052, 0.07, '#3a4149'))
    // bogies: frame, motor, two axles with wheels on the rails (rails stand 0.085 either side of the centre line)
    for (const sx of [-1, 1]) {
      const bx = sx * c.len * 0.3
      out.push(box(0.3, 0.022, 0.2, bx, -0.026, 0, '#13171b'))
      out.push(box(0.1, 0.05, 0.09, bx, -0.034, 0, '#2b3137'))
      for (const dx of [-0.115, 0.115]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#4c545e', 12))
          out.push(cylZ(0.022, 0.02, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
        }
      }
      for (const sz of [-1, 1]) out.push(box(0.3, 0.012, 0.012, bx, -0.02, sz * 0.1, '#1e2328'))
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.42
    const wy1 = c.h * 0.77
    for (const s of [-1, 1]) {
      // windows: black rim, glass pane proud of the wall
      for (const [x0, x1] of c.wins) {
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.012, wy1 - wy0 + 0.012, 0.006, cx, (wy0 + wy1) / 2, s * (zw + 0.0015), '#12161a'))
        out.push(box(x1 - x0, wy1 - wy0, 0.008, cx, (wy0 + wy1) / 2, s * (zw + 0.002), GLASS))
      }
      // doors: black frame, two glass leaves with the gap between them, a green push button beside the door
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        out.push(box(dw + 0.012, c.h * 0.74, 0.007, cx, c.h * 0.43, s * (zw + 0.002), '#14181c'))
        for (const sl of [-1, 1]) out.push(box(dw / 2 - 0.012, c.h * 0.62, 0.009, cx + sl * (dw / 4 + 0.0015), c.h * 0.47, s * (zw + 0.0025), GLASS))
        out.push(box(0.005, c.h * 0.72, 0.01, cx, c.h * 0.43, s * (zw + 0.003), '#090b0d'))
        out.push(box(0.012, 0.018, 0.008, x1 + 0.014, c.h * 0.42, s * (zw + 0.003), '#3f9a4b'))
      }
    }
    out.push(...cabStripe(c, 1), ...cabStripe(c, -1))

    // roof: two air conditioning units with grilles; the head car also carries a small antenna
    for (const f of [-0.27, 0.14]) {
      out.push(box(c.len * 0.17, 0.014, 0.15, c.len * f, c.h + 0.003, 0, '#bfc5cc'))
      for (const k of [-1, 0, 1]) out.push(box(c.len * 0.12, 0.004, 0.012, c.len * f, c.h + 0.011, k * 0.045, '#8d949c'))
    }
    if (c.nF > 0) out.push(box(0.05, 0.02, 0.006, c.len / 2 - c.nF - 0.22, c.h + 0.008, 0, '#d9dde2', -0.35))

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
