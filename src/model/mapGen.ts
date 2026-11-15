import { poolFor, takeName } from './names'
import { LAND, WATER } from './types'
import type { CityDoc, Zone, ZoneKind } from './types'

/** Ready-made landscapes for a new city. */
export type MapPreset = 'leer' | 'seen' | 'fluss' | 'kueste' | 'inseln' | 'berge'

export const MAP_PRESETS: { id: MapPreset; label: string; text: string }[] = [
  { id: 'leer', label: 'Leer', text: 'Eine leere Wiese, alles baust du selbst.' },
  { id: 'seen', label: 'Seenland', text: 'Ein großer See in der Mitte, Wälder am Ufer.' },
  { id: 'fluss', label: 'Flusstal', text: 'Ein Fluss schlängelt sich durchs Land, mit Wald und Hügeln an den Rändern.' },
  { id: 'kueste', label: 'Küste', text: 'Das Meer an einer Seite mit Buchten, im Hinterland Hügel und Wald.' },
  { id: 'inseln', label: 'Inseln', text: 'Eine große Insel und mehrere kleine im Meer.' },
  { id: 'berge', label: 'Bergland', text: 'Gebirge in den Ecken, Wälder und ein Bergsee.' },
]

// ---- noise ----------------------------------------------------------------------------------

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const fade = (t: number) => t * t * (3 - 2 * t)

/** Smooth value noise, 0..1 */
function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const tx = fade(x - xi)
  const ty = fade(y - yi)
  const a = hash(xi, yi, seed)
  const b = hash(xi + 1, yi, seed)
  const c = hash(xi, yi + 1, seed)
  const d = hash(xi + 1, yi + 1, seed)
  const top = a + (b - a) * tx
  const bottom = c + (d - c) * tx
  return top + (bottom - top) * ty
}

/** Layered noise (finer detail on top of coarse shapes), 0..1 */
function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(x * freq, y * freq, seed + i * 131) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

// ---- the landscapes -----------------------------------------------------------------------------

export interface GeneratedMap {
  terrain: Uint8Array
  forest: Uint8Array
  mountain: Uint8Array
}

/**
 * A landscape for a map of `size` cells. The same preset and seed always give the same map; a different seed another one.
 * Coordinates are measured in shares of the map, so every size shows the same shapes.
 */
export function generateMap(preset: MapPreset, size: number, seed: number): GeneratedMap {
  const terrain = new Uint8Array(size * size)
  const forest = new Uint8Array(size * size)
  const mountain = new Uint8Array(size * size)
  if (preset === 'leer') return { terrain, forest, mountain }
  // a few numbers per seed that move the shapes around
  const r = (n: number) => hash(n, 7, seed)
  const side = Math.floor(r(1) * 4)
  const vertical = r(2) < 0.5
  const phase = r(3) * Math.PI * 2
  const lakeX = 0.5 + (r(4) - 0.5) * 0.16
  const lakeY = 0.5 + (r(5) - 0.5) * 0.16
  const riverWidth = Math.min(9, Math.max(3, size * 0.022)) / size
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      const v = (y + 0.5) / size
      const i = y * size + x
      let water = false
      let forestAt = false
      let mountainAt = false
      switch (preset) {
        case 'seen': {
          const d = Math.hypot(u - lakeX, v - lakeY)
          const w = 0.21 * (0.7 + 0.8 * (fbm(u * 3, v * 3, seed) - 0.3))
          water = d < w
          forestAt = !water && d > w * 1.12 && fbm(u * 5 + 10, v * 5, seed + 7) > 0.63
          break
        }
        case 'fluss': {
          // along the river (a) and across it (b)
          const a = vertical ? v : u
          const b = vertical ? u : v
          const centre = 0.5 + 0.16 * Math.sin(a * Math.PI * 2 * 1.3 + phase) + 0.14 * (fbm(a * 2.4, 0.5, seed + 3) - 0.5) * 2
          const dist = Math.abs(b - centre)
          water = dist < (riverWidth / 2) * (0.75 + 0.7 * fbm(a * 9, 3.1, seed + 5))
          forestAt = !water && dist > 0.05 && fbm(u * 5 + 3, v * 5, seed + 7) > 0.62
          mountainAt = !water && dist > 0.36 && fbm(u * 4 + 8, v * 4, seed + 11) > 0.6
          break
        }
        case 'kueste': {
          // t: distance from the coast edge (0..1), w: position along the coast
          const t = side === 0 ? v : side === 1 ? 1 - v : side === 2 ? u : 1 - u
          const w = side < 2 ? u : v
          const coast = 0.2 + 0.2 * (fbm(w * 2.6, 0.7, seed + 2) - 0.5) * 2 + 0.05 * Math.sin(w * 11 + phase)
          water = t < coast
          forestAt = !water && t > coast + 0.04 && fbm(u * 5 + 1, v * 5, seed + 7) > 0.6
          mountainAt = !water && t > 0.62 && fbm(u * 4 + 6, v * 4, seed + 11) > 0.6
          break
        }
        case 'inseln': {
          const g = 1 - Math.hypot((u - 0.5) / 0.36, (v - 0.5) / 0.32)
          const n = fbm(u * 5, v * 5, seed)
          const small = fbm(u * 7 + 5, v * 7 + 2, seed + 3) > 0.66
          water = !(g * 1.1 + (n - 0.5) * 0.9 > 0.1 || small)
          forestAt = !water && fbm(u * 6 + 2, v * 6, seed + 7) > 0.61
          break
        }
        case 'berge': {
          const ridge = 1 - Math.abs(2 * fbm(u * 3, v * 3, seed + 11) - 1)
          const far = Math.hypot(u - 0.5, v - 0.5)
          const d = Math.hypot(u - lakeX, v - lakeY)
          water = d < 0.09 * (0.7 + 0.7 * fbm(u * 5, v * 5, seed))
          mountainAt = !water && far > 0.3 && ridge > 0.74
          forestAt = !water && !mountainAt && fbm(u * 6, v * 6, seed + 7) > 0.62
          break
        }
        default:
          break
      }
      if (water) terrain[i] = WATER
      else if (mountainAt) mountain[i] = 1
      else if (forestAt) forest[i] = 1
    }
  }
  return { terrain, forest, mountain }
}

// ---- turning the masks into areas -----------------------------------------------------------------

/** The connected parts of a mask, biggest first, as lists of cell indices. */
function components(mask: Uint8Array, size: number): number[][] {
  const seen = new Uint8Array(mask.length)
  const out: number[][] = []
  const stack: number[] = []
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue
    const cells: number[] = []
    seen[s] = 1
    stack.push(s)
    while (stack.length) {
      const c = stack.pop()!
      cells.push(c)
      const x = c % size
      const y = (c - x) / size
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
        const n = ny * size + nx
        if (mask[n] && !seen[n]) {
          seen[n] = 1
          stack.push(n)
        }
      }
    }
    out.push(cells)
  }
  return out.sort((a, b) => b.length - a.length)
}

const MIN_AREA = 10
const MAX_AREAS = 10

/**
 * Put a landscape onto a city: water in the terrain, and every forest and mountain as a named area (names from the player's
 * wishes first, then made-up ones). Tiny patches are dropped, and there are at most ten areas of a kind.
 */
export function applyMap(doc: CityDoc, preset: MapPreset, seed: number): CityDoc {
  if (preset === 'leer') return doc
  const size = doc.size
  const gen = generateMap(preset, size, seed)
  const zoneGrid = new Uint16Array(size * size)
  const zones: Zone[] = []
  let d: CityDoc = { ...doc, terrain: gen.terrain, zoneGrid, zones }
  for (const kind of ['mountain', 'forest'] as ZoneKind[]) {
    const parts = components(kind === 'forest' ? gen.forest : gen.mountain, size)
      .filter((c) => c.length >= MIN_AREA)
      .slice(0, MAX_AREAS)
    parts.forEach((cells, n) => {
      const id = zones.length + 1
      const plain = `${kind === 'forest' ? 'Wald' : 'Gebirge'} ${n + 1}`
      const taken = takeName(d, 'landscape', poolFor('landscape', kind === 'forest' ? 'forest' : 'mountain'), plain)
      zones.push({ id, kind, name: taken.name })
      d = { ...d, zones: [...zones], nameQueues: taken.queues }
      for (const c of cells) zoneGrid[c] = id
    })
  }
  return { ...d, zones }
}

/** Share of the map that is water (0..1) */
export function waterShare(terrain: Uint8Array): number {
  let n = 0
  for (let i = 0; i < terrain.length; i++) if (terrain[i] === WATER) n++
  return n / terrain.length
}

export { LAND }
