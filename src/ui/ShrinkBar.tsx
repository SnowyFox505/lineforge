import { motion } from 'motion/react'
import { useMemo } from 'react'
import { shrinkImpact } from '../model/shrink'
import { useEditor } from '../store/editorStore'

/** While the map is being cut down: what would be lost (it is shown red and breathing on the map), and the choice to go on or not. */
export default function ShrinkBar() {
  const doc = useEditor((s) => s.doc)
  const to = useEditor((s) => s.shrinkTo)
  const cancel = useEditor((s) => s.cancelShrink)
  const confirm = useEditor((s) => s.confirmShrink)
  const impact = useMemo(() => (to ? shrinkImpact(doc, to) : null), [doc, to])
  if (!to || !impact) return null
  const parts = [
    impact.stations.length && `${impact.stations.length} Station${impact.stations.length > 1 ? 'en' : ''}`,
    impact.pois.length && `${impact.pois.length} Sehenswürdigkeit${impact.pois.length > 1 ? 'en' : ''}`,
    impact.painted && `${impact.painted.toLocaleString('de-DE')} bemalte Felder`,
    impact.water && `${impact.water.toLocaleString('de-DE')} Wasserfelder`,
  ].filter(Boolean) as string[]
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-[calc(12px+var(--safe-bottom))]"
    >
      <div className="card pointer-events-auto mx-auto max-w-lg space-y-3 rounded-[26px] border !border-red-400/60 p-4">
        <div>
          <div className="text-base font-bold">
            Karte auf {to}×{to} verkleinern
          </div>
          <p className="mt-1 text-sm leading-snug text-white/70">
            Alles außerhalb des <span className="font-bold text-red-300">roten Rahmens</span> wird <span className="font-bold text-red-300">gelöscht</span>
            {parts.length ? `: ${parts.join(', ')}` : ' (dort ist nichts gebaut oder bemalt)'}.
            {impact.lines.length ? ` Betroffene Linien: ${impact.lines.join(', ')}.` : ''}
          </p>
          <p className="mt-1 text-xs text-white/45">Mit „Rückgängig“ holst du die alte Karte zurück. Drehe und zoome die Karte, um den Rahmen anzuschauen.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-soft flex-1 rounded-2xl py-3 text-sm font-bold" onClick={cancel}>
            Abbrechen
          </button>
          <button className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-bold text-[#fff] active:scale-95" onClick={confirm}>
            Verkleinern
          </button>
        </div>
      </div>
    </motion.div>
  )
}
