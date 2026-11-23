import { useEffect, useState } from 'react'
import OfflineSplash from './OfflineSplash'
import Splash from './Splash'
import { OFFLINE_CHECK_MS, OFFLINE_LATE_MS, OFFLINE_MIN_MS, OFFLINE_SWAP_MS } from './splashScene'
import type { OfflineStage } from './splashScene'

/** The real steps of opening a city, in the order they happen. `done` of them are finished. */
const LOAD_STEPS = ['Stadt wird geöffnet', 'Editor wird aufgebaut', 'Schriften werden geladen', 'Karte wird gezeichnet']
/** how far the ring is when `done` steps are finished (the later steps take longer) */
const LOAD_PROGRESS = [0, 0.15, 0.45, 0.7, 1]

/**
 * Which splash is on screen. It starts as the city splash. Without a connection (at the start, or when it drops in the first
 * moments) the city splash breaks off (`abort`) and the offline splash fades in over it; a moment later the city splash is removed.
 */
function useOfflineStage(): OfflineStage {
  const [stage, setStage] = useState<OfflineStage>('city')
  useEffect(() => {
    const t0 = performance.now()
    let timer: number | undefined
    const trip = (delay: number) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setStage((s) => (s === 'city' ? 'abort' : s)), delay)
    }
    // offline from the start: let the city splash run a moment, as if the connection was being tried
    if (navigator.onLine === false) trip(OFFLINE_CHECK_MS)
    const onOffline = () => {
      if (performance.now() - t0 < OFFLINE_LATE_MS) trip(200)
    }
    window.addEventListener('offline', onOffline)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('offline', onOffline)
    }
  }, [])
  useEffect(() => {
    if (stage !== 'abort') return
    const id = window.setTimeout(() => setStage('offline'), OFFLINE_SWAP_MS)
    return () => window.clearTimeout(id)
  }, [stage])
  return stage
}

/** Loading screen of a city: shows the real steps, stays at least `minMs` and until `done` is all of them, then opens onto the game. */
export default function LoadingScreen({ title, done, minMs = 3000, onDone }: { title: string; done: number; minMs?: number; onDone: () => void }) {
  const n = Math.min(done, LOAD_STEPS.length)
  const stage = useOfflineStage()
  return (
    <>
      {stage !== 'offline' && (
        <Splash
          eyebrow="Stadt wird geladen"
          title={title}
          messages={LOAD_STEPS}
          progress={LOAD_PROGRESS[n]}
          liveMessage={n >= LOAD_STEPS.length ? 'Gleich geht es los' : LOAD_STEPS[n]}
          ready={n >= LOAD_STEPS.length}
          minMs={minMs}
          onDone={onDone}
          z={70}
          abort={stage === 'abort'}
        />
      )}
      {stage !== 'city' && <OfflineSplash title={title} progress={LOAD_PROGRESS[n]} ready={n >= LOAD_STEPS.length} minMs={OFFLINE_MIN_MS} onDone={onDone} z={71} />}
    </>
  )
}
