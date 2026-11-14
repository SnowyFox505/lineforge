import { newId } from './factory'
import type { CityDoc, Poi, Station } from './types'

/**
 * The "landmark" station type is gone: a landmark is a point of interest with a catchment radius now.
 * An old landmark station becomes a plain stop, and a landmark with its label appears at the same place.
 * Returns the same document when there is nothing to do.
 */
export function migrateLandmarks(doc: CityDoc): CityDoc {
  const old = Object.values(doc.stations).filter((s) => (s.type as string) === 'landmark')
  if (!old.length) return doc
  const stations: Record<string, Station> = { ...doc.stations }
  const pois: Poi[] = [...(doc.pois ?? [])]
  for (const s of old) {
    const { landmarkLabel, ...rest } = s as Station & { landmarkLabel?: string }
    stations[s.id] = { ...rest, type: 'standard' }
    pois.push({ id: newId(), kind: 'landmark', name: landmarkLabel?.trim() || 'Wahrzeichen', x: s.x, y: s.y })
  }
  return { ...doc, stations, pois }
}
