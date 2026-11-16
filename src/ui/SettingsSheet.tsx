import { useState } from 'react'
import { MAP_SIZES } from '../model/constants'
import { motion } from 'motion/react'
import { BetaNote, useNotYet } from './NotYet'
import type { GameMode } from '../model/types'
import { exportCityJson } from '../persistence/db'
import { useEditor } from '../store/editorStore'
import AppearanceSheet from './AppearanceSheet'
import Icon from './Icon'
import NameQueuesEditor from './NameQueues'
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
  const notYet = useNotYet()
  const resizeMap = useEditor((s) => s.resizeMap)
  const setNameQueues = useEditor((s) => s.setNameQueues)
  const bigger = MAP_SIZES.filter((m) => m.size > doc.size)
  const smaller = MAP_SIZES.filter((m) => m.size < doc.size)
  const startShrink = useEditor((s) => s.startShrink)
  const [look, setLook] = useState(false)

  return (
    <>
    <Sheet open={open} onClose={onClose} title="Stadt-Einstellungen">
      <div className="space-y-5">
        <button className="btn-soft flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm" onClick={() => setLook(true)}>
          <Icon name="palette" size={20} />
          <span className="flex-1">
            <span className="block font-semibold">Darstellung und Stift</span>
            <span className="block text-xs text-white/55">Hell oder dunkel, Farben mit Verlauf, Apple Pencil</span>
          </span>
        </button>

        <div>
          <div className="eyebrow mb-2">Name</div>
          <CommitInput value={doc.name} onCommit={renameCity} className="w-full" />
        </div>

        <div>
          <div className="eyebrow mb-2">Spielmodus</div>
          <motion.div animate={notYet.controls}>
          <Segmented
            value={doc.mode}
            onChange={(m) => (m === 'normal' ? notYet.poke() : setMode(m))}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'creative', label: 'Kreativ' },
            ]}
          />
          </motion.div>
          <div className="mt-2 flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm text-white/55">{MODE_INFO[doc.mode].text}</p>
            <BetaNote show={notYet.shown} className="shrink-0" />
          </div>
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
          {smaller.length > 0 && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                {smaller.map((m) => (
                  <button key={m.size} className="flex-1 rounded-2xl border border-red-400/40 bg-red-500/10 py-3 text-sm font-semibold text-red-300 active:scale-95" onClick={() => { onClose(); startShrink(m.size) }}>
                    Auf {m.size}×{m.size} verkleinern
                  </button>
                ))}
              </div>
              <p className="text-xs text-red-300/80">Achtung: Beim Verkleinern wird alles außerhalb der neuen Größe gelöscht. Du siehst es vorher in 3D und kannst abbrechen.</p>
            </div>
          )}
          <p className="mt-2 text-xs text-white/40">Beim Erweitern und Verkleinern bleibt die Mitte erhalten. Rückgängig ist möglich.</p>
        </div>

        <div>
          <div className="eyebrow mb-2">Namen für Neues</div>
          <NameQueuesEditor value={doc.nameQueues} onChange={setNameQueues} />
        </div>

        <button
          className="btn-soft flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm"
          onClick={() => downloadBlob(new Blob([exportCityJson(doc)], { type: 'application/json' }), `${doc.name}.lineforge.json`)}
        >
          <Icon name="download" size={18} /> Stadt exportieren (JSON)
        </button>
      </div>
    </Sheet>
    <AppearanceSheet open={look} onClose={() => setLook(false)} />
    </>
  )
}
