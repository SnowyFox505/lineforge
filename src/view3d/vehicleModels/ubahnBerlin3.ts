import type * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Berlin U-Bahn, large profile, classic yellow series D / DL / F74-F92 (photos "U-Bahn Berlin / Zug 3": 2701, 2355, 2943, ...):
 * 2.65 m wide, 3.43 m high, plain golden yellow aluminium body with a black skirt. The front is nearly flat with a slightly
 * rounded roof: three separate windscreens in black rubber frames (wide driver's pane, middle pane = emergency door, narrow pane),
 * the destination display above them in the roof curve, rounded rectangular head lights low on the yellow face, a pale bumper
 * strip over the black apron and the coupler between. Sides: tall windows with a small tilting vent light, double doors with a
 * window in each leaf, a single cab door behind the nose. No pantograph: current is collected from the third rail by shoes.
 * Driving direction +x; the wide pane sits on the right (+z) like in the photos.
 */

const BLACK = '#0e1012'
const RUBBER = '#16191c'
const FRONT_GLASS = '#1d2a36'
const APRON = '#1b2026'
const CAB_W = 0.1

// face layout (heights in design units above the car underside)
const WS_BOTTOM = 0.158
const WS_TOP = 0.318
const WS_R = 0.016

/** The three windscreens: centre z, width; widths follow the width of the face. */
function panes(m: FrontMetrics) {
  const total = 2 * m.capHW - 0.03
  const pil = total * 0.05
  const wBig = total * 0.37
  const wMid = total * 0.3
  const wSmall = total * 0.23
  const zBig = total / 2 - wBig / 2
  const zMid = total / 2 - wBig - pil - wMid / 2
  const zSmall = -total / 2 + wSmall / 2
  return [
    { z: zBig, w: wBig },
    { z: zMid, w: wMid },
    { z: zSmall, w: wSmall },
  ]
}

export const ubahnBerlin3Sign = (m: FrontMetrics) => ({ y: m.capTop - 0.031, w: Math.min(0.15, 2 * m.capHW * 0.5), h: 0.028, x: 0.0122 })
export const ubahnBerlin3Lamp = (m: FrontMetrics) => ({ y: 0.102, z: Math.min(0.12, m.capHW - 0.03), w: 0.034, h: 0.024 })

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const lamp = ubahnBerlin3Lamp(m)
  const sign = ubahnBerlin3Sign(m)
  const ps = panes(m)
  const hP = WS_TOP - WS_BOTTOM
  const cy = (WS_TOP + WS_BOTTOM) / 2
  const parts: THREE.BufferGeometry[] = []

  // windscreens: black rubber frame, dark glass, a faint reflection
  ps.forEach((p, i) => {
    parts.push(frontPlate(p.w, hP, WS_R, x, cy, p.z, 0.006, BLACK))
    parts.push(frontPlate(p.w - 0.014, hP - 0.014, WS_R * 0.7, x + 0.006, cy, p.z, 0.0022, FRONT_GLASS))
    parts.push(frontPlate(p.w * 0.16, hP - 0.05, 0.004, x + 0.0082, cy - 0.004, p.z - p.w * 0.22, 0.0006, '#2a3b4a'))
    // wipers parked at the lower edge: the wide pane has the long one, the middle pane a short one
    if (i < 2) {
      const L = i === 0 ? 0.095 : 0.07
      const a = i === 0 ? 1.0 : 1.2
      const zp = p.z + p.w * 0.38 - (L / 2) * Math.sin(a) * 1
      parts.push(box(0.0025, L, 0.0045, x + 0.0105, WS_BOTTOM + 0.022 + (L / 2) * Math.cos(a), zp, '#050607', 0, a))
    }
  })
  // emergency door of the middle pane: a handle and the door edge
  parts.push(box(0.004, 0.026, 0.005, x + 0.009, cy - 0.01, ps[1].z + ps[1].w * 0.5 + 0.004, '#aeb4ba'))
  // roof edge above the display: black rubber seal around the destination recess
  parts.push(frontPlate(sign.w + 0.014, sign.h + 0.009, 0.01, x + 0.0095, sign.y, 0, 0.0015, '#06080a'))
  // top marker light and a roof rain drip rail
  parts.push(box(0.004, 0.006, 0.03, x + 0.002, c.capTop - 0.004, 0, '#f6f2e4'))

  // head light housings (pale rounded plate; the lit lamps themselves are separate meshes, see CarMesh)
  for (const sz of [-1, 1]) {
    parts.push(frontPlate(lamp.w + 0.014, lamp.h + 0.012, 0.009, x + 0.0085, lamp.y, sz * lamp.z, 0.0032, '#d9dbdd'))
    parts.push(frontPlate(lamp.w + 0.004, lamp.h + 0.003, 0.007, x + 0.0114, lamp.y, sz * lamp.z, 0.0012, '#2b2f34'))
  }
  // number plate and a small plate: dark panel with four pale digits (hint of the car number)
  parts.push(frontPlate(0.062, 0.02, 0.003, x + 0.0045, 0.118, 0, 0.0018, '#16191c'))
  for (let k = 0; k < 4; k++) parts.push(box(0.0012, 0.012, 0.006, x + 0.0066, 0.118, -0.0225 + k * 0.015, '#e8e6dc'))
  parts.push(frontPlate(0.03, 0.012, 0.002, x + 0.0045, 0.084, 0.082 * Math.sign(lamp.z), 0.0015, '#e9e9e6'))

  // pale bumper strip over the black apron, side steps and the rain strips beside the panes
  parts.push(box(0.008, 0.007, c.capHW * 2 * 0.97, x + 0.0035, 0.047, 0, '#b7bbbf'))
  for (const sz of [-1, 1]) parts.push(box(0.008, hP + 0.01, 0.006, x + 0.0035, cy, sz * (c.capHW - 0.004), RUBBER))

  // coupler: cover, head with the contact pins, air hoses and the pull rod
  parts.push(box(0.022, 0.05, 0.11, x + 0.006, 0.027, 0, '#2a3037'))
  parts.push(cylX(0.021, 0.032, x + 0.02, 0.028, 0, '#5d646d'))
  parts.push(cylX(0.0095, 0.014, x + 0.038, 0.028, 0, '#14181c'))
  parts.push(box(0.012, 0.014, 0.05, x + 0.019, 0.052, 0, '#8d949c'))
  for (const sz of [-1, 1]) {
    parts.push(cylX(0.0045, 0.022, x + 0.018, 0.012, sz * 0.05, '#d7b52a', 6))
    parts.push(box(0.016, 0.012, 0.03, x + 0.014, 0.034, sz * 0.075, '#3a424b'))
  }
  // anticlimber apron
  parts.push(box(0.032, 0.026, c.capHW * 2 * 0.95, x + 0.004, 0.013, 0, APRON))
  return rakeParts(parts, c.rake, c.h)
}

/** The single cab door behind a nose (it replaces the window next to the nose): black frame, yellow leaf, tall window, handle. */
function cabDoor(c: CarCtx, x0: number, x1: number, sz: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  const cx = (x0 + x1) / 2
  const w = x1 - x0
  const z = (d: number) => sz * (zw + d)
  out.push(box(w + 0.012, 0.31, 0.007, cx, 0.2, z(0.002), BLACK))
  out.push(box(w - 0.004, 0.285, 0.0085, cx, 0.2, z(0.0028), c.body))
  out.push(box(w * 0.7, 0.158, 0.0095, cx, 0.255, z(0.0034), '#12161a'))
  out.push(box(w * 0.6, 0.145, 0.0105, cx, 0.255, z(0.0038), GLASS))
  out.push(box(0.016, 0.005, 0.0105, cx - w * 0.3, 0.14, z(0.004), '#c9ced3'))
  return out
}

export const ubahnBerlin3: ModelDef = {
  sign: ubahnBerlin3Sign,
  lamp: ubahnBerlin3Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    out.push(box(c.len * 0.82, 0.05, c.w * 0.72, 0, -0.03, 0, '#1d2127'))
    for (const sz of [-1, 1]) out.push(box(c.len * 0.55, 0.034, 0.006, 0, -0.012, sz * (c.w * 0.36 + 0.002), '#2a3037'))
    // equipment under the floor: traction boxes, resistor grille, battery box, air tanks
    out.push(box(c.len * 0.17, 0.05, c.w * 0.52, -c.len * 0.08, -0.04, 0, '#323941'))
    out.push(box(c.len * 0.12, 0.046, c.w * 0.44, c.len * 0.13, -0.038, 0, '#2d343b'))
    out.push(box(c.len * 0.07, 0.04, c.w * 0.4, c.len * 0.22, -0.036, 0, '#3a424b'))
    for (let k = 0; k < 4; k++) out.push(box(c.len * 0.003, 0.034, c.w * 0.4, c.len * 0.13 + (k - 1.5) * c.len * 0.024, -0.04, 0, '#454d56'))
    out.push(cylX(0.02, c.len * 0.16, c.len * 0.02, -0.054, 0.07, '#3a4149'))
    out.push(cylX(0.016, c.len * 0.1, c.len * 0.02, -0.052, -0.07, '#3a4149'))
    // bogies: frame, motor, brake blocks, two axles with wheels on the rails (rails stand 0.085 either side of the centre line)
    for (const sx of [-1, 1]) {
      const bx = sx * c.len * 0.3
      out.push(box(0.3, 0.022, 0.2, bx, -0.026, 0, '#13171b'))
      out.push(box(0.1, 0.05, 0.09, bx, -0.034, 0, '#2b3137'))
      out.push(box(0.05, 0.02, 0.17, bx, -0.018, 0, '#222830'))
      for (const dx of [-0.115, 0.115]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#4c545e', 12))
          out.push(cylZ(0.022, 0.02, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
          out.push(cylZ(0.007, 0.014, bx + dx, -0.012, sz * 0.1, '#6b7580', 6))
        }
      }
      for (const sz of [-1, 1]) {
        out.push(box(0.3, 0.012, 0.012, bx, -0.02, sz * 0.1, '#1e2328'))
        // third-rail shoe: arm with insulator out to the side and the contact shoe
        out.push(box(0.06, 0.008, 0.03, bx + 0.11, -0.032, sz * 0.118, '#3b4048'))
        out.push(box(0.05, 0.007, 0.022, bx + 0.11, -0.04, sz * 0.136, '#6b5a45'))
      }
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.43
    const wy1 = c.h * 0.82
    const wyc = (wy0 + wy1) / 2
    const isCab = (x0: number, x1: number) => (c.nF > 0 && x1 > c.len / 2 - c.nF - 0.07) || (c.nR > 0 && x0 < -c.len / 2 + c.nR + 0.07)
    for (const s of [-1, 1] as const) {
      // the cab door is wider than the window it replaces and swallows the window in front of it
      const cabs = c.wins.filter(([a, b]) => isCab(a, b)).map(([, b]) => [b - CAB_W, b] as [number, number])
      for (const [x0, x1] of c.wins) {
        if (isCab(x0, x1)) {
          out.push(...cabDoor(c, x1 - CAB_W, x1, s))
          continue
        }
        if (cabs.some(([a, b]) => x1 > a - 0.01 && x0 < b)) continue
        // windows: black rubber rim, glass pane proud of the wall, the small tilting vent light across the top
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.012, wy1 - wy0 + 0.012, 0.006, cx, wyc, s * (zw + 0.0015), RUBBER))
        out.push(box(x1 - x0, wy1 - wy0, 0.008, cx, wyc, s * (zw + 0.002), GLASS))
        out.push(box(x1 - x0 + 0.004, 0.005, 0.0095, cx, wy0 + (wy1 - wy0) * 0.7, s * (zw + 0.0024), RUBBER))
      }
      // doors: double leaves in a black frame, a window in the upper part of each leaf, rubber seal between the leaves
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        out.push(box(dw + 0.012, 0.31, 0.007, cx, 0.2, s * (zw + 0.002), BLACK))
        for (const sl of [-1, 1]) {
          const lx = cx + sl * (dw / 4 + 0.0015)
          out.push(box(dw / 2 - 0.008, 0.285, 0.0085, lx, 0.2, s * (zw + 0.0028), c.body))
          out.push(box(dw / 2 - 0.022, 0.16, 0.0095, lx, 0.263, s * (zw + 0.0034), '#12161a'))
          out.push(box(dw / 2 - 0.028, 0.15, 0.0105, lx, 0.263, s * (zw + 0.0038), GLASS))
        }
        out.push(box(0.004, 0.285, 0.0105, cx, 0.2, s * (zw + 0.0042), '#0a0c0e'))
        // grey door rail on top of the frame
        out.push(box(dw + 0.016, 0.006, 0.0085, cx, 0.358, s * (zw + 0.0022), '#6c7279'))
      }
    }

    // roof: ventilation hoods, a cable duct and the ribs of the roof sheet
    for (const f of [-0.27, 0.12, 0.34]) {
      out.push(box(c.len * 0.1, 0.012, 0.09, c.len * f, c.h + 0.003, 0, '#cf9a0b'))
      for (const k of [-1, 0, 1]) out.push(box(c.len * 0.07, 0.004, 0.01, c.len * f, c.h + 0.01, k * 0.03, '#9a7708'))
    }
    out.push(box(c.len * 0.55, 0.005, 0.018, -c.len * 0.04, c.h + 0.002, 0, '#7f7f78'))
    for (const sz of [-1, 1]) out.push(box(c.len * 0.7, 0.003, 0.006, -c.len * 0.02, c.h - 0.012, sz * 0.085, '#c99509'))
    if (c.nF > 0) out.push(box(0.05, 0.02, 0.006, c.len / 2 - c.nF - 0.2, c.h + 0.008, 0, '#d9dde2', -0.35))

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
