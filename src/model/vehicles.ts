import type { OperatorId } from './types'

export type VehicleKind = OperatorId

export interface VehicleSpec {
  kind: VehicleKind
  /** which detailed model of this kind (e.g. '484' for the Berlin S-Bahn class 484); empty = the generic one */
  model?: string
  /** name of the model in the vehicle gallery */
  label?: string
  /** length of every car, head first */
  lens: number[]
  gap: number
  width: number
  /** body height (above the rail) */
  height: number
  /** length of the sloped nose of the end cars */
  nose: number
  /** cells per second at cruising speed */
  speed: number
  doubleDeck?: boolean
  body: string
  roof: string
  /** the whole body is painted in the line colour (trams) */
  paintAll?: boolean
  pantograph: boolean
  /** the colour the real train has where the model uses the line colour (used unless trains are painted in line colours) */
  livery: string
}

const rep = (n: number, v: number) => Array.from({ length: n }, () => v)


export function trainLength(spec: VehicleSpec): number {
  return spec.lens.reduce((a, b) => a + b, 0) + spec.gap * (spec.lens.length - 1)
}

/** Centre offsets of the cars relative to the train centre, head first (positive = towards the front). */
export function carOffsets(spec: VehicleSpec): number[] {
  const total = trainLength(spec)
  const out: number[] = []
  let x = total / 2
  for (const len of spec.lens) {
    out.push(x - len / 2)
    x -= len + spec.gap
  }
  return out
}

/** Munich S-Bahn, new generation (Siemens ET 1420): graphite body, silver lower body, overhead-line train. */
const MUC_ET1420: VehicleSpec = { kind: 'sbahn', model: '1420', label: 'MUC ET 1420 grau', lens: rep(3, 2.0), gap: 0.07, width: 0.37, height: 0.45, nose: 0.34, speed: 7.5, body: '#464d58', roof: '#4b515a', pantograph: false, livery: '#c8202a' }
const MUC_ET1420B: VehicleSpec = { kind: 'sbahn', model: '1420b', label: 'MUC ET 1420 blau', lens: rep(3, 2.0), gap: 0.07, width: 0.37, height: 0.45, nose: 0.34, speed: 7.5, body: '#eef1f4', roof: '#dde1e6', pantograph: false, livery: '#1f6fd1' }

/** Munich S-Bahn class 423 (red with a white stripe, grey skirt, round front with the destination display above the windscreen) */
const MUC_BR423: VehicleSpec = { kind: 'sbahn', model: 'm423', label: 'MUC BR 423', lens: rep(3, 1.95), gap: 0.07, width: 0.36, height: 0.43, nose: 0.28, speed: 7, body: '#e4e5e6', roof: '#9ca1a8', pantograph: false, livery: '#c8202a' }

/** Berlin S-Bahn class 481 (the red-and-yellow classic) */
const SBAHN_481: VehicleSpec = { kind: 'sbahn', model: '481', label: 'BR 481', lens: rep(3, 1.95), gap: 0.07, width: 0.36, height: 0.43, nose: 0.24, speed: 7, body: '#ebcd7c', roof: '#d6cba9', pantograph: false, livery: '#c4202a' }

/** Berlin U-Bahn, Stadler series J / JK (signal yellow, black doors, huge black windscreen with the display on top) */
const BLN_J: VehicleSpec = { kind: 'ubahn', model: 'j', label: 'BLN J / JK', lens: rep(3, 1.9), gap: 0.06, width: 0.32, height: 0.4, nose: 0.13, speed: 7.5, body: '#fccd16', roof: '#f4c10f', pantograph: false, livery: '#fccd16' }
/** Berlin U-Bahn class H (large profile, 2.65 m wide, three doors per side and car; yellow all over) */
const BLN_H: VehicleSpec = { kind: 'ubahn', model: 'h', label: 'BLN H', lens: rep(3, 1.9), gap: 0.06, width: 0.318, height: 0.42, nose: 0.14, speed: 7.5, body: '#fccd16', roof: '#ebbf12', pantograph: false, livery: '#fccd16' }
/** Berlin U-Bahn large profile, classic yellow series D / F (2.65 m wide, 3.43 m high, black skirt, three separate windscreens) */
const BLN_F79: VehicleSpec = { kind: 'ubahn', model: 'f79', label: 'BLN F-Serie', lens: rep(3, 1.75), gap: 0.06, width: 0.32, height: 0.4, nose: 0.1, speed: 7.5, body: '#f8c21a', roof: '#efb512', pantograph: false, livery: '#f8c21a' }
/** Munich U-Bahn C2 (Siemens Inspiro): silver-grey walk-through train, blue door frames, third rail */
const MUC_C2: VehicleSpec = { kind: 'ubahn', model: 'c2', label: 'MUC C2', lens: rep(3, 2.1), gap: 0.05, width: 0.35, height: 0.43, nose: 0.4, speed: 8, body: '#c3c9d1', roof: '#6c727b', pantograph: false, livery: '#3d86e6' }
/** Munich U-Bahn class A (A2.x): blue with a cream window band, 2.9 m wide, three double doors per car, third rail */
const MUC_A2: VehicleSpec = { kind: 'ubahn', model: 'a2', label: 'MUC A2', lens: rep(3, 2.05), gap: 0.06, width: 0.35, height: 0.43, nose: 0.1, speed: 7.5, body: '#46a0ec', roof: '#d2d7dc', pantograph: false, livery: '#46a0ec' }
/** Nuremberg U-Bahn G1 (Siemens Inspiro, 2.90 m wide, four cars; here three): graphite with red nose, roof edge and base stripe, white lower panels */
const NUE_G1: VehicleSpec = { kind: 'ubahn', model: 'g1', label: 'NUE G1', lens: rep(3, 1.8), gap: 0.06, width: 0.35, height: 0.4, nose: 0.22, speed: 7.5, body: '#23272d', roof: '#868c95', pantograph: false, livery: '#cc1522' }

/** Munich tram, Siemens Avenio (4 sections, 2.3 m wide, 36.9 m long, light blue with a dark window band) */
const TRAM_M1: VehicleSpec = { kind: 'tram', model: 'tm1', label: 'MUC Avenio', lens: [1.12, 0.95, 0.95, 1.12], gap: 0.08, width: 0.28, height: 0.35, nose: 0.2, speed: 4.5, body: '#80a9f0', roof: '#cfd4da', pantograph: false, livery: '#80a9f0' }
/** Munich tram, Siemens Avenio T (2.30 m wide, four sections, blue with a black window band and a grey sill stripe, panorama windscreen, pantographs on the middle cars) */
const TRAM_M2: VehicleSpec = { kind: 'tram', model: 'tm2', label: 'MUC Avenio T', lens: [1.2, 0.85, 0.85, 1.2], gap: 0.09, width: 0.28, height: 0.36, nose: 0.22, speed: 4.5, body: '#3b80e0', roof: '#dfe3e8', pantograph: false, livery: '#3b80e0' }
const TRAM_M3: VehicleSpec = { kind: 'tram', model: 'tm3', label: 'MUC Variobahn', lens: [1.25, 1.0, 1.25], gap: 0.1, width: 0.28, height: 0.35, nose: 0.2, speed: 4.5, body: '#3b82f0', roof: '#4a8cf2', pantograph: false, livery: '#3b82f0' }
const TRAM_M4: VehicleSpec = { kind: 'tram', model: 'tm4', label: 'MUC R2.2', lens: [1.1, 1.0, 1.1], gap: 0.1, width: 0.29, height: 0.37, nose: 0.16, speed: 4.5, body: '#3070e0', roof: '#3274e4', pantograph: false, livery: '#3070e0' }
const TRAM_B1: VehicleSpec = { kind: 'tram', model: 'tb1', label: 'BLN Flexity', lens: [1.2, 0.9, 1.2], gap: 0.1, width: 0.29, height: 0.4, nose: 0.13, speed: 4.5, body: '#fcc80a', roof: '#eceef0', pantograph: false, livery: '#fcc80a' }
const TRAM_B2: VehicleSpec = { kind: 'tram', model: 'tb2', label: 'BLN Urbanliner', lens: [1.15, 1.0, 1.15], gap: 0.1, width: 0.29, height: 0.37, nose: 0.22, speed: 4.5, body: '#ffd400', roof: '#f3f5f7', pantograph: false, livery: '#ffd400' }
const ICE_1: VehicleSpec = { kind: 'fernverkehr', model: 'ice1', label: 'ICE 1 (BR 401)', lens: [2.3, 2.5, 2.5, 2.5, 2.3], gap: 0.07, width: 0.36, height: 0.41, nose: 0.95, speed: 12, body: '#eef0f2', roof: '#dfe3e7', pantograph: false, livery: '#c9111d' }
const ICE_3: VehicleSpec = { kind: 'fernverkehr', model: 'ice3', label: 'ICE 3', lens: [2.3, 2.0, 2.0, 2.0, 2.3], gap: 0.07, width: 0.36, height: 0.46, nose: 0.95, speed: 12, body: '#f2f4f6', roof: '#e3e6ea', pantograph: false, livery: '#d4202a' }
const ICE_4: VehicleSpec = { kind: 'fernverkehr', model: 'ice4', label: 'ICE 4', lens: [2.3, 2.1, 2.1, 2.1, 2.3], gap: 0.07, width: 0.36, height: 0.46, nose: 1.0, speed: 12, body: '#f3f4f6', roof: '#c9ced4', pantograph: false, livery: '#ec0016' }
const REG_TALENT2: VehicleSpec = { kind: 'regional', model: 'talent2', label: 'BR 442 Talent 2', lens: [2.0, 1.7, 1.7, 2.0], gap: 0.05, width: 0.35, height: 0.43, nose: 0.4, speed: 8, body: '#ea1e2a', roof: '#9aa0a8', pantograph: false, livery: '#ecedee' }
const REG_KISS: VehicleSpec = { kind: 'regional', model: 'kiss', label: 'IC 2 KISS', lens: [2.6, 2.3, 2.6], gap: 0.05, width: 0.36, height: 0.56, nose: 0.36, speed: 8, doubleDeck: true, body: '#e9ebee', roof: '#c9cdd1', pantograph: false, livery: '#e0222d' }
const REG_DESIRO: VehicleSpec = { kind: 'regional', model: 'desiro', label: 'Desiro HC', lens: rep(3, 2.1), gap: 0.07, width: 0.36, height: 0.5, nose: 0.36, speed: 8, body: '#d8212a', roof: '#3d4249', pantograph: false, livery: '#d8212a' }
const REG_DESIRO_ODEG: VehicleSpec = { kind: 'regional', model: 'desiroodeg', label: 'Desiro HC ODEG', lens: [2.45, 2.3, 2.45], gap: 0.045, width: 0.355, height: 0.45, nose: 0.5, speed: 9, body: '#eef0ec', roof: '#8b929a', pantograph: false, livery: '#f3a900' }
const REG_SKODA: VehicleSpec = { kind: 'regional', model: 'skoda', label: 'Škoda Doppelstock', lens: [2.2, 2.1, 2.1, 2.2], gap: 0.07, width: 0.36, height: 0.56, nose: 0.45, speed: 8, doubleDeck: true, body: '#d6232b', roof: '#8a9199', pantograph: false, livery: '#eceef0' }

/**
 * The default vehicle of every kind (the first of its list in `VEHICLE_MODELS`). Proportions follow the real trains, lengths are shortened a little.
 */
export const VEHICLES: Record<OperatorId, VehicleSpec> = {
  sbahn: { kind: 'sbahn', model: '484', label: 'BR 484', lens: rep(3, 1.95), gap: 0.07, width: 0.36, height: 0.43, nose: 0.17, speed: 7, body: '#ecc979', roof: '#c4c9cf', pantograph: false, livery: '#b5202b' },
  ubahn: { kind: 'ubahn', lens: rep(3, 1.6), gap: 0.06, width: 0.33, height: 0.41, nose: 0.14, speed: 7.5, body: '#f6c61a', roof: '#7c838d', pantograph: false, livery: '#f6c61a' },
  tram: TRAM_M1,
  regional: REG_SKODA,
  fernverkehr: ICE_4,
}

/** Models of a vehicle kind the player can choose from; the first one of a kind is the default (= `VEHICLES`). */
export const VEHICLE_MODELS: Record<string, VehicleSpec[]> = {
  sbahn: [VEHICLES.sbahn, SBAHN_481, MUC_ET1420B, MUC_ET1420, MUC_BR423],
  tram: [VEHICLES.tram, TRAM_M2, TRAM_M3, TRAM_M4, TRAM_B1, TRAM_B2],
  fernverkehr: [VEHICLES.fernverkehr, ICE_1, ICE_3],
  regional: [VEHICLES.regional, REG_TALENT2, REG_KISS, REG_DESIRO, REG_DESIRO_ODEG],
  ubahn: [
    VEHICLES.ubahn,
    BLN_J,
    BLN_H,
    BLN_F79,
    MUC_C2,
    MUC_A2,
    NUE_G1,
  ],
}

/** The vehicle a line runs with: its chosen model if it exists, else the default of its kind. */
export function vehicleFor(kind: VehicleKind, model?: string): VehicleSpec {
  return VEHICLE_MODELS[kind]?.find((v) => v.model === model) ?? VEHICLES[kind]
}
