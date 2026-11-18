import { motion } from 'motion/react'
import { useState } from 'react'
import { useEditor } from '../store/editorStore'

/**
 * After the map was enlarged: the lines that left the map at its old edge (connections to the outside world) are offered to go on
 * to the new edge, one question per connection.
 */
export default function OutsideAsk() {
  const doc = useEditor((s) => s.doc)
  const ask = useEditor((s) => s.outsideAsk)
  const extend = useEditor((s) => s.extendOutsideAt)
  const skip = useEditor((s) => s.skipOutsideAt)
  const [problem, setProblem] = useState<string | null>(null)
  const open = ask.filter((e) => doc.stations[e.id])
  if (!open.length) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-[calc(12px+var(--safe-bottom))]"
    >
      <div className="card pointer-events-auto mx-auto max-w-lg space-y-3 rounded-[26px] p-4">
        <div>
          <div className="text-base font-bold">Verbindung nach außerhalb</div>
          <p className="mt-1 text-sm leading-snug text-white/70">Die Karte ist größer geworden. Soll die Linie bis zum neuen Kartenrand weitergeführt werden?</p>
        </div>
        <div className="space-y-2">
          {open.map((e) => {
            const st = doc.stations[e.id]
            return (
              <div key={e.id} className="rounded-2xl bg-white/6 p-2.5">
                <div className="mb-2 truncate text-sm font-semibold">
                  {st.name} <span className="text-white/55">→ {st.outside}</span>
                </div>
                <div className="flex gap-2">
                  <button className="btn-soft flex-1 rounded-xl py-2.5 text-sm font-bold" onClick={() => skip(e.id)}>
                    So lassen
                  </button>
                  <button
                    className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-bold active:scale-95"
                    onClick={() => setProblem(extend(e.id) ? null : 'Am neuen Kartenrand ist dort kein Platz (Wasser?). Ziehe die Linie von Hand weiter und lass es hier so.')}
                  >
                    Weiterführen
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        {problem && <p className="text-xs leading-snug text-amber-300">{problem}</p>}
      </div>
    </motion.div>
  )
}
