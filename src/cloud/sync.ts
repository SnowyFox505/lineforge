import { uploadDelay } from './schedule'
import { firebase } from '../auth/firebase'
import { clearOwner, deleteLocalCity, listCityDocs, onCitySaved, putCityFromCloud } from '../persistence/db'
import type { CityDoc } from '../model/types'
import { decodeCity, encodeCity } from './codec'

/**
 * Cloud copy of a person's cities in Firestore:
 *   users/{uid}/cities/{id}    small description (name, size, time of the last change), listed quickly
 *   users/{uid}/cityData/{id}  the city itself (compressed bytes)
 * The newest change wins. A deleted city stays in the list as a small marker (`deleted`, time of the deletion) without its
 * data, so every other device removes its copy at the next sync. A copy that was changed after the deletion (on a device that
 * was offline) is not removed but uploaded again, so no work is lost by accident.
 */
export interface CloudCity {
  id: string
  name: string
  updatedAt: number
  /** the city was deleted at `updatedAt`; only this marker is left */
  deleted?: boolean
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

const PENDING_KEY = 'lineforge-pending-deletes'

function readPending(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '{}') as Record<string, string[]>
  } catch {
    return {}
  }
}

function writePending(all: Record<string, string[]>) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(all))
  } catch {
    // no storage: the deletion is only tried once
  }
}

async function writeTombstone(uid: string, id: string, name: string, at: number): Promise<void> {
  const { db } = await firebase()
  const { doc: ref, setDoc, deleteDoc } = await import('firebase/firestore')
  // the marker replaces the description (a listed city is never without its data), then the data goes
  await setDoc(ref(db, 'users', uid, 'cities', id), { name, deleted: true, updatedAt: at })
  await deleteDoc(ref(db, 'users', uid, 'cityData', id))
}

/**
 * Deletes a city in the cloud, so it disappears on every device of the person. When that fails (offline), the deletion is
 * remembered and tried again at the next sync: the city must not come back from the cloud in the meantime.
 */
export async function deleteCloudCity(uid: string, id: string, name = ''): Promise<void> {
  try {
    await writeTombstone(uid, id, name, Date.now())
  } catch (e) {
    const all = readPending()
    if (!(all[uid] ?? []).includes(id)) all[uid] = [...(all[uid] ?? []), id]
    writePending(all)
    throw e
  }
}

async function retryPendingDeletes(uid: string): Promise<void> {
  const all = readPending()
  const ids = all[uid] ?? []
  if (!ids.length) return
  const left: string[] = []
  for (const id of ids) {
    try {
      await writeTombstone(uid, id, '', Date.now())
    } catch {
      left.push(id)
    }
  }
  if (left.length) all[uid] = left
  else delete all[uid]
  writePending(all)
}

export async function listCloudCities(uid: string): Promise<CloudCity[]> {
  const { db } = await firebase()
  const { collection, getDocs } = await import('firebase/firestore')
  const snap = await getDocs(collection(db, 'users', uid, 'cities'))
  return snap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? ''), updatedAt: Number(d.data().updatedAt ?? 0), deleted: d.data().deleted === true }))
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
  /** second colour of a gradient; missing or empty = single colour */
  accent2?: string
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
  removed: number
}

/**
 * Which cities have to travel in which direction (newest change wins). `remove` lists the local cities that were deleted
 * in the cloud (on another device) and not changed here since.
 */
export function planSync(local: { id: string; updatedAt: number }[], cloud: CloudCity[]): { pull: string[]; push: string[]; remove: string[] } {
  const localById = new Map(local.map((c) => [c.id, c]))
  const cloudById = new Map(cloud.map((c) => [c.id, c]))
  return {
    pull: cloud.filter((c) => !c.deleted && (!localById.has(c.id) || localById.get(c.id)!.updatedAt < c.updatedAt)).map((c) => c.id),
    push: local.filter((l) => !cloudById.has(l.id) || cloudById.get(l.id)!.updatedAt < l.updatedAt).map((l) => l.id),
    remove: local
      .filter((l) => {
        const c = cloudById.get(l.id)
        return !!c && c.deleted === true && l.updatedAt <= c.updatedAt
      })
      .map((l) => l.id),
  }
}

/** Brings this device and the cloud to the same state (newest change wins). */
export async function syncAll(uid: string): Promise<SyncResult> {
  await retryPendingDeletes(uid)
  const [cloud, local] = await Promise.all([listCloudCities(uid), listCityDocs(uid)])
  const plan = planSync(local, cloud)
  const cloudById = new Map(cloud.map((c) => [c.id, c]))
  const localById = new Map(local.map((c) => [c.id, c]))
  for (const id of plan.pull) await putCityFromCloud(await pullCity(uid, id), cloudById.get(id)!.updatedAt, uid)
  for (const id of plan.push) {
    const l = localById.get(id)!
    await pushCity(uid, l.doc, l.updatedAt)
  }
  for (const id of plan.remove) await deleteLocalCity(id, uid)
  return { pulled: plan.pull.length, pushed: plan.push.length, removed: plan.remove.length }
}

// --- uploads of single changes, a few seconds after the last change of a city ---

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; doc: CityDoc; at: number; first: number }>()
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
          const first = old?.first ?? Date.now()
          pending.set(doc.id, { doc, at, first, timer: setTimeout(() => void upload(doc.id), uploadDelay(first, Date.now())) })
          onState?.('syncing')
        }
      : null,
  )
}

/** Drops an upload that is still waiting (the city was deleted: it must not come back in the cloud). */
export function cancelUpload(id: string) {
  const p = pending.get(id)
  if (p) clearTimeout(p.timer)
  pending.delete(id)
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
