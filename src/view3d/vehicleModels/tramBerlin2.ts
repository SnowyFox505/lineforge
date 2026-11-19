import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Berlin tram, Alstom Flexity "Urbanliner" of the BVG (photos "Straßenbahn Berlin / Zug 2": 5001-A, 5005-B): 2.40 m wide, signal yellow
 * body with a white roof, tall dark side windows, double doors with big glass leaves, black bellows between the modules. The front is
 * a blunt, slightly raked face: a wide black windscreen frame with the destination display at the top of the glass, a white roof cap
 * above it, a silver lamp strip (round lenses, the BERLIN plate between them) and a bulging yellow chin below. A single
 * cab side window wraps round the corner behind the windscreen. Single-arm pantograph and air conditioning on the roof.
 * Driving direction +x; both ends are driver's cabs.
 */

const BLACK = '#0d0f11'
const RUBBER = '#15181b'
const FRONT_GLASS = '#2a3b4b'
const SILVER = '#a9afb5'
const WHITE = '#eef0f2'
const DOOR = '#2b3036'

// face layout (heights above the car underside)
const WS0 = 0.124
const LAMP_Y = 0.1

export const tramBerlin2Sign = (m: FrontMetrics) => ({ y: m.capTop - 0.049, w: Math.min(0.17, 2 * m.capHW * 0.68), h: 0.026, x: 0.0122 })
export const tramBerlin2Lamp = (m: FrontMetrics) => ({ y: LAMP_Y, z: m.capHW * 0.5, w: 0.02, h: 0.02, round: true })

/** A plate on the front face with a flat bottom edge and rounded top corners (radius r): half width hw, from y0 to y1, standing `depth` proud of x. */
function capPlate(hw: number, y0: number, y1: number, r: number, x: number, depth: number, hex: string): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-hw, y0)
  s.lineTo(hw, y0)
  s.lineTo(hw, y1 - r)
  s.quadraticCurveTo(hw, y1, hw - r, y1)
  s.lineTo(-hw + r, y1)
  s.quadraticCurveTo(-hw, y1, -hw, y1 - r)
  s.lineTo(-hw, y0)
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 })
  g.rotateY(Math.PI / 2)
  g.translate(x, 0, 0)
  g.deleteAttribute('uv')
  return paint(g, hex)
}

/** A thin bar between two points in the x-y plane (pantograph arms). */
function arm(x0: number, y0: number, x1: number, y1: number, t: number, z: number, d: number, hex: string): THREE.BufferGeometry {
  return box(Math.hypot(x1 - x0, y1 - y0), t, d, (x0 + x1) / 2, (y0 + y1) / 2, z, hex, Math.atan2(y1 - y0, x1 - x0))
}

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const hw = c.capHW
  const lamp = tramBerlin2Lamp(m)
  const sign = tramBerlin2Sign(m)
  const parts: THREE.BufferGeometry[] = []
  const WS1 = c.capTop - 0.022
  const cy = (WS0 + WS1) / 2

  // white roof cap over the windscreen, with the little sensor dome on top
  parts.push(capPlate(hw - 0.0015, WS1 - 0.04, c.capTop - 0.0006, c.roofR * 0.88, x, 0.004, WHITE))
  parts.push(cylX(0.0065, 0.002, x + 0.0045, c.capTop - 0.0115, 0, '#c4c9ce', 10))

  // windscreen: black frame, dark glass, recess for the display, wipers, maker's name
  parts.push(capPlate(hw - 0.003, WS0, WS1, 0.045, x, 0.006, BLACK))
  parts.push(capPlate(hw - 0.012, WS0 + 0.009, WS1 - 0.009, 0.038, x + 0.006, 0.0022, FRONT_GLASS))
  // a faint lighter band under the display and a soft reflection
  parts.push(frontPlate(2 * hw - 0.03, 0.008, 0.002, x + 0.0082, sign.y - sign.h / 2 - 0.009, 0, 0.0007, '#34475a'))
  parts.push(frontPlate(0.03, WS1 - WS0 - 0.075, 0.004, x + 0.0082, cy - 0.012, -hw * 0.45, 0.0006, '#2b3d4f'))
  parts.push(frontPlate(sign.w + 0.01, sign.h + 0.007, 0.005, x + 0.0082, sign.y, 0, 0.0015, '#040506'))
  parts.push(box(0.0012, 0.0045, 0.03, x + 0.0092, WS0 + 0.0165, 0, '#aeb4ba'))
  const a = -1.3
  for (const [zp, L] of [
    [hw * 0.62, 0.098],
    [hw * 0.02, 0.092],
  ] as const) {
    parts.push(box(0.0022, L, 0.0045, x + 0.0098, WS0 + 0.026 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#050607', 0, a))
    parts.push(cylX(0.0045, 0.003, x + 0.0098, WS0 + 0.026, zp, '#1b1f23', 8))
  }

  // lamp strip: silver frame, dark inner band, lens housings, outer marker lights, small red lamps, the BERLIN plate between the lamps
  parts.push(frontPlate(2 * hw - 0.004, 0.038, 0.01, x, LAMP_Y, 0, 0.0065, SILVER))
  parts.push(frontPlate(2 * hw - 0.02, 0.027, 0.008, x + 0.0065, LAMP_Y, 0, 0.0012, '#343a40'))
  for (const sz of [-1, 1]) {
    parts.push(cylX(0.0128, 0.0018, x + 0.0077, LAMP_Y, sz * lamp.z, '#101316', 14))
    parts.push(cylX(0.0072, 0.002, x + 0.0079, LAMP_Y, sz * hw * 0.8, '#101316', 10))
    parts.push(cylX(0.0045, 0.0022, x + 0.0081, LAMP_Y, sz * hw * 0.8, '#7c848b', 8))
    parts.push(cylX(0.0042, 0.002, x + 0.0079, LAMP_Y, sz * hw * 0.27, '#c8271c', 8))
  }
  parts.push(frontPlate(0.056, 0.02, 0.003, x + 0.0077, LAMP_Y, 0, 0.0014, '#f2f3f1'))
  for (const [dz, col] of [
    [-0.017, '#c8271c'],
    [-0.008, '#16191c'],
    [0.002, '#16191c'],
    [0.012, '#16191c'],
    [0.02, '#c8271c'],
  ] as const)
    parts.push(box(0.0012, 0.008, 0.006, x + 0.0093, LAMP_Y, dz, col))

  // the bulging yellow chin with a red marker light, a dark rubber edge and the tow eye
  parts.push(frontPlate(2 * hw - 0.002, 0.082, 0.02, x, 0.04, 0, 0.017, c.body))
  parts.push(box(0.004, 0.003, 2 * hw - 0.024, x + 0.0155, 0.0095, 0, '#2a2d31'))
  parts.push(box(0.0022, 0.006, 0.016, x + 0.0182, 0.03, 0, '#d1281c'))
  parts.push(box(0.012, 0.006, 0.02, x + 0.0125, 0.0035, 0, '#3a4048'))
  return rakeParts(parts, c.rake, c.h)
}

/** The cab side window (it follows the curve of the nose), the side lamp, the flap and the car number. Built for the front end, both sides. */
function cabSide(c: CarCtx, dEnd: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const nz = c.spec.nose
  const hl = c.len / 2
  const xn = hl - nz
  const zw = c.w / 2
  const narrow = 1 - c.capHW / zw
  const drop = 1 - c.capTop / c.h
  const tOf = (x: number) => Math.max(0, (x - xn) / nz)
  const zOf = (x: number) => zw * (1 - narrow * tOf(x) ** 2)
  const topOf = (x: number) => c.h * (1 - drop * tOf(x) ** 2)
  const shear = (x: number, y: number) => x - c.rake * (y / c.h) * tOf(x)
  const x0 = dEnd + 0.015
  const xEnd = xn + nz * 0.99
  const N = 7
  const y0 = 0.14

  for (const s of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const xa = x0 + ((xEnd - x0) * i) / N
      const xb = x0 + ((xEnd - x0) * (i + 1)) / N
      const y1 = Math.min(topOf(xb) - c.roofR * (zOf(xb) / zw), c.h - c.roofR)
      const yc = (y0 + y1) / 2
      const hh = y1 - y0
      const ax = shear(xa, yc)
      const bx = shear(xb, yc)
      const az = zOf(xa)
      const bz = zOf(xb)
      const L = Math.hypot(bx - ax, bz - az)
      const ang = s * -Math.atan2(bz - az, bx - ax)
      const mx = (ax + bx) / 2
      const mz = (az + bz) / 2
      out.push(box(L + 0.002, hh + 0.011, 0.006, 0, 0, 0, RUBBER).rotateY(ang).translate(mx, yc, s * (mz + 0.0015)))
      out.push(box(L + 0.001, hh, 0.008, 0, 0, 0, GLASS).rotateY(ang).translate(mx, yc, s * (mz + 0.002)))
    }
    // side marker light (orange) at the roof edge, behind the cab window
    out.push(box(0.012, 0.012, 0.006, dEnd + 0.007, 0.318, s * (zw + 0.0005), '#f08c10'))
    // service flap on the lower nose, outlined; the car number below the doors
    const fx = xn + 0.05
    out.push(box(0.044, 0.0022, 0.003, fx, 0.112, s * (zw + 0.0008), '#9c7a00'))
    out.push(box(0.044, 0.0022, 0.003, fx, 0.07, s * (zw + 0.0008), '#9c7a00'))
    for (const dx of [-0.022, 0.022]) out.push(box(0.0022, 0.044, 0.003, fx + dx, 0.091, s * (zw + 0.0008), '#9c7a00'))
    out.push(box(0.008, 0.005, 0.004, fx + 0.012, 0.092, s * (zw + 0.0012), '#3a4048'))
    for (let k = 0; k < 6; k++) out.push(box(k === 4 ? 0.003 : 0.0045, 0.01, 0.003, xn - 0.048 + k * 0.0075, 0.075, s * (zw + 0.0008), '#2a2d31'))
  }
  return out
}

/** Double door: black frame, two leaves with a dark lower panel and a big glass pane, seal between the leaves. */
function door(c: CarCtx, x0: number, x1: number, s: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const zw = c.w / 2
  const cx = (x0 + x1) / 2
  const dw = x1 - x0
  const top = c.h - c.roofR
  const yc = (0.03 + top) / 2
  out.push(box(dw + 0.01, top - 0.03, 0.006, cx, yc, s * (zw + 0.0015), BLACK))
  for (const sl of [-1, 1]) {
    const lx = cx + sl * (dw / 4 + 0.001)
    out.push(box(dw / 2 - 0.006, 0.12, 0.0075, lx, 0.095, s * (zw + 0.0024), DOOR))
    out.push(box(dw / 2 - 0.006, top - 0.165, 0.0078, lx, (0.158 + top - 0.004) / 2, s * (zw + 0.0026), '#12161a'))
    out.push(box(dw / 2 - 0.013, top - 0.176, 0.0088, lx, (0.158 + top - 0.004) / 2, s * (zw + 0.0032), GLASS))
  }
  out.push(box(0.0035, top - 0.034, 0.0095, cx, yc, s * (zw + 0.0042), '#050607'))
  // door step edge and a grey rail above the opening
  out.push(box(dw + 0.012, 0.006, 0.0085, cx, 0.028, s * (zw + 0.0022), '#6f757c'))
  out.push(box(dw - 0.02, 0.0045, 0.0085, cx, top + 0.003, s * (zw + 0.002), '#5b6168'))
  return out
}

/** The black bellows between two cars: ribbed rounded plates filling half the gap from the end of this car. */
function bellows(c: CarCtx, end: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const depth = 0.0102
  const n = 5
  const y0 = 0.016
  const y1 = c.h * 0.965
  for (let k = 0; k < n; k++) {
    const kk = end > 0 ? k : n - 1 - k
    const x = end > 0 ? c.len / 2 + k * depth - 0.001 : -c.len / 2 - n * depth + k * depth + 0.001
    const big = kk % 2 === 0
    out.push(frontPlate(c.w * (big ? 0.93 : 0.88), (y1 - y0) * (big ? 1 : 0.95), big ? 0.055 : 0.05, x, (y0 + y1) / 2, 0, depth, big ? '#1a1c1f' : '#0b0c0e'))
  }
  // white cover over the joint at roof level
  out.push(box(2 * (n * depth) - 0.004, 0.006, c.w * 0.5, end * (c.len / 2), c.h * 0.968, 0, WHITE))
  return out
}

export const tramBerlin2: ModelDef = {
  sign: tramBerlin2Sign,
  lamp: tramBerlin2Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    // dark underframe with skirts between the bogies, battery and equipment boxes
    out.push(box(c.len * 0.9, 0.028, c.w * 0.84, 0, -0.012, 0, '#24282d'))
    for (const sz of [-1, 1]) out.push(box(c.len * 0.34, 0.03, 0.005, 0, -0.013, sz * (c.w / 2 - 0.006), '#30353b'))
    out.push(box(c.len * 0.18, 0.026, c.w * 0.6, c.len * 0.04, -0.038, 0, '#33393f'))
    out.push(box(c.len * 0.1, 0.022, c.w * 0.5, -c.len * 0.1, -0.034, 0, '#2c3238'))
    // bogies: frame, motors, two axles with small wheels on the rails (rails stand 0.085 either side of the centre line)
    for (const sx of [-1, 1]) {
      const bx = sx * c.len * 0.3
      out.push(box(0.25, 0.016, 0.19, bx, -0.03, 0, '#181c20'))
      out.push(box(0.09, 0.034, 0.1, bx, -0.044, 0, '#2a3036'))
      for (const dx of [-0.075, 0.075]) {
        out.push(cylZ(0.006, 0.19, bx + dx, -0.038, 0, '#2b3036', 6))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.032, 0.014, bx + dx, -0.038, sz * 0.085, '#59616b', 14))
          out.push(cylZ(0.016, 0.017, bx + dx, -0.038, sz * 0.085, '#2a3036', 8))
        }
      }
      for (const sz of [-1, 1]) out.push(box(0.24, 0.012, 0.012, bx, -0.03, sz * 0.1, '#1e2328'))
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.42
    const wy1 = c.h - c.roofR
    const wyc = (wy0 + wy1) / 2
    for (const s of [-1, 1] as const) {
      // side windows: black rubber rim, glass proud of the wall
      for (const [x0, x1] of c.wins) {
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.011, wy1 - wy0 + 0.011, 0.006, cx, wyc, s * (zw + 0.0015), RUBBER))
        out.push(box(x1 - x0, wy1 - wy0, 0.008, cx, wyc, s * (zw + 0.002), GLASS))
      }
      for (const [x0, x1] of c.doors) out.push(...door(c, x0, x1, s))
    }

    // roof: air conditioning unit with fan grilles and, on the middle car, the single-arm pantograph
    const unit = (x: number, len: number) => {
      out.push(box(len, 0.024, 0.15, x, c.h + 0.011, 0, '#d8dbde'))
      out.push(box(len - 0.03, 0.005, 0.12, x, c.h + 0.0235, 0, '#c4c8cc'))
      for (const k of [-0.28, 0.28]) out.push(box(len * 0.26, 0.002, 0.09, x + len * k, c.h + 0.026, 0, '#4a5056'))
    }
    if (c.role === 'head' || c.role === 'single') unit(-c.len * 0.14, 0.3)
    if (c.role === 'tail') unit(c.len * 0.14, 0.3)
    if (c.role === 'mid') unit(-c.len * 0.3, 0.2)
    if (c.role === 'mid' || (c.role === 'head' && c.spec.lens.length < 3) || c.role === 'single') {
      const px = c.role === 'mid' ? c.len * 0.12 : -c.len * 0.3
      out.push(box(0.15, 0.008, 0.1, px, c.h + 0.004, 0, '#6e747b'))
      for (const dx of [-0.05, 0.05]) for (const sz of [-1, 1]) out.push(box(0.012, 0.014, 0.012, px + dx, c.h + 0.014, sz * 0.04, '#c9cdd1'))
      out.push(box(0.12, 0.006, 0.09, px, c.h + 0.024, 0, '#5a6068'))
      out.push(arm(px - 0.05, c.h + 0.027, px + 0.025, c.h + 0.112, 0.008, 0, 0.012, '#8f959c'))
      out.push(arm(px + 0.025, c.h + 0.112, px - 0.04, c.h + 0.176, 0.006, 0, 0.01, '#9aa0a6'))
      out.push(box(0.018, 0.005, 0.17, px - 0.04, c.h + 0.18, 0, '#1d2024'))
      for (const sz of [-1, 1]) out.push(box(0.016, 0.01, 0.006, px - 0.04, c.h + 0.178, sz * 0.086, '#8f959c', 0.5))
    }

    // end faces with a nose (a cab), bellows where a car continues
    const dEnd = (front: boolean) => {
      const ds = c.doors.map((d) => (front ? d[1] : -d[0]))
      return ds.length ? Math.max(...ds) : c.len / 2 - c.spec.nose - 0.05
    }
    if (c.nF > 0) out.push(...endFace(c), ...cabSide(c, dEnd(true)))
    else out.push(...bellows(c, 1))
    if (c.nR > 0) out.push(...toRear([...endFace(c), ...cabSide(c, dEnd(false))]))
    else out.push(...bellows(c, -1))
    return out
  },
}
