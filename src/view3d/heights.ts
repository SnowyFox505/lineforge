import { RAIL } from '../model/scale'
import { WATER_THRESHOLD } from '../model/terrainField'

export const LAND_Y = 0.5
export const BED_Y = -1.4
export const BASE_Y = -3.6
/** Track top surface (ballast) sits just above the land */
export const RAIL_Y = LAND_Y + 0.1 * RAIL

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Terrain height for a water-field value: gentle banks falling into a real, deep river bed. */
export function groundHeight(f: number): number {
  return LAND_Y + (BED_Y - LAND_Y) * smooth(0.04, 0.9, f)
}

/** Height of the water surface: exactly where the 2D coastline (field = threshold) meets the bank. */
export const WATER_Y = groundHeight(WATER_THRESHOLD)
