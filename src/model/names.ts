import { CANAL_NAMES, FOREST_NAMES, LAKE_STEMS, MOUNTAIN_NAMES, PLACE_NAMES, RIVER_NAMES, SEA_NAMES } from './nameData'
import type { CityDoc } from './types'

/** The wish lists a player can fill: the next names that are used before random ones. */
export type NameKind = 'district' | 'suburb' | 'water' | 'landscape'

export type NameQueues = Record<NameKind, string[]>

export const NAME_KINDS: { kind: NameKind; label: string; hint: string }[] = [
  { kind: 'district', label: 'Bezirke', hint: 'Der nächste neue Bezirk heißt wie der erste Name hier.' },
  { kind: 'suburb', label: 'Vororte', hint: 'Der nächste neue Vorort bekommt den ersten Namen.' },
  { kind: 'water', label: 'Gewässer', hint: 'Seen, Flüsse, Kanäle und Meere nehmen den ersten Namen.' },
  { kind: 'landscape', label: 'Landschaft', hint: 'Wälder und Gebirge nehmen den ersten Namen.' },
]

export const emptyQueues = (): NameQueues => ({ district: [], suburb: [], water: [], landscape: [] })

export function queuesOf(doc: CityDoc): NameQueues {
  return { ...emptyQueues(), ...(doc.nameQueues ?? {}) }
}

/** Letters only, lower case: "Rotter-Feld" and "rotterfeld" are the same */
const letters = (n: string) => n.toLowerCase().replace(/[^a-zäöüß]/g, '')

/**
 * Two names are too alike when they are the same, start with the same five letters ("Rotterfeld", "Rotterhagen")
 * or end in the same seven letters ("Birkenhain" and "Eichenhain" are fine, "Westerhorst" and "Osterhorst" are not).
 */
export function tooSimilar(a: string, b: string): boolean {
  const x = letters(a)
  const y = letters(b)
  if (!x || !y) return false
  if (x === y) return true
  if (x.length >= 5 && y.length >= 5 && x.slice(0, 5) === y.slice(0, 5)) return true
  return x.length >= 7 && y.length >= 7 && x.slice(-7) === y.slice(-7)
}

/** Names that are in use in a city: districts, suburbs, waters and landscapes. */
export function usedNames(doc: CityDoc): string[] {
  return [...(doc.zones ?? []).map((z) => z.name), ...(doc.waters ?? []).map((w) => w.name)]
}

/** A random name from the pool that does not look like any used one; null when the pool has nothing left. */
export function pickName(pool: string[], used: string[], rand: () => number = Math.random): string | null {
  const free = pool.filter((n) => !used.some((u) => tooSimilar(n, u)))
  if (free.length) return free[Math.floor(rand() * free.length)]
  // everything looks alike by now: at least not the same name twice
  const rest = pool.filter((n) => !used.some((u) => letters(u) === letters(n)))
  return rest.length ? rest[Math.floor(rand() * rest.length)] : null
}

/** The pool a random name of this kind comes from */
export const LAKE_NAMES: string[] = LAKE_STEMS.map((s) => `${s}see`)

export function poolFor(kind: NameKind, detail?: 'lake' | 'river' | 'canal' | 'sea' | 'forest' | 'mountain'): string[] {
  if (kind === 'district' || kind === 'suburb') return PLACE_NAMES
  if (kind === 'water') return detail === 'river' ? RIVER_NAMES : detail === 'canal' ? CANAL_NAMES : detail === 'sea' ? SEA_NAMES : LAKE_NAMES
  return detail === 'mountain' ? MOUNTAIN_NAMES : FOREST_NAMES
}

/**
 * The name for something new: the first wish of the player's list (that is not in use yet), else a random one
 * from the pool, else `fallback`. Returns the name and the lists without the name that was used.
 */
export function takeName(doc: CityDoc, kind: NameKind, pool: string[], fallback: string, rand: () => number = Math.random): { name: string; queues: NameQueues } {
  const queues = queuesOf(doc)
  const used = usedNames(doc)
  const list = [...queues[kind]]
  while (list.length) {
    const wish = list.shift()!.trim()
    if (wish && !used.some((u) => letters(u) === letters(wish))) return { name: wish, queues: { ...queues, [kind]: list } }
  }
  const name = pickName(pool, used, rand) ?? fallback
  return { name, queues: { ...queues, [kind]: list } }
}
