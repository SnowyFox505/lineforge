import { flushUploads } from '../cloud/sync'
import { useEffect, useState } from 'react'
import Splash from './Splash'

/** Deletes the offline copy of the app (service worker + caches). Saved cities live in IndexedDB and stay untouched. */
export async function clearAppCaches() {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
  }
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const STEPS = ['Suche nach Updates', 'Zwischenspeicher wird geleert', 'Neue Version wird geladen']

/** Full-screen update screen: clears the offline copy, sends what is still on its way to the cloud, then reloads the app. */
export default function UpdateOverlay() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await clearAppCaches()
      } catch {
        // clearing is best effort: the reload below still fetches the newest version
      }
      // a city that is still on its way to the cloud goes first (but never hold the update up for long)
      await Promise.race([flushUploads().catch(() => undefined), sleep(6000)])
      if (alive) setReady(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <Splash
      variant="update"
      eyebrow="Update"
      title="Aktualisiere LineForge"
      messages={STEPS}
      loop={false}
      hint="Deine Städte bleiben erhalten."
      doneTitle="Aktuell!"
      doneMessage="Die App startet neu"
      ready={ready}
      minMs={3200}
      onDone={() => location.reload()}
      z={60}
    />
  )
}
