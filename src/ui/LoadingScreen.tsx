import Splash from './Splash'

/** The real steps of opening a city, in the order they happen. `done` of them are finished. */
const LOAD_STEPS = ['Stadt wird geöffnet', 'Editor wird aufgebaut', 'Schriften werden geladen', 'Karte wird gezeichnet']
/** how far the ring is when `done` steps are finished (the later steps take longer) */
const LOAD_PROGRESS = [0, 0.15, 0.45, 0.7, 1]

/** Loading screen of a city: shows the real steps, stays at least `minMs` and until `done` is all of them, then opens onto the game. */
export default function LoadingScreen({ title, done, minMs = 3000, onDone }: { title: string; done: number; minMs?: number; onDone: () => void }) {
  const n = Math.min(done, LOAD_STEPS.length)
  return (
    <Splash
      variant="city"
      eyebrow="Stadt wird geladen"
      title={title}
      messages={LOAD_STEPS}
      progress={LOAD_PROGRESS[n]}
      liveMessage={n >= LOAD_STEPS.length ? 'Gleich geht es los' : LOAD_STEPS[n]}
      ready={n >= LOAD_STEPS.length}
      minMs={minMs}
      onDone={onDone}
      z={70}
    />
  )
}
