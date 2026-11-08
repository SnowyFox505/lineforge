import { firebase } from '../auth/firebase'
import { clearOwner, listCityDocs, onCitySaved, putCityFromCloud } from '../persistence/db'
import type { CityDoc } from '../model/types'
import { decodeCity, encodeCity } from './codec'

/**
 * Cloud copy of a person's cities in Firestore:
 *   users/{uid}/cities/{id}    small description (name, size, time of the last change), listed quickly
 *   users/{uid}/cityData/{id}  the city itself (compressed bytes)
 * The newest change wins. A deletion travels up to the cloud; a city that is deleted on another device is simply
 * kept here (and uploaded again at the next change), so nothing is ever lost by a sync.
 */
export interface CloudCity {
  id: string
  name: string
  updatedAt: number
}

export async function pushCity(uid: string, doc: CityDoc, updatedAt: number): Promise<void> {
  const { db } = await firebase()
  const { doc: ref, setDoc, Bytes } = await import('firebase/firestore')
  const bytes = await encodeCity(doc)
  // the data first, then the description: a listed city always has its data
  await setDoc(ref(db, 'users', uid, 'cityData', doc.id), { data: Bytes.fromUint8Array(bytes), updatedAt })
  await setDoc(ref(db, 'users', uid, 'cities', doc.id), {
    name: doc.name,
    size: doc.size,
    mode: doc.mode,
    stations: Object.keys(doc.stations).length,
    lines: Object.keys(doc.lines).length,
    updatedAt,
  })
}

export async function deleteCloudCity(uid: string, id: string): Promise<void> {
  const { db } = await firebase()
  const { doc: ref, deleteDoc } = await import('firebase/firestore')
  await deleteDoc(ref(db, 'users', uid, 'cities', id))
  await deleteDoc(ref(db, 'users', uid, 'cityData', id))
}

export async function listCloudCities(uid: string): Promise<CloudCity[]> {
  const { db } = await firebase()
  const { collection, getDocs } = await import('firebase/firestore')
  const snap = await getDocs(collection(db, 'users', uid, 'cities'))
  return snap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? ''), updatedAt: Number(d.data().updatedAt ?? 0) }))
}

async function pullCity(uid: string, id: string): Promise<CityDoc> {
  const { db } = await firebase()
  const { doc: ref, getDoc } = await import('firebase/firestore')
  const snap = await getDoc(ref(db, 'users', uid, 'cityData', id))
  if (!snap.exists()) throw new Error('Stadt nicht gefunden')
  return decodeCity(snap.data().data.toUint8Array())
}

/** Personal settings (for now the accent colour) live in users/{uid}/settings/profile and follow the person to every device. */
export interface CloudSettings {
  accent?: string
}

export async function pullSettings(uid: string): Promise<CloudSettings> {
  const { db } = await firebase()
  const { doc: ref, getDoc } = await import('firebase/firestore')
  const snap = await getDoc(ref(db, 'users', uid, 'settings', 'profile'))
  return snap.exists() ? (snap.data() as CloudSettings) : {}
}

export async function pushSettings(uid: string, settings: CloudSettings): Promise<void> {
  const { db } = await firebase()
  const { doc: ref, setDoc } = await import('firebase/firestore')
  await setDoc(ref(db, 'users', uid, 'settings', 'profile'), settings, { merge: true })
}

export interface SyncResult {
  pulled: number
  pushed: number
}

/** Which cities have to travel in which direction (newest change wins). */
export function planSync(local: { id: string; updatedAt: number }[], cloud: CloudCity[]): { pull: string[]; push: string[] } {
  const localById = new Map(local.map((c) => [c.id, c]))
  const cloudById = new Map(cloud.map((c) => [c.id, c]))
  return {
    pull: cloud.filter((c) => !localById.has(c.id) || localById.get(c.id)!.updatedAt < c.updatedAt).map((c) => c.id),
    push: local.filter((l) => !cloudById.has(l.id) || cloudById.get(l.id)!.updatedAt < l.updatedAt).map((l) => l.id),
  }
}

/** Brings this device and the cloud to the same state (newest change wins). */
export async function syncAll(uid: string): Promise<SyncResult> {
  const [cloud, local] = await Promise.all([listCloudCities(uid), listCityDocs(uid)])
  const plan = planSync(local, cloud)
  const cloudById = new Map(cloud.map((c) => [c.id, c]))
  const localById = new Map(local.map((c) => [c.id, c]))
  for (const id of plan.pull) await putCityFromCloud(await pullCity(uid, id), cloudById.get(id)!.updatedAt, uid)
  for (const id of plan.push) {
    const l = localById.get(id)!
    await pushCity(uid, l.doc, l.updatedAt)
  }
  return { pulled: plan.pull.length, pushed: plan.push.length }
}

// --- uploads of single changes, a few seconds after the last change of a city ---

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; doc: CityDoc; at: number }>()
let activeUid: string | null = null
let onState: ((state: 'syncing' | 'idle' | 'error') => void) | null = null

async function upload(id: string) {
  const p = pending.get(id)
  if (!p || !activeUid) return
  pending.delete(id)
  onState?.('syncing')
  try {
    await pushCity(activeUid, p.doc, p.at)
    onState?.(pending.size ? 'syncing' : 'idle')
  } catch {
    // keep the change: the next full sync (app start, coming online) uploads it
    onState?.('error')
  }
}

/** Starts uploading every local save of this person (null: stop). */
export function startUploads(uid: string | null, stateCallback?: (s: 'syncing' | 'idle' | 'error') => void) {
  activeUid = uid
  onState = stateCallback ?? null
  for (const p of pending.values()) clearTimeout(p.timer)
  pending.clear()
  onCitySaved(
    uid
      ? (doc, at, owner) => {
          if (owner !== uid) return
          const old = pending.get(doc.id)
          if (old) clearTimeout(old.timer)
          pending.set(doc.id, { doc, at, timer: setTimeout(() => void upload(doc.id), 4000) })
          onState?.('syncing')
        }
      : null,
  )
}

/** Uploads everything that is still waiting (before leaving the app or signing out). */
export async function flushUploads(): Promise<void> {
  const ids = [...pending.keys()]
  for (const id of ids) {
    const p = pending.get(id)
    if (p) clearTimeout(p.timer)
    await upload(id)
  }
}

export { clearOwner }
