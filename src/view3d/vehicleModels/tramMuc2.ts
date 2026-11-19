import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Munich tram, Siemens Avenio T (photos "Strassenbahn Muenchen / Zug 2"): four-section low-floor tram, 2.30 m wide, blue
 * body, thin light grey stripe under one continuous black window band, white roof. Black panorama windscreen with the
 * destination display in its top edge, blue apron below it with round LED head lights, a small crest and the coupler flap.
 * Doors: black glass double leaves, a single cab door behind each windscreen. Wheel fairings in body blue, grey bellows
 * between the sections, single-arm pantographs on the two middle sections, white roof with air conditioning units.
 */

const INK = '#0b0e12'
const FRAME = '#0f1317'
const BLACK = '#06080a'
const GREY = '#cdd2d8'
const ROOF_DARK = '#aeb4bc'
const UNDER = '#30363d'

/** The black windscreen block: bottom, top, centre, height, width at the bottom and the top. */
function screen(m: FrontMetrics) {
  const y0 = 0.108
  const y1 = m.capTop - 0.012
  const wb = 2 * m.capHW - 0.008
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, wb, wt: wb * 0.93 }
}

export const tramMuc2Sign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 - 0.027, w: s.wt * 0.72, h: 0.03, x: 0.0122 }
}
export const tramMuc2Lamp = (m: FrontMetrics) => ({ y: 0.064, z: m.capHW * 0.72, w: 0.022, h: 0.022, round: true })

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
  const lamp = tramMuc2Lamp(m)
  const sign = tramMuc2Sign(m)
  const parts: THREE.BufferGeometry[] = []

  // black windscreen block (frame) with the glass panel inside, a recess for the display in its top edge
  parts.push(frontShape(taper(s.wb, s.wt, s.h, 0.02, 0.05), x, s.cy, 0, 0.007, FRAME))
  parts.push(frontShape(taper(s.wb - 0.016, s.wt - 0.016, s.h - 0.014, 0.016, 0.044), x + 0.007, s.cy, 0, 0.0025, INK))
  // faint reflections across the glass
  parts.push(frontShape(taper(0.07, 0.04, s.h - 0.07, 0.008, 0.008), x + 0.0095, s.cy - 0.012, -s.wb * 0.22, 0.0006, '#18262f'))
  parts.push(frontShape(taper(0.018, 0.01, s.h - 0.07, 0.004, 0.004), x + 0.0095, s.cy - 0.012, s.wb * 0.05, 0.0006, '#18262f'))
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.01, x + 0.0095, sign.y, 0, 0.0015, BLACK))
  // one long wiper parked across the lower edge of the glass
  const a = 1.42
  const L = 0.15
  parts.push(box(0.0025, L, 0.0045, x + 0.0105, s.y0 + 0.026 + (L / 2) * Math.cos(a), -0.05 + (L / 2) * Math.sin(a), BLACK, 0, a))
  parts.push(cylX(0.005, 0.004, x + 0.0105, s.y0 + 0.022, -0.05, '#1a1f25', 8))

  // head light housings (the lit lamps themselves are separate meshes, see CarMesh), a small amber indicator beside each
  for (const sz of [-1, 1]) {
    parts.push(frontPlate(lamp.w + 0.016, lamp.h + 0.014, 0.008, x + 0.0085, lamp.y, sz * lamp.z, 0.0015, BLACK))
    parts.push(cylX(0.0045, 0.003, x + 0.0105, lamp.y + 0.004, sz * (lamp.z - 0.03), '#e9a02a', 8))
    parts.push(cylX(0.0045, 0.003, x + 0.0105, lamp.y - 0.006, sz * (lamp.z - 0.03), '#d8dde2', 8))
  }
  // crest between the head lights: dark disc with a pale ring
  parts.push(cylX(0.0125, 0.003, x + 0.0045, 0.066, 0, '#e8ecf0', 14))
  parts.push(cylX(0.0095, 0.0036, x + 0.0052, 0.066, 0, '#0f2a52', 14))
  parts.push(box(0.004, 0.011, 0.008, x + 0.0075, 0.066, 0, '#e8ecf0'))
  // marker light and a camera dome above the glass
  parts.push(box(0.004, 0.006, 0.05, x + 0.002, c.capTop - 0.004, 0, '#f6f8fb'))
  parts.push(cylX(0.005, 0.005, x + 0.003, c.capTop - 0.004, 0.075, '#1a1f25', 10))

  // coupler flap, bumper with a step plate below
  parts.push(frontPlate(0.095, 0.036, 0.006, x + 0.002, 0.043, 0, 0.012, '#262b31'))
  parts.push(box(0.006, 0.012, 0.07, x + 0.0155, 0.043, 0, '#3a424b'))
  parts.push(box(0.03, 0.03, c.capHW * 2 * 0.9, x + 0.004, 0.015, 0, '#1b2026'))
  parts.push(box(0.014, 0.005, c.capHW * 1.6, x + 0.017, 0.03, 0, '#4a525c'))
  for (const sz of [-1, 1]) parts.push(cylX(0.0035, 0.016, x + 0.0155, 0.026, sz * 0.045, '#d7b52a', 6))

  // rear-view mirrors on arms from the side wall (black, standing out beside the windscreen)
  for (const sz of [-1, 1]) {
    const mx = x - c.nF * 0.14
    const zs = sz * (c.w / 2) * (1 - (1 - c.capHW / (c.w / 2)) * 0.8)
    parts.push(box(0.014, 0.008, 0.012, mx, 0.252, zs + sz * 0.004, '#14181c'))
    parts.push(box(0.012, 0.007, 0.036, mx + 0.006, 0.252, zs + sz * 0.021, '#14181c'))
    parts.push(box(0.012, 0.05, 0.016, mx + 0.012, 0.232, zs + sz * 0.036, '#0d1013'))
    parts.push(box(0.0035, 0.044, 0.012, mx + 0.0185, 0.232, zs + sz * 0.036, '#4a5766'))
  }
  return rakeParts(parts, c.rake, c.h)
}

/** Dark corner windows on the sides of the nose, wrapping the windscreen round (built facing +x, follows the tapering side wall and the rake of the shell). */
function cornerGlass(c: CarCtx): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const narrow = 1 - c.capHW / (c.w / 2)
  const y0 = 0.125
  const y1 = c.capTop - 0.05
  const yc = (y0 + y1) / 2
  const N = 8
  for (let k = 0; k < N; k++) {
    const t0 = 0.02 + (0.96 * k) / N
    const t1 = 0.02 + (0.96 * (k + 1)) / N
    const tm = (t0 + t1) / 2
    const half = (c.w / 2) * (1 - narrow * tm * tm)
    const xm = c.len / 2 - c.nF + c.nF * tm - c.rake * (yc / c.h) * tm
    for (const sz of [-1, 1]) out.push(box((t1 - t0) * c.nF + 0.002, y1 - y0, 0.004, xm, yc, sz * (half + 0.0004), GLASS))
  }
  return out
}

/** x-intervals of doors along a car: double doors and, next to a nose, the single cab door. */
interface Opening {
  x0: number
  x1: number
  cab: boolean
}
function openings(c: CarCtx): Opening[] {
  const out: Opening[] = []
  const a = -c.len / 2 + (c.nR > 0 ? c.nR + 0.012 : 0.035)
  const b = c.len / 2 - (c.nF > 0 ? c.nF + 0.012 : 0.035)
  const dw = 0.15
  const cabW = 0.1
  if (c.nF > 0) out.push({ x0: b - cabW, x1: b, cab: true })
  if (c.nR > 0) out.push({ x0: a, x1: a + cabW, cab: true })
  if (c.nF > 0 && c.nR > 0) {
    out.push({ x0: -dw / 2, x1: dw / 2, cab: false })
  } else if (c.nF > 0) {
    for (const k of [0, 1]) {
      const cx = b - cabW - 0.11 - dw / 2 - k * 0.3
      out.push({ x0: cx - dw / 2, x1: cx + dw / 2, cab: false })
    }
  } else if (c.nR > 0) {
    for (const k of [0, 1]) {
      const cx = a + cabW + 0.11 + dw / 2 + k * 0.3
      out.push({ x0: cx - dw / 2, x1: cx + dw / 2, cab: false })
    }
  } else {
    const cx = (a + b) / 2
    out.push({ x0: cx - dw / 2, x1: cx + dw / 2, cab: false })
  }
  return out.sort((p, q) => p.x0 - q.x0)
}

export const tramMuc2: ModelDef = {
  sign: tramMuc2Sign,
  lamp: tramMuc2Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    // floor and the equipment under it
    out.push(box(c.len * 0.9, 0.03, c.w * 0.78, 0, -0.015, 0, '#1f242a'))
    out.push(box(c.len * 0.2, 0.034, c.w * 0.56, c.len * 0.08, -0.03, 0, '#313840'))
    // dark sill skirt along the lower edge, in front of the underbody
    for (const sz of [-1, 1]) out.push(box(c.len * 0.97, 0.03, 0.006, 0, -0.012, sz * (zw - 0.006), UNDER))

    // bogie positions: under the cab and at the articulation of a cab section, in the middle of a middle section
    const xs: number[] = []
    if (c.role === 'mid') xs.push(0)
    else {
      if (c.nF > 0) xs.push(c.len / 2 - c.nF - 0.15)
      else xs.push(c.len / 2 - 0.2)
      if (c.nR > 0) xs.push(-(c.len / 2 - c.nR - 0.15))
      else xs.push(-(c.len / 2 - 0.2))
    }
    const wy = -0.034
    for (const bx of xs) {
      out.push(box(0.26, 0.02, 0.17, bx, wy, 0, '#13171b'))
      out.push(box(0.09, 0.04, 0.09, bx, wy - 0.004, 0, '#2b3137'))
      for (const dx of [-0.1, 0.1]) {
        out.push(cylZ(0.006, 0.19, bx + dx, wy, 0, '#2b3036', 6))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.036, 0.014, bx + dx, wy, sz * 0.085, '#4c545e', 12))
          out.push(cylZ(0.018, 0.018, bx + dx, wy, sz * 0.085, '#2a3036', 8))
        }
      }
      for (const sz of [-1, 1]) out.push(box(0.26, 0.012, 0.012, bx, wy + 0.012, sz * 0.095, '#1e2328'))
      // wheel fairings in body blue with a dark wheel opening
      for (const sz of [-1, 1]) {
        out.push(box(0.29, 0.058, 0.007, bx, -0.026, sz * (zw - 0.005), c.line))
        out.push(box(0.09, 0.036, 0.0075, bx, -0.036, sz * (zw - 0.0045), '#0c0f12'))
        out.push(box(0.29, 0.005, 0.008, bx, 0.0, sz * (zw - 0.005), UNDER))
      }
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.37
    const wy1 = c.h * 0.83
    const wc = (wy0 + wy1) / 2
    const ops = openings(c)
    const a = -c.len / 2 + (c.nR > 0 ? c.nR + 0.012 : 0.035)
    const b = c.len / 2 - (c.nF > 0 ? c.nF + 0.012 : 0.035)

    for (const s of [-1, 1] as const) {
      const z = (d: number) => s * (zw + d)
      // window panes between the doors: dark rim, glass, blue pillars between the panes
      const cuts: [number, number][] = []
      let from = a
      for (const o of ops) {
        if (o.x0 - from > 0.03) cuts.push([from, o.x0 - 0.006])
        from = o.x1 + 0.006
      }
      if (b - from > 0.03) cuts.push([from, b])
      for (const [p, q] of cuts) {
        const n = Math.max(1, Math.round((q - p + 0.02) / 0.19))
        out.push(box(q - p + 0.008, wy1 - wy0 + 0.008, 0.003, (p + q) / 2, wc, z(0.001), FRAME))
        out.push(box(q - p, wy1 - wy0, 0.0045, (p + q) / 2, wc, z(0.0015), GLASS))
        for (let k = 1; k < n; k++) {
          const px = p + ((q - p) * k) / n
          out.push(box(0.016, wy1 - wy0, 0.0058, px, wc, z(0.0021), c.line))
        }
      }
      // doors
      for (const o of ops) {
        const cx = (o.x0 + o.x1) / 2
        const dw = o.x1 - o.x0
        const y0 = c.h * 0.075
        const y1 = c.h * 0.8
        out.push(box(dw + 0.012, y1 - y0 + 0.01, 0.0045, cx, (y0 + y1) / 2, z(0.0012), FRAME))
        if (o.cab) {
          // single cab door: blue lower leaf, small black window above, handle
          out.push(box(dw - 0.006, c.h * 0.28, 0.0055, cx, c.h * 0.21, z(0.002), c.line))
          out.push(box(dw - 0.006, c.h * 0.03, 0.0058, cx, c.h * 0.355, z(0.0022), GREY))
          out.push(box(dw - 0.008, y1 - c.h * 0.39, 0.0055, cx, (y1 + c.h * 0.39) / 2, z(0.002), GLASS))
          out.push(box(0.014, 0.005, 0.007, cx - dw * 0.3, c.h * 0.33, z(0.0045), '#e6e9ed'))
          continue
        }
        for (const sl of [-1, 1]) {
          out.push(box(dw / 2 - 0.007, y1 - y0 - 0.006, 0.0058, cx + sl * (dw / 4 + 0.0008), (y0 + y1) / 2, z(0.002), GLASS))
          // grey sill stripe continues across the lower part of each leaf
        }
        out.push(box(0.004, y1 - y0, 0.0068, cx, (y0 + y1) / 2, z(0.0024), BLACK))
        out.push(box(dw - 0.004, 0.012, 0.0062, cx, y0 + 0.006, z(0.0022), '#1a1f25'))
        // door display above the leaves (amber text on black) and a door push button beside
        out.push(box(dw * 0.7, 0.016, 0.003, cx, c.h * 0.815, z(0.0035), BLACK))
        out.push(box(dw * 0.52, 0.006, 0.0032, cx, c.h * 0.815, z(0.0043), '#ff9b2d'))
        out.push(box(0.008, 0.016, 0.005, o.x1 + 0.014, c.h * 0.42, z(0.003), '#2f9a4a'))
      }
    }

    // bellows towards the section behind: dark pleated tube, pale cover plates at the sides and on the roof
    if (c.role === 'head' || c.role === 'mid') {
      const g = c.spec.gap
      const bx = -c.len / 2 - g / 2
      const bh = c.h * 0.9
      const bw = c.w * 0.84
      out.push(box(g + 0.012, bh, bw, bx, c.h * 0.46, 0, '#23282e'))
      for (let k = 0; k < 5; k++) out.push(box(0.005, bh + 0.005, bw + 0.005, bx - g * 0.36 + (g * 0.72 * k) / 4, c.h * 0.46, 0, '#3b4148'))
      for (const sz of [-1, 1]) out.push(box(g - 0.012, c.h * 0.7, 0.004, bx, c.h * 0.5, sz * (bw / 2 + 0.002), '#9aa1aa'))
      out.push(box(g - 0.012, 0.005, bw * 0.55, bx, c.h * 0.915, 0, '#9aa1aa'))
    }

    // roof: air conditioning units, cable duct, the antenna dome of the cab sections; middle sections carry a pantograph
    const toNose = c.nF > 0 ? 1 : -1
    const hasNose = c.nF > 0 || c.nR > 0
    const acX = hasNose ? -toNose * 0.1 : -0.17
    const acL = hasNose ? 0.4 : 0.22
    out.push(box(acL, 0.016, 0.15, acX, c.h + 0.003, 0, ROOF_DARK))
    out.push(box(acL + 0.01, 0.006, 0.158, acX, c.h - 0.002, 0, '#8d949d'))
    for (const k of [-1, 0, 1]) out.push(box(acL * 0.8, 0.004, 0.012, acX, c.h + 0.012, k * 0.045, '#8a919a'))
    out.push(box(c.len * 0.6, 0.004, 0.022, 0, c.h + 0.001, 0, '#c1c7ce'))
    if (hasNose) {
      const nx = toNose * (c.len / 2 - (c.nF > 0 ? c.nF : c.nR) - 0.12)
      out.push(box(0.05, 0.012, 0.03, nx, c.h + 0.005, 0.05, '#bfc5cc'))
      out.push(cylX(0.012, 0.01, nx + 0.075, c.h + 0.004, -0.05, '#1a1f25', 10))
    }
    if (c.role === 'mid' || c.role === 'single') {
      const px = 0.14
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(box(0.008, 0.016, 0.008, px + sx * 0.055, c.h + 0.01, sz * 0.055, '#c9ced5'))
      out.push(box(0.13, 0.008, 0.1, px - 0.01, c.h + 0.02, 0, '#59616b'))
      const base = px - 0.06
      const jx = px + 0.05
      out.push(bar(base, c.h + 0.03, jx, c.h + 0.1, 0.012, 0.007, 0.014, '#9aa1aa'))
      out.push(bar(base, c.h + 0.03, jx, c.h + 0.1, -0.012, 0.007, 0.014, '#9aa1aa'))
      out.push(bar(jx, c.h + 0.1, base - 0.01, c.h + 0.17, 0, 0.006, 0.012, '#aab1ba'))
      out.push(box(0.016, 0.008, 0.2, base - 0.012, c.h + 0.173, 0, '#d7dce2'))
      out.push(box(0.01, 0.005, 0.2, base - 0.012, c.h + 0.179, 0, '#1b2026'))
      for (const sz of [-1, 1]) out.push(box(0.012, 0.01, 0.014, base - 0.012, c.h + 0.172, sz * 0.1, '#7e858e'))
    }

    if (c.nF > 0) out.push(...endFace(c), ...cornerGlass(c))
    if (c.nR > 0) out.push(...toRear([...endFace(c), ...cornerGlass({ ...c, nF: c.nR })]))
    return out
  },
}
