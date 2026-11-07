import { MAP_SIZES } from '../model/constants'
import type { GameMode } from '../model/types'
import { exportCityJson } from '../persistence/db'
import { useEditor } from '../store/editorStore'
import Icon from './Icon'
import { CommitInput, Segmented, Sheet } from './primitives'

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const MODE_INFO: Record<GameMode, { label: string; text: string }> = {
  normal: { label: 'Normal', text: 'Unfälle, Bauarbeiten und wachsender Bedarf fordern dein Netz (folgt).' },
  creative: { label: 'Kreativ', text: 'Frei bauen, ohne Störungen und ohne Sorgen um deine Bürger.' },
}

export default function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useEditor((s) => s.doc)
  const renameCity = useEditor((s) => s.renameCity)
  const setMode = useEditor((s) => s.setMode)
  const resizeMap = useEditor((s) => s.resizeMap)
  const bigger = MAP_SIZES.filter((m) => m.size > doc.size)

  return (
    <Sheet open={open} onClose={onClose} title="Stadt-Einstellungen">
      <div className="space-y-5">
        <div>
          <div className="eyebrow mb-2">Name</div>
          <CommitInput value={doc.name} onCommit={renameCity} className="w-full" />
        </div>

        <div>
          <div className="eyebrow mb-2">Spielmodus</div>
          <Segmented
            value={doc.mode}
            onChange={setMode}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'creative', label: 'Kreativ' },
            ]}
          />
          <p className="mt-2 text-sm text-white/55">{MODE_INFO[doc.mode].text}</p>
        </div>

        <div>
          <div className="eyebrow mb-2">
            Kartengröße · {doc.size}×{doc.size}
          </div>
          {bigger.length ? (
            <div className="flex gap-2">
              {bigger.map((m) => (
                <button key={m.size} className="btn-soft flex-1 rounded-2xl py-3 text-sm" onClick={() => resizeMap(m.size)}>
                  Auf {m.size}×{m.size} erweitern
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/55">Größer geht es nicht.</p>
          )}
          <p className="mt-2 text-xs text-white/40">Beim Erweitern bleibt alles in der Mitte erhalten. Rückgängig ist möglich.</p>
        </div>

        <button
          className="btn-soft flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm"
          onClick={() => downloadBlob(new Blob([exportCityJson(doc)], { type: 'application/json' }), `${doc.name}.lineforge.json`)}
        >
          <Icon name="download" size={18} /> Stadt exportieren (JSON)
        </button>
      </div>
    </Sheet>
  )
}
