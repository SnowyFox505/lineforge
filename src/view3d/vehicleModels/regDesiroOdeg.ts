import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Siemens Desiro HC (class 3462) in the ODEG livery (photos "Siemens Desiro / ODEG"): a single-deck electric unit with an
 * articulated (Jakobs bogie) set of cars. White body with a green belt at the bottom, a yellow-orange (the line colour) nose that runs
 * back along the head car to its first door with a white swoosh over the windows, yellow doors with two narrow glass slits, dark
 * tinted windows. The rounded front: a big tapered windscreen in a black mask with a white trim (destination display in its top),
 * a white lower panel with the wide LED head lights and the ODEG logo and unit number, ribbed vents in the green lower corners
 * with the coupler flap between. Roof: air conditioning units, a single-arm pantograph on the middle car, antennas.
 */

const TEAL = '#0b8a73'
const WHITE = '#eef0ec'
const MASK = '#14181c'
const FRONT_GLASS = '#1b2a37'
const FRAME = '#262b30'
const LOGO_TEXT = '#1b4a44'

// face layout
const WS_BOTTOM = 0.205
const WS_TOP_GAP = 0.016
const PANEL_BOTTOM = 0.118

/** The windscreen: bottom, top, centre height, height, and the width at the bottom and the top. */
function screen(m: FrontMetrics) {
  const y0 = WS_BOTTOM
  const y1 = m.capTop - WS_TOP_GAP
  const wb = 2 * m.capHW - 0.02
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, wb, wt: wb * 0.88 }
}

export const regDesiroOdegSign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 - 0.034, w: s.wt * 0.66, h: 0.032, x: 0.0122 }
}
export const regDesiroOdegLamp = (m: FrontMetrics) => ({ y: 0.162, z: m.capHW - 0.056, w: 0.054, h: 0.02 })

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

/** A flat shape stuck on a side wall (x along the car, y up); `s` = +1 for the +z wall, -1 for the -z wall. */
function wallShape(shape: THREE.Shape, zw: number, s: 1 | -1, depth: number, hex: string): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 })
  g.translate(0, 0, s > 0 ? zw : -zw - depth)
  g.deleteAttribute('uv')
  return paint(g, hex)
}

/** A thin bar between two points in the x-y plane (pantograph arms). */
function bar(x0: number, y0: number, x1: number, y1: number, z: number, t: number, d: number, hex: string): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, y1 - y0)
  return box(len, t, d, (x0 + x1) / 2, (y0 + y1) / 2, z, hex, Math.atan2(y1 - y0, x1 - x0))
}

/** A cylinder standing upright (fans, insulators). */
function cylY(r: number, h: number, x: number, y: number, z: number, hex: string, seg = 10): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, seg).toNonIndexed()
  g.deleteAttribute('uv')
  g.translate(x, y, z)
  return paint(g, hex)
}

// --- tiny 3x5 pixel font for the logo and the unit number ---
const FONT: Record<string, string[]> = {
  O: ['111', '101', '101', '101', '111'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  G: ['111', '100', '101', '101', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '.': ['000', '000', '000', '000', '010'],
  '-': ['000', '000', '111', '000', '000'],
  ' ': ['000', '000', '000', '000', '000'],
}

/** Horizontal runs of lit pixels of a text: [first column, run length, row (0 = top)] and the total width in pixels. */
function textRuns(text: string): { runs: [number, number, number][]; width: number } {
  const runs: [number, number, number][] = []
  let col = 0
  for (const ch of text) {
    const rows = FONT[ch] ?? FONT[' ']
    rows.forEach((row, r) => {
      let k = 0
      while (k < 3) {
        if (row[k] === '1') {
          let e = k
          while (e + 1 < 3 && row[e + 1] === '1') e++
          runs.push([col + k, e - k + 1, r])
          k = e + 1
        } else k++
      }
    })
    col += 4
  }
  return { runs, width: col - 1 }
}

/** Text on the front face (plane x = const, the reader looks towards -x, so the text runs towards -z), centred on (cy, cz). */
function frontText(text: string, x: number, cy: number, cz: number, pix: number, hex: string): THREE.BufferGeometry[] {
  const { runs, width } = textRuns(text)
  return runs.map(([c0, n, r]) => box(0.0014, pix, n * pix, x, cy + (2 - r) * pix, cz - ((c0 + n / 2 - width / 2) * pix), hex))
}

/** Text on a side wall: `dir` = +1 on the +z wall (runs towards +x), -1 on the -z wall. Centred on (cx, cy). */
function sideText(text: string, cx: number, cy: number, z: number, dir: 1 | -1, pix: number, hex: string): THREE.BufferGeometry[] {
  const { runs, width } = textRuns(text)
  return runs.map(([c0, n, r]) => box(n * pix, pix, 0.0014, cx + dir * (c0 + n / 2 - width / 2) * pix, cy + (2 - r) * pix, z, hex))
}

/** The ODEG chevron mark: three stacked yellow bars bent towards the text (front: plane x = const; side: plane z = const). */
function chevrons(yellow: string, cx: number, cy: number, z: number, s: number, side: 1 | -1 | 0): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const bw = 5.2 * s
  const bh = 1.5 * s
  for (let k = -1; k <= 1; k++) {
    const tilt = -k * 0.32
    if (side === 0) out.push(box(0.0014, bh, bw, cx, cy + k * 2.1 * s, z, yellow, 0, tilt))
    else out.push(box(bw, bh, 0.0014, cx, cy + k * 2.1 * s, z, yellow, side * tilt))
  }
  return out
}

/** ODEG logo on the front (z = centre) */
function frontLogo(x: number, cy: number, yellow: string): THREE.BufferGeometry[] {
  const pix = 0.0042
  const out: THREE.BufferGeometry[] = []
  const { width } = textRuns('ODEG')
  const tw = width * pix
  const total = tw + 0.03
  // text on the right (looking at the face: towards -z), chevrons on the left (+z)
  out.push(...frontText('ODEG', x, cy, -total / 2 + tw / 2 + 0.0, pix, LOGO_TEXT))
  out.push(...chevrons(yellow, x, cy, total / 2 - 0.011, 0.0045, 0))
  return out
}

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const s = screen(m)
  const lamp = regDesiroOdegLamp(m)
  const sign = regDesiroOdegSign(m)
  const parts: THREE.BufferGeometry[] = []

  // white trim of the windscreen, black mask, dark glass, recess of the destination display
  parts.push(frontShape(taper(s.wb, s.wt, s.h + 0.012, 0.022, 0.05), x, s.cy + 0.002, 0, 0.0045, WHITE))
  parts.push(frontShape(taper(s.wb - 0.05, s.wt - 0.054, s.h - 0.016, 0.018, 0.045), x + 0.0045, s.cy + 0.002, 0, 0.0028, MASK))
  parts.push(frontShape(taper(s.wb - 0.074, s.wt - 0.078, s.h - 0.04, 0.015, 0.04), x + 0.0073, s.cy + 0.002, 0, 0.0022, FRONT_GLASS))
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.01, x + 0.0095, sign.y, 0, 0.0015, '#06080a'))
  // faint reflections
  parts.push(frontShape(taper(0.06, 0.036, s.h - 0.09, 0.006, 0.006), x + 0.0095, s.cy - 0.012, -s.wb * 0.2, 0.0005, '#243646'))
  // wipers parked over the lower edge of the glass
  const a = 1.3
  for (const zp of [-0.1, 0.012]) {
    const L = 0.105
    parts.push(box(0.0025, L, 0.0045, x + 0.0105, s.y0 + 0.052 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#040506', 0, a))
  }
  // sensor / marker light dome at the roof edge
  parts.push(box(0.005, 0.007, 0.034, x + 0.002, c.capTop - 0.006, 0, '#f4f4ee'))
  parts.push(cylX(0.005, 0.005, x + 0.003, c.capTop - 0.006, 0.07, '#1a1f25', 10))

  // white lower panel, head light housings (the lit lamps are separate meshes, see CarMesh), logo and unit number
  parts.push(frontPlate(2 * c.capHW - 0.008, s.y0 - PANEL_BOTTOM + 0.004, 0.012, x + 0.0005, (PANEL_BOTTOM + s.y0) / 2 - 0.002, 0, 0.0042, WHITE))
  for (const sz of [-1, 1]) {
    parts.push(frontPlate(lamp.w + 0.016, lamp.h + 0.012, 0.007, x + 0.0045, lamp.y, sz * lamp.z, 0.0032, '#16191c'))
  }
  parts.push(...frontLogo(x + 0.0048, 0.178, '#f3a900'))
  parts.push(...frontText('3462 012-0', x + 0.0048, 0.133, 0, 0.0021, '#3c4147'))

  // ribbed vent blocks left and right of the coupler flap
  for (const sz of [-1, 1]) {
    const vz = sz * Math.min(0.1, c.capHW - 0.045)
    parts.push(frontPlate(0.062, 0.07, 0.008, x - 0.001, 0.085, vz, 0.011, '#14171a'))
    for (let k = 0; k < 6; k++) parts.push(box(0.004, 0.0032, 0.052, x + 0.0108, 0.058 + k * 0.0105, vz, '#434a52'))
  }
  // coupler flap, the coupler head and air hoses
  parts.push(box(0.022, 0.07, 0.1, x + 0.006, 0.068, 0, '#2d3238'))
  parts.push(box(0.01, 0.024, 0.07, x + 0.016, 0.098, 0, '#3a4149'))
  parts.push(cylX(0.021, 0.03, x + 0.022, 0.062, 0, '#737b86'))
  parts.push(cylX(0.009, 0.014, x + 0.038, 0.062, 0, '#14181c'))
  for (const sz of [-1, 1]) parts.push(cylX(0.004, 0.02, x + 0.015, 0.038, sz * 0.045, '#d7b52a', 6))
  // apron / buffer beam and a step plate
  parts.push(box(0.03, 0.03, c.capHW * 2 * 0.94, x + 0.004, 0.015, 0, '#1b2026'))
  parts.push(box(0.012, 0.006, c.capHW * 1.5, x + 0.016, 0.03, 0, '#3a424b'))
  return rakeParts(parts, c.rake, c.h)
}

/** The white swoosh over the windows of a head car's side (+1 front end, -1 rear end), on both walls. */
function swoosh(c: CarCtx, end: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const nose = end > 0 ? c.nF : c.nR
  if (nose <= 0 || c.doors.length === 0) return out
  const h = c.h
  const zw = c.w / 2
  // front boundary of the first door counted from the end, and where the nose starts
  const door = end > 0 ? c.doors[c.doors.length - 1] : c.doors[0]
  const xd = end > 0 ? door[1] : -door[0] // distance along the travel axis of this end
  const xn = c.len / 2 - nose
  const L = xn - xd // yellow stretch behind the nose
  for (const sz of [-1, 1] as const) {
    const sh = new THREE.Shape()
    // local coordinates measured from the door edge towards the nose, mirrored for the rear end
    const p = (t: number, yf: number): [number, number] => [end * (xd + t * L), h * yf]
    const pts: [number, number][] = [p(0, 0.3), p(0.3, 0.36), p(0.62, 0.47), p(0.86, 0.6), p(0.88, 0.75), p(0.8, 0.92), p(0.72, 0.99), p(0, 0.99)]
    sh.moveTo(pts[0][0], pts[0][1])
    for (const q of pts.slice(1)) sh.lineTo(q[0], q[1])
    out.push(wallShape(sh, zw + 0.0008, sz, 0.0022, WHITE))
  }
  return out
}

/** The bicycle pictogram on a white panel over a window (side wall, `s` = +1 / -1 for the wall). */
function bicycle(cx: number, cy: number, z: number, s: 1 | -1, w: number, hgt: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const panel = box(w, hgt, 0.004, cx, cy, z - s * 0.0015, WHITE)
  out.push(panel)
  const R = Math.min(w * 0.17, 0.034)
  const wy = cy - R * 0.9
  const rx = cx - R * 1.9
  const fx = cx + R * 1.9
  const zz = z + s * 0.0022
  for (const x of [rx, fx]) {
    const g = new THREE.TorusGeometry(R, 0.0032, 5, 18).toNonIndexed()
    g.deleteAttribute('uv')
    g.translate(x, wy, zz)
    out.push(paint(g, TEAL))
  }
  const bb: [number, number] = [cx - R * 0.1, wy]
  const seat: [number, number] = [cx - R * 0.55, wy + R * 1.35]
  const head: [number, number] = [cx + R * 1.45, wy + R * 1.4]
  const pts: [[number, number], [number, number]][] = [
    [[rx, wy], bb],
    [[rx, wy], seat],
    [bb, seat],
    [seat, head],
    [bb, head],
    [head, [fx, wy]],
    [head, [cx + R * 1.3, wy + R * 1.8]],
  ]
  for (const [a, b] of pts) out.push(bar(a[0], a[1], b[0], b[1], zz, 0.0034, 0.003, TEAL))
  out.push(box(R * 0.7, 0.004, 0.003, cx - R * 0.65, wy + R * 1.5, zz, TEAL))
  return out
}

export const regDesiroOdeg: ModelDef = {
  sign: regDesiroOdegSign,
  lamp: regDesiroOdegLamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    const hl = c.len / 2
    // underframe trough, side skirt panels and the equipment under the floor
    out.push(box(c.len * 0.94, 0.045, c.w * 0.8, 0, -0.026, 0, '#1f242a'))
    for (const sz of [-1, 1]) out.push(box(c.len * 0.7, 0.032, 0.005, 0, -0.012, sz * (c.w * 0.4 + 0.001), '#2c3238'))
    out.push(box(c.len * 0.16, 0.055, c.w * 0.58, -c.len * 0.12, -0.048, 0, '#313840'))
    out.push(box(c.len * 0.12, 0.048, c.w * 0.5, c.len * 0.1, -0.044, 0, '#2c3239'))
    out.push(box(c.len * 0.07, 0.04, c.w * 0.44, c.len * 0.2, -0.04, 0, '#394049'))
    out.push(cylX(0.02, c.len * 0.14, -c.len * 0.02, -0.062, 0.075, '#3a4149'))
    out.push(cylX(0.016, c.len * 0.09, c.len * 0.02, -0.058, -0.075, '#3a4149'))

    // bogies: the head car has the front one, every car except the tail the Jakobs bogie in the gap behind it, the tail its rear one
    const xs: number[] = []
    if (c.role === 'head' || c.role === 'single') xs.push(hl - c.nF - 0.1)
    if (c.role === 'tail' || c.role === 'single') xs.push(-hl + c.nR + 0.1)
    else xs.push(-hl - c.spec.gap / 2)
    if (c.role === 'head' || c.role === 'single') xs.splice(0, 1, hl - c.nF - 0.12)
    for (const bx of xs) {
      out.push(box(0.3, 0.022, 0.2, bx, -0.026, 0, '#13171b'))
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
        out.push(box(0.3, 0.012, 0.012, bx, -0.02, sz * 0.1, '#1e2328'))
        out.push(cylX(0.005, 0.07, bx + 0.07, -0.012, sz * 0.045, '#8a929c', 6))
      }
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.4
    const wy1 = c.h * 0.8
    for (const s of [-1, 1] as const) {
      // windows: dark rim, tinted glass pane proud of the wall
      for (const [x0, x1] of c.wins) {
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.01, wy1 - wy0 + 0.01, 0.006, cx, (wy0 + wy1) / 2, s * (zw + 0.0015), FRAME))
        out.push(box(x1 - x0, wy1 - wy0, 0.008, cx, (wy0 + wy1) / 2, s * (zw + 0.002), GLASS))
      }
      // doors: dark frame, two yellow leaves each with a tall narrow glass slit, the seam between them, a push button beside
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        out.push(box(dw + 0.012, c.h * 0.8, 0.006, cx, c.h * 0.455, s * (zw + 0.0015), FRAME))
        for (const sl of [-1, 1]) {
          const lx = cx + sl * (dw / 4 + 0.0012)
          out.push(box(dw / 2 - 0.006, c.h * 0.75, 0.008, lx, c.h * 0.47, s * (zw + 0.002), c.line))
          out.push(box(dw * 0.2, c.h * 0.5, 0.0095, lx, c.h * 0.56, s * (zw + 0.0026), GLASS))
        }
        out.push(box(0.004, c.h * 0.75, 0.0095, cx, c.h * 0.47, s * (zw + 0.003), '#8c6200'))
        out.push(box(0.012, 0.016, 0.008, x1 + 0.014, c.h * 0.42, s * (zw + 0.003), '#3f9a4b'))
        // step below the door
        out.push(box(dw, 0.006, 0.012, cx, 0.006, s * (zw + 0.004), '#2c3238'))
      }
      // ODEG logo above the windows, next to the first door of the car
      const d0 = c.doors[0]
      if (d0) {
        const lx = d0[1] + 0.13
        out.push(...sideText('ODEG', lx + s * 0.012, c.h * 0.9, s * (zw + 0.0008), s, 0.0032, LOGO_TEXT))
        out.push(...chevrons('#f3a900', lx - s * 0.036, c.h * 0.9, s * (zw + 0.0008), 0.0035, s))
      }
    }
    // the small tall cab window on the yellow side of each nose
    for (const [nose, end] of [[c.nF, 1], [c.nR, -1]] as const) {
      if (nose <= 0) continue
      for (const s of [-1, 1] as const) {
        const cx = end * (c.len / 2 - nose + 0.09)
        out.push(box(0.085, c.h * 0.36, 0.005, cx, c.h * 0.62, s * (zw * 0.9955 + 0.001), FRAME))
        out.push(box(0.075, c.h * 0.32, 0.006, cx, c.h * 0.62, s * (zw * 0.9955 + 0.0016), GLASS))
      }
    }
    // a bicycle bay: one window of the head and tail car is a white panel with the bicycle pictogram
    if (c.doors.length > 0 && c.role !== 'mid') {
      const bay = c.role === 'tail' ? [...c.wins].reverse().find(([, x1]) => x1 < c.doors[c.doors.length - 1][0]) : c.wins.find(([x0]) => x0 > c.doors[0][1])
      if (bay) for (const s of [-1, 1] as const) out.push(...bicycle((bay[0] + bay[1]) / 2, c.h * 0.6, s * (zw + 0.006), s, bay[1] - bay[0], (wy1 - wy0) / c.h * c.h))
    }
    // web address and unit number on the green belt
    for (const s of [-1, 1] as const) {
      const d0 = c.doors[0]
      if (!d0) continue
      out.push(...sideText('ODEG.DE', d0[1] + 0.18 * s, c.h * 0.19, s * (zw + 0.0008), s, 0.0022, '#e8efec'))
      out.push(...sideText('94 80 3462 004-3', d0[1] + 0.46 * s, c.h * 0.09, s * (zw + 0.0008), s, 0.0016, '#cfd9d5'))
    }
    if (c.nF > 0) out.push(...swoosh(c, 1))
    if (c.nR > 0) out.push(...swoosh(c, -1))

    // roof: two air conditioning units with fans, a cable duct and vents; the middle car carries the single-arm pantograph
    for (const f of [-0.27, 0.2]) {
      out.push(box(c.len * 0.2, 0.018, 0.16, c.len * f, c.h + 0.004, 0, '#b4bac1'))
      out.push(box(c.len * 0.21, 0.006, 0.168, c.len * f, c.h - 0.001, 0, '#7e858e'))
      for (const k of [-1, 1]) out.push(cylY(0.026, 0.004, c.len * (f + k * 0.045), c.h + 0.015, 0, '#5c636b', 12))
    }
    out.push(box(c.len * 0.3, 0.005, 0.02, -c.len * 0.03, c.h + 0.002, 0, '#6a717a'))
    for (const f of [-0.45, 0.4]) out.push(box(0.05, 0.01, 0.07, c.len * f, c.h + 0.004, 0, '#8d949c'))
    if (c.role === 'mid' || c.role === 'single' || (c.role === 'head' && c.spec.lens.length < 3)) {
      const px = -c.len * 0.02
      // insulators, base, the arm folded like a Z and the contact strip
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(cylY(0.007, 0.022, px + sx * 0.055, c.h + 0.012, sz * 0.05, '#c9ced5', 8))
      out.push(box(0.17, 0.012, 0.13, px, c.h + 0.026, 0, '#2a313b'))
      const jx = px + 0.06
      out.push(bar(px - 0.05, c.h + 0.034, jx, c.h + 0.1, 0.0, 0.007, 0.014, '#9aa1aa'))
      out.push(bar(jx, c.h + 0.1, px - 0.045, c.h + 0.158, 0.0, 0.006, 0.012, '#9aa1aa'))
      out.push(box(0.018, 0.006, 0.18, px - 0.045, c.h + 0.162, 0, '#d7dce2'))
      out.push(box(0.012, 0.004, 0.18, px - 0.045, c.h + 0.167, 0, '#1b2026'))
      out.push(box(0.2, 0.012, 0.02, px - 0.2, c.h + 0.01, 0, '#2a313b'))
    }
    // cable duct bridging the gap to the car behind
    if (c.role !== 'tail' && c.role !== 'single') out.push(box(0.12, 0.008, 0.03, -c.len / 2 - 0.005, c.h + 0.004, 0, '#6a717a'))
    // radio antennas on the head and tail car
    if (c.nF > 0) out.push(box(0.05, 0.02, 0.006, c.len / 2 - c.nF - 0.2, c.h + 0.008, 0, '#d9dde2', -0.35))

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
