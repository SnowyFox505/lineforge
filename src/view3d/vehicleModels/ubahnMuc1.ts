import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Munich U-Bahn, the C-Zug (Siemens Inspiro, class C2; photos "U-Bahn Muenchen / Zug 1"): a smooth silver-grey walk-through train with a
 * dark skirt, big tinted windows and doors set in blue (the line colour slot = the MVG blue) frames. The front is a rounded, raked face:
 * a huge dark windscreen with the destination display in its top edge, a silver-grey grille with the Munich coat of arms below it, a
 * dark apron with the Scharfenberg coupler, and vertical LED head light strips at both sides. Behind the cab a blue panel with the tall,
 * slanted cab door window. No pantograph: power comes from the third rail through collector shoes on the bogies.
 */

const SILVER = '#bcc2ca'
const SILVER_DARK = '#8d949d'
const INK = '#0b0f14'
const FRAME = '#1b1f25'
const BLUE_DARK = '#1f55a8'

const SCREEN_BOTTOM = 0.178
const SCREEN_GAP = 0.011

/** The windscreen: bottom, top, centre height, height, width at the bottom and at the top. */
function screen(m: FrontMetrics) {
  const y0 = SCREEN_BOTTOM
  const y1 = m.capTop - SCREEN_GAP
  const wb = 2 * m.capHW - 0.014
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, wb, wt: wb * 0.9 }
}

export const ubahnMuc1Sign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 - 0.03, w: s.wt * 0.64, h: 0.029, x: 0.0122 }
}
export const ubahnMuc1Lamp = (m: FrontMetrics) => ({ y: 0.128, z: m.capHW - 0.016, w: 0.012, h: 0.084 })

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
  g.deleteAttribute('uv')
  return paint(g, hex)
}

/** A raised polygon on a side wall (x along the car, y up) standing `depth` proud of the wall at |z| = zw, on side `sz`. */
function sidePoly(pts: [number, number][], zw: number, sz: 1 | -1, depth: number, hex: string): THREE.BufferGeometry {
  const sh = new THREE.Shape()
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)))
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false })
  g.deleteAttribute('uv')
  g.translate(0, 0, sz > 0 ? zw - 0.0006 : -zw - depth + 0.0006)
  return paint(g, hex)
}

/** A thin bar between two points in the x-y plane. */
function bar(x0: number, y0: number, x1: number, y1: number, z: number, t: number, d: number, hex: string): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, y1 - y0)
  return box(len, t, d, (x0 + x1) / 2, (y0 + y1) / 2, z, hex, Math.atan2(y1 - y0, x1 - x0))
}

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const s = screen(m)
  const lamp = ubahnMuc1Lamp(m)
  const sign = ubahnMuc1Sign(m)
  const parts: THREE.BufferGeometry[] = []
  const hw = c.capHW

  // windscreen: dark frame, black glass, the destination display housing in its top edge
  parts.push(frontShape(taper(s.wb, s.wt, s.h, 0.03, 0.07), x, s.cy, 0, 0.006, FRAME))
  parts.push(frontShape(taper(s.wb - 0.026, s.wt - 0.03, s.h - 0.026, 0.026, 0.06), x + 0.006, s.cy, 0, 0.0025, INK))
  // reflections across the glass and the sun visor line below the display
  parts.push(frontShape(taper(0.07, 0.042, s.h - 0.06, 0.008, 0.008), x + 0.0087, s.cy - 0.004, -s.wb * 0.24, 0.0006, '#17232e'))
  parts.push(frontShape(taper(0.016, 0.01, s.h - 0.06, 0.004, 0.004), x + 0.0087, s.cy - 0.004, -s.wb * 0.05, 0.0006, '#17232e'))
  parts.push(frontPlate(sign.w + 0.014, sign.h + 0.01, 0.01, x + 0.0095, sign.y, 0, 0.0015, '#05070a'))
  // wipers parked low across the glass
  const a = 1.38
  for (const zp of [-0.105, 0.02]) {
    const L = 0.11
    parts.push(box(0.0025, L, 0.0045, x + 0.0098, s.y0 + 0.03 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#040506', 0, a))
  }
  // rubber lip under the glass
  parts.push(frontPlate(s.wb - 0.02, 0.007, 0.003, x + 0.0032, s.y0 - 0.006, 0, 0.003, '#15181d'))

  // silver-grey grille panel below the glass, ribbed, with the Munich coat of arms in the middle
  const gy0 = 0.1
  const gy1 = s.y0 - 0.012
  const gw = 2 * hw - 0.075
  parts.push(frontPlate(gw, gy1 - gy0, 0.01, x + 0.0015, (gy0 + gy1) / 2, 0, 0.0045, SILVER_DARK))
  for (let k = 0; k < 5; k++) parts.push(box(0.0022, 0.0042, gw - 0.016, x + 0.0066, gy0 + 0.012 + k * ((gy1 - gy0 - 0.022) / 4), 0, '#4d545d'))
  // coat of arms: white shield with a dark figure and a gold rim
  parts.push(frontPlate(0.028, 0.034, 0.008, x + 0.0066, (gy0 + gy1) / 2, 0, 0.002, '#d6b13c'))
  parts.push(frontPlate(0.022, 0.028, 0.006, x + 0.0085, (gy0 + gy1) / 2, 0, 0.0016, '#f1f2f4'))
  parts.push(box(0.002, 0.014, 0.008, x + 0.0108, (gy0 + gy1) / 2 - 0.002, 0, '#1b1d21'))
  parts.push(box(0.002, 0.007, 0.012, x + 0.0108, (gy0 + gy1) / 2 + 0.007, 0, '#b8352e'))

  // head light strips at both sides: a dark housing, the lit bar is a separate mesh (see CarMesh), cross slits over it
  for (const sz of [-1, 1]) {
    const zl = sz * lamp.z
    parts.push(frontPlate(lamp.w + 0.016, lamp.h + 0.014, 0.006, x + 0.008, lamp.y, zl, 0.0015, '#0a0d11'))
    for (let k = 1; k < 7; k++) parts.push(box(0.0012, 0.0026, lamp.w + 0.008, x + 0.0167, lamp.y - lamp.h / 2 + (k * lamp.h) / 7, zl, '#0f1217'))
    // silver pillar between the glass and the corner
    parts.push(frontPlate(0.011, s.h * 0.55, 0.004, x + 0.0013, s.y0 + s.h * 0.3, sz * (hw - 0.007), 0.004, SILVER))
  }

  // dark apron under the grille: a bulging bumper with the MVG mark at the left and the coupler in the middle
  parts.push(frontPlate(2 * hw - 0.006, 0.098, 0.018, x + 0.0015, 0.05, 0, 0.0075, '#343a42'))
  parts.push(box(0.012, 0.016, 2 * hw * 0.92, x + 0.0098, 0.012, 0, '#1a1e24'))
  parts.push(frontPlate(0.056, 0.012, 0.003, x + 0.0092, 0.07, -hw * 0.46, 0.0012, '#e9edf2'))
  parts.push(frontPlate(0.026, 0.012, 0.003, x + 0.0092, 0.07, -hw * 0.46 - 0.036, 0.0012, '#2f79d6'))
  parts.push(box(0.0014, 0.007, 0.04, x + 0.0112, 0.07, -hw * 0.46 + 0.006, '#2f79d6'))
  // coupler: cover, head and the air hoses
  parts.push(box(0.022, 0.058, 0.084, x + 0.011, 0.04, 0, '#3a424b'))
  parts.push(cylX(0.018, 0.03, x + 0.026, 0.034, 0, '#737b86'))
  parts.push(cylX(0.008, 0.014, x + 0.043, 0.034, 0, '#14181c'))
  for (const sz of [-1, 1]) parts.push(cylX(0.004, 0.02, x + 0.017, 0.022, sz * 0.042, '#d7b52a', 6))
  // buffer beam stub at the lower corners and a step plate
  for (const sz of [-1, 1]) parts.push(box(0.014, 0.014, 0.028, x + 0.01, 0.018, sz * hw * 0.78, '#6b727c'))
  // sensor dome and a marker light on the roof edge above the glass
  parts.push(box(0.004, 0.006, 0.05, x + 0.002, c.capTop - 0.004, 0, '#f6f8fb'))
  return rakeParts(parts, c.rake, c.h)
}

/** The cab flank behind a nose: a blue panel with the tall, slanted cab door window (a slim silver frame, dark glass). */
function cabFlank(c: CarCtx, sz: 1 | -1, front: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  const n = front ? c.nF : c.nR
  const xe = c.len / 2 - n // where the nose starts
  const h = c.h
  const f = front ? 1 : -1
  const mx = (x: number) => f * x
  const y0 = h * 0.17
  const y1 = h * 0.815
  // panel: rear edge vertical, front edge leans back towards the roof
  const xr = xe - 0.12
  const pts: [number, number][] = [
    [mx(xr), y0],
    [mx(xe + 0.05), y0],
    [mx(xe - 0.01), y1],
    [mx(xr), y1],
  ]
  out.push(sidePoly(f > 0 ? pts : pts.slice().reverse(), zw, sz, 0.0055, c.line))
  // the cab door window: tall, wider at the bottom
  const wy0 = h * 0.36
  const wy1 = h * 0.79
  const wp: [number, number][] = [
    [mx(xr + 0.02), wy0],
    [mx(xe + 0.03), wy0],
    [mx(xe - 0.03), wy1],
    [mx(xr + 0.02), wy1],
  ]
  out.push(sidePoly(f > 0 ? wp : wp.slice().reverse(), zw + 0.0055, sz, 0.0022, FRAME))
  const ip: [number, number][] = [
    [mx(xr + 0.03), wy0 + 0.008],
    [mx(xe + 0.021), wy0 + 0.008],
    [mx(xe - 0.039), wy1 - 0.009],
    [mx(xr + 0.03), wy1 - 0.009],
  ]
  out.push(sidePoly(f > 0 ? ip : ip.slice().reverse(), zw + 0.0075, sz, 0.0018, GLASS))
  // door handle strip and the vent grille low on the panel
  out.push(box(0.008, 0.03, 0.003, mx(xr + 0.008), h * 0.5, sz * (zw + 0.0068), '#d3d8de'))
  for (let k = 0; k < 4; k++) out.push(box(0.04, 0.0035, 0.002, mx(xr + 0.06), h * 0.2 + k * 0.009, sz * (zw + 0.0067), BLUE_DARK))
  return out
}

export const ubahnMuc1: ModelDef = {
  sign: ubahnMuc1Sign,
  lamp: ubahnMuc1Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    // dark skirts along the underframe (the wheels peek out below them) and the equipment boxes between the bogies
    out.push(box(c.len * 0.86, 0.05, c.w * 0.76, 0, -0.03, 0, '#1d2127'))
    for (const sz of [-1, 1]) out.push(box(c.len * 0.5, 0.036, 0.006, 0, -0.014, sz * (c.w * 0.375 + 0.002), '#363c44'))
    out.push(box(c.len * 0.17, 0.056, c.w * 0.58, -c.len * 0.1, -0.046, 0, '#2d333a'))
    out.push(box(c.len * 0.12, 0.048, c.w * 0.5, c.len * 0.14, -0.041, 0, '#2a3036'))
    out.push(cylX(0.018, c.len * 0.14, 0, -0.06, 0.075, '#3a4149'))
    out.push(cylX(0.014, c.len * 0.1, 0, -0.058, -0.075, '#3a4149'))
    // bogies: frame, motors, brake discs, two axles on the rails (rails stand 0.085 either side of the centre line)
    for (const sx of [-1, 1]) {
      const bx = sx * c.len * 0.3
      out.push(box(0.3, 0.022, 0.2, bx, -0.026, 0, '#13171b'))
      out.push(box(0.1, 0.05, 0.09, bx, -0.034, 0, '#2b3137'))
      out.push(box(0.05, 0.02, 0.17, bx, -0.018, 0, '#222830'))
      for (const dx of [-0.11, 0.11]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        out.push(cylZ(0.022, 0.008, bx + dx, -0.027, 0.04, '#5a626c', 10))
        out.push(cylZ(0.022, 0.008, bx + dx, -0.027, -0.04, '#5a626c', 10))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#4c545e', 12))
          out.push(cylZ(0.022, 0.02, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
          out.push(cylZ(0.007, 0.014, bx + dx, -0.012, sz * 0.1, '#6b7580', 6))
        }
      }
      for (const sz of [-1, 1]) {
        out.push(box(0.3, 0.012, 0.012, bx, -0.02, sz * 0.1, '#1e2328'))
        // third-rail collector: a beam out of the frame, an insulator and the copper-coloured shoe
        out.push(box(0.06, 0.008, 0.03, bx, -0.03, sz * 0.12, '#262b31'))
        out.push(box(0.012, 0.016, 0.01, bx + 0.015, -0.034, sz * 0.14, '#cbbd9a'))
        out.push(box(0.05, 0.006, 0.02, bx, -0.046, sz * 0.152, '#b0743a'))
      }
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const h = c.h
    const wy0 = h * 0.38
    const wy1 = h * 0.8
    const isCab = (x0: number, x1: number) => (c.nF > 0 && x1 > c.len / 2 - c.nF - 0.07) || (c.nR > 0 && x0 < -c.len / 2 + c.nR + 0.07)
    for (const s of [-1, 1] as const) {
      // windows: dark rim, tinted glass pane proud of the wall
      for (const [x0, x1] of c.wins) {
        if (isCab(x0, x1)) continue
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.012, wy1 - wy0 + 0.012, 0.006, cx, (wy0 + wy1) / 2, s * (zw + 0.0015), '#12161b'))
        out.push(box(x1 - x0, wy1 - wy0, 0.008, cx, (wy0 + wy1) / 2, s * (zw + 0.002), GLASS))
        // a silver sill strip under each window
        out.push(box(x1 - x0 + 0.01, 0.006, 0.007, cx, wy0 - 0.012, s * (zw + 0.0015), SILVER_DARK))
      }
      // doors: a blue surround wider than the leaves, silver leaves with two tall glass panes, a seam, a lamp strip above and a button beside
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        out.push(box(dw + 0.05, h * 0.66, 0.006, cx, h * 0.485, s * (zw + 0.0015), c.line))
        out.push(box(dw + 0.012, h * 0.665, 0.0075, cx, h * 0.44, s * (zw + 0.002), '#8e959e'))
        out.push(box(dw, h * 0.64, 0.008, cx, h * 0.44, s * (zw + 0.0025), SILVER))
        for (const sl of [-1, 1]) out.push(box(dw / 2 - 0.022, h * 0.5, 0.0095, cx + sl * (dw / 4 + 0.0015), h * 0.5, s * (zw + 0.0032), GLASS))
        out.push(box(0.004, h * 0.64, 0.0105, cx, h * 0.44, s * (zw + 0.0036), '#14181d'))
        out.push(box(dw * 0.46, 0.008, 0.005, cx, h * 0.795, s * (zw + 0.0042), '#e6eef8'))
        out.push(box(0.01, 0.018, 0.007, x1 + 0.031, h * 0.42, s * (zw + 0.0035), '#e8ecf0'))
      }
      // the MVG mark on the dark skirt, next to the first door of the car
      const d0 = c.doors[0]
      if (d0) {
        out.push(box(0.05, 0.011, 0.002, d0[1] + 0.14, h * 0.1, s * (zw + 0.001), '#e9edf2'))
        out.push(box(0.02, 0.011, 0.0022, d0[1] + 0.185, h * 0.1, s * (zw + 0.001), '#2f79d6'))
      }
      if (c.nF > 0) out.push(...cabFlank(c, s, true))
      if (c.nR > 0) out.push(...cabFlank(c, s, false))
    }

    // roof: low air conditioning hoods with grilles, a cable duct and a roof antenna; no pantograph
    for (const f of [-0.28, 0.24]) {
      out.push(box(c.len * 0.2, 0.014, 0.17, c.len * f, c.h + 0.002, 0, '#8e959e'))
      for (const k of [-1, 0, 1]) out.push(box(c.len * 0.14, 0.004, 0.014, c.len * f, c.h + 0.011, k * 0.05, '#686f78'))
    }
    out.push(box(c.len * 0.3, 0.005, 0.02, c.len * -0.02, c.h + 0.002, 0, '#6a717a'))
    if (c.role === 'mid' || c.role === 'single') out.push(box(0.05, 0.008, 0.04, c.len * 0.05, c.h + 0.004, 0.0, '#c5cad1'))
    if (c.nF > 0) out.push(bar(c.len / 2 - c.nF - 0.3, c.h, c.len / 2 - c.nF - 0.34, c.h + 0.028, 0, 0.004, 0.004, '#1a1e23'))

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
