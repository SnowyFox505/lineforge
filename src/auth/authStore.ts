import type { User } from 'firebase/auth'
import { create } from 'zustand'
import { deleteCloudCity, flushUploads, startUploads, syncAll } from '../cloud/sync'
import { adoptGuestCities, clearOwner, countGuestCities, deleteCity, GUEST, setOwner } from '../persistence/db'
import { accountsAvailable, firebase } from './firebase'

export interface Account {
  uid: string
  name: string
  email: string | null
  phone: string | null
  photo: string | null
}

type Status = 'off' | 'loading' | 'guest' | 'user'

interface AuthState {
  status: Status
  user: Account | null
  busy: boolean
  error: string | null
  sync: 'idle' | 'syncing' | 'error'
  /** counts up whenever the person (and so the list of cities) changes */
  ownerTick: number
  guestCities: number
  init: () => void
  clearError: () => void
  signInEmail: (email: string, password: string) => Promise<boolean>
  signUpEmail: (name: string, email: string, password: string) => Promise<boolean>
  resetPassword: (email: string) => Promise<boolean>
  signInGoogle: () => Promise<boolean>
  updateName: (name: string) => Promise<void>
  adoptLocalCities: () => Promise<number>
  syncNow: () => Promise<void>
  signOut: (force?: boolean) => Promise<'ok' | 'unsynced'>
  removeCity: (id: string) => Promise<void>
}

/** Firebase error codes in plain German */
export function friendlyError(e: unknown): string {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : ''
  const map: Record<string, string> = {
    'auth/invalid-email': 'Diese E-Mail-Adresse ist ungültig.',
    'auth/user-not-found': 'Mit dieser E-Mail gibt es noch kein Konto.',
    'auth/wrong-password': 'Das Passwort stimmt nicht.',
    'auth/invalid-credential': 'E-Mail oder Passwort stimmt nicht.',
    'auth/email-already-in-use': 'Zu dieser E-Mail gibt es schon ein Konto. Melde dich an.',
    'auth/weak-password': 'Das Passwort ist zu schwach (mindestens 6 Zeichen).',
    'auth/too-many-requests': 'Zu viele Versuche. Bitte warte kurz und versuche es später erneut.',
    'auth/network-request-failed': 'Keine Verbindung zum Internet.',
    'auth/popup-closed-by-user': 'Die Anmeldung wurde abgebrochen.',
    'auth/cancelled-popup-request': 'Die Anmeldung wurde abgebrochen.',
    'auth/operation-not-allowed': 'Diese Anmeldeart ist noch nicht freigeschaltet.',
    'auth/unauthorized-domain': 'Diese Adresse ist für die Anmeldung noch nicht freigegeben.',
    'auth/requires-recent-login': 'Bitte melde dich neu an und versuche es noch einmal.',
  }
  if (map[code]) return map[code]
  return e instanceof Error && !code ? e.message : 'Das hat leider nicht geklappt. Versuche es noch einmal.'
}

const toAccount = (u: User): Account => ({
  uid: u.uid,
  name: u.displayName || u.email?.split('@')[0] || u.phoneNumber || 'Spieler',
  email: u.email,
  phone: u.phoneNumber,
  photo: u.photoURL,
})

let started = false

export const useAuth = create<AuthState>((set, get) => {
  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    set({ busy: true, error: null })
    try {
      await fn()
      return true
    } catch (e) {
      set({ error: friendlyError(e) })
      return false
    } finally {
      set({ busy: false })
    }
  }

  const doSync = async (uid: string) => {
    set({ sync: 'syncing' })
    try {
      await syncAll(uid)
      set({ sync: 'idle', ownerTick: get().ownerTick + 1 })
    } catch {
      set({ sync: 'error' })
    }
  }

  const enter = async (u: User | null) => {
    if (u) {
      setOwner(u.uid)
      startUploads(u.uid, (sync) => set({ sync }))
      set({ status: 'user', user: toAccount(u), ownerTick: get().ownerTick + 1, guestCities: await countGuestCities() })
      void doSync(u.uid)
    } else {
      setOwner(GUEST)
      startUploads(null)
      set({ status: 'guest', user: null, sync: 'idle', ownerTick: get().ownerTick + 1, guestCities: 0 })
    }
  }

  return {
    status: accountsAvailable ? 'loading' : 'off',
    user: null,
    busy: false,
    error: null,
    sync: 'idle',
    ownerTick: 0,
    guestCities: 0,

    init: () => {
      if (!accountsAvailable || started) return
      started = true
      void (async () => {
        const { auth } = await firebase()
        const { onAuthStateChanged } = await import('firebase/auth')
        onAuthStateChanged(auth, (u) => void enter(u))
        window.addEventListener('online', () => {
          const uid = get().user?.uid
          if (uid) void doSync(uid)
        })
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') void flushUploads()
        })
      })().catch(() => set({ status: 'guest' }))
    },

    clearError: () => set({ error: null }),

    signInEmail: (email, password) =>
      run(async () => {
        const { auth } = await firebase()
        const { signInWithEmailAndPassword } = await import('firebase/auth')
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }),

    signUpEmail: (name, email, password) =>
      run(async () => {
        const { auth } = await firebase()
        const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth')
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
        if (name.trim()) {
          await updateProfile(cred.user, { displayName: name.trim() })
          set({ user: toAccount(cred.user) })
        }
      }),

    resetPassword: (email) =>
      run(async () => {
        const { auth } = await firebase()
        const { sendPasswordResetEmail } = await import('firebase/auth')
        await sendPasswordResetEmail(auth, email.trim())
      }),

    signInGoogle: () =>
      run(async () => {
        const { auth } = await firebase()
        const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import('firebase/auth')
        const provider = new GoogleAuthProvider()
        try {
          await signInWithPopup(auth, provider)
        } catch (e) {
          const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : ''
          // pop-ups are blocked in some in-app and home-screen modes: then the page itself goes to Google and comes back
          if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, provider)
          else throw e
        }
      }),

    updateName: async (name) => {
      const { auth } = await firebase()
      const { updateProfile } = await import('firebase/auth')
      if (!auth.currentUser) return
      await updateProfile(auth.currentUser, { displayName: name.trim() })
      set({ user: toAccount(auth.currentUser) })
    },

    adoptLocalCities: async () => {
      const uid = get().user?.uid
      if (!uid) return 0
      const moved = await adoptGuestCities(uid)
      set({ guestCities: 0, ownerTick: get().ownerTick + 1 })
      await doSync(uid)
      return moved.length
    },

    syncNow: async () => {
      const uid = get().user?.uid
      if (uid) await doSync(uid)
    },

    signOut: async (force = false) => {
      const uid = get().user?.uid
      if (uid) {
        try {
          await flushUploads()
          await syncAll(uid)
        } catch {
          // offline or error: signing out now could lose changes that are not in the cloud yet
          if (!force) return 'unsynced'
        }
        await clearOwner(uid)
      }
      const { auth } = await firebase()
      const { signOut } = await import('firebase/auth')
      await signOut(auth)
      set({ error: null })
      return 'ok'
    },

    removeCity: async (id) => {
      await deleteCity(id)
      const uid = get().user?.uid
      if (uid) {
        try {
          await deleteCloudCity(uid, id)
        } catch {
          set({ sync: 'error' })
        }
      }
    },
  }
})

// dev only: lets scripted browser tests simulate a sign-in without creating real accounts
if (import.meta.env.DEV) (window as unknown as { __auth: unknown }).__auth = useAuth
