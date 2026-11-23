/**
 * Firebase is loaded only when needed, so people without an account never download it.
 * The web config is public by design (security comes from the Firestore rules); it is read from VITE_FIREBASE_* variables.
 */
const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
}

/** false until the Firebase project has been set up: the app then works exactly as before, without accounts */
export const accountsAvailable = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)

let boot: Promise<{ auth: import('firebase/auth').Auth; db: import('firebase/firestore').Firestore }> | null = null

export function firebase() {
  if (!accountsAvailable) return Promise.reject(new Error('Konten sind noch nicht eingerichtet'))
  boot ??= (async () => {
    const [{ initializeApp }, authMod, { getFirestore }] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])
    const app = initializeApp(firebaseConfig)
    // The sign-in lives in IndexedDB first, localStorage second (never session storage, it dies with the tab); the browser is asked
    // not to clear the site's storage, because iOS and some browsers drop it under pressure and the person is then signed out.
    try {
      void navigator.storage?.persist?.()
    } catch {
      // not supported: fine
    }
    const auth = authMod.initializeAuth(app, {
      persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence],
      popupRedirectResolver: authMod.browserPopupRedirectResolver,
    })
    auth.languageCode = 'de'
    return { auth, db: getFirestore(app) }
  })()
  return boot
}
