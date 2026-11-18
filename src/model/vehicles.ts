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

/**
 * Vehicle types modelled on their real counterparts (S-Bahn Berlin 484, metro, Avenio-style tram,
 * double-deck regional EMU, ICE 4). Proportions follow the real trains, lengths are shortened a little.
 */
export const VEHICLES: Record<OperatorId, VehicleSpec> = {
  sbahn: { kind: 'sbahn', model: '484', label: 'BR 484', lens: rep(3, 1.95), gap: 0.07, width: 0.36, height: 0.43, nose: 0.17, speed: 7, body: '#ecc979', roof: '#c4c9cf', pantograph: false, livery: '#b5202b' },
  ubahn: { kind: 'ubahn', lens: rep(3, 1.6), gap: 0.06, width: 0.33, height: 0.41, nose: 0.14, speed: 7.5, body: '#f6c61a', roof: '#7c838d', pantograph: false, livery: '#f6c61a' },
  tram: { kind: 'tram', lens: [1.15, 1.0, 1.15], gap: 0.1, width: 0.3, height: 0.38, nose: 0.26, speed: 4.5, body: '#eef0f3', roof: '#d8dde3', paintAll: true, pantograph: true, livery: '#2b6fd6' },
  regional: { kind: 'regional', lens: rep(2, 2.1), gap: 0.07, width: 0.36, height: 0.56, nose: 0.4, speed: 8, doubleDeck: true, body: '#d6232b', roof: '#6c737d', pantograph: true, livery: '#f1f1f1' },
  fernverkehr: { kind: 'fernverkehr', lens: rep(4, 2.0), gap: 0.07, width: 0.36, height: 0.46, nose: 1.1, speed: 12, body: '#f1f3f6', roof: '#aeb5bf', pantograph: true, livery: '#d6232b' },
}

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

/** Models of a vehicle kind the player can choose from; the first one of a kind is the default (= `VEHICLES`). */
export const VEHICLE_MODELS: Record<string, VehicleSpec[]> = {
  sbahn: [VEHICLES.sbahn, SBAHN_481, MUC_ET1420B, MUC_ET1420, MUC_BR423],
}

/** The vehicle a line runs with: its chosen model if it exists, else the default of its kind. */
export function vehicleFor(kind: VehicleKind, model?: string): VehicleSpec {
  return VEHICLE_MODELS[kind]?.find((v) => v.model === model) ?? VEHICLES[kind]
}
