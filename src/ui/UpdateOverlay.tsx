import { flushUploads } from '../cloud/sync'
import { useEffect, useState } from 'react'
import { APP_VERSION } from '../version'
import DepartureScreen from './DepartureScreen'
import { fetchLatestVersion } from './updates'

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

/** Full-screen update screen (a departure board): clears the offline copy, sends what is still on its way to the cloud, then reloads the app. */
export default function UpdateOverlay() {
  const [stage, setStage] = useState(0)
  const [newVersion, setNewVersion] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const go = (n: number) => alive && setStage((s) => Math.max(s, n))
    ;(async () => {
      // the screen needs the number of the new version from the start (but does not wait long for it)
      const latest = await Promise.race([fetchLatestVersion(), sleep(800).then(() => null)])
      if (alive) setNewVersion(latest ?? APP_VERSION)
      go(1)
      try {
        await clearAppCaches()
      } catch {
        // clearing is best effort: the reload below still fetches the newest version
      }
      go(2)
      // a city that is still on its way to the cloud goes first (but never hold the update up for long)
      await Promise.race([flushUploads().catch(() => undefined), sleep(6000)])
      go(3)
    })()
    return () => {
      alive = false
    }
  }, [])

  if (newVersion === null) return <div className="fixed inset-0 z-[60]" style={{ background: '#06080c' }} role="status" />
  return <DepartureScreen oldVersion={APP_VERSION} newVersion={newVersion} stage={stage} onDone={() => location.reload()} />
}
