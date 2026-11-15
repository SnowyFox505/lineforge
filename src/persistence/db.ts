import Dexie from 'dexie'
import { gameTime } from '../sim/clock'
import type { CityDoc } from '../model/types'

/** Cities saved on this device belong to an owner: 'guest' (no account) or the user id of a signed-in account. */
export const GUEST = 'guest'

interface CityRecord {
  id: string
  name: string
  updatedAt: number
  owner: string
  doc: CityDoc
}

class LineForgeDB extends Dexie {
  cities!: Dexie.Table<CityRecord, string>

  constructor() {
    super('lineforge')
    this.version(1).stores({ cities: 'id, updatedAt' })
    // v2: cities belong to a person; everything saved before belongs to the guest
    this.version(2)
      .stores({ cities: 'id, updatedAt, owner' })
      .upgrade((tx) =>
        tx
          .table('cities')
          .toCollection()
          .modify((c) => {
            c.owner = GUEST
          }),
      )
  }
}

const db = new LineForgeDB()

let owner = GUEST
/** Which person's cities the functions below work with. Set when somebody signs in or out. */
export function setOwner(next: string) {
  owner = next
}
export function getOwner() {
  return owner
}

type SaveHook = (doc: CityDoc, updatedAt: number, owner: string) => void
let saveHook: SaveHook | null = null
/** The cloud sync listens here to upload every local save of a signed-in person. */
export function onCitySaved(fn: SaveHook | null) {
  saveHook = fn
}

export interface CityRow {
  id: string
  name: string
  updatedAt: number
  doc: CityDoc
}

export async function saveCity(input: CityDoc): Promise<void> {
  // the game time keeps running outside of the document: it is written into what is saved
  const doc = input.id === gameTime.cityId ? { ...input, clock: Math.round(gameTime.minutes) } : input
  const updatedAt = Date.now()
  await db.cities.put({ id: doc.id, name: doc.name, updatedAt, owner, doc })
  saveHook?.(doc, updatedAt, owner)
}

/** Stores a city exactly as it came from the cloud (keeps the time of the cloud copy, no upload). */
export async function putCityFromCloud(doc: CityDoc, updatedAt: number, forOwner: string): Promise<void> {
  await db.cities.put({ id: doc.id, name: doc.name, updatedAt, owner: forOwner, doc })
}

async function mine(forOwner = owner): Promise<CityRow[]> {
  const rows = await db.cities.where('owner').equals(forOwner).toArray()
  return rows.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function listCities(): Promise<{ id: string; name: string; updatedAt: number }[]> {
  return (await mine()).map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
}

/** All saved cities of the current person (newest first), including their documents for previews. */
export async function listCityDocs(forOwner = owner): Promise<CityRow[]> {
  return mine(forOwner)
}

export async function loadCity(id: string): Promise<CityDoc | undefined> {
  const r = await db.cities.get(id)
  return r && r.owner === owner ? r.doc : undefined
}

export async function deleteCity(id: string): Promise<void> {
  const r = await db.cities.get(id)
  if (r && r.owner === owner) await db.cities.delete(id)
}

export async function latestCity(): Promise<CityDoc | undefined> {
  return (await mine())[0]?.doc
}

/** Moves the cities saved as a guest on this device into an account. Returns the moved cities. */
export async function adoptGuestCities(uid: string): Promise<CityRow[]> {
  const rows = await mine(GUEST)
  for (const r of rows) await db.cities.put({ ...r, owner: uid })
  return rows
}

export async function countGuestCities(): Promise<number> {
  return db.cities.where('owner').equals(GUEST).count()
}

/** Removes everything a person has on this device (after signing out, so the next person on the device sees nothing). */
export async function clearOwner(forOwner: string): Promise<void> {
  await db.cities.where('owner').equals(forOwner).delete()
}

// --- JSON export / import (terrain as plain array) ---

export function exportCityJson(doc: CityDoc): string {
  const clock = doc.id === gameTime.cityId ? Math.round(gameTime.minutes) : doc.clock
  return JSON.stringify({ ...doc, clock, terrain: Array.from(doc.terrain), zoneGrid: doc.zoneGrid ? Array.from(doc.zoneGrid) : undefined })
}

/** A city from a file gets a new id (so an import never overwrites a city); the cloud keeps the id with `keepId`. */
export function importCityJson(text: string, keepId = false): CityDoc {
  const raw = JSON.parse(text)
  if (!raw || typeof raw.size !== 'number' || !Array.isArray(raw.terrain) || raw.terrain.length !== raw.size ** 2) {
    throw new Error('Ungültige LineForge-Datei')
  }
  return {
    id: keepId && typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    name: String(raw.name ?? 'Importierte Stadt'),
    mode: raw.mode === 'creative' ? 'creative' : 'normal',
    size: raw.size,
    terrain: Uint8Array.from(raw.terrain),
    stations: raw.stations ?? {},
    lines: raw.lines ?? {},
    zones: Array.isArray(raw.zones) ? raw.zones : [],
    zoneGrid: Array.isArray(raw.zoneGrid) && raw.zoneGrid.length === raw.size ** 2 ? Uint16Array.from(raw.zoneGrid) : new Uint16Array(raw.size ** 2),
    pois: Array.isArray(raw.pois) ? raw.pois : [],
    waters: Array.isArray(raw.waters) ? raw.waters : undefined,
    nameQueues: raw.nameQueues && typeof raw.nameQueues === 'object' ? raw.nameQueues : undefined,
    links: Array.isArray(raw.links) ? raw.links : undefined,
    clock: typeof raw.clock === 'number' ? raw.clock : undefined,
    geoV: typeof raw.geoV === 'number' ? raw.geoV : undefined,
  }
}
