import type { CityDoc } from './types'

/** Height of the highest peak (world units, one cell is one unit wide) */
export const MOUNTAIN_MAX = 5.5

/** Mountain heights grow with the distance from the edge of the area: about this many cells to reach 63 % of the full height */
const RISE = 2.6
/** Depth (cells) that stays flat at the border of an area */
const FOOT = 0.9

export interface MountainField {
  size: number
  /** height at the (size + 1)² cell corners */
  h: Float32Array
}

/**
 * The shape of the mountains: the further inside a mountain area, the higher the ground. Rounded by blurring, so the
 * slopes are smooth. Null when the map has no mountains.
 */
export function buildMountains(doc: Pick<CityDoc, 'zoneGrid' | 'zones' | 'size'>): MountainField | null {
  const { zoneGrid, zones, size } = doc
  if (!zoneGrid || !zones?.length) return null
  const ids = new Set(zones.filter((z) => z.kind === 'mountain').map((z) => z.id))
  if (!ids.size) return null
  const n = size * size
  const depth = new Int16Array(n).fill(-1)
  let queue: number[] = []
  let any = false
  for (let i = 0; i < n; i++) {
    if (ids.has(zoneGrid[i])) any = true
    else {
      depth[i] = 0
      queue.push(i)
    }
  }
  if (!any) return null
  for (let d = 1; queue.length; d++) {
    const next: number[] = []
    for (const i of queue) {
      const x = i % size
      const around = [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, i >= size ? i - size : -1, i < n - size ? i + size : -1]
      for (const j of around) {
        if (j >= 0 && depth[j] === -1) {
          depth[j] = d
          next.push(j)
        }
      }
    }
    queue = next
  }
  // a map that is only mountains: depth is unknown, take the distance from the border instead
  for (let i = 0; i < n; i++) if (depth[i] === -1) depth[i] = Math.min(i % size, Math.floor(i / size), size - 1 - (i % size), size - 1 - Math.floor(i / size)) + 1

  // corners: the mean depth of the four cells around them (outside the map: the nearest cell)
  const m = size + 1
  let h = new Float32Array(m * m)
  const at = (x: number, y: number) => depth[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))]
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) h[j * m + i] = (at(i - 1, j - 1) + at(i, j - 1) + at(i - 1, j) + at(i, j)) / 4
  // two blurs make the ridges round
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(m * m)
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) {
        let sum = 0
        let cnt = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = i + dx
            const y = j + dy
            if (x < 0 || y < 0 || x >= m || y >= m) continue
            sum += h[y * m + x]
            cnt++
          }
        }
        out[j * m + i] = sum / cnt
      }
    }
    h = out
  }
  // the first cells at the edge of the area are the foot: flat, so the mountain does not stand on a wall
  for (let i = 0; i < h.length; i++) h[i] = MOUNTAIN_MAX * (1 - Math.exp(-Math.max(0, h[i] - FOOT) / RISE))
  return { size, h }
}

const hash2 = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
/** Smooth value noise (0..1) */
function noise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/** Height of the mountains at a point of the map (cell coordinates, 0..size): smooth, with some peaks and saddles. */
export function mountainHeightAt(f: MountainField, u: number, v: number): number {
  const m = f.size + 1
  const x = Math.min(f.size, Math.max(0, u))
  const y = Math.min(f.size, Math.max(0, v))
  const xi = Math.min(f.size - 1, Math.floor(x))
  const yi = Math.min(f.size - 1, Math.floor(y))
  const fx = x - xi
  const fy = y - yi
  const base = f.h[yi * m + xi] * (1 - fx) * (1 - fy) + f.h[yi * m + xi + 1] * fx * (1 - fy) + f.h[(yi + 1) * m + xi] * (1 - fx) * fy + f.h[(yi + 1) * m + xi + 1] * fx * fy
  if (base < 0.001) return 0
  const n = noise(u * 0.42, v * 0.42) * 0.6 + noise(u * 1.1 + 40, v * 1.1 + 40) * 0.4
  return base * (0.55 + 0.9 * n)
}
