import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { carOffsets } from '../model/vehicles'
import type { VehicleSpec } from '../model/vehicles'
import { RAIL_Y } from './heights'
import { carGlassCompile, poolTexture, trainSpill } from './night'
import { logoTexture, makeSignMaterial, setSign } from './destSign'
import { useTrainLook } from '../ui/trainLook'
import { modelOf, modelKey } from './vehicleModels'
import { box, DARK, GLASS } from './vehicleModels/parts'
import type { CarCtx, FrontMetrics } from './vehicleModels/types'

/** Underside of the car bodies above the rail head */
export const BODY_Y = RAIL_Y + 0.07

type Role = 'head' | 'mid' | 'tail' | 'single'

/** How a vehicle type looks. Fractions are of the body height; colours may be 'line' (the line colour) or 'body'. */
interface Style {
  /** y-levels (fractions) at which the side wall changes colour; must contain every colour boundary used below */
  levels: number[]
  /** roundness of the roof edge, as a fraction of the width */
  roofRound: number
  /** how much the roof drops / the width narrows towards the nose tip (0..1) and how sharply */
  drop: number
  narrow: number
  pow: number
  /** doors: positions as fractions of the usable length, width, number of windows */
  doors: number[]
  doorW: number
  winW: number
  winGap: number
  /** height of the windscreen bottom edge */
  ws0: number
  /** window rows (y0,y1) */
  windows: [number, number][]
  /** coloured side bands (y0,y1,colour) */
  bands: [number, number, string][]
  /** colour of the lower part of the door */
  door: string
  /** colour of the front below the windscreen */
  front: string
  roof: string
  skirt: number
  /** the nose is painted as plain body (the detail model puts windscreen and lights on the end face itself) */
  detailFront?: boolean
  /** the end face leans back: its top lies this far behind its bottom (design units); the nose is sheared, the model's end parts must follow (`rakeParts`) */
  rake?: number
  /** colour of the whole nose (and, with `cabLen`, of the wall behind it): 'line', 'body' or a hex colour */
  noseColour?: string
  /** length of the wall behind the nose that is painted in `noseColour` too */
  cabLen?: number
}

const STYLES: Record<string, Style> = {
  // Berlin S-Bahn 484 (see vehicleModels/sbahn484.ts): cream body, red lower body in the line colour, black skirt, dark doors
  sbahn484: {
    levels: [0, 0.07, 0.37, 0.4, 0.82],
    roofRound: 0.18,
    drop: 0.13,
    narrow: 0.07,
    pow: 2.1,
    doors: [0.18, 0.5, 0.82],
    doorW: 0.17,
    winW: 0.2,
    winGap: 0.05,
    ws0: 0.39,
    windows: [[0.4, 0.82]],
    bands: [
      [0, 0.07, DARK],
      [0.07, 0.37, 'line'],
    ],
    door: '#14181c',
    front: 'line',
    roof: '#c4c9cf',
    skirt: 0.07,
    detailFront: true,
  },
  // Munich S-Bahn ET 1420 (see vehicleModels/sbahnMuc2.ts): graphite body, light grey lower body, thin stripe in the line colour
  // Munich ET 1420, grey version (renders): graphite body above, light grey below
  sbahn1420: {
    levels: [0, 0.07, 0.29, 0.325, 0.38, 0.8],
    roofRound: 0.22,
    drop: 0.12,
    narrow: 0.12,
    pow: 1.5,
    doors: [0.2, 0.5, 0.8],
    doorW: 0.18,
    winW: 0.3,
    winGap: 0.05,
    ws0: 0.37,
    windows: [[0.38, 0.79]],
    bands: [
      [0, 0.07, DARK],
      [0.07, 0.29, '#b4bac2'],
      [0.29, 0.325, 'line'],
    ],
    door: '#14181c',
    front: '#b4bac2',
    roof: '#a9b0b9',
    skirt: 0.07,
    detailFront: true,
    rake: 0.13,
  },
  // Munich ET 1420, blue-white version (photos 1 and 3): white body, dark windows, blue (= line colour) front section and doors
  sbahn1420b: {
    levels: [0, 0.07, 0.29, 0.325, 0.38, 0.8],
    roofRound: 0.22,
    drop: 0.12,
    narrow: 0.12,
    pow: 1.5,
    doors: [0.2, 0.5, 0.8],
    doorW: 0.18,
    winW: 0.3,
    winGap: 0.05,
    ws0: 0.37,
    windows: [[0.38, 0.79]],
    bands: [
      [0, 0.07, DARK],
      [0.07, 0.29, 'body'],
      [0.29, 0.325, 'line'],
    ],
    door: '#14181c',
    front: 'line',
    roof: '#dde1e6',
    skirt: 0.07,
    detailFront: true,
    rake: 0.13,
    noseColour: 'line',
    cabLen: 0.72,
  },
  // Berlin U-Bahn series J / JK (see vehicleModels/ubahnBerlin1.ts): signal yellow, dark grey base stripe, black doors, raked nearly flat front
  ubahnj: {
    levels: [0, 0.1, 0.44, 0.84],
    roofRound: 0.13,
    drop: 0.05,
    narrow: 0.12,
    pow: 2,
    doors: [0.17, 0.5, 0.83],
    doorW: 0.17,
    winW: 0.15,
    winGap: 0.04,
    ws0: 0.28,
    windows: [[0.44, 0.84]],
    bands: [[0, 0.1, '#4d535b']],
    door: '#15191d',
    front: 'body',
    roof: '#f4c10f',
    skirt: 0.1,
    detailFront: true,
    rake: 0.05,
  },
  // Berlin U-Bahn class H (see vehicleModels/ubahnBerlin2.ts): all yellow, black skirt, raked flat front with a wide black windscreen
  ubahnh: {
    levels: [0, 0.08, 0.42, 0.82],
    roofRound: 0.2,
    drop: 0.05,
    narrow: 0.09,
    pow: 2,
    doors: [0.17, 0.5, 0.83],
    doorW: 0.16,
    winW: 0.17,
    winGap: 0.04,
    ws0: 0.36,
    windows: [[0.42, 0.82]],
    bands: [[0, 0.08, DARK]],
    door: '#fccd16',
    front: '#fccd16',
    roof: '#ebbf12',
    skirt: 0.08,
    detailFront: true,
    rake: 0.05,
  },
  // Berlin U-Bahn large profile, classic yellow series D / F (see vehicleModels/ubahnBerlin3.ts): plain yellow, black skirt, slightly raked flat front
  ubahnf79: {
    levels: [0, 0.1, 0.12, 0.43, 0.82],
    roofRound: 0.2,
    drop: 0.05,
    narrow: 0.05,
    pow: 1.8,
    doors: [0.2, 0.5, 0.8],
    doorW: 0.16,
    winW: 0.105,
    winGap: 0.045,
    ws0: 0.4,
    windows: [[0.43, 0.82]],
    bands: [
      [0, 0.1, DARK],
      [0.1, 0.12, 'line'],
    ],
    door: 'body',
    front: 'body',
    roof: '#efb512',
    skirt: 0.1,
    detailFront: true,
    rake: 0.03,
  },
  // Munich U-Bahn C2 (see vehicleModels/ubahnMuc1.ts): silver-grey body, dark skirt, doors in blue (line colour) frames
  ubahnc2: {
    levels: [0, 0.2, 0.38, 0.8],
    roofRound: 0.26,
    drop: 0.12,
    narrow: 0.2,
    pow: 1.8,
    doors: [0.13, 0.5, 0.87],
    doorW: 0.19,
    winW: 0.15,
    winGap: 0.04,
    ws0: 0.4,
    windows: [[0.38, 0.8]],
    bands: [[0, 0.2, '#434950']],
    door: '#434950',
    front: 'body',
    roof: '#6c727b',
    skirt: 0.2,
    detailFront: true,
    rake: 0.15,
  },
  // Munich U-Bahn class A (see vehicleModels/ubahnMuc2.ts): blue body, cream window band, blue doors and roof strip (line colour), grey roof
  ubahna2: {
    levels: [0, 0.07, 0.4, 0.43, 0.8, 0.83],
    roofRound: 0.14,
    drop: 0.03,
    narrow: 0.05,
    pow: 2,
    doors: [0.14, 0.478, 0.816],
    doorW: 0.15,
    winW: 0.12,
    winGap: 0.03,
    ws0: 0.4,
    windows: [[0.43, 0.8]],
    bands: [
      [0, 0.07, DARK],
      [0.4, 0.83, '#f7f0da'],
      [0.83, 1.01, 'line'],
    ],
    door: 'line',
    front: 'line',
    roof: '#c9ced3',
    skirt: 0.07,
    detailFront: true,
    rake: 0.03,
  },
  // Nuremberg U-Bahn G1 (see vehicleModels/ubahnNuernberg1.ts): graphite body, white lower panels over a red base stripe, red nose and roof edge
  ubahng1: {
    levels: [0, 0.08, 0.17, 0.4, 0.82, 0.885],
    roofRound: 0.12,
    drop: 0.1,
    narrow: 0.1,
    pow: 2,
    doors: [0.17, 0.5, 0.83],
    doorW: 0.17,
    winW: 0.26,
    winGap: 0.05,
    ws0: 0.4,
    windows: [[0.4, 0.82]],
    bands: [
      [0, 0.08, DARK],
      [0.08, 0.17, 'line'],
      [0.17, 0.4, '#eceef0'],
      [0.885, 1.01, 'line'],
    ],
    door: '#15181c',
    front: 'line',
    roof: '#868c95',
    skirt: 0.08,
    detailFront: true,
    rake: 0.06,
    noseColour: 'line',
  },
  // Berlin S-Bahn 481 (see vehicleModels/sbahn481.ts): cream-yellow body, red lower body in the line colour, red door leaves
  sbahn481: {
    levels: [0, 0.07, 0.42, 0.48, 0.8],
    roofRound: 0.22,
    drop: 0.07,
    narrow: 0.07,
    pow: 2.1,
    doors: [0.18, 0.5, 0.82],
    doorW: 0.17,
    winW: 0.2,
    winGap: 0.05,
    ws0: 0.42,
    windows: [[0.48, 0.8]],
    bands: [
      [0, 0.07, DARK],
      [0.07, 0.42, 'line'],
    ],
    door: 'line',
    front: 'line',
    roof: '#d6cba9',
    skirt: 0.07,
    detailFront: true,
  },
  // Munich S-Bahn 423 (see vehicleModels/sbahnMuc1.ts): red body in the line colour, white stripe over a dark grey skirt, white doors
  sbahnm423: {
    levels: [0, 0.11, 0.2, 0.4, 0.72],
    roofRound: 0.2,
    drop: 0.13,
    narrow: 0.12,
    pow: 2.1,
    doors: [0.165, 0.5, 0.835],
    doorW: 0.19,
    winW: 0.12,
    winGap: 0.04,
    ws0: 0.5,
    windows: [[0.4, 0.72]],
    bands: [
      [0, 0.11, '#454a52'],
      [0.11, 0.2, '#e9ebec'],
      [0.2, 1.01, 'line'],
    ],
    door: '#dee0e2',
    front: 'line',
    roof: '#9ca1a8',
    skirt: 0.11,
    detailFront: true,
  },
  // generic S-Bahn: yellow body, red band and front, big dark windscreen
  sbahn: {
    levels: [0, 0.3, 0.46, 0.76],
    roofRound: 0.26,
    drop: 0.1,
    narrow: 0.12,
    pow: 1.6,
    doors: [0.2, 0.5, 0.8],
    doorW: 0.2,
    winW: 0.3,
    winGap: 0.06,
    ws0: 0.34,
    windows: [[0.46, 0.76]],
    bands: [[0, 0.3, 'line']],
    door: '#d9a82a',
    front: 'line',
    roof: '#9aa2ad',
    skirt: 0.0,
  },
  // Berlin U-Bahn (IK/J): yellow body, black skirt, flat front with a huge windscreen
  ubahn: {
    levels: [0, 0.1, 0.46, 0.8],
    roofRound: 0.24,
    drop: 0.04,
    narrow: 0.05,
    pow: 1.4,
    doors: [0.18, 0.5, 0.82],
    doorW: 0.19,
    winW: 0.24,
    winGap: 0.06,
    ws0: 0.28,
    windows: [[0.46, 0.8]],
    bands: [[0, 0.1, DARK]],
    door: '#d9a70c',
    front: DARK,
    roof: '#8a919b',
    skirt: 0.1,
  },
  // Low-floor tram: painted in the line colour, grey stripes, dark window band
  tram: {
    levels: [0, 0.1, 0.38, 0.43, 0.72, 0.76],
    roofRound: 0.3,
    drop: 0.16,
    narrow: 0.2,
    pow: 1.8,
    doors: [0.24, 0.76],
    doorW: 0.2,
    winW: 0.3,
    winGap: 0.05,
    ws0: 0.3,
    windows: [[0.43, 0.72]],
    bands: [
      [0, 0.1, '#7d858f'],
      [0.38, 0.43, '#d9dee4'],
      [0.72, 0.76, '#d9dee4'],
    ],
    door: GLASS,
    front: 'body',
    roof: '#d8dde3',
    skirt: 0.1,
  },
  // Double-deck regional EMU: red body, light lower stripe, two window rows
  regional: {
    levels: [0, 0.1, 0.2, 0.24, 0.42, 0.46, 0.5, 0.56, 0.76, 0.81],
    roofRound: 0.2,
    drop: 0.14,
    narrow: 0.18,
    pow: 1.7,
    doors: [0.2, 0.8],
    doorW: 0.22,
    winW: 0.17,
    winGap: 0.06,
    ws0: 0.42,
    windows: [
      [0.24, 0.42],
      [0.56, 0.76],
    ],
    bands: [
      [0, 0.1, '#59616c'],
      [0.1, 0.2, '#d0d4da'],
      [0.46, 0.5, 'line'],
    ],
    door: '#a51b22',
    front: 'body',
    roof: '#6c737d',
    skirt: 0.1,
  },
  // ICE 4: white body, long streamlined nose, continuous dark windows over a coloured stripe
  fernverkehr: {
    levels: [0, 0.12, 0.38, 0.46, 0.5, 0.76],
    roofRound: 0.3,
    drop: 0.4,
    narrow: 0.42,
    pow: 1.25,
    doors: [0.18, 0.82],
    doorW: 0.2,
    winW: 0.62,
    winGap: 0.07,
    ws0: 0.5,
    windows: [[0.5, 0.76]],
    bands: [
      [0, 0.12, '#68707b'],
      [0.38, 0.46, 'line'],
    ],
    door: '#dde1e6',
    front: 'body',
    roof: '#b4bbc5',
    skirt: 0.12,
  },
}

/** The shell style of a vehicle: its own model's if it has one, else the one of its kind. */
const styleOf = (spec: VehicleSpec): Style => STYLES[modelKey(spec)] ?? STYLES[spec.kind]

/** Top and half width of the flat end face of a nose (the shell narrows and drops towards it). */
export function frontMetrics(spec: VehicleSpec): FrontMetrics {
  const st = styleOf(spec)
  return { capTop: spec.height * (1 - st.drop), capHW: (spec.width / 2) * (1 - st.narrow) }
}

function colourOf(name: string, line: string, body: string) {
  return name === 'line' ? line : name === 'body' ? body : name
}

/** x-intervals of windows and doors along a car (car-local, centred on 0). */
function layoutSide(st: Style, len: number, nF: number, nR: number) {
  const a = -len / 2 + (nR > 0 ? nR + 0.04 : 0.13)
  const b = len / 2 - (nF > 0 ? nF + 0.04 : 0.13)
  const span = Math.max(0.2, b - a)
  const doors: [number, number][] = st.doors
    .map((f) => a + span * f)
    .filter((c) => c - st.doorW / 2 > a - 0.001 && c + st.doorW / 2 < b + 0.001)
    .map((c) => [c - st.doorW / 2, c + st.doorW / 2] as [number, number])
  const wins: [number, number][] = []
  const cuts = [a, ...doors.flatMap((d) => d), b]
  for (let i = 0; i < cuts.length; i += 2) {
    const x0 = cuts[i] + (i === 0 ? 0 : 0.035)
    const x1 = cuts[i + 1] - (i + 1 === cuts.length - 1 ? 0 : 0.035)
    const seg = x1 - x0
    if (seg < 0.14) continue
    const n = Math.max(1, Math.round((seg + st.winGap) / (st.winW + st.winGap)))
    const w = (seg - st.winGap * (n - 1)) / n
    for (let k = 0; k < n; k++) wins.push([x0 + k * (w + st.winGap), x0 + k * (w + st.winGap) + w])
  }
  return { doors, wins }
}

const inAny = (list: [number, number][], x: number) => list.some(([a, b]) => x > a && x < b)

/** The body shell of a car: rounded cross-sections along its length, tapered at the nose, coloured face by face. */
function shell(spec: VehicleSpec, len: number, nF: number, nR: number, line: string): THREE.BufferGeometry {
  const st = styleOf(spec)
  const { height: h, width: w } = spec
  const hl = len / 2
  const body = spec.paintAll ? line : spec.body
  const side = layoutSide(st, len, nF, nR)

  // slice positions: ends, nose steps, window and door edges
  const xsSet = new Set<number>([-hl, hl])
  const NOSE_STEPS = 7
  for (let k = 1; k < NOSE_STEPS; k++) {
    if (nF > 0) xsSet.add(+(hl - nF + (nF * k) / NOSE_STEPS).toFixed(5))
    if (nR > 0) xsSet.add(+(-hl + nR - (nR * k) / NOSE_STEPS).toFixed(5))
  }
  if (nF > 0) xsSet.add(+(hl - nF).toFixed(5))
  if (nR > 0) xsSet.add(+(-hl + nR).toFixed(5))
  for (const [x0, x1] of [...side.wins, ...side.doors]) {
    xsSet.add(+x0.toFixed(5))
    xsSet.add(+x1.toFixed(5))
  }
  const xs = [...xsSet].sort((p, q) => p - q)

  const profile = (x: number) => {
    let top = h
    let wf = 1
    if (nF > 0 && x > hl - nF) {
      const t = (x - (hl - nF)) / nF
      top = h * (1 - st.drop * t ** st.pow)
      wf = 1 - st.narrow * t ** 2
    } else if (nR > 0 && x < -hl + nR) {
      const t = (-hl + nR - x) / nR
      top = h * (1 - st.drop * t ** st.pow)
      wf = 1 - st.narrow * t ** 2
    }
    return { top, wf }
  }

  const ARC = [Math.PI, (5 * Math.PI) / 6, (2 * Math.PI) / 3, Math.PI / 2]
  // ring: left side (z<0) bottom to top, then mirrored; returns points as [y, z]
  const ringAt = (x: number) => {
    const { top, wf } = profile(x)
    const hw = (w / 2) * wf
    const rr = Math.min(st.roofRound * w * wf, top * 0.4)
    const left: [number, number][] = []
    for (const lv of st.levels) left.push([Math.min(lv * h, top - rr), -hw])
    for (const th of ARC) left.push([top - rr + rr * Math.sin(th), -hw + rr + rr * Math.cos(th)])
    const right = left.map(([y, z]) => [y, -z] as [number, number]).reverse()
    return [...left, ...right]
  }
  const rings = xs.map(ringAt)
  const K = rings[0].length
  const half = K / 2

  const pos: number[] = []
  const col: number[] = []
  const c = new THREE.Color()
  const va = new THREE.Vector3()
  const vb = new THREE.Vector3()
  const vc = new THREE.Vector3()
  const n = new THREE.Vector3()

  const isNoseX = (x: number) => (nF > 0 && x > hl - nF - 1e-6) || (nR > 0 && x < -hl + nR + 1e-6)

  const paintFace = (cx: number, cy: number, _cz: number, nx: number, ny: number, nz: number): string => {
    const yF = cy / h
    const ax = Math.abs(nx)
    const sideFace = Math.abs(nz) > 0.55
    const nose = isNoseX(cx)
    // painted nose (and the wall behind it): one colour above the skirt, except the roof
    if (st.noseColour && ny < 0.55) {
      const behind = (nF > 0 && cx > hl - nF - (st.cabLen ?? 0)) || (nR > 0 && cx < -hl + nR + (st.cabLen ?? 0))
      if ((nose || behind) && yF >= st.skirt && !(behind && !nose && Math.abs(nz) <= 0.55)) {
        const glass = !nose && st.windows.some(([y0, y1]) => yF > y0 && yF < y1) && inAny(side.wins, cx)
        if (!glass) return colourOf(st.noseColour, line, body)
      }
    }
    // a detail model puts windscreen, lights and vents on the end face itself: the nose is plain body and bands
    if (st.detailFront && nose && ax > 0.25) {
      for (const [y0, y1, cn] of st.bands) if (yF >= y0 && yF <= y1) return colourOf(cn, line, body)
      return body
    }
    // windscreen on and around the nose
    if (nose && ax > 0.25 && yF > st.ws0) return GLASS
    if (nose && ny < 0.8 && yF > st.ws0 && nF > 0.5) return GLASS
    if (nose && ny > 0.3 && yF > 0.6) return st.roof
    if (nose && ax > 0.25) {
      for (const [y0, y1, cn] of st.bands) if (yF >= y0 && yF <= y1 && cn !== 'body') return colourOf(cn, line, body)
      return colourOf(st.front, line, body)
    }
    // flat end of a car without nose: gangway
    if (!nose && ax > 0.6) return DARK
    if (ny > 0.55) return st.roof
    if (!sideFace) return body
    // side wall
    for (const [y0, y1] of st.windows) if (yF > y0 && yF < y1 && inAny(side.wins, cx)) return GLASS
    for (const [y0, y1] of st.windows) if (yF > y0 && yF < y1 && inAny(side.doors, cx)) return GLASS
    if (yF > 0.08 && yF < st.windows[st.windows.length - 1][1] && inAny(side.doors, cx)) return colourOf(st.door, line, body)
    for (const [y0, y1, cn] of st.bands) if (yF > y0 && yF < y1) return colourOf(cn, line, body)
    return body
  }

  // a raked nose: the top of the nose leans back (x shifts with height, growing towards the end face)
  const shear = (v: THREE.Vector3) => {
    if (!st.rake) return
    if (nF > 0 && v.x > hl - nF) v.x -= st.rake * (v.y / h) * ((v.x - (hl - nF)) / nF)
    else if (nR > 0 && v.x < -hl + nR) v.x += st.rake * (v.y / h) * ((-hl + nR - v.x) / nR)
  }
  const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) => {
    shear(p)
    shear(q)
    shear(r)
    n.copy(q).sub(p).cross(vb.copy(r).sub(p)).normalize()
    const cx = (p.x + q.x + r.x) / 3
    const cy = (p.y + q.y + r.y) / 3
    const cz = (p.z + q.z + r.z) / 3
    c.set(paintFace(cx, cy, cz, n.x, n.y, n.z))
    for (const v of [p, q, r]) {
      pos.push(v.x, v.y, v.z)
      col.push(c.r, c.g, c.b)
    }
  }
  const P = (x: number, r: [number, number]) => new THREE.Vector3(x, r[0], r[1])

  for (let s = 0; s < xs.length - 1; s++) {
    const A = rings[s]
    const B = rings[s + 1]
    const x0 = xs[s]
    const x1 = xs[s + 1]
    for (let i = 0; i < K - 1; i++) {
      const a0 = P(x0, A[i])
      const a1 = P(x0, A[i + 1])
      const b0 = P(x1, B[i])
      const b1 = P(x1, B[i + 1])
      if (a0.distanceToSquared(a1) < 1e-10 && b0.distanceToSquared(b1) < 1e-10) continue
      tri(va.copy(a0), vc.copy(b1), b0.clone())
      tri(a0.clone(), a1.clone(), b1.clone())
    }
  }
  // end caps: horizontal strips between the mirrored left and right points
  const cap = (ring: [number, number][], x: number, forward: boolean) => {
    for (let i = 0; i < half - 1; i++) {
      const l0 = P(x, ring[i])
      const l1 = P(x, ring[i + 1])
      const r0 = P(x, ring[K - 1 - i])
      const r1 = P(x, ring[K - 2 - i])
      if (forward) {
        tri(l0.clone(), l1.clone(), r1.clone())
        tri(l0.clone(), r1.clone(), r0.clone())
      } else {
        tri(l0.clone(), r1.clone(), l1.clone())
        tri(l0.clone(), r0.clone(), r1.clone())
      }
    }
  }
  cap(rings[rings.length - 1], xs[xs.length - 1], true)
  cap(rings[0], xs[0], false)

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3))
  g.computeVertexNormals()
  return g
}

const cache = new Map<string, THREE.BufferGeometry>()

export function carGeometry(spec: VehicleSpec, index: number, role: Role, line: string): THREE.BufferGeometry {
  const key = `${modelKey(spec)}|${index}|${role}|${line}`
  const hit = cache.get(key)
  if (hit) return hit
  const len = spec.lens[index]
  const { height: h, width: w } = spec
  const nF = role === 'head' || role === 'single' ? spec.nose : 0
  const nR = role === 'tail' || role === 'single' ? spec.nose : 0
  const st = styleOf(spec)
  const model = modelOf(spec)
  const parts: THREE.BufferGeometry[] = [shell(spec, len, nF, nR, line)]
  const body = spec.paintAll ? line : spec.body
  const side = layoutSide(st, len, nF, nR)
  const fm = frontMetrics(spec)
  const ctx: CarCtx = { spec, index, role, len, w, h, nF, nR, line, body, doors: side.doors, wins: side.wins, capTop: fm.capTop, capHW: fm.capHW, roofR: st.roofRound * w, rake: st.rake ?? 0 }

  if (model) {
    // detailed model: its own underframe, bogies, doors, windows, roof equipment and end faces
    parts.push(...model.chassis(ctx), ...model.details(ctx))
  } else {
    // underframe and bogies
    parts.push(box(len * 0.86, 0.06, w * 0.8, 0, -0.03, 0, '#22272e'))
    for (const sx of [-1, 1]) {
      parts.push(box(0.3, 0.07, w * 0.7, sx * len * 0.3, -0.045, 0, '#14181d'))
      for (const sz of [-1, 1]) parts.push(box(0.22, 0.07, 0.03, sx * len * 0.3, -0.045, sz * w * 0.38, '#3a414b'))
    }
    // roof equipment
    if (spec.kind === 'regional' || spec.kind === 'sbahn' || spec.kind === 'ubahn') {
      for (const f of [-0.28, 0.12]) parts.push(box(len * 0.14, 0.022, w * 0.5, len * f, h + 0.002, 0, '#8d949e'))
    }
    // buffer beams at the head: dark bumper
    if (nF > 0) parts.push(box(0.04, 0.05, w * (1 - st.narrow) * 0.9, len / 2 - 0.005, 0.03, 0, '#1b2026'))
    if (nR > 0) parts.push(box(0.04, 0.05, w * (1 - st.narrow) * 0.9, -len / 2 + 0.005, 0.03, 0, '#1b2026'))
  }
  // flexible gangway between cars
  if ((role === 'mid' || role === 'tail') && nR === 0) parts.push(box(0.09, h * 0.86, w * 0.82, -len / 2 - 0.02, h * 0.45, 0, '#1d2127'))
  // pantograph on a middle (or head) car
  if (spec.pantograph && (role === 'mid' || (role === 'head' && spec.lens.length < 3))) {
    const px = -len * 0.12
    parts.push(box(0.2, 0.02, 0.17, px, h + 0.01, 0, '#2a313b'))
    parts.push(box(0.018, 0.17, 0.018, px, h + 0.09, 0.05, '#8a93a0', 0.4))
    parts.push(box(0.018, 0.17, 0.018, px, h + 0.09, -0.05, '#8a93a0', -0.4))
    parts.push(box(0.03, 0.014, 0.24, px + 0.03, h + 0.17, 0, '#2a313b'))
  }

  const merged = mergeGeometries(parts, false)!
  parts.forEach((p) => p.dispose())
  cache.set(key, merged)
  return merged
}

const lampWhite = new THREE.MeshStandardMaterial({ color: '#fff7dc', emissive: '#fff0b8', emissiveIntensity: 1.6 })
const lampRed = new THREE.MeshStandardMaterial({ color: '#ff3b2a', emissive: '#ff2a1a', emissiveIntensity: 1.3 })
const lampGeo = new THREE.BoxGeometry(0.03, 0.035, 0.07)
const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.25 })
// at night the windows light up from inside
bodyMat.onBeforeCompile = carGlassCompile(new THREE.Color(GLASS))
bodyMat.customProgramCacheKey = () => 'lf-car-glass'
trainSpill.map = poolTexture()
const spillGeo = new THREE.PlaneGeometry(1, 1)

let logoMat: THREE.MeshBasicMaterial | null = null
/** The logo plate's material, made when the first car needs it (it draws its picture on a canvas) */
const logoMaterial = () => (logoMat ??= new THREE.MeshBasicMaterial({ map: logoTexture(), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }))
const planes = new Map<string, THREE.PlaneGeometry>()
const planeOf = (w: number, h: number) => {
  const k = `${w}x${h}`
  let g = planes.get(k)
  if (!g) planes.set(k, (g = new THREE.PlaneGeometry(w, h)))
  return g
}
const lampShapes = new Map<string, THREE.BufferGeometry>()
/** A lamp body: a thin box, or a round disc facing forward */
const lampShape = (w: number, h: number, round?: boolean) => {
  const k = `${w}x${h}${round ? 'r' : ''}`
  let g = lampShapes.get(k)
  if (!g) {
    g = round ? new THREE.CylinderGeometry(Math.min(w, h) / 2, Math.min(w, h) / 2, 0.008, 16).rotateZ(Math.PI / 2) : new THREE.BoxGeometry(0.008, h, w)
    lampShapes.set(k, g)
  }
  return g
}
const lampWarm = new THREE.MeshStandardMaterial({ color: '#fff0c4', emissive: '#ffd98a', emissiveIntensity: 1.5 })

/**
 * One railcar in its own frame: +x is the direction of travel, origin at the car centre, rail level at y = 0 of BODY_Y.
 * `sign` is the material of the destination display (the head car of a model that has one); the owner changes its text.
 */
export function CarMesh({ spec, index, color, sign }: { spec: VehicleSpec; index: number; color: string; sign?: THREE.MeshBasicMaterial }) {
  const n = spec.lens.length
  const role: Role = n === 1 ? 'single' : index === 0 ? 'head' : index === n - 1 ? 'tail' : 'mid'
  // a train keeps the colours of its real model unless the player wants the line colour on it
  const tint = useTrainLook((s) => s.tint)
  const paintColour = tint ? color : spec.livery
  const geo = useMemo(() => carGeometry(spec, index, role, paintColour), [spec, index, role, paintColour])
  const len = spec.lens[index]
  const st = styleOf(spec)
  const model = modelOf(spec)
  const fm = frontMetrics(spec)
  const lamp = model?.lamp(fm)
  const lampY = lamp?.y ?? spec.height * 0.14
  const lampZ = lamp?.z ?? spec.width * 0.5 * (1 - st.narrow) * 0.62
  const lampG = lamp ? lampShape(lamp.w, lamp.h, lamp.round) : lampGeo
  const lampFront = lamp?.warm ? lampWarm : lampWhite
  const front = role === 'head' || role === 'single'
  const rear = role === 'tail' || role === 'single'
  const signSpec = model?.sign?.(fm)
  const logoSpec = model?.logo?.(fm)
  // a raked end face: decals and lamps lean back with it
  const rake = st.rake ?? 0
  const tilt = Math.atan2(rake, spec.height)
  const xAt = (y: number) => (rake * y) / spec.height
  return (
    <group position={[0, BODY_Y, 0]}>
      <mesh geometry={geo} material={bodyMat} />
      {/* warm light from the windows on the ground below (only visible at night) */}
      <mesh geometry={spillGeo} material={trainSpill} position={[0, RAIL_Y + 0.02 - BODY_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[len * 1.35, spec.width * 2.2, 1]} renderOrder={3} />
      {front && [-1, 1].map((s) => <mesh key={`f${s}`} geometry={lampG} material={lampFront} position={[len / 2 + (lamp ? 0.0112 : 0.004) - xAt(lampY), lampY, s * lampZ]} rotation={[0, 0, tilt]} />)}
      {rear && [-1, 1].map((s) => <mesh key={`r${s}`} geometry={lampG} material={lampRed} position={[-len / 2 - (lamp ? 0.0112 : 0.004) + xAt(lampY), lampY, s * lampZ]} rotation={[0, 0, -tilt]} />)}
      {front && signSpec && sign && <mesh geometry={planeOf(signSpec.w, signSpec.h)} material={sign} position={[len / 2 + signSpec.x - xAt(signSpec.y), signSpec.y, 0]} rotation={new THREE.Euler(0, Math.PI / 2, tilt, 'ZYX')} />}
      {front && logoSpec && <mesh geometry={planeOf(logoSpec.w, logoSpec.h)} material={logoMaterial()} position={[len / 2 + logoSpec.x - xAt(logoSpec.y), logoSpec.y, logoSpec.z]} rotation={new THREE.Euler(0, Math.PI / 2, tilt, 'ZYX')} />}
      {rear && logoSpec && <mesh geometry={planeOf(logoSpec.w, logoSpec.h)} material={logoMaterial()} position={[-len / 2 - logoSpec.x + xAt(logoSpec.y), logoSpec.y, logoSpec.z]} rotation={new THREE.Euler(0, -Math.PI / 2, -tilt, 'ZYX')} />}
    </group>
  )
}

/** A complete train standing along +x, centred on the origin (used by the station editor and the gallery). */
export function TrainStatic({ spec, color, line = 'S5', dest = 'Hauptbahnhof' }: { spec: VehicleSpec; color: string; line?: string; dest?: string }) {
  const offs = carOffsets(spec)
  const sign = useMemo(() => makeSignMaterial(), [])
  setSign(sign, line, color, dest)
  return (
    <group>
      {offs.map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <CarMesh spec={spec} index={i} color={color} sign={sign} />
        </group>
      ))}
    </group>
  )
}
