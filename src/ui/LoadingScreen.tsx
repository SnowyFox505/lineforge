import Splash from './Splash'

const STEPS = ['Straßen werden verlegt', 'Gleise werden gelegt', 'Stationen öffnen', 'Fahrpläne werden gedruckt', 'Züge werden poliert']

/** Loading screen of a city: stays at least `minMs` and until `ready`, then opens onto the game. */
export default function LoadingScreen({ title, ready, minMs = 3000, onDone }: { title: string; ready: boolean; minMs?: number; onDone: () => void }) {
  return <Splash variant="city" eyebrow="Stadt wird geladen" title={title} messages={STEPS} ready={ready} minMs={minMs} onDone={onDone} z={70} />
}
