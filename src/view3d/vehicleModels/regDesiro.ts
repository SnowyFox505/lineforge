import type * as THREE from 'three'
import { box, cylX, cylZ, frontPlate, GLASS, rakeParts, toRear } from './parts'
import type { CarCtx, FrontMetrics, ModelDef } from './types'

/**
 * Siemens Desiro (HC / "Franken-Thueringen-Express" look, Deutsche Bahn red): red body, dark roof, a white stripe over a light grey
 * lower body, light grey doors with a dark window, a leaning front with one big black panel (destination display on top, curved
 * windscreen below), white LED head lights low in the red cheeks with the DB logo between them, black apron with the coupler flap.
 * Electric: a single-arm pantograph on the middle car (or on the head car of a two-car train), flat AC units and roof pods.
 */

const RED_DARK = '#9d141a'
const PANEL = '#0d1013'
const ROOF_DARK = '#3d4249'
const ROOF_LIGHT = '#6b727b'

/** The big black front panel: bottom, top, centre height, size. */
function panel(m: FrontMetrics) {
  const y0 = m.capTop * 0.46
  const y1 = m.capTop - 0.011
  return { y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, w: Math.min(2 * m.capHW - 0.05, 0.27) }
}

export const regDesiroSign = (m: FrontMetrics) => {
  const p = panel(m)
  return { y: p.y1 - 0.028, w: p.w * 0.78, h: 0.034, x: 0.0122 }
}
export const regDesiroLogo = (m: FrontMetrics) => {
  const p = panel(m)
  return { y: p.y0 - 0.056, z: 0, w: 0.04, h: 0.022, x: 0.0104 }
}
export const regDesiroLamp = (m: FrontMetrics) => {
  const p = panel(m)
  return { y: p.y0 - 0.056, z: Math.min(m.capHW - 0.05, 0.095), w: 0.056, h: 0.016 }
}

/** Everything on the front end face of a head car. Built facing +x at x = len / 2. */
function endFace(c: CarCtx): THREE.BufferGeometry[] {
  const m: FrontMetrics = { capTop: c.capTop, capHW: c.capHW }
  const x = c.len / 2
  const p = panel(m)
  const lamp = regDesiroLamp(m)
  const sign = regDesiroSign(m)
  const parts: THREE.BufferGeometry[] = []

  // black panel with rounded top corners, the curved windscreen in it, the dark recess of the destination display above
  parts.push(frontPlate(p.w, p.h, 0.06, x, p.cy, 0, 0.007, PANEL))
  const gy0 = p.y0 + 0.014
  const gy1 = p.y1 - 0.058
  parts.push(frontPlate(p.w - 0.022, gy1 - gy0, 0.045, x + 0.007, (gy0 + gy1) / 2, 0, 0.0025, '#2f3f4b'))
  // a slim light reflection across the glass and the thin black centre pillar line of the windscreen frame
  parts.push(box(0.0015, (gy1 - gy0) * 0.88, 0.006, x + 0.0098, (gy0 + gy1) / 2, 0, '#10161b'))
  parts.push(frontPlate(sign.w + 0.012, sign.h + 0.01, 0.01, x + 0.0095, sign.y, 0, 0.0015, '#050607'))
  // wipers parked across the lower edge of the glass, washer nozzles
  const a = 1.3
  for (const zp of [-0.078, 0.008]) {
    const L = 0.095
    parts.push(box(0.0025, L, 0.0045, x + 0.0108, gy0 + 0.03 + (L / 2) * Math.cos(a), zp + (L / 2) * Math.sin(a), '#040506', 0, a))
  }
  // red frame lip around the panel's lower edge, a thin dark red line under the cheeks
  parts.push(box(0.004, 0.004, p.w, x + 0.002, p.y0 - 0.003, 0, RED_DARK))

  // head lights (the lit lamps are separate meshes, see CarMesh): black housings, white plate with the logo between them
  for (const sz of [-1, 1]) parts.push(frontPlate(lamp.w + 0.014, lamp.h + 0.011, 0.005, x + 0.0095, lamp.y, sz * lamp.z, 0.0015, '#07090b'))
  parts.push(frontPlate(0.05, 0.03, 0.006, x + 0.0092, lamp.y, 0, 0.0014, '#f1f2f3'))
  // number plate (white strip with the vehicle number) under the white stripe's top edge
  parts.push(box(0.003, 0.012, 0.062, x + 0.0035, p.y0 - 0.092, 0, '#e8eaec'))

  // black apron with two air grilles, the coupler flap and the coupler head
  parts.push(box(0.03, 0.036, c.capHW * 2 * 0.97, x + 0.003, 0.034, 0, '#1a1e23'))
  for (const sz of [-1, 1]) {
    const vz = sz * Math.min(0.1, c.capHW - 0.045)
    parts.push(frontPlate(0.062, 0.05, 0.008, x - 0.001, 0.07, vz, 0.007, '#14171b'))
    for (const dy of [-0.014, -0.005, 0.004, 0.013]) parts.push(box(0.003, 0.0028, 0.05, x + 0.0066, 0.07 + dy, vz, '#323941'))
  }
  parts.push(box(0.018, 0.058, 0.082, x + 0.007, 0.074, 0, '#31373e'))
  parts.push(box(0.004, 0.006, 0.07, x + 0.0165, 0.092, 0, '#1b1f24'))
  parts.push(cylX(0.019, 0.026, x + 0.02, 0.066, 0, '#6d7580'))
  parts.push(cylX(0.008, 0.012, x + 0.035, 0.066, 0, '#14181c'))
  // lower buffer beam / rail guard and two step plates
  parts.push(box(0.026, 0.012, c.capHW * 2 * 0.92, x + 0.004, 0.006, 0, '#101317'))
  for (const sz of [-1, 1]) parts.push(box(0.016, 0.01, 0.05, x + 0.012, 0.036, sz * (c.capHW - 0.03), '#2a2f36'))
  return rakeParts(parts, c.rake, c.h)
}

/** Rubber bellows of the articulation: the half that belongs to this end of a car (the neighbour adds the other half). */
function bellows(c: CarCtx, sign: 1 | -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const hl = c.spec.gap / 2 + 0.003
  const x = sign * (c.len / 2 + hl / 2 - 0.004)
  out.push(box(hl + 0.008, c.h * 0.9, c.w * 0.88, x, c.h * 0.46, 0, '#23272c'))
  // folds
  for (const k of [-0.5, 0, 0.5]) out.push(box(0.008, c.h * 0.9 + 0.006, c.w * 0.88 + 0.006, x + k * hl * 0.8, c.h * 0.46, 0, '#17191d'))
  // grey roof cover over the gap
  out.push(box(hl + 0.01, 0.012, c.w * 0.5, x, c.h + 0.001, 0, ROOF_LIGHT))
  return out
}

export const regDesiro: ModelDef = {
  sign: regDesiroSign,
  logo: regDesiroLogo,
  lamp: regDesiroLamp,

  chassis(c) {
    const out: THREE.BufferGeometry[] = []
    // underfloor: long flat tray, equipment boxes, air tanks, and side aprons hiding most of it
    out.push(box(c.len * 0.82, 0.05, c.w * 0.72, 0, -0.028, 0, '#20252b'))
    out.push(box(c.len * 0.2, 0.052, c.w * 0.58, -c.len * 0.04, -0.045, 0, '#2f353c'))
    out.push(box(c.len * 0.12, 0.044, c.w * 0.5, c.len * 0.1, -0.04, 0, '#3a4149'))
    out.push(cylX(0.02, c.len * 0.14, 0, -0.058, 0.08, '#4a525b', 10))
    out.push(cylX(0.016, c.len * 0.1, c.len * 0.17, -0.054, -0.08, '#4a525b', 10))
    for (const s of [-1, 1]) out.push(box(c.len * 0.5, 0.034, 0.004, c.len * 0.02, -0.006, s * (c.w / 2 - 0.004), '#262b31'))
    // bogies near the car ends: frame, two motors/gearboxes, brake discs, axles with wheels on the rails (rails stand 0.085 either side)
    for (const sx of [-1, 1]) {
      const bx = sx * c.len * 0.33
      out.push(box(0.31, 0.02, 0.2, bx, -0.024, 0, '#14181c'))
      out.push(box(0.09, 0.05, 0.1, bx, -0.036, 0, '#2c3238'))
      for (const sz of [-1, 1]) out.push(box(0.26, 0.012, 0.012, bx, -0.016, sz * 0.1, '#1e2328'))
      for (const dx of [-0.115, 0.115]) {
        out.push(cylZ(0.008, 0.19, bx + dx, -0.027, 0, '#2b3036', 6))
        out.push(cylZ(0.024, 0.012, bx + dx, -0.027, 0.04, '#5d646e', 12))
        out.push(cylZ(0.024, 0.012, bx + dx, -0.027, -0.04, '#5d646e', 12))
        for (const sz of [-1, 1]) {
          out.push(cylZ(0.043, 0.016, bx + dx, -0.027, sz * 0.085, '#4c545e', 14))
          out.push(cylZ(0.022, 0.02, bx + dx, -0.027, sz * 0.085, '#2a3036', 8))
        }
      }
      // primary springs above the axle boxes
      for (const dx of [-0.115, 0.115]) for (const sz of [-1, 1]) out.push(box(0.016, 0.026, 0.016, bx + dx, -0.01, sz * 0.1, '#7d848c'))
    }
    return out
  },

  details(c) {
    const out: THREE.BufferGeometry[] = []
    const zw = c.w / 2
    const wy0 = c.h * 0.4
    const wy1 = c.h * 0.74

    for (const s of [-1, 1]) {
      // windows: dark rim, glass pane proud of the wall, thin red pillar look comes from the gaps between panes
      for (const [x0, x1] of c.wins) {
        const cx = (x0 + x1) / 2
        out.push(box(x1 - x0 + 0.01, wy1 - wy0 + 0.01, 0.006, cx, (wy0 + wy1) / 2, s * (zw + 0.0015), '#0f1317'))
        out.push(box(x1 - x0, wy1 - wy0, 0.008, cx, (wy0 + wy1) / 2, s * (zw + 0.002), GLASS))
      }
      // doors: grey frame, two light grey leaves with a dark window, a seam, a green push button and a white sticker beside them
      for (const [x0, x1] of c.doors) {
        const cx = (x0 + x1) / 2
        const dw = x1 - x0
        const dy0 = c.h * 0.085
        const dy1 = c.h * 0.77
        out.push(box(dw + 0.012, dy1 - dy0 + 0.008, 0.006, cx, (dy0 + dy1) / 2, s * (zw + 0.0015), '#3b4047'))
        for (const sl of [-1, 1]) {
          const lx = cx + sl * (dw / 4 + 0.001)
          out.push(box(dw / 2 - 0.006, dy1 - dy0 - 0.004, 0.008, lx, (dy0 + dy1) / 2, s * (zw + 0.0022), '#d6d9dc'))
          out.push(box(dw / 2 - 0.022, c.h * 0.31, 0.009, lx, (wy0 + wy1) / 2 + 0.004, s * (zw + 0.0028), GLASS))
          // red/dark lower door panel line
          out.push(box(dw / 2 - 0.02, 0.008, 0.009, lx, c.h * 0.28, s * (zw + 0.0028), '#8f959c'))
        }
        out.push(box(0.004, dy1 - dy0 - 0.004, 0.01, cx, (dy0 + dy1) / 2, s * (zw + 0.003), '#6c727a'))
        out.push(box(0.012, 0.018, 0.008, x1 + 0.014, c.h * 0.43, s * (zw + 0.003), '#3f9a4b'))
        out.push(box(0.016, 0.022, 0.006, x0 - 0.016, c.h * 0.5, s * (zw + 0.003), '#f1f2f3'))
        // door step: a dark tread under the door
        out.push(box(dw * 0.9, 0.008, 0.03, cx, c.h * 0.06, s * (zw - 0.004), '#2a2f35'))
      }
      // company logo (white plate with a red mark) on the first door-side wall of the car, and the class marks
      const dx = c.doors.length ? c.doors[0][1] + 0.12 : 0
      if (c.doors.length) {
        out.push(box(0.05, 0.026, 0.005, dx, c.h * 0.335, s * (zw + 0.0025), '#f1f2f3'))
        out.push(box(0.034, 0.015, 0.006, dx, c.h * 0.335, s * (zw + 0.0032), '#e2001a'))
      }
    }

    // the articulation of the car ends that meet another car
    if (c.nR === 0) out.push(...bellows(c, -1))
    if (c.nF === 0) out.push(...bellows(c, 1))

    // roof: dark flat AC units with grilles in front of and behind the middle, raised pods over the articulations
    const zr = (c.w * 0.54) / 2
    for (const f of [-0.27, 0.1]) {
      out.push(box(c.len * 0.19, 0.018, zr * 1.5, c.len * f, c.h + 0.002, 0, ROOF_LIGHT))
      out.push(box(c.len * 0.17, 0.006, zr * 1.35, c.len * f, c.h + 0.0125, 0, ROOF_DARK))
      for (const k of [-1, 0, 1]) out.push(box(c.len * 0.14, 0.004, 0.012, c.len * f, c.h + 0.016, k * 0.044, '#23272c'))
    }
    // roof vent / aerial row along the centre line
    out.push(box(c.len * 0.1, 0.01, 0.05, c.len * -0.42, c.h + 0.004, 0, ROOF_LIGHT))
    for (const sx of [-1, 1]) if (!(sx > 0 && c.nF > 0) && !(sx < 0 && c.nR > 0)) out.push(box(0.16, 0.026, 0.12, sx * (c.len / 2 - 0.12), c.h - 0.004, 0, ROOF_DARK))
    // head car: aerial and a shark fin near the front
    if (c.nF > 0) {
      out.push(box(0.05, 0.016, 0.01, c.len / 2 - c.nF - 0.19, c.h + 0.01, 0, '#d9dde2', -0.4))
      out.push(box(0.03, 0.02, 0.024, c.len / 2 - c.nF - 0.38, c.h + 0.012, 0.04, '#252a30'))
    }

    // single-arm pantograph: on the middle car, or on the head car when the train has only two
    const carrier = c.role === 'mid' || (c.role === 'head' && c.spec.lens.length < 3)
    if (carrier) {
      const bx = -c.len * 0.08
      const y0 = c.h + 0.006
      out.push(box(0.2, 0.014, 0.15, bx, y0, 0, '#2c3239'))
      for (const dz of [-0.06, 0.06]) for (const dx of [-0.07, 0.07]) out.push(box(0.012, 0.026, 0.012, bx + dx, y0 + 0.016, dz, '#cfd3d8'))
      out.push(box(0.2, 0.008, 0.012, bx, y0 + 0.032, -0.06, '#9aa1aa'))
      out.push(box(0.2, 0.008, 0.012, bx, y0 + 0.032, 0.06, '#9aa1aa'))
      // lower arm (from the base forward and up), upper arm (back and up), the collector head on top
      out.push(box(0.014, 0.125, 0.018, bx - 0.005, y0 + 0.095, 0, '#8d949e', -0.55))
      out.push(box(0.012, 0.11, 0.016, bx, y0 + 0.19, 0, '#8d949e', 0.58))
      out.push(box(0.034, 0.006, 0.2, bx - 0.035, y0 + 0.24, 0, '#2a2e33'))
      for (const dz of [-0.07, 0.07]) out.push(box(0.012, 0.007, 0.05, bx - 0.035, y0 + 0.246, dz, '#6a5f55'))
      // roof line and insulators of the supply
      out.push(box(0.16, 0.014, 0.03, bx - 0.2, c.h + 0.006, 0, '#8d949e'))
    }

    if (c.nF > 0) out.push(...endFace(c))
    if (c.nR > 0) out.push(...toRear(endFace(c)))
    return out
  },
}
