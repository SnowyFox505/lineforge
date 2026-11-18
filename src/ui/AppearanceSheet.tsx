import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useAuth } from '../auth/authStore'
import Icon from './Icon'
import { Segmented, Sheet } from './primitives'
import { usePen } from './pen'
import { useTrainLook } from './trainLook'
import { accentFromHue, GRADIENTS, hueOf, isKnownGradient, PRESETS, useTheme } from './theme'
import type { Mode } from './theme'
import type { PenMode } from './pen'

const SOFT = { type: 'spring', stiffness: 380, damping: 34 } as const

const same = (a: string | null, b: string | null) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

const RAINBOW = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 359].map((h) => accentFromHue(h)).join(', ')})`
const RAINBOW_SWATCH = 'conic-gradient(from 0deg, #ff5470, #ffc233, #a6e03c, #17c3b2, #5b7cff, #e055c4, #ff5470)'

/** A round colour button with a check mark when it is the chosen one */
function Swatch({ label, background, on, onClick, check = '#0d1300' }: { label: string; background: string; on: boolean; onClick: () => void; check?: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full"
      style={{ background, boxShadow: on ? '0 0 0 2px var(--ring-gap), 0 0 0 4px var(--accent-text, var(--accent))' : 'inset 0 0 0 1px rgba(128,128,128,0.35)' }}
    >
      <AnimatePresence>
        {on && (
          <motion.span key="c" style={{ color: check }} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}>
            <Icon name="check" size={20} stroke={3} className="drop-shadow" />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

type Editor = null | 'color' | 'gradient'

/** One colour or a blend of two: ready-made choices (all readable), your own, and the gradients you saved. */
export function AccentPicker() {
  const accent = useTheme((s) => s.accent)
  const accent2 = useTheme((s) => s.accent2)
  const setAccent = useTheme((s) => s.setAccent)
  const saved = useTheme((s) => s.saved)
  const saveGradient = useTheme((s) => s.saveGradient)
  const removeGradient = useTheme((s) => s.removeGradient)
  const save = useAuth((s) => s.saveAccent)
  const isPreset = PRESETS.some((p) => same(p.hex, accent)) && !accent2
  const known = !!accent2 && isKnownGradient(accent, accent2, saved)
  const [editor, setEditor] = useState<Editor>(!isPreset && !known ? (accent2 ? 'gradient' : 'color') : null)
  const hue = hueOf(accent)
  const hue2 = hueOf(accent2 ?? accent)
  const pick = (hex: string, hex2: string | null = null) => {
    setAccent(hex, hex2)
    save(hex, hex2)
  }
  const isSaved = !!accent2 && saved.some(([x, y]) => same(x, accent) && same(y, accent2))
  const gradients = [...GRADIENTS.map((g) => ({ key: g.id, label: g.label, a: g.a, b: g.b })), ...saved.map(([a, b]) => ({ key: a + b, label: 'Eigener Verlauf', a, b }))]
  return (
    <div className="space-y-4">
      <div>
        <span className="eyebrow mb-2 block">Akzentfarbe</span>
        <div className="flex flex-wrap items-center gap-3">
          {PRESETS.map((p) => (
            <Swatch
              key={p.id}
              label={p.label}
              background={p.hex}
              on={editor === null && !accent2 && same(p.hex, accent)}
              onClick={() => {
                setEditor(null)
                pick(p.hex)
              }}
            />
          ))}
          <Swatch
            label="Eigene Farbe"
            background={RAINBOW_SWATCH}
            on={editor === 'color'}
            check="#fff"
            onClick={() => {
              setEditor('color')
              pick(accentFromHue(hue))
            }}
          />
        </div>
      </div>

      <div>
        <span className="eyebrow mb-2 block">Verlauf</span>
        <div className="flex flex-wrap items-center gap-3">
          {gradients.map((g) => (
            <Swatch
              key={g.key}
              label={g.label}
              background={`linear-gradient(135deg, ${g.a}, ${g.b})`}
              on={editor !== 'gradient' && same(g.a, accent) && same(g.b, accent2)}
              onClick={() => {
                setEditor(null)
                pick(g.a, g.b)
              }}
            />
          ))}
          <Swatch
            label="Neuen Verlauf bauen"
            background={RAINBOW_SWATCH}
            on={editor === 'gradient'}
            check="#fff"
            onClick={() => {
              setEditor('gradient')
              pick(accent, accent2 ?? accentFromHue(hue + 140))
            }}
          />
        </div>
        <p className="mt-2 text-xs text-white/50">Das bunte Rad baut einen eigenen Verlauf aus zwei Farben. Gespeicherte Verläufe erscheinen hier.</p>
      </div>

      <AnimatePresence initial={false}>
        {editor && (
          <motion.div key="hue" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SOFT} style={{ overflow: 'hidden' }}>
            <div className="space-y-3 pt-1">
              <div>
                <span className="mb-1 block text-xs font-semibold text-white/60">{editor === 'gradient' ? 'Farbe 1' : 'Farbton'}</span>
                <input
                  type="range"
                  className="slider hue-slider"
                  min={0}
                  max={359}
                  step={1}
                  value={hue}
                  aria-label="Farbton"
                  style={{ ['--track' as string]: RAINBOW }}
                  onChange={(e) => pick(accentFromHue(Number(e.target.value)), editor === 'gradient' ? accent2 : null)}
                />
              </div>
              {editor === 'gradient' && accent2 && (
                <>
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-white/60">Farbe 2</span>
                    <input
                      type="range"
                      className="slider hue-slider"
                      min={0}
                      max={359}
                      step={1}
                      value={hue2}
                      aria-label="Farbton der zweiten Farbe"
                      style={{ ['--track' as string]: RAINBOW }}
                      onChange={(e) => pick(accent, accentFromHue(Number(e.target.value)))}
                    />
                  </div>
                  <button
                    className="btn-soft w-full rounded-2xl px-4 py-2.5 text-sm disabled:opacity-40"
                    disabled={known && !isSaved}
                    onClick={() => (isSaved ? removeGradient(accent, accent2) : saveGradient(accent, accent2))}
                  >
                    {isSaved ? 'Gespeicherten Verlauf entfernen' : known ? 'Schon vorhanden' : 'Verlauf speichern'}
                  </button>
                </>
              )}
              <p className="text-xs text-white/50">Die Helligkeit passt sich dem Farbton an, damit Schrift immer lesbar bleibt.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="btn-primary rounded-2xl py-3 text-center text-sm" aria-hidden>
        So sehen Knöpfe aus
      </div>
    </div>
  )
}

const MODES: { value: Mode; label: string }[] = [
  { value: 'dark', label: 'Dunkel' },
  { value: 'light', label: 'Hell' },
  { value: 'auto', label: 'Wie Gerät' },
]

const PEN_MODES: { value: PenMode; label: string }[] = [
  { value: 'auto', label: 'Automatisch' },
  { value: 'on', label: 'Immer' },
  { value: 'off', label: 'Aus' },
]

const PEN_TEXT: Record<PenMode, string> = {
  auto: 'Sobald du den Apple Pencil benutzt, zeichnet nur noch der Stift. Finger bewegen und zoomen die Karte.',
  on: 'Der Stift zeichnet, Finger bewegen und zoomen die Karte.',
  off: 'Finger und Stift machen dasselbe: Sie benutzen das gewählte Werkzeug.',
}

/** Look of the app (light / dark, colours) and how a pen is used. Needs no account. */
export default function AppearanceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mode = useTheme((s) => s.mode)
  const setMode = useTheme((s) => s.setMode)
  const pen = usePen((s) => s.mode)
  const setPen = usePen((s) => s.setMode)
  const tint = useTrainLook((s) => s.tint)
  const setTint = useTrainLook((s) => s.setTint)
  return (
    <Sheet open={open} onClose={onClose} title="Darstellung">
      <div className="space-y-6">
        <div>
          <span className="eyebrow mb-2 block">Erscheinungsbild</span>
          <Segmented value={mode} onChange={setMode} options={MODES} />
          <p className="mt-2 text-sm text-white/55">Die Karte, das Netz und die 3D-Ansicht behalten ihre Farben, Menüs und Fenster werden hell oder dunkel.</p>
        </div>
        <AccentPicker />
        <div>
          <span className="eyebrow mb-2 block">Zugfarben</span>
          <Segmented
            value={tint ? 'line' : 'original'}
            onChange={(v) => setTint(v === 'line')}
            options={[
              { value: 'original', label: 'Wie das Vorbild' },
              { value: 'line', label: 'Linienfarbe' },
            ]}
          />
          <p className="mt-2 text-sm text-white/55">{tint ? 'Die Züge tragen die Farbe ihrer Linie.' : 'Die Züge behalten die Farben der echten Züge. Die Linie erkennst du an der Zielanzeige.'}</p>
        </div>
        <div>
          <span className="eyebrow mb-2 block">Apple Pencil</span>
          <Segmented value={pen} onChange={setPen} options={PEN_MODES} />
          <p className="mt-2 text-sm text-white/55">{PEN_TEXT[pen]}</p>
        </div>
      </div>
    </Sheet>
  )
}
