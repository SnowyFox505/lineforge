import { takeName, poolFor } from './names'
import { WATER } from './types'
import type { CityDoc, WaterKind, WaterName } from './types'

/**
 * Bodies of water: the water of the map is cut into parts that can be named. A lake with a river flowing into it
 * is two parts: the lake is where the water is wide (at least five cells across), the river is what is left.
 */
export interface WaterBody {
  /** index in `WaterBodies.list`, also the label in `WaterBodies.labels` (plus one) */
  id: number
  cells: number[]
  area: number
  x0: number
  y0: number
  x1: number
  y1: number
  /** cells of the body that lie on the border of the map */
  edge: number
  /** widest place: the largest distance to land (1 = a cell next to land) */
  depth: number
  /** compact (a lake, a sea) or a long strip (a river, a canal) */
  shape: 'blob' | 'strip'
  /** where the name goes (cell centre, map coordinates) */
  label: { x: number; y: number }
}

export interface WaterBodies {
  size: number
  /** body id + 1 per cell, 0 = land */
  labels: Int32Array
  list: WaterBody[]
}

/** Water is at least this far from land (cells) to count as a lake: a width of five cells */
const LAKE_DEPTH = 3
/** A stretch of water that is long compared to its width is a river or canal */
const STRIP_RATIO = 8
const STRIP_MIN_AREA = 14
/** A sea touches the map edge with at least this many cells and covers this share of the map */
const SEA_EDGE = 10
const SEA_SHARE = 0.03

const cache = new WeakMap<Uint8Array, WaterBodies>()

/** All bodies of water of a map (kept per terrain, so it is only computed again after painting). */
export function waterBodies(doc: Pick<CityDoc, 'terrain' | 'size'>): WaterBodies {
  const hit = cache.get(doc.terrain)
  if (hit) return hit
  const out = computeBodies(doc.terrain, doc.size)
  cache.set(doc.terrain, out)
  return out
}

function computeBodies(terrain: Uint8Array, size: number): WaterBodies {
  const n = size * size
  const isWater = (i: number) => terrain[i] === WATER
  // distance to land (the map edge is not land: a sea goes on beyond it)
  const dist = new Int16Array(n).fill(-1)
  let queue: number[] = []
  for (let i = 0; i < n; i++) {
    if (!isWater(i)) {
      dist[i] = 0
      queue.push(i)
    }
  }
  const nb = (i: number, f: (j: number) => void) => {
    const x = i % size
    if (x > 0) f(i - 1)
    if (x < size - 1) f(i + 1)
    if (i >= size) f(i - size)
    if (i < n - size) f(i + size)
  }
  for (let d = 1; queue.length; d++) {
    const next: number[] = []
    for (const i of queue) {
      nb(i, (j) => {
        if (dist[j] === -1) {
          dist[j] = d
          next.push(j)
        }
      })
    }
    queue = next
  }
  // a map that is all water has no land to measure from
  for (let i = 0; i < n; i++) if (dist[i] === -1) dist[i] = size

  // the wide water (cores) grown back by what the distance took away: the lakes
  const lake = new Uint8Array(n)
  let front: number[] = []
  for (let i = 0; i < n; i++) {
    if (isWater(i) && dist[i] >= LAKE_DEPTH) {
      lake[i] = 1
      front.push(i)
    }
  }
  // (growing in all eight directions: the distance to land is measured along the grid, so corners need the diagonal)
  for (let step = 0; step < LAKE_DEPTH - 1 && front.length; step++) {
    const next: number[] = []
    for (const i of front) {
      const x = i % size
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = Math.floor(i / size) + dy
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
          const j = ny * size + nx
          if (isWater(j) && !lake[j]) {
            lake[j] = 1
            next.push(j)
          }
        }
      }
    }
    front = next
  }

  // parts: connected cells of the same kind (lake or not)
  const labels = new Int32Array(n)
  const list: WaterBody[] = []
  for (let s = 0; s < n; s++) {
    if (!isWater(s) || labels[s]) continue
    const id = list.length
    const wide = lake[s]
    const cells: number[] = []
    const stack = [s]
    labels[s] = id + 1
    let x0 = size
    let y0 = size
    let x1 = 0
    let y1 = 0
    let edge = 0
    let depth = 0
    while (stack.length) {
      const i = stack.pop()!
      cells.push(i)
      const x = i % size
      const y = (i - x) / size
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) edge++
      depth = Math.max(depth, dist[i])
      nb(i, (j) => {
        if (isWater(j) && !labels[j] && lake[j] === wide) {
          labels[j] = id + 1
          stack.push(j)
        }
      })
    }
    const strip = !wide && cells.length >= STRIP_MIN_AREA && cells.length / (depth * depth) >= STRIP_RATIO
    list.push({ id, cells, area: cells.length, x0, y0, x1, y1, edge, depth, shape: strip ? 'strip' : 'blob', label: labelPoint(cells, size, dist, strip, x1 - x0 >= y1 - y0) })
  }
  return { size, labels, list }
}

/** A blob is named at its deepest place near the middle, a strip halfway along its length. */
function labelPoint(cells: number[], size: number, dist: Int16Array, strip: boolean, alongX: boolean): { x: number; y: number } {
  if (strip) {
    const key = (i: number) => (alongX ? i % size : Math.floor(i / size))
    const sorted = [...cells].sort((a, b) => key(a) - key(b))
    const mid = sorted[Math.floor(sorted.length / 2)]
    return { x: (mid % size) + 0.5, y: Math.floor(mid / size) + 0.5 }
  }
  let cx = 0
  let cy = 0
  for (const i of cells) {
    cx += i % size
    cy += Math.floor(i / size)
  }
  cx /= cells.length
  cy /= cells.length
  let best = cells[0]
  let bestScore = -Infinity
  for (const i of cells) {
    const x = i % size
    const y = Math.floor(i / size)
    // deep water counts more than being close to the centre
    const score = dist[i] * 2 - Math.hypot(x - cx, y - cy)
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return { x: (best % size) + 0.5, y: Math.floor(best / size) + 0.5 }
}

/** The body of water that covers a cell, or null on land / outside the map. */
export function waterAt(doc: Pick<CityDoc, 'terrain' | 'size'>, x: number, y: number): WaterBody | null {
  if (x < 0 || y < 0 || x >= doc.size || y >= doc.size) return null
  const b = waterBodies(doc)
  const id = b.labels[y * doc.size + x]
  return id ? b.list[id - 1] : null
}

/** A sea: water that reaches the border of the map over a good stretch and covers a good part of it. */
export function isSeaLike(doc: Pick<CityDoc, 'size'>, body: WaterBody): boolean {
  return body.shape === 'blob' && body.edge >= SEA_EDGE && body.area >= SEA_SHARE * doc.size * doc.size
}

/** What the map suggests this water is. */
export function suggestKind(doc: Pick<CityDoc, 'size'>, body: WaterBody): WaterKind {
  if (isSeaLike(doc, body)) return 'sea'
  return body.shape === 'strip' ? 'river' : 'lake'
}

/**
 * What the player may call it: a long strip is a river or a canal; a big water at the edge of the map a sea,
 * a lake or a river (never a canal); any other compact water a lake.
 */
export function allowedKinds(doc: Pick<CityDoc, 'size'>, body: WaterBody): WaterKind[] {
  if (body.shape === 'strip') return ['river', 'canal']
  if (isSeaLike(doc, body)) return ['sea', 'lake', 'river']
  return ['lake']
}

export const WATER_LABEL: Record<WaterKind, string> = { lake: 'See', river: 'Fluss', canal: 'Kanal', sea: 'Meer' }

export interface NamedWater {
  water: WaterName
  body: WaterBody
}

/** The names that still have water under them (one per body: if two names meet in one body, the first one counts). */
export function namedWaters(doc: CityDoc): NamedWater[] {
  if (!doc.waters?.length) return []
  const seen = new Set<number>()
  const out: NamedWater[] = []
  for (const w of doc.waters) {
    const body = waterAt(doc, w.x, w.y)
    if (!body || seen.has(body.id)) continue
    seen.add(body.id)
    out.push({ water: w, body })
  }
  return out
}

/** The name of the body at a cell, if it has one. */
export function nameAt(doc: CityDoc, x: number, y: number): NamedWater | null {
  const body = waterAt(doc, x, y)
  if (!body) return null
  return namedWaters(doc).find((n) => n.body.id === body.id) ?? null
}

/**
 * Names the body at a cell with the kind the map suggests and a name from the player's wishes or at random.
 * Returns the new document and the id of the name (the existing one when the body is named already).
 */
export function nameWaterAt(doc: CityDoc, x: number, y: number, rand?: () => number): { doc: CityDoc; id: string } | null {
  const body = waterAt(doc, x, y)
  if (!body) return null
  const existing = nameAt(doc, x, y)
  if (existing) return { doc, id: existing.water.id }
  const kind = suggestKind(doc, body)
  const taken = takeName(doc, 'water', poolFor('water', kind), WATER_LABEL[kind], rand)
  // the anchor is the label cell: it stays inside the body even when the tapped cell is at its rim
  const id = `w${(doc.waters ?? []).reduce((m, w) => Math.max(m, parseInt(w.id.slice(1), 10) || 0), 0) + 1}`
  const water: WaterName = { id, kind, name: taken.name, x: Math.floor(body.label.x), y: Math.floor(body.label.y), auto: true }
  return { doc: { ...doc, waters: [...(doc.waters ?? []), water], nameQueues: taken.queues }, id }
}

/** Another kind: a name that was made up by the game follows the kind ("…see" becomes a river name). */
export function setWaterKind(doc: CityDoc, id: string, kind: WaterKind, rand?: () => number): CityDoc {
  const w = (doc.waters ?? []).find((v) => v.id === id)
  if (!w || w.kind === kind) return doc
  let next: WaterName = { ...w, kind }
  let queues = doc.nameQueues
  if (w.auto) {
    const others = { ...doc, waters: (doc.waters ?? []).filter((v) => v.id !== id) }
    const taken = takeName(others, 'water', poolFor('water', kind), WATER_LABEL[kind], rand)
    next = { ...next, name: taken.name }
    queues = taken.queues
  }
  return { ...doc, waters: (doc.waters ?? []).map((v) => (v.id === id ? next : v)), nameQueues: queues }
}

/** A new made-up name for the same kind (the next wish of the player, else a random one). */
export function rerollWaterName(doc: CityDoc, id: string, rand?: () => number): CityDoc {
  const w = (doc.waters ?? []).find((v) => v.id === id)
  if (!w) return doc
  const others = { ...doc, waters: (doc.waters ?? []).filter((v) => v.id !== id) }
  const taken = takeName(others, 'water', poolFor('water', w.kind), w.name, rand)
  return { ...doc, waters: (doc.waters ?? []).map((v) => (v.id === id ? { ...v, name: taken.name, auto: true } : v)), nameQueues: taken.queues }
}

export function renameWater(doc: CityDoc, id: string, name: string): CityDoc {
  return { ...doc, waters: (doc.waters ?? []).map((v) => (v.id === id ? { ...v, name, auto: false } : v)) }
}

export function removeWaterName(doc: CityDoc, id: string): CityDoc {
  return { ...doc, waters: (doc.waters ?? []).filter((v) => v.id !== id) }
}
