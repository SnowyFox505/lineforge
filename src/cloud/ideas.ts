import { firebase } from '../auth/firebase'

/**
 * Notes about ideas and bugs, collected in one list for everybody who plays (Firestore `ideas/{id}`).
 * A note is kept on the device until it was sent, so writing one works offline and without being signed in.
 */
export interface Idea {
  id: string
  text: string
  kind: 'idea' | 'bug'
  /** display name of the writer */
  by: string
  uid: string
  at: number
  /** version of the app it was written in */
  version: string
  done?: boolean
}

const KEY = 'lineforge-pending-ideas'
export const MAX_IDEA = 500

export function pendingIdeas(): Idea[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Idea[]
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function writePending(list: Idea[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // no storage: the note is only sent now
  }
}

/** Keep a note and try to send it. The uid and name are filled in when it is sent (a guest has none yet). */
export function writeIdea(text: string, kind: Idea['kind'], version: string): Idea | null {
  const t = text.trim().slice(0, MAX_IDEA)
  if (!t) return null
  const idea: Idea = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, text: t, kind, by: '', uid: '', at: Date.now(), version }
  writePending([...pendingIdeas(), idea])
  return idea
}

/** What went wrong the last time (a Firestore error code such as permission-denied), for the idea window. */
export let lastIdeaError = ''
/** the same for sending a note (kept apart: sending can work while reading is not allowed) */
export let lastSendError = ''

function errorText(e: unknown): string {
  const x = e as { code?: string; message?: string }
  return x?.code || x?.message || 'unbekannt'
}

/** Send what waits on the device. Returns how many went out (0 when nobody is signed in or there is no connection). */
export async function flushIdeas(): Promise<number> {
  const waiting = pendingIdeas()
  if (!waiting.length) return 0
  try {
    const { auth, db } = await firebase()
    const user = auth.currentUser
    if (!user) return 0
    const { doc, setDoc } = await import('firebase/firestore')
    let sent = 0
    for (const idea of waiting) {
      const out = { ...idea, uid: user.uid, by: user.displayName || user.email || 'Unbekannt' }
      await setDoc(doc(db, 'ideas', idea.id), out)
      writePending(pendingIdeas().filter((p) => p.id !== idea.id))
      sent++
    }
    lastSendError = ''
    return sent
  } catch (e) {
    lastSendError = errorText(e)
    return 0
  }
}

/** All notes, newest first. Throws when the list may not be read (the account is not on the list of the rules). */
export async function listIdeas(): Promise<Idea[]> {
  try {
    const { db } = await firebase()
    const { collection, getDocs } = await import('firebase/firestore')
    const snap = await getDocs(collection(db, 'ideas'))
    return snap.docs.map((d) => d.data() as Idea).sort((a, b) => b.at - a.at)
  } catch (e) {
    lastIdeaError = errorText(e)
    throw e
  }
}

export async function setIdeaDone(id: string, done: boolean): Promise<void> {
  const { db } = await firebase()
  const { doc, updateDoc } = await import('firebase/firestore')
  await updateDoc(doc(db, 'ideas', id), { done })
}

export async function deleteIdea(id: string): Promise<void> {
  const { db } = await firebase()
  const { doc, deleteDoc } = await import('firebase/firestore')
  await deleteDoc(doc(db, 'ideas', id))
}

/** The open notes as plain text, to paste somewhere. */
export function ideasAsText(list: Idea[]): string {
  return list
    .filter((i) => !i.done)
    .map((i) => `- [${i.kind === 'bug' ? 'Fehler' : 'Idee'}] ${i.text} (${i.by}, ${new Date(i.at).toLocaleDateString('de-DE')}, v${i.version})`)
    .join('\n')
}
