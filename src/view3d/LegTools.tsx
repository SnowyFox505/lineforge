import { useMemo } from 'react'
import * as THREE from 'three'
import { BRIDGE_STYLES, legBridge, legProfile, PROFILE_LABEL } from '../model/profiles'
import type { BridgeStyle, TrackProfile } from '../model/types'
import { useEditor } from '../store/editorStore'
import { useTheme } from '../ui/theme'
import { takeTrainPick } from './follow'
import { RAIL_Y } from './heights'
import type { LineNet, Network3D } from './network3d'

function ribbon(ln: LineNet, d0: number, d1: number, half: number, lift: number) {
  const pos: number[] = []
  const idx: number[] = []
  let k = 0
  for (let j = 0; j < ln.n; j++) {
    if (ln.cum[j] < d0 || ln.cum[j] > d1) continue
    const nx = -ln.tz[j]
    const nz = ln.tx[j]
    const y = ln.cy[j] + RAIL_Y + lift
    pos.push(ln.cx[j] + nx * half, y, ln.cz[j] + nz * half, ln.cx[j] - nx * half, y, ln.cz[j] - nz * half)
    if (k > 0) {
      const a = (k - 1) * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
    k++
  }
  if (k < 2) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

type Strip = { ln: LineNet; lg: LineNet['legs'][number]; geo: THREE.BufferGeometry }

/** Invisible strips over every stretch of track between two stations: tap one to change how it runs. */
export function LegPicker({ net, see }: { net: Network3D; see: boolean }) {
  const select = useEditor((s) => s.selectLeg)
  const setFollow = useEditor((s) => s.setFollow)
  const sel = useEditor((s) => s.selectedLeg)
  const accent = useTheme((s) => s.accent)
  const strips = useMemo(
    () =>
      net.lines.flatMap((ln) =>
        ln.legs
          .map((lg) => ({ ln, lg, geo: ribbon(ln, lg.d0, lg.d1, 0.8, 0.2) }))
          .filter((x): x is Strip => !!x.geo),
      ),
    [net],
  )
  return (
    <group>
      {strips.map(({ ln, lg, geo }) => {
        const on = sel?.lineId === ln.line.id && sel.leg === lg.k
        // metro tunnels can only be picked in the underground view, the ground hides them
        const pickable = lg.profile !== 'tunnel' || see
        return (
          <mesh
            key={`${ln.line.id}-${lg.k}`}
            geometry={geo}
            renderOrder={on ? 12 : 1}
            raycast={pickable ? undefined : () => null}
            onClick={(e) => {
              if (e.delta > 6) {
                takeTrainPick() // it was a drag, not a tap
                return
              }
              e.stopPropagation()
              // a train was pressed and has moved on while the finger was down: the tap was meant for the train
              const train = takeTrainPick()
              if (train) {
                setFollow(train)
                return
              }
              select({ lineId: ln.line.id, leg: lg.k })
            }}
          >
            <meshBasicMaterial color={accent} transparent opacity={on ? 0.5 : 0} depthWrite={false} depthTest={!on} side={THREE.DoubleSide} />
          </mesh>
        )
      })}
    </group>
  )
}

const PROFILES: TrackProfile[] = ['ground', 'embankment', 'tunnel']

/** Bottom sheet for the selected stretch of track: profile and, where it crosses water, the bridge style. */
export function LegPanel({ net }: { net: Network3D }) {
  const doc = useEditor((s) => s.doc)
  const sel = useEditor((s) => s.selectedLeg)
  const select = useEditor((s) => s.selectLeg)
  const updateLeg = useEditor((s) => s.updateLeg)
  if (!sel) return null
  const line = doc.lines[sel.lineId]
  const ln = net.lines.find((l) => l.line.id === sel.lineId)
  if (!line || !ln) return null
  const a = doc.stations[line.stations[sel.leg]]
  const b = doc.stations[line.stations[sel.leg + 1]]
  const profile = legProfile(line, sel.leg, doc)
  const bridge = legBridge(line, sel.leg)
  const hasBridge = ln.bridges.some((br) => br.leg === sel.leg)
  const eras: { key: 'historic' | 'modern'; label: string }[] = [
    { key: 'historic', label: 'Historisch' },
    { key: 'modern', label: 'Modern' },
  ]
  const pick = (id: BridgeStyle) => updateLeg(sel.lineId, sel.leg, { bridge: id })
  return (
    <div className="glass pointer-events-auto absolute inset-x-3 bottom-[98px] z-20 max-h-[56%] overflow-y-auto rounded-3xl p-4 md:left-1/2 md:right-auto md:w-[440px] md:-translate-x-1/2">
      <div className="flex items-center gap-3">
        <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: line.color }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold">
            {line.name} · {a?.name ?? '?'} → {b?.name ?? '?'}
          </div>
          <div className="text-xs text-white/50">Gleisabschnitt</div>
        </div>
        <button onClick={() => select(null)} aria-label="Schließen" className="btn-soft grid h-9 w-9 place-items-center rounded-full text-lg leading-none">
          ×
        </button>
      </div>

      <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-white/45">Verlauf</div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {PROFILES.map((p) => (
          <button key={p} onClick={() => updateLeg(sel.lineId, sel.leg, { profile: p })} className={`rounded-2xl px-2 py-3 text-[13px] font-semibold leading-tight transition-colors ${profile === p ? 'bg-accent text-ink' : 'btn-soft'}`}>
            {PROFILE_LABEL[p]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-white/45">
        {profile === 'embankment' ? 'Das Gleis liegt erhöht auf einem Damm mit Bögen.' : profile === 'tunnel' ? 'Das Gleis verläuft unter der Erde. Zum Ansehen den Untergrund einblenden.' : 'Das Gleis liegt auf dem Boden.'}
      </p>

      {hasBridge && (
        <>
          <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-white/45">Brücke über dem Wasser</div>
          <button onClick={() => pick('standard')} className={`mt-2 w-full rounded-2xl px-3 py-2.5 text-left text-[13px] font-semibold ${bridge === 'standard' ? 'bg-accent text-ink' : 'btn-soft'}`}>
            Standard <span className={bridge === 'standard' ? 'font-normal opacity-70' : 'font-normal text-white/45'}>· schlichte Balkenbrücke</span>
          </button>
          {eras.map((era) => (
            <div key={era.key}>
              <div className="mt-3 text-xs font-semibold text-white/60">{era.label}</div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {BRIDGE_STYLES.filter((s) => s.era === era.key).map((s) => (
                  <button key={s.id} onClick={() => pick(s.id)} title={s.hint} className={`rounded-2xl px-2 py-2.5 text-[12.5px] font-semibold leading-tight ${bridge === s.id ? 'bg-accent text-ink' : 'btn-soft'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
