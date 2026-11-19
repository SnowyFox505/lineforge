import { useEffect, useState } from 'react'
import { APP_BUILD } from '../version'

const SEEN_KEY = 'lineforge.seenVersion'

/** The version whose patch notes the person has seen last; null when there is none (or the storage is blocked). */
export function lastSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

export function markVersionSeen(version: string) {
  try {
    localStorage.setItem(SEEN_KEY, version)
  } catch {
    // storage blocked: the notes simply show again next time
  }
}

/** Asks the server for the id of the newest build. Null when it cannot be told (offline, dev server, no file). */
export async function fetchLatestBuild(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data: unknown = await res.json()
    if (data && typeof data === 'object' && 'build' in data && typeof data.build === 'string') return data.build
  } catch {
    // offline or not json (the dev server answers with the page): no news
  }
  return null
}

/** Asks the server for the version number of the newest build ("0.34.1"). Null when it cannot be told. */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data: unknown = await res.json()
    if (data && typeof data === 'object' && 'version' in data && typeof data.version === 'string') return data.version
  } catch {
    // offline or not json: no news
  }
  return null
}

/** True when the server has a newer build than the one that is running. Checked at start, when the app comes back to the front and every few minutes. */
export function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (APP_BUILD === 'dev') return
    let alive = true
    const check = async () => {
      const latest = await fetchLatestBuild()
      if (alive && latest && latest !== APP_BUILD) setAvailable(true)
    }
    void check()
    const timer = setInterval(() => void check(), 5 * 60 * 1000)
    const onShow = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', onShow)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [])
  return available
}
