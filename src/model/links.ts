import type { CityDoc } from './types'

/**
 * Links join two stations into one interchange without merging them: a tram stop next to a station, say.
 * They stay separate stations (own platforms, own lines) but share a name and count as one stop for transfers.
 */

/** The stations linked to `id`, directly or through others, including `id` itself (sorted by id). */
export function linkedIds(doc: CityDoc, id: string): string[] {
  const links = doc.links ?? []
  const seen = new Set([id])
  const todo = [id]
  while (todo.length) {
    const cur = todo.pop()!
    for (const [a, b] of links) {
      const other = a === cur ? b : b === cur ? a : null
      if (other && !seen.has(other)) {
        seen.add(other)
        todo.push(other)
      }
    }
  }
  return [...seen].sort()
}

export function areLinked(doc: CityDoc, a: string, b: string): boolean {
  return (doc.links ?? []).some(([x, y]) => (x === a && y === b) || (x === b && y === a))
}

/** The station of a linked group that carries the label (the others stay unlabelled so the name is not shown twice). */
export function labelHolder(doc: CityDoc, id: string): string {
  return linkedIds(doc, id)[0]
}

/** Link two stations (they take the name of the first one), or unlink them when they are linked already. */
export function toggleLink(doc: CityDoc, a: string, b: string): CityDoc {
  if (a === b || !doc.stations[a] || !doc.stations[b]) return doc
  if (areLinked(doc, a, b)) return { ...doc, links: (doc.links ?? []).filter(([x, y]) => !((x === a && y === b) || (x === b && y === a))) }
  const next: CityDoc = { ...doc, links: [...(doc.links ?? []), [a, b]] }
  return renameLinked(next, a, doc.stations[a].name)
}

/** Give a station and everything linked to it the same name. */
export function renameLinked(doc: CityDoc, id: string, name: string): CityDoc {
  const ids = linkedIds(doc, id)
  if (ids.every((i) => doc.stations[i]?.name === name)) return doc
  const stations = { ...doc.stations }
  for (const i of ids) if (stations[i]) stations[i] = { ...stations[i], name }
  return { ...doc, stations }
}

/** Remove the links of a station that is gone. */
export function dropLinks(doc: CityDoc, id: string): CityDoc {
  if (!doc.links?.some(([a, b]) => a === id || b === id)) return doc
  return { ...doc, links: doc.links.filter(([a, b]) => a !== id && b !== id) }
}
