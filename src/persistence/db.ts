import Dexie from 'dexie'
import type { CityDoc } from '../model/types'

interface CityRecord {
  id: string
  name: string
  updatedAt: number
  doc: CityDoc
}

class LineForgeDB extends Dexie {
  cities!: Dexie.Table<CityRecord, string>

  constructor() {
    super('lineforge')
    this.version(1).stores({ cities: 'id, updatedAt' })
  }
}

const db = new LineForgeDB()

export async function saveCity(doc: CityDoc): Promise<void> {
  await db.cities.put({ id: doc.id, name: doc.name, updatedAt: Date.now(), doc })
}

export async function listCities(): Promise<{ id: string; name: string; updatedAt: number }[]> {
  const all = await db.cities.orderBy('updatedAt').reverse().toArray()
  return all.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
}

/** All saved cities (newest first), including their documents for previews. */
export async function listCityDocs(): Promise<{ id: string; name: string; updatedAt: number; doc: CityDoc }[]> {
  return db.cities.orderBy('updatedAt').reverse().toArray()
}

export async function loadCity(id: string): Promise<CityDoc | undefined> {
  return (await db.cities.get(id))?.doc
}

export async function deleteCity(id: string): Promise<void> {
  await db.cities.delete(id)
}

export async function latestCity(): Promise<CityDoc | undefined> {
  return (await db.cities.orderBy('updatedAt').last())?.doc
}

// --- JSON export / import (terrain as plain array) ---

export function exportCityJson(doc: CityDoc): string {
  return JSON.stringify({ ...doc, terrain: Array.from(doc.terrain), zoneGrid: doc.zoneGrid ? Array.from(doc.zoneGrid) : undefined })
}

export function importCityJson(text: string): CityDoc {
  const raw = JSON.parse(text)
  if (!raw || typeof raw.size !== 'number' || !Array.isArray(raw.terrain) || raw.terrain.length !== raw.size ** 2) {
    throw new Error('Ungültige LineForge-Datei')
  }
  return {
    id: crypto.randomUUID(),
    name: String(raw.name ?? 'Importierte Stadt'),
    mode: raw.mode === 'creative' ? 'creative' : 'normal',
    size: raw.size,
    terrain: Uint8Array.from(raw.terrain),
    stations: raw.stations ?? {},
    lines: raw.lines ?? {},
    zones: Array.isArray(raw.zones) ? raw.zones : [],
    zoneGrid: Array.isArray(raw.zoneGrid) && raw.zoneGrid.length === raw.size ** 2 ? Uint16Array.from(raw.zoneGrid) : new Uint16Array(raw.size ** 2),
    pois: Array.isArray(raw.pois) ? raw.pois : [],
  }
}
