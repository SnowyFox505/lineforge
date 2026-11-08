import type { OperatorId } from './types'

export type VehicleKind = OperatorId

export interface VehicleSpec {
  kind: VehicleKind
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
}

const rep = (n: number, v: number) => Array.from({ length: n }, () => v)

/**
 * Vehicle types modelled on their real counterparts (S-Bahn Berlin 484, metro, Avenio-style tram,
 * double-deck regional EMU, ICE 4). Proportions follow the real trains, lengths are shortened a little.
 */
export const VEHICLES: Record<OperatorId, VehicleSpec> = {
  sbahn: { kind: 'sbahn', lens: rep(3, 1.95), gap: 0.07, width: 0.36, height: 0.43, nose: 0.3, speed: 7, body: '#f2c230', roof: '#8f96a0', pantograph: false },
  ubahn: { kind: 'ubahn', lens: rep(3, 1.6), gap: 0.06, width: 0.33, height: 0.41, nose: 0.14, speed: 7.5, body: '#f6c61a', roof: '#7c838d', pantograph: false },
  tram: { kind: 'tram', lens: [1.15, 1.0, 1.15], gap: 0.1, width: 0.3, height: 0.38, nose: 0.26, speed: 4.5, body: '#eef0f3', roof: '#d8dde3', paintAll: true, pantograph: true },
  regional: { kind: 'regional', lens: rep(2, 2.1), gap: 0.07, width: 0.36, height: 0.56, nose: 0.4, speed: 8, doubleDeck: true, body: '#d6232b', roof: '#6c737d', pantograph: true },
  fernverkehr: { kind: 'fernverkehr', lens: rep(4, 2.0), gap: 0.07, width: 0.36, height: 0.46, nose: 1.1, speed: 12, body: '#f1f3f6', roof: '#aeb5bf', pantograph: true },
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
