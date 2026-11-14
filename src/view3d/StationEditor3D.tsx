import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OPERATORS, STATION_TYPES } from '../model/constants'
import { isUndergroundStation, lookOf, STATION_LOOKS, UG_COVER, UG_LIFT } from '../model/profiles'
import { RAIL } from '../model/scale'
import { layoutStation, MAX_TRACKS, resolveDesign, stationOperators } from '../model/stationDesign'
import { clusterByDirection, levelHeight, lineDirectionAtStation, MAX_LEVELS } from '../model/stationGroups'
import type { CityDoc } from '../model/types'
import type { OperatorId, PlatformLength, PlatformStyle, StationDesign } from '../model/types'
import { useEditor } from '../store/editorStore'
import Icon from '../ui/Icon'
import { Segmented, spring } from '../ui/primitives'
import { LAND_Y } from './heights'
import StationBuilding from './StationBuilding'
import type { EntranceSign } from './StationBuilding'
import { TrainStatic } from './vehicles3d'
import { trainLength, VEHICLES } from '../model/vehicles'
import { stopsAt } from '../model/stops'

const OP_COLOR: Record<OperatorId, string> = {
  sbahn: '#27c46b',
  ubahn: '#3db8ff',
  tram: '#ff5470',
  regional: '#ff8a3d',
  fernverkehr: '#9a6bff',
}

const ease = (u: number) => u * u * (3 - 2 * u)

/** Demo trains: every track gets a train of its first allowed operator that arrives, stops and leaves. */
function PreviewTrains({ tracks, colors, length }: { tracks: { z: number; ops: OperatorId[] }[]; colors: Partial<Record<OperatorId, string>>; length: number }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const clock = useRef(0)
  useFrame((_, dt) => {
    clock.current += Math.min(dt, 0.1)
    tracks.forEach((t, i) => {
      const g = refs.current[i]
      if (!g) return
      if (!t.ops.length) {
        g.visible = false
        return
      }
      g.visible = true
      const op = t.ops[0]
      const trainLen = trainLength(VEHICLES[op])
      const P = 14
      const u = (((clock.current + i * 2.3) % P) + P) % P
      const far = length / 2 + trainLen / 2 + 8
      let x: number
      if (u < 4) x = -far + (0 - -far) * ease(u / 4)
      else if (u < 9) x = 0
      else x = 0 + far * ease((u - 9) / 5)
      g.position.set(x, 0, t.z)
    })
  })
  return (
    <group>
      {tracks.map((t, i) => {
        const op = t.ops[0]
        if (!op) return <group key={i} ref={(g) => void (refs.current[i] = g)} />
        const color = colors[op] ?? OP_COLOR[op]
        return (
          <group key={`${i}-${op}`} ref={(g) => void (refs.current[i] = g)}>
            <TrainStatic spec={VEHICLES[op]} color={color} />
          </group>
        )
      })}
    </group>
  )
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button className="btn-soft grid h-10 w-10 place-items-center rounded-full text-xl disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Weniger">
        −
      </button>
      <span className="w-6 text-center text-lg font-bold tabular-nums">{value}</span>
      <button className="btn-soft grid h-10 w-10 place-items-center rounded-full text-xl disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Mehr">
        +
      </button>
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 text-left" role="switch" aria-checked={on}>
      <span className="text-sm font-semibold">{label}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-white/15'}`}>
        <motion.span className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow" animate={{ left: on ? 22 : 2 }} transition={spring} />
      </span>
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-2">{title}</div>
      {children}
    </div>
  )
}

/** Which lines the station's levels will carry (same rule the 3D network uses). */
function levelAssignment(doc: CityDoc, id: string, count: number) {
  const lines = Object.values(doc.lines).filter((l) => stopsAt(l, id) && l.operator !== 'tram')
  const labels = clusterByDirection(lines.map((l) => lineDirectionAtStation(doc, l, id) ?? { x: 1, z: 0 }), count)
  const k = labels.length ? Math.max(...labels) + 1 : 0
  return Array.from({ length: k }, (_, i) => {
    const mine = lines.filter((_, j) => labels[j] === i)
    return { names: mine.map((l) => l.name), ops: [...new Set(mine.map((l) => l.operator))] as OperatorId[] }
  })
}

function Panel({ id, level, setLevel }: { id: string; level: number; setLevel: (l: number) => void }) {
  const doc = useEditor((s) => s.doc)
  const update = useEditor((s) => s.updateStation)
  const st = doc.stations[id]
  const levels = st?.levels ?? 1
  const assign = useMemo(() => levelAssignment(doc, id, levels), [doc, id, levels])
  const activeLevel = Math.min(level, Math.max(0, assign.length - 1))
  const ops = useMemo(() => (assign[activeLevel]?.ops.length ? assign[activeLevel].ops : stationOperators(doc, id)), [assign, activeLevel, doc, id])
  const design = useMemo(() => (st ? resolveDesign(st, ops, activeLevel) : null), [st, ops, activeLevel])
  const [angle, setAngle] = useState<number | null>(null)
  if (!st || !design) return null

  const patch = (p: Partial<StationDesign>) =>
    activeLevel === 0
      ? update(id, { design: { ...st.design, ...p } })
      : update(id, { levelDesigns: { ...st.levelDesigns, [activeLevel]: { ...st.levelDesigns?.[activeLevel], ...p } } })
  const shown = angle ?? design.angle ?? 0

  const setTracks = (n: number) => patch({ tracks: n, trackOps: Array.from({ length: n }, (_, i) => design.trackOps[i] ?? (ops.length ? ops : (['sbahn'] as OperatorId[]))) })
  const toggleOp = (i: number, op: OperatorId) => {
    const cur = design.trackOps[i] ?? []
    const next = cur.includes(op) ? cur.filter((o) => o !== op) : [...cur, op]
    patch({ trackOps: design.trackOps.map((t, k) => (k === i ? next : t)) })
  }

  return (
    <div className="space-y-5">
      <Section title="Ebenen">
        <div className="flex items-center justify-between gap-3">
          <Stepper value={levels} min={1} max={MAX_LEVELS} onChange={(n) => update(id, { levels: n })} />
          <p className="min-w-0 flex-1 text-xs leading-snug text-white/50">
            {levels === 1 ? 'Alle Linien teilen sich einen Bahnhof.' : 'Die Linien werden nach Richtung auf die Ebenen verteilt: unten abgesenkt, oben erhöht.'}
          </p>
        </div>
        {levels > 1 && assign.length > 0 && (
          <div className="mt-3">
            <Segmented<number>
              value={activeLevel}
              onChange={setLevel}
              options={assign.map((a, i) => ({ value: i, label: `Ebene ${i + 1}`, sub: a.names.join(', ') || '–' }))}
            />
            {assign.length < levels && (
              <p className="mt-2 text-xs text-white/45">Die Linien laufen in ähnlicher Richtung, deshalb werden nur {assign.length} Ebene{assign.length > 1 ? 'n' : ''} gebraucht.</p>
            )}
          </div>
        )}
      </Section>

      <Section title="Bahnhofsart (Ansicht von außen)">
        <div className="grid grid-cols-2 gap-2">
          {STATION_LOOKS.map((l) => {
            const on = lookOf(st) === l.id
            return (
              <button key={l.id} onClick={() => update(id, { look: l.id })} className={`rounded-2xl px-3 py-2.5 text-left transition-colors ${on ? 'bg-accent text-ink' : 'btn-soft'}`}>
                <div className="text-[13px] font-bold leading-tight">{l.label}</div>
                <div className={`mt-0.5 text-[11px] leading-snug ${on ? 'opacity-70' : 'text-white/45'}`}>{l.hint}</div>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Lage">
        <Toggle on={isUndergroundStation(doc, st)} onChange={(v) => update(id, { underground: v })} label="Unterirdischer Bahnhof (im Tunnel)" />
        <p className="mt-2 text-xs text-white/45">Das geht für jeden Bahnhof, auch für S-Bahn und Fernverkehr (zum Beispiel am Flughafen). Reine U-Bahn-Stationen und Flughäfen liegen standardmäßig unter der Erde. Bei mehreren Ebenen ist das nicht möglich. Den Streckenverlauf stellst du in der 3D-Karte ein: Abschnitt antippen.</p>
      </Section>

      <Section title="Anzahl der Gleise">
        <Stepper value={design.tracks} min={1} max={MAX_TRACKS} onChange={setTracks} />
      </Section>

      <Section title="Bahnsteige">
        <Segmented<PlatformStyle>
          value={design.platform}
          onChange={(v) => patch({ platform: v })}
          options={[
            { value: 'island', label: 'Mitte', sub: 'zwischen den Gleisen' },
            { value: 'side', label: 'Seite', sub: 'außen am Gleis' },
          ]}
        />
      </Section>

      <Section title="Bahnsteiglänge">
        <Segmented<PlatformLength>
          value={design.length}
          onChange={(v) => patch({ length: v })}
          options={[
            { value: 'short', label: 'Kurz' },
            { value: 'medium', label: 'Mittel' },
            { value: 'long', label: 'Lang' },
          ]}
        />
      </Section>


      <Section title="Verkehr auf den Gleisen">
        <div className="space-y-2">
          {design.trackOps.map((tops, i) => (
            <div key={i} className="card flex items-center gap-2 rounded-2xl p-2">
              <span className="w-14 shrink-0 pl-2 text-xs font-bold text-white/60">Gleis {i + 1}</span>
              <div className="flex flex-1 gap-1.5 overflow-x-auto">
                {(Object.keys(OPERATORS) as OperatorId[]).map((op) => {
                  const on = tops.includes(op)
                  return (
                    <button
                      key={op}
                      onClick={() => toggleOp(i, op)}
                      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${on ? 'border-white/30 text-white' : 'border-white/8 text-white/40'}`}
                      style={on ? { background: `${OP_COLOR[op]}33` } : undefined}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: OP_COLOR[op], opacity: on ? 1 : 0.4 }} />
                      {OPERATORS[op].label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="U-Bahn">
        <Toggle on={design.ubahn} onChange={(v) => patch({ ubahn: v })} label="Anschluss an die U-Bahn (unterirdisch)" />
      </Section>

      <Section title="Ausrichtung">
        <Toggle on={design.angle === null} onChange={(v) => patch({ angle: v ? null : shown })} label="Automatisch (folgt der Linie)" />
        {design.angle !== null && (
          <div className="mt-2 flex items-center gap-3">
            <input
              type="range"
              className="slider"
              min={0}
              max={345}
              step={15}
              value={shown}
              style={{ ['--p' as string]: `${(shown / 345) * 100}%` }}
              onChange={(e) => setAngle(Number(e.target.value))}
              onPointerUp={() => {
                if (angle !== null) patch({ angle })
                setAngle(null)
              }}
              onKeyUp={() => {
                if (angle !== null) patch({ angle })
                setAngle(null)
              }}
            />
            <span className="w-12 text-right text-sm font-bold tabular-nums">{shown}°</span>
          </div>
        )}
      </Section>
    </div>
  )
}

export default function StationEditor3D() {
  const id = useEditor((s) => s.editStationId)
  const setEdit = useEditor((s) => s.setEditStation)
  const doc = useEditor((s) => s.doc)
  const st = id ? doc.stations[id] : undefined
  const [level, setLevel] = useState(0)
  useEffect(() => setLevel(0), [id])
  const assign = useMemo(() => (id ? levelAssignment(doc, id, st?.levels ?? 1) : []), [doc, id, st?.levels])
  const activeLevel = Math.min(level, Math.max(0, assign.length - 1))
  const ops = useMemo(() => (id ? (assign[activeLevel]?.ops.length ? assign[activeLevel].ops : stationOperators(doc, id)) : []), [assign, activeLevel, doc, id])
  const design = useMemo(() => (st ? resolveDesign(st, ops, activeLevel) : null), [st, ops, activeLevel])
  const layout = useMemo(() => {
    if (!design) return null
    // platforms grow with the longest train that may call here
    const used = new Set<OperatorId>([...ops, ...design.trackOps.flat()])
    const minLen = [...used].reduce((m, op) => Math.max(m, trainLength(VEHICLES[op]) + 2), 0)
    return layoutStation(design, minLen)
  }, [design, ops])
  // what the station looks like in the world: the same rules as there (level height, tunnel, outer look, entrance building)
  const levelCount = Math.max(1, assign.length)
  const liftWorld = st && levelCount === 1 && isUndergroundStation(doc, st) ? UG_LIFT : levelHeight(levelCount, activeLevel)
  const lift = liftWorld / RAIL // the editor builds at design size
  const underground = lift <= UG_COVER / RAIL
  const sign: EntranceSign = ops.includes('ubahn') ? 'U' : ops.includes('sbahn') ? 'S' : 'Bf'
  const entrance = st && activeLevel === 0 && lift === 0 ? (st.type === 'hauptbahnhof' || st.type === 'interchange' ? 'big' : st.type === 'standard' ? null : 'small') : null
  const look = st ? lookOf(st) : null
  // camera distance that frames the whole station, whatever its size
  const dist = layout ? Math.max(layout.length, layout.halfWidth * 2 + 4) * 1.45 + 6 : 24

  // operator colours: take the colour of a real line when the station has one
  const colors = useMemo(() => {
    const out: Partial<Record<OperatorId, string>> = {}
    if (!id) return out
    for (const l of Object.values(doc.lines)) if (stopsAt(l, id) && !out[l.operator]) out[l.operator] = l.color
    return out
  }, [doc, id])

  return (
    <AnimatePresence>
      {id && st && design && layout && (
        <motion.div className="absolute inset-0 z-50 flex flex-col bg-ink" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <div className="relative min-h-0 flex-1" style={{ background: 'radial-gradient(ellipse at 50% 40%, #1d2c3d 0%, #0a1017 60%, #06080c 100%)' }}>
            <Canvas camera={{ position: [dist * 0.55, dist * 0.42, dist * 0.8], fov: 40, near: 0.1, far: 400 }} gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
              <hemisphereLight args={['#cfe2ff', '#2a4a3c', 1.5]} />
              <directionalLight position={[10, 16, 8]} intensity={2.2} color="#fff0d9" />
              <directionalLight position={[-8, 8, -10]} intensity={0.4} color="#7aa8ff" />
              {/* ground slab; see-through when the metro level is shown */}
              <mesh position={[0, LAND_Y - 0.25, 0]}>
                <boxGeometry args={[layout.length + 14, 0.5, layout.halfWidth * 2 + 14]} />
                <meshStandardMaterial key={design.ubahn || underground ? 'see' : 'solid'} color="#2f6246" roughness={1} transparent={design.ubahn || underground} opacity={design.ubahn || underground ? 0.5 : 1} depthWrite={!(design.ubahn || underground)} />
              </mesh>
              {design.ubahn && (
                <mesh position={[0, LAND_Y - 1.6, 0]}>
                  <boxGeometry args={[layout.length + 14, 2.4, layout.halfWidth * 2 + 14]} />
                  <meshStandardMaterial color="#10161d" roughness={1} transparent opacity={0.35} />
                </mesh>
              )}
              <StationBuilding design={design} layout={layout} underground lift={lift} liftScale={RAIL} shell={look} entrance={entrance} sign={sign} />
              <group position={[0, lift, 0]}>
                <PreviewTrains tracks={layout.tracks} colors={colors} length={layout.length} />
              </group>
              <OrbitControls enableDamping dampingFactor={0.08} target={[0, 0.6, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={4} maxDistance={60} />
            </Canvas>
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto flex max-w-2xl items-center gap-2 px-3 pt-[calc(10px+var(--safe-top))]">
            <button onClick={() => setEdit(null)} className="glass pointer-events-auto grid h-12 w-12 shrink-0 place-items-center rounded-full active:scale-90" aria-label="Schließen">
              <Icon name="back" />
            </button>
            <div className="glass pointer-events-auto min-w-0 flex-1 rounded-full px-4 py-1.5">
              <div className="truncate text-[15px] font-bold leading-tight">{st.name}</div>
              <div className="truncate text-[11px] leading-tight text-white/50">
                Bahnhof-Editor · {STATION_TYPES[st.type].label} · {design.tracks} {design.tracks === 1 ? 'Gleis' : 'Gleise'}
              </div>
            </div>
          </div>

          <motion.div
            className="glass relative z-10 mx-auto max-h-[50%] w-full max-w-xl shrink-0 overflow-y-auto rounded-t-[28px] p-5 pb-[calc(1.25rem+var(--safe-bottom))]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            <Panel id={id} level={level} setLevel={setLevel} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
