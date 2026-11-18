import type * as THREE from 'three'
import type { VehicleSpec } from '../../model/vehicles'

/** Everything a detailed model needs to know about the car it is building (design size, car frame: +x forward, y up from the body underside). */
export interface CarCtx {
  spec: VehicleSpec
  index: number
  role: 'head' | 'mid' | 'tail' | 'single'
  len: number
  /** body width and height */
  w: number
  h: number
  /** length of the sloped nose at the front / rear end (0 = no nose there) */
  nF: number
  nR: number
  /** the line colour and the body colour */
  line: string
  body: string
  /** x-intervals of the doors and windows on the side walls (car frame) */
  doors: [number, number][]
  wins: [number, number][]
  /** top and half width of the flat end face at a nose (the plane x = len / 2) */
  capTop: number
  capHW: number
  /** the corner radius at the roof edge */
  roofR: number
}

/** Where the flat front face of a nose is: top height and half width (the plane x = len / 2). */
export interface FrontMetrics {
  capTop: number
  capHW: number
}

/** A rectangular destination display on the front of the head car: centre height, size, and how far in front of the end face it sits. */
export interface SignSpec {
  y: number
  w: number
  h: number
  x: number
}

/** A small decal (logo) on the front face: centre height, size, offset from the end face. */
export interface DecalSpec {
  y: number
  z: number
  w: number
  h: number
  x: number
}

/** Head and tail lamps: height, distance from the centre line, size. */
export interface LampSpec {
  y: number
  z: number
  w: number
  h: number
  /** a round lamp (diameter = the smaller of w and h) instead of a rectangular one */
  round?: boolean
  /** warm yellowish white instead of cold white (older lamps) */
  warm?: boolean
}

/** The extra detail of one vehicle model, on top of the shared body shell (see vehicles3d.tsx). */
export interface ModelDef {
  /** parts replacing the generic underframe, bogies and buffer beam of the shell */
  chassis: (c: CarCtx) => THREE.BufferGeometry[]
  /** everything else: doors, windows, front face, roof equipment */
  details: (c: CarCtx) => THREE.BufferGeometry[]
  /** the destination display on the head car (line on the left, destination on the right); drawn as an animated texture */
  sign?: (m: FrontMetrics) => SignSpec
  /** the railway company logo on the front */
  logo?: (m: FrontMetrics) => DecalSpec
  lamp: (m: FrontMetrics) => LampSpec
}
