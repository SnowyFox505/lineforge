import { MAP_SIZE } from './constants'
import type { CityDoc, GameMode } from './types'

export function newId(): string {
  return crypto.randomUUID().slice(0, 8)
}

export function createCity(name: string, mode: GameMode, size = MAP_SIZE): CityDoc {
  return {
    id: crypto.randomUUID(),
    name,
    mode,
    size,
    terrain: new Uint8Array(size * size),
    stations: {},
    lines: {},
    zoneGrid: new Uint16Array(size * size),
    zones: [],
    pois: [],
  }
}
