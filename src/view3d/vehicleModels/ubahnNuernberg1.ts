import * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, paint, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Nuremberg U-Bahn class G1 (Siemens Inspiro, VAG, photos "U-Bahn Nuernberg / Zug 1"): graphite body with dark glass,
 * a red frame (VAG red = the livery colour) that sweeps from the sloped nose over the A-pillars and along the roof edge, white
 * lower panels over a red base stripe, doors in a black frame with red light bands. The front is a big black face under the red
 * arch: one wide windscreen whose top holds the destination display, slim white LED head lights in the lower corners with the
 * round emblem between them, a red strip and a dark grey bumper with the coupler below. Third-rail train: current collector
 * shoes on the bogies instead of a pantograph.
 */

const BLACK = '#0d1014'
const GRAPHITE = '#23272d'
const WHITE = '#eceef0'
const GREY = '#3b4048'
const GREY_L = '#7b828c'
const INK = '#111b25'

const FACE_BOTTOM = 0.1
const FACE_TOP_GAP = 0.02
const GLASS_BOTTOM = 0.158

/** The black face on the end face: bottom, top, centre, height and width (at the bottom). */
function face(m: FrontMetrics) {
  const y0 = FACE_BOTTOM
  const y1 = m.capTop - FACE_TOP_GAP
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, wb: 2 * m.capHW - 0.036 }
}

/** The windscreen inside the face. */
function screen(m: FrontMetrics) {
  const f = face(m)
  const y0 = GLASS_BOTTOM
  const y1 = f.y1 - 0.011
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, wb: f.wb - 0.03 }
}

export const ubahnNue1Sign = (m: FrontMetrics) => {
  const s = screen(m)
  return { y: s.y1 - 0.022, w: s.wb * 0.78, h: (s.wb * 0.78) / 5.5, x: 0.0122 }
}
export const ubahnNue1Lamp = (m: FrontMetrics) => {
  const f = face(m)
  return { y: f.y0 + 0.027, z: f.wb * 0.355, w: 0.08, h: 0.0085 }
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
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 })
  g.rotateY(Math.PI / 2)
  g.translate(x, y, z)
  g.deleteAttribute('uv') // ExtrudeGeometry is already non-indexed with normals
  return paint(g, hex)
}

/** The round emblem standing proud of the front. */
function emblem(x: number, y: number, z: number, r: number): THREE.BufferGeometry[] {
  return [cylX(r, 0.003, x + 0.0015, y, z, '#d9dde2', 20), cylX(r * 0.72, 0.0036, x + 0.0018, y, z, '#1b2026', 20), cylX(r * 0.4, 0.0042, x + 0.0021, y, z, '#e7eaee', 16)]
}

/** Everything on the front (or, turned round, the rear) end face of a car with a nose. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const f = face(m)
  const s = screen(m)
  const lamp = ubahnNue1Lamp(m)
  const sign = ubahnNue1Sign(m)
  const parts: THREE.BufferGeometry[] = []

  // the black face under the red arch (the red is the painted nose), the windscreen inside it
  parts.push(frontShape(taper(f.wb, f.wb * 0.95, f.h, 0.028, 0.055), x, f.cy, 0, 0.006, BLACK))
  parts.push(frontShape(taper(s.wb, s.wb * 0.93, s.h, 0.016, 0.045), x + 0.006, s.cy, 0, 0.0025, INK))
  // faint reflections across the glass
  parts.push(frontShape(taper(0.07, 0.04, s.h - 0.05, 0.006, 0.006), x + 0.0085, s.cy - 0.004, -s.wb * 0.24, 0.0006, '#18262f'))
  parts.push(frontShape(taper(0.022, 0.012, s.h - 0.05, 0.004, 0.004), x + 0.0085, s.cy - 0.004, -s.wb * 0.08, 0.0006, '#18262f'))
  // lighter driver's cab behind the glass: dashboard edge along the lower rim of the glass
  parts.push(frontPlate(s.wb * 0.9, 0.012, 0.004, x + 0.0085, s.y0 + 0.013, 0, 0.0008, '#161d24'))
  // recess behind the destination display
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.008, 0.008, x + 0.009, sign.y, 0, 0.0015, '#05070a'))
  // wipers parked across the lower edge of the glass
  const a = 1.3
  for (const zp of [-0.085, 0.015]) {
    const L = 0.095
    parts.push(box(0.0025, L, 0.004, x + 0.0098, s.y0 + 0.025 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#040506', 0, a))
  }
  // head light housings (the lit lamps themselves are separate meshes, see CarMesh) with a slim dark eyebrow above
  for (const sz of [-1, 1]) {
    parts.push(frontPlate(lamp.w + 0.016, lamp.h + 0.011, 0.005, x + 0.0066, lamp.y, sz * lamp.z, 0.0014, '#06080a'))
    parts.push(box(0.003, 0.004, lamp.w * 0.8, x + 0.0074, lamp.y + 0.0105, sz * (lamp.z + 0.004), '#161b20', 0, sz * 0.12))
  }
  parts.push(...emblem(x + 0.006, f.y0 + 0.027, 0, 0.0118))
  // small marker light and a sensor dome on top of the red arch
  parts.push(box(0.004, 0.006, 0.03, x + 0.002, c.capTop - 0.008, 0, '#f6f8fb'))
  parts.push(cylX(0.005, 0.004, x + 0.003, c.capTop - 0.0105, 0.055, '#161b20', 8))

  // dark grey bumper below the red strip, with a lip on top, the coupler and its hoses
  parts.push(frontPlate(c.capHW * 2 - 0.006, 0.042, 0.012, x - 0.001, 0.051, 0, 0.011, GREY))
  parts.push(box(0.016, 0.009, c.capHW * 2 - 0.012, x + 0.006, 0.075, 0, '#4a5059'))
  for (const sz of [-1, 1]) for (const k of [-1, 0, 1]) parts.push(box(0.003, 0.0035, 0.045, x + 0.0112, 0.052 + k * 0.011, sz * 0.1, '#262b31'))
  parts.push(box(0.02, 0.038, 0.1, x + 0.011, 0.048, 0, '#2a2f36'))
  parts.push(cylX(0.02, 0.03, x + 0.026, 0.044, 0, GREY_L))
  parts.push(cylX(0.009, 0.012, x + 0.043, 0.044, 0, '#14181c'))
  for (const sz of [-1, 1]) parts.push(cylX(0.004, 0.022, x + 0.02, 0.022, sz * 0.045, '#d3b329', 6))
  // obstacle deflector right in front of the wheels
  parts.push(box(0.012, 0.034, 0.23, x + 0.004, -0.012, 0, '#1c2127'))
  return rakeParts(parts, c.rake, c.h)
}

/** Strokes of the letters V, A and G on a unit cell (u across, v up): pairs of points. */
const GLYPHS: Record<string, [number, number][][]> = {
  V: [[[0, 1], [0.5, 0], [1, 1]]],
  A: [[[0, 0], [0.5, 1], [1, 0]], [[0.22, 0.36], [0.78, 0.36]]],
  G: [[[1, 0.82], [0.5, 1], [0, 0.8], [0, 0.2], [0.5, 0], [1, 0.2], [1, 0.46], [0.55, 0.46]]],
}

/** White lettering on a side wall (`dir` = +1 for the wall at +z, -1 for the one at -z: the text reads left to right from outside). */
function lettering(text: string, x0: number, y0: number, z: number, dir: 1 | -1, cell: number, height: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const t = height * 0.17
  let ox = x0
  for (const ch of text) {
    for (const stroke of GLYPHS[ch]) {
      for (let i = 0; i < stroke.length - 1; i++) {
        const [u0, v0] = stroke[i]
        const [u1, v1] = stroke[i + 1]
        const dx = dir * (u1 - u0) * cell
        const dy = (v1 - v0) * height
        out.push(box(Math.hypot(dx, dy) + t * 0.5, t, 0.0014, ox + dir * ((u0 + u1) / 2) * cell, y0 + ((v0 + v1) / 2) * height, z + dir * 0.0008, WHITE, Math.atan2(dy, dx)))
      }
    }
    ox += dir * cell * 1.35
  }
  return out
}

export const ubahnNuernberg1: ModelDef = {
  sign: ubahnNue1Sign,
  lamp: ubahnNue1Lamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    // floor and the side skirts between the bogies
    out.push(box(c.len * 0.9, 0.04, c.w * 0.8, 0, -0.02, 0, '#1b1f24'))
    for (const sz of [-1, 1]) out.push(box(c.len * 0.34, 0.044, 0.006, 0, -0.022, sz * (c.w * 0.37), '#2a2f36'))
    // equipment under the floor: traction converter with cooling fins, brake resistor, battery boxes, compressor, air tanks
    out.push(box(c.len * 0.2, 0.05, c.w * 0.54, -c.len * 0.02, -0.045, 0, '#3a4149'))
    for (let k = -3; k <= 3; k++) out.push(box(c.len * 0.17, 0.008, 0.003, -c.len * 0.02, -0.072, k * 0.026, '#262b31'))
    out.push(box(c.len * 0.11, 0.04, c.w * 0.42, c.len * 0.15, -0.04, 0, '#2c3239'))
    out.push(box(c.len * 0.09, 0.034, c.w * 0.5, -c.len * 0.18, -0.037, 0, '#313840'))
    out.push(box(c.len * 0.05, 0.046, c.w * 0.3, c.len * 0.04, -0.043, 0, '#222830'))
    out.push(cylX(0.019, c.len * 0.16, 0, -0.056, 0.075, '#3a4149'))
    out.push(cylX(0.015, c.len * 0.11, 0, -0.054, -0.075, '#3a4149'))
    // bogies (wheel base 2.1 m): frame, cross beams, motors with gear boxes, brake discs, springs, current collector shoes
    for (const sx of [-1, 1]) {
      const bx = sx * c.len * 0.3
      for (const sz of [-1, 1]) out.push(box(0.31, 0.014, 0.014, bx, -0.02, sz * 0.1, '#1a1e23'))
      for (const dx of [-0.07, 0.07]) out.push(box(0.016, 0.016, 0.2, bx + dx, -0.022, 0, '#13171b'))
      out.push(box(0.04, 0.012, 0.19, bx, -0.014, 0, '#1e2328'))
      for (const dx of [-0.126, 0.126]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        out.push(cylZ(0.021, 0.075, bx + dx * 0.52, -0.034, 0, '#2b3137', 10))
        out.push(box(0.036, 0.034, 0.03, bx + dx * 0.9, -0.034, 0.035 * Math.sign(sx), '#222830'))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.024, 0.006, bx + dx, -0.027, sz * 0.04, '#5a626c', 10))
          out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#4c545e', 12))
          out.push(cylZ(0.022, 0.02, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
          // axle box and the primary spring above it
          out.push(box(0.03, 0.022, 0.014, bx + dx, -0.027, sz * 0.104, '#1c2025'))
          out.push(box(0.012, 0.018, 0.012, bx + dx, -0.011, sz * 0.1, '#6b7580'))
        }
      }
      for (const sz of [-1, 1]) {
        // secondary air spring and damper
        out.push(box(0.032, 0.016, 0.032, bx, -0.006, sz * 0.06, '#15191d'))
        out.push(cylX(0.005, 0.07, bx + 0.07, -0.014, sz * 0.045, '#8a929c', 6))
        // third-rail current collector: beam out of the bogie frame and the shoe
        out.push(box(0.014, 0.008, 0.034, bx, -0.036, sz * 0.12, '#2a2f36'))
        out.push(box(0.07, 0.006, 0.02, bx, -0.044, sz * 0.134, '#7a808a'))
        out.push(box(0.074, 0.003, 0.024, bx, -0.0475, sz * 0.134, '#3a3f46'))
      }
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const h = c.h
    const wy0 = h * 0.4
    const wy1 = h * 0.82
    const red = c.line
    const hl = c.len / 2
    const cabX1 = c.nF > 0 ? hl - c.nF - 0.014 : 0
    const cabX0 = cabX1 - 0.115
    for (const s of [-1, 1] as const) {
      // windows: dark rim, tinted glass pane proud of the wall
      for (const [x0, x1] of c.wins) {
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.01, wy1 - wy0 + 0.01, 0.006, cx, (wy0 + wy1) / 2, s * (zw + 0.0015), BLACK))
        out.push(box(x1 - x0, wy1 - wy0, 0.008, cx, (wy0 + wy1) / 2, s * (zw + 0.002), GLASS))
      }
      // the tall narrow side window of the cab behind the nose (the same on the rear end of the tail car)
      for (const [e0, e1, ok] of [
        [cabX0, cabX1, c.nF > 0],
        [-hl + c.nR + 0.014, -hl + c.nR + 0.129, c.nR > 0],
      ] as [number, number, boolean][]) {
        if (!ok) continue
        const cx = (e0 + e1) / 2
        out.push(box(e1 - e0 + 0.01, h * 0.42 + 0.01, 0.006, cx, h * 0.6, s * (zw + 0.0015), BLACK))
        out.push(box(e1 - e0, h * 0.42, 0.008, cx, h * 0.6, s * (zw + 0.002), GLASS))
      }
      // doors: black frame, two glass leaves with a dark lower part, the seam, red light bands on both edges and a display above
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        out.push(box(dw + 0.014, h * 0.75, 0.006, cx, h * 0.4575, s * (zw + 0.0015), BLACK))
        for (const sl of [-1, 1]) {
          out.push(box(dw / 2 - 0.014, h * 0.63, 0.0092, cx + sl * (dw / 4 + 0.0015), h * 0.485, s * (zw + 0.0026), GLASS))
          out.push(box(dw / 2 - 0.014, h * 0.09, 0.0092, cx + sl * (dw / 4 + 0.0015), h * 0.155, s * (zw + 0.0026), GRAPHITE))
          out.push(box(0.0045, h * 0.72, 0.0105, cx + sl * (dw / 2 + 0.0015), h * 0.455, s * (zw + 0.0032), red))
        }
        out.push(box(0.005, h * 0.73, 0.0105, cx, h * 0.455, s * (zw + 0.003), '#07090b'))
        out.push(box(dw * 0.55, 0.009, 0.005, cx, h * 0.835, s * (zw + 0.002), '#0b0e12'))
        out.push(box(dw * 0.3, 0.004, 0.0058, cx, h * 0.835, s * (zw + 0.002), '#ffb53d'))
        out.push(box(0.01, 0.016, 0.007, x1 + 0.014, h * 0.42, s * (zw + 0.003), '#3f9a4b'))
      }
      // "VAG" in white on the red base stripe, in the first bay of the car
      const d0 = c.doors[0]
      if (d0) {
        const bx = (-hl + (c.nR > 0 ? c.nR + 0.04 : 0.13) + d0[0]) / 2
        out.push(...lettering('VAG', bx - s * 0.03, h * 0.095, s * zw, s, 0.011, h * 0.062))
      }
    }

    // roof: two air conditioning units with grilles, cable duct and antenna on the head cars
    for (const f of [-0.27, 0.16]) {
      out.push(box(c.len * 0.2, 0.016, 0.16, c.len * f, h + 0.003, 0, '#a7adb5'))
      out.push(box(c.len * 0.21, 0.006, 0.168, c.len * f, h - 0.002, 0, '#80878f'))
      for (const k of [-1, 0, 1]) out.push(box(c.len * 0.14, 0.004, 0.014, c.len * f, h + 0.012, k * 0.048, '#6c737c'))
    }
    out.push(box(c.len * 0.3, 0.005, 0.022, c.len * -0.05, h + 0.002, 0, '#6a717a'))
    if (c.role === 'mid' || c.role === 'single') out.push(box(0.05, 0.012, 0.06, 0, h + 0.006, 0.05, '#9aa1aa'))
    if (c.nF > 0) out.push(box(0.05, 0.02, 0.006, hl - c.nF - 0.2, h + 0.008, 0, '#d9dde2', -0.35))
    // ribbed bellows in the gap to the car ahead (the walk-through G1 has a wide, folded one; the shell adds a plain box on the other side)
    if (c.nF === 0) {
      for (const k of [0, 1, 2, 3]) out.push(box(0.007, h * 0.88, c.w * 0.84, hl + 0.006 + k * 0.014, h * 0.45, 0, k % 2 ? '#14181c' : '#2a2f36'))
    }

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
