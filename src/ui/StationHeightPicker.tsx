import { HEIGHT_LABEL, stationHeight } from '../model/profiles'
import type { StationHeight } from '../model/profiles'
import type { CityDoc } from '../model/types'
import { useEditor } from '../store/editorStore'

const ORDER: StationHeight[] = ['ground', 'elevated', 'lowered', 'underground']

/** Where the platforms of a station lie: on the ground, on a viaduct, in a cutting or in a tunnel. */
export default function StationHeightPicker({ doc, id, disabled, className = '' }: { doc: CityDoc; id: string; disabled?: boolean; className?: string }) {
  const update = useEditor((s) => s.updateStation)
  const st = doc.stations[id]
  if (!st) return null
  const now = stationHeight(doc, st)
  const choose = (h: StationHeight) =>
    update(id, { underground: h === 'underground', height: h === 'elevated' || h === 'lowered' ? h : undefined })
  return (
    <div className={`-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 ${className}`} role="group" aria-label="Lage des Bahnhofs">
      {ORDER.map((h) => (
        <button
          key={h}
          disabled={disabled}
          onClick={() => h !== now && choose(h)}
          aria-pressed={h === now}
          className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition-all active:scale-95 disabled:opacity-40 ${
            h === now ? 'border-accent/70 bg-accent/15 text-white' : 'border-white/8 bg-white/5 text-white/80'
          }`}
        >
          {HEIGHT_LABEL[h].label}
        </button>
      ))}
    </div>
  )
}
