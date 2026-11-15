import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { OPERATORS, STATION_TYPES } from '../model/constants'
import { stopsAt } from '../model/stops'
import { allowedKinds, namedWaters, WATER_LABEL } from '../model/waters'
import { BUILD_TYPES, stationTypeAt } from '../model/stationType'
import { effectiveTypes } from '../plan/glyphs'
import { poiModel, poiRadius, poiStations, poisServedBy, POI_MODELS, POI_RADIUS_MAX, POI_RADIUS_MIN, stationsInReach } from '../model/poi'
import type { OperatorId, PoiKind, ZoneKind } from '../model/types'
import { useEditor } from '../store/editorStore'
import { groupOf } from '../store/editorStore'
import type { Tool, ToolGroup } from '../store/editorStore'
import { POI_STYLE } from '../editor2d/drawPoi'
import { ZONE_STYLE } from '../editor2d/zoneGfx'
import { useZoneLook } from '../editor2d/zoneLook'
import Icon from './Icon'
import type { IconName } from './Icon'
import { ColorPicker, CommitInput, Slider, spring, StationGlyph } from './primitives'

interface ToolDef {
  id: Tool
  label: string
  icon: IconName
  /** for tools that share a tool id (points of interest) */
  poi?: PoiKind
}

interface Toolbox {
  id: ToolGroup
  label: string
  icon: IconName
  tools: ToolDef[]
}

/** The tools are sorted into toolboxes so the dock stays tidy. */
const TOOLBOXES: Toolbox[] = [
  {
    id: 'terra',
    label: 'Terra­forming',
    icon: 'mountain',
    tools: [
      { id: 'water', label: 'Wasser', icon: 'drop' },
      { id: 'erase', label: 'Land', icon: 'leaf' },
      { id: 'waterName', label: 'Gewässer', icon: 'edit' },
      { id: 'forest', label: 'Wald', icon: 'tree' },
      { id: 'mountain', label: 'Gebirge', icon: 'mountain' },
    ],
  },
  {
    id: 'infra',
    label: 'Infra­struktur',
    icon: 'route',
    tools: [
      { id: 'line', label: 'Linie', icon: 'route' },
      { id: 'station', label: 'Station', icon: 'pin' },
      { id: 'link', label: 'Verbinden', icon: 'link' },
      { id: 'legSmooth', label: 'Glätten', icon: 'smooth' },
      { id: 'legRebuild', label: 'Abschnitt', icon: 'cut' },
    ],
  },
  {
    id: 'area',
    label: 'Gebiete',
    icon: 'layers',
    tools: [
      { id: 'city', label: 'Stadt', icon: 'city' },
      { id: 'suburb', label: 'Vorort', icon: 'house' },
      { id: 'airport', label: 'Flughafen', icon: 'plane' },
      { id: 'zoneErase', label: 'Radierer', icon: 'eraser' },
    ],
  },
  {
    id: 'poi',
    label: 'Sehens­würdig­keiten',
    icon: 'star',
    tools: [
      { id: 'poi', label: 'Stadion', icon: 'stadium', poi: 'stadium' },
      { id: 'poi', label: 'Wahrzeichen', icon: 'arch', poi: 'landmark' },
      { id: 'poi', label: 'Attraktion', icon: 'star', poi: 'attraction' },
    ],
  },
]

export function LineBadge({ name, color, operator, active }: { name: string; color: string; operator: OperatorId; active?: boolean }) {
  return (
    <span
      className="inline-flex min-w-[2.4rem] items-center justify-center px-2.5 py-1 text-sm font-bold text-[#fff]"
      style={{
        background: color,
        borderRadius: Math.min(OPERATORS[operator].badgeRadius, 14),
        boxShadow: active ? `0 0 0 2px #0b0f15, 0 0 0 4px #fff, 0 6px 18px -4px ${color}` : `0 6px 16px -6px ${color}`,
        textShadow: '0 1px 2px rgba(0,0,0,0.35)',
      }}
    >
      {name}
    </span>
  )
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition-all active:scale-95 ${
        active ? 'border-accent/70 bg-accent/15 text-white' : 'border-white/8 bg-white/5 text-white/80'
      }`}
    >
      {children}
    </button>
  )
}

function StationCard() {
  const id = useEditor((s) => s.selectedStationId)
  const st = useEditor((s) => (id ? s.doc.stations[id] : undefined))
  const update = useEditor((s) => s.updateStation)
  const remove = useEditor((s) => s.removeStation)
  const select = useEditor((s) => s.selectStation)
  const doc = useEditor((s) => s.doc)
  const setMain = useEditor((s) => s.setMainStation)
  if (!st) return null
  const nearby = poisServedBy(doc, st)
  // two lines at one stop make it an interchange by themselves; the airport follows from the grounds
  const effective = effectiveTypes(doc)[st.id] ?? st.type
  const isMain = st.type === 'hauptbahnhof'
  const canBeMain = st.type !== 'tramstop' && st.type !== 'airport'
  return (
    <motion.div
      key={st.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="card mb-2 rounded-2xl p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="eyebrow shrink-0">Station</span>
        <CommitInput value={st.name} onCommit={(name) => update(st.id, { name })} className="min-w-0 flex-1 !py-2" />
        {canBeMain && (
          <button
            className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition-all active:scale-95 ${isMain ? 'border-accent/70 bg-accent/15 text-white' : 'border-white/8 bg-white/5 text-white/80'}`}
            onClick={() => setMain(st.id)}
            aria-pressed={isMain}
          >
            {isMain ? 'Hauptbahnhof ✓' : 'Zum Hbf machen'}
          </button>
        )}
        <button className="btn-soft grid h-10 w-10 shrink-0 place-items-center rounded-xl text-red-300" onClick={() => remove(st.id)} aria-label="Station löschen">
          <Icon name="trash" size={18} />
        </button>
        <button className="btn-soft grid h-10 w-10 shrink-0 place-items-center rounded-xl" onClick={() => select(null)} aria-label="Auswahl aufheben">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {BUILD_TYPES.map((t) => {
          // every station that is not a tram stop is a rail stop (the main station and the airport are rail stops too)
          const active = t === 'tramstop' ? st.type === 'tramstop' : st.type !== 'tramstop'
          return (
            <Chip key={t} active={active} onClick={() => !active && update(st.id, { type: stationTypeAt(doc, st.x, st.y, t) })}>
              <StationGlyph type={t === 'standard' ? effective : t} size={22} />
              {STATION_TYPES[t].label}
            </Chip>
          )
        })}
      </div>
      {st.type !== 'tramstop' && effective !== 'standard' && (
        <p className="mt-1 text-xs text-white/55">
          {STATION_TYPES[effective].label}: {STATION_TYPES[effective].hint}
        </p>
      )}
      {nearby.length > 0 && (
        <p className="mt-2 text-xs text-white/55">
          Ziel für {nearby.map((p) => `${POI_STYLE[p.kind].label} „${p.name}“`).join(', ')}
        </p>
      )}
    </motion.div>
  )
}

/** Link two stations (a tram stop next to a station) into one interchange without merging them. */
function LinkPanel() {
  const doc = useEditor((s) => s.doc)
  const first = useEditor((s) => s.selectedStationId)
  const toggle = useEditor((s) => s.toggleLink)
  const links = doc.links ?? []
  return (
    <div className="space-y-2">
      <p className="text-sm text-white/55">
        {first && doc.stations[first]
          ? `Tippe jetzt die Station an, die mit „${doc.stations[first].name}“ verbunden werden soll.`
          : 'Tippe zwei Stationen nacheinander an, zum Beispiel eine Tram-Haltestelle neben einer Station. Sie bleiben getrennte Stationen, gelten aber als ein Umstieg und teilen sich den Namen. Nochmal verbinden löst die Verbindung.'}
      </p>
      {links.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {links.map(([a, b]) => (
            <Chip key={`${a}-${b}`} onClick={() => toggle(a, b)}>
              <Icon name="link" size={16} />
              {doc.stations[a]?.name} ↔ {doc.stations[b]?.name}
              <Icon name="close" size={14} />
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}

function LinePanel() {
  const doc = useEditor((s) => s.doc)
  const activeId = useEditor((s) => s.activeLineId)
  const setActive = useEditor((s) => s.setActiveLine)
  const addLine = useEditor((s) => s.addLine)
  const updateLine = useEditor((s) => s.updateLine)
  const removeLine = useEditor((s) => s.removeLine)
  const popFromLine = useEditor((s) => s.popFromLine)
  const resetRoute = useEditor((s) => s.resetRoute)
  const removeWaypoint = useEditor((s) => s.removeWaypoint)
  const selectedWp = useEditor((s) => s.selectedWaypoint)
  const lineMode = useEditor((s) => s.lineMode)
  const setLineMode = useEditor((s) => s.setLineMode)
  const smoothActive = useEditor((s) => s.smoothActive)
  const lastLeg = useEditor((s) => s.lastLeg)
  const active = activeId ? doc.lines[activeId] : undefined
  const lines = Object.values(doc.lines)

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="eyebrow">Neue Linie</span>
          <div className="flex rounded-xl bg-white/6 p-0.5 text-xs font-semibold" role="group" aria-label="So baust du">
            {(
              [
                ['draw', 'Zeichnen'],
                ['connect', 'Stationen verbinden'],
              ] as const
            ).map(([m, label]) => (
              <button key={m} onClick={() => setLineMode(m)} className={`rounded-[10px] px-2.5 py-1.5 transition-colors ${lineMode === m ? 'bg-white/90 text-[color:var(--bg)]' : 'text-white/60'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {(Object.keys(OPERATORS) as OperatorId[]).map((op) => (
            <Chip key={op} onClick={() => addLine(op)}>
              <Icon name="plus" size={16} />
              {OPERATORS[op].label}
            </Chip>
          ))}
        </div>
      </div>

      {lines.length > 0 ? (
        <div>
          <div className="eyebrow mb-2">Deine Linien</div>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-2 py-2">
            {lines.map((l) => (
              <button key={l.id} onClick={() => setActive(l.id)} className="shrink-0 transition-transform active:scale-90">
                <LineBadge name={l.name} color={l.color} operator={l.operator} active={activeId === l.id} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-white/50">
          {lineMode === 'draw' ? 'Lege eine Linie an, dann ziehe die Strecke mit dem Finger über die Karte.' : 'Lege eine Linie an, dann tippe die Stationen der Reihe nach an.'}
        </p>
      )}

      <AnimatePresence>
        {active && (
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="card space-y-3 rounded-2xl p-3"
          >
            <div className="flex items-center gap-2">
              <CommitInput value={active.name} onCommit={(name) => updateLine(active.id, { name })} className="w-24 !py-2" />
              <span className="min-w-0 flex-1 truncate text-xs text-white/50">
                {OPERATORS[active.operator].label} · {active.stations.length} Stationen
              </span>
              <button className="btn-soft grid h-10 w-10 place-items-center rounded-xl" onClick={() => popFromLine(active.id)} aria-label="Letzte Station entfernen">
                <Icon name="undo" size={18} />
              </button>
              <button className="btn-soft grid h-10 w-10 place-items-center rounded-xl text-red-300" onClick={() => removeLine(active.id)} aria-label="Linie löschen">
                <Icon name="trash" size={18} />
              </button>
            </div>
            <ColorPicker value={active.color} onChange={(color) => updateLine(active.id, { color })} />
            {active.stations.length >= 3 && (
              <div className="border-t border-white/8 pt-3">
                <div className="eyebrow mb-1">Hält an</div>
                <p className="mb-2 text-xs leading-snug text-white/50">Tippe eine Station an, um sie auszulassen: Die Linie fährt dort auf einem Gleis ohne Bahnsteig durch.</p>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {active.stations.map((sid, i) => {
                    const st = doc.stations[sid]
                    if (!st) return null
                    const end = i === 0 || i === active.stations.length - 1
                    const stops = stopsAt(active, sid)
                    return (
                      <button
                        key={`${sid}-${i}`}
                        disabled={end}
                        onClick={() => {
                          const passes = new Set(active.passes ?? [])
                          if (stops) passes.add(sid)
                          else passes.delete(sid)
                          updateLine(active.id, { passes: [...passes] })
                        }}
                        className={`flex shrink-0 items-center gap-1.5 rounded-2xl border px-3 py-2 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60 ${
                          stops ? 'border-accent/70 bg-accent/15 text-white' : 'border-white/8 bg-white/5 text-white/45 line-through'
                        }`}
                        aria-pressed={stops}
                        title={end ? 'Endstationen halten immer' : stops ? 'Hält hier: tippen zum Durchfahren' : 'Fährt durch: tippen zum Halten'}
                      >
                        <span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: active.color, background: stops ? active.color : 'transparent' }} />
                        {st.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 border-t border-white/8 pt-3">
              <p className="min-w-0 flex-1 text-xs leading-snug text-white/50">
                {lineMode === 'draw'
                  ? 'Ziehe von einem Ende der Linie aus weiter. Tippe auf die Linie für eine Station, ziehe die Rauten, um die Kurve zu formen.'
                  : 'Tippe die Stationen der Reihe nach an. Tippe ins Freie für einen Punkt, durch den die Linie führt, ziehen verschiebt ihn.'}
              </p>
              {selectedWp && selectedWp.lineId === active.id && (
                <button className="btn-soft shrink-0 rounded-xl px-3 py-2 text-xs text-red-300" onClick={() => removeWaypoint(selectedWp.lineId, selectedWp.k, selectedWp.j)}>
                  Wegpunkt weg
                </button>
              )}
              {lineMode === 'draw' && active.stations.length >= 2 && (
                <button
                  className="btn-soft shrink-0 rounded-xl px-3 py-2 text-xs"
                  onClick={() => smoothActive()}
                  title={lastLeg && lastLeg.lineId === active.id ? 'Rundet den zuletzt gezeichneten Abschnitt ab (mehrmals tippen: noch runder)' : 'Rundet die ganze Linie ab'}
                >
                  Glätten
                </button>
              )}
              {(active.via ?? []).some((v) => v.length > 0) && (
                <button className="btn-soft shrink-0 rounded-xl px-3 py-2 text-xs" onClick={() => resetRoute(active.id)}>
                  Automatisch
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Tool 'legRebuild': a stretch of a line is chosen on the map, then it is laid again or removed. */
function LegPanel() {
  const doc = useEditor((s) => s.doc)
  const sel = useEditor((s) => s.selectedLeg)
  const rebuild = useEditor((s) => s.rebuildLegAt)
  const remove = useEditor((s) => s.removeLegAt)
  const line = sel ? doc.lines[sel.lineId] : undefined
  const a = line ? doc.stations[line.stations[sel!.leg]] : undefined
  const b = line ? doc.stations[line.stations[sel!.leg + 1]] : undefined
  if (!sel || !line || !a || !b) {
    return (
      <div>
        <div className="eyebrow mb-1">Abschnitt neu bauen oder löschen</div>
        <p className="text-xs leading-snug text-white/50">Tippe auf eine Strecke zwischen zwei Stationen, um sie zu wählen.</p>
      </div>
    )
  }
  const only = line.stations.length < 3
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: line.color }} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {line.name}: {a.name} → {b.name}
        </span>
      </div>
      <div className="flex gap-2">
        <button className="btn-soft flex-1 rounded-xl px-3 py-2 text-xs" onClick={() => rebuild(sel.lineId, sel.leg)}>
          Neu verlegen
        </button>
        <button
          className="btn-soft flex-1 rounded-xl px-3 py-2 text-xs text-red-300 disabled:opacity-40"
          disabled={only}
          title={only ? 'Die Linie hat nur diesen Abschnitt: lösche stattdessen die Linie' : 'Nimmt den Abschnitt heraus: am Ende wird die Linie kürzer, in der Mitte wird sie geteilt'}
          onClick={() => remove(sel.lineId, sel.leg)}
        >
          Abschnitt entfernen
        </button>
      </div>
      <p className="text-xs leading-snug text-white/50">„Neu verlegen“ wirft die Kurve weg und baut die Strecke zwischen den beiden Stationen neu. Die Stationen bleiben immer auf der Karte.</p>
    </div>
  )
}

const ZONE_LABEL: Record<ZoneKind, { single: string; add: string; hint: string }> = {
  city: { single: 'Bezirk', add: 'Neuer Bezirk', hint: 'Male die Stadt und teile sie in benannte Bezirke.' },
  suburb: { single: 'Vorort', add: 'Neuer Vorort', hint: 'Zeigt, wo die Vororte liegen.' },
  airport: { single: 'Flughafen', add: 'Neuer Flughafen', hint: 'Ein Flughafen braucht eine große Fläche.' },
  forest: { single: 'Wald', add: 'Neuer Wald', hint: 'Male Wälder auf das Land. Du kannst sie benennen.' },
  mountain: { single: 'Gebirge', add: 'Neues Gebirge', hint: 'Male Gebirge auf das Land. Gleise führen durch Täler.' },
}

const ZONE_PLURAL: Record<ZoneKind, string> = { city: 'Bezirke', suburb: 'Vororte', airport: 'Flughäfen', forest: 'Wälder', mountain: 'Gebirge' }

/** Paint areas: brush, the zones of this kind (named) and how to add, rename and delete them. */
function ZonePanel({ kind }: { kind: ZoneKind }) {
  const doc = useEditor((s) => s.doc)
  const brush = useEditor((s) => s.brush)
  const setBrush = useEditor((s) => s.setBrush)
  const active = useEditor((s) => s.activeZone[kind])
  const setActive = useEditor((s) => s.setActiveZone)
  const addZone = useEditor((s) => s.addZone)
  const renameZone = useEditor((s) => s.renameZone)
  const rerollZone = useEditor((s) => s.rerollZoneName)
  const removeZone = useEditor((s) => s.removeZone)
  const pick = useEditor((s) => s.pickZone)
  const setPick = useEditor((s) => s.setPickZone)
  const weight = useZoneLook((s) => s.weight)
  const setWeight = useZoneLook((s) => s.setWeight)
  const outline = useZoneLook((s) => s.outline)
  const setOutline = useZoneLook((s) => s.setOutline)
  // the picker is only on while this panel is open
  useEffect(() => () => setPick(false), [setPick])
  const zones = (doc.zones ?? []).filter((z) => z.kind === kind)
  const current = zones.find((z) => z.id === active)
  const L = ZONE_LABEL[kind]
  const style = ZONE_STYLE[kind]
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="eyebrow">{L.hint}</span>
          <span className="text-sm font-bold tabular-nums">{brush}</span>
        </div>
        <Slider value={brush} min={2} max={24} onChange={setBrush} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={pick} onClick={() => setPick(!pick)}>
          <Icon name="pipette" size={16} />
          {pick ? 'Tippe auf eine Fläche' : 'Fläche wählen'}
        </Chip>
        <Chip active={weight === 'light'} onClick={() => setWeight(weight === 'light' ? 'strong' : 'light')}>
          Leichte Flächen
        </Chip>
        <Chip active={outline} onClick={() => setOutline(!outline)}>
          Umriss
        </Chip>
      </div>
      <div>
        <div className="eyebrow mb-2">{ZONE_PLURAL[kind]}</div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {zones.map((z) => (
            <Chip key={z.id} active={z.id === active} onClick={() => setActive(kind, z.id)}>
              <span className="h-3 w-3 rounded-full" style={{ background: style.fill }} />
              {z.name}
            </Chip>
          ))}
          <Chip onClick={() => addZone(kind)}>
            <Icon name="plus" size={16} />
            {L.add}
          </Chip>
        </div>
      </div>
      {current && (
        <div className="card flex items-center gap-2 rounded-2xl p-2">
          <span className="eyebrow shrink-0 pl-1">Name</span>
          <CommitInput value={current.name} onCommit={(name) => renameZone(current.id, name)} className="min-w-0 flex-1 !py-2" />
          {kind !== 'airport' && (
            <button className="btn-soft grid h-10 w-10 shrink-0 place-items-center rounded-xl" onClick={() => rerollZone(current.id)} aria-label="Neuen Namen würfeln">
              <Icon name="refresh" size={18} />
            </button>
          )}
          <button className="btn-soft grid h-10 w-10 shrink-0 place-items-center rounded-xl text-red-300" onClick={() => removeZone(current.id)} aria-label={`${L.single} löschen`}>
            <Icon name="trash" size={18} />
          </button>
        </div>
      )}
    </div>
  )
}

/** Name the bodies of water: tap a lake, river or sea; kind, name and a new random name can be changed here. */
function WaterPanel() {
  const doc = useEditor((s) => s.doc)
  const id = useEditor((s) => s.selectedWaterId)
  const setKind = useEditor((s) => s.setWaterKind)
  const reroll = useEditor((s) => s.rerollWaterName)
  const rename = useEditor((s) => s.renameWater)
  const remove = useEditor((s) => s.removeWaterName)
  const named = namedWaters(doc).find((n) => n.water.id === id)
  if (!named) {
    return <p className="text-sm text-white/55">Tippe auf einen See, Fluss, Kanal oder das Meer. Das Spiel erkennt, was es ist, und gibt ihm einen Namen. Du kannst beides ändern.</p>
  }
  const { water, body } = named
  const kinds = allowedKinds(doc, body)
  return (
    <div className="card space-y-2 rounded-2xl p-3">
      <div className="flex items-center gap-2">
        <CommitInput value={water.name} onCommit={(name) => rename(water.id, name)} className="min-w-0 flex-1 !py-2" />
        <button className="btn-soft grid h-10 w-10 shrink-0 place-items-center rounded-xl" onClick={() => reroll(water.id)} aria-label="Neuen Namen würfeln">
          <Icon name="refresh" size={18} />
        </button>
        <button className="btn-soft grid h-10 w-10 shrink-0 place-items-center rounded-xl text-red-300" onClick={() => remove(water.id)} aria-label="Namen entfernen">
          <Icon name="trash" size={18} />
        </button>
      </div>
      {kinds.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {kinds.map((k) => (
            <Chip key={k} active={water.kind === k} onClick={() => setKind(water.id, k)}>
              {WATER_LABEL[k]}
            </Chip>
          ))}
        </div>
      )}
      <p className="text-xs text-white/45">
        {WATER_LABEL[water.kind]} · {body.area} Felder
      </p>
    </div>
  )
}

/** Points of interest: place markers; the selected one can be renamed, changed or deleted. */
function PoiPanel() {
  const doc = useEditor((s) => s.doc)
  const poiKind = useEditor((s) => s.poiKind)
  const selectedId = useEditor((s) => s.selectedPoiId)
  const updatePoi = useEditor((s) => s.updatePoi)
  const removePoi = useEditor((s) => s.removePoi)
  const selectPoi = useEditor((s) => s.selectPoi)
  const poi = (doc.pois ?? []).find((p) => p.id === selectedId)
  return (
    <div className="space-y-3">
      <p className="text-sm text-white/55">
        {poi ? POI_STYLE[poi.kind].hint : `Tippe auf die Karte, um ${POI_STYLE[poiKind].label === 'Attraktion' ? 'eine' : 'ein'} ${POI_STYLE[poiKind].label} zu setzen. ${POI_STYLE[poiKind].hint}`}
      </p>
      {poi && (
        <div className="card space-y-2 rounded-2xl p-3">
          <div className="flex items-center gap-2">
            <CommitInput value={poi.name} onCommit={(name) => updatePoi(poi.id, { name })} className="min-w-0 flex-1 !py-2" />
            <button className="btn-soft grid h-10 w-10 shrink-0 place-items-center rounded-xl text-red-300" onClick={() => removePoi(poi.id)} aria-label="Löschen">
              <Icon name="trash" size={18} />
            </button>
            <button className="btn-soft grid h-10 w-10 shrink-0 place-items-center rounded-xl" onClick={() => selectPoi(null)} aria-label="Auswahl aufheben">
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {(Object.keys(POI_STYLE) as PoiKind[]).map((k) => (
              <Chip key={k} active={poi.kind === k} onClick={() => updatePoi(poi.id, { kind: k, radius: undefined, model: undefined })}>
                <span className="h-3 w-3 rounded-full" style={{ background: POI_STYLE[k].color }} />
                {POI_STYLE[k].label}
              </Chip>
            ))}
          </div>
          <div>
            <div className="eyebrow mb-1">Aussehen in 3D</div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {POI_MODELS[poi.kind].map((m) => (
                <Chip key={m.id} active={poiModel(poi) === m.id} onClick={() => updatePoi(poi.id, { model: m.id })}>
                  {m.label}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="eyebrow">Einzugsgebiet · Radius</span>
              <span className="text-sm font-bold tabular-nums">{poiRadius(poi)}</span>
            </div>
            <Slider value={poiRadius(poi)} min={POI_RADIUS_MIN} max={POI_RADIUS_MAX} onChange={(radius) => updatePoi(poi.id, { radius })} />
            {(() => {
              const inReach = stationsInReach(doc, poi)
              const serving = new Set(poiStations(doc, poi).map((s) => s.id))
              if (!inReach.length) return <p className="mt-1 text-xs text-white/50">Keine Station im Kreis. Setze eine Station hinein, damit die Leute hierher fahren.</p>
              return (
                <div className="mt-2">
                  <div className="eyebrow mb-1">Hier steigen die Leute aus</div>
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {inReach.map((s) => (
                      <Chip
                        key={s.id}
                        active={serving.has(s.id)}
                        onClick={() => {
                          const now = new Set(serving)
                          if (now.has(s.id)) now.delete(s.id)
                          else now.add(s.id)
                          updatePoi(poi.id, { stations: [...now] })
                        }}
                      >
                        {s.name}
                      </Chip>
                    ))}
                  </div>
                  <p className="text-xs text-white/50">Nur diese Stationen gelten als Ziel. Ohne Auswahl ist es die nächste Station: Wer zum Rathaus fährt, will nicht automatisch zum Zoo daneben.</p>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ToolDock() {
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const poiKind = useEditor((s) => s.poiKind)
  const setPoiKind = useEditor((s) => s.setPoiKind)
  const brush = useEditor((s) => s.brush)
  const setBrush = useEditor((s) => s.setBrush)
  const stationType = useEditor((s) => s.stationType)
  const setStationType = useEditor((s) => s.setStationType)
  const requestFit = useEditor((s) => s.requestFit)
  const hasSelection = useEditor((s) => s.selectedStationId !== null)
  const group = groupOf(tool)
  const box = TOOLBOXES.find((b) => b.id === group)
  const isActive = (t: ToolDef) => tool === t.id && (!t.poi || poiKind === t.poi)
  const pick = (t: ToolDef) => {
    if (t.poi) setPoiKind(t.poi)
    setTool(t.id)
  }
  const openBox = (b: Toolbox) => {
    if (group === b.id) return setTool('pan') // tap the open toolbox again to close it
    pick(b.tools[0])
  }

  const showContext = tool !== 'pan' || hasSelection

  return (
    <motion.div layout transition={spring} className="glass pointer-events-auto relative mx-auto w-full max-w-xl rounded-[28px] p-2" style={{ borderRadius: 28 }}>
      <AnimatePresence initial={false}>
        {showContext && (
          <motion.div key="ctx" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
            <div className="max-h-[32vh] overflow-y-auto px-2 pb-3 pt-2">
              {(tool === 'pan' || tool === 'station') && (
                <AnimatePresence mode="popLayout">
                  <StationCard />
                </AnimatePresence>
              )}
              {(tool === 'water' || tool === 'erase') && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="eyebrow">{tool === 'water' ? 'Wasser malen' : 'Land malen'} · Pinsel</span>
                    <span className="text-sm font-bold tabular-nums">{brush}</span>
                  </div>
                  <Slider value={brush} min={2} max={14} onChange={setBrush} />
                </div>
              )}
              {tool === 'station' && (
                <div>
                  <div className="eyebrow mb-2">Tippe auf die Karte, um zu bauen</div>
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {BUILD_TYPES.map((t) => (
                      <Chip key={t} active={stationType === t} onClick={() => setStationType(t)}>
                        <StationGlyph type={t} size={22} />
                        {STATION_TYPES[t].label}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              {tool === 'waterName' && <WaterPanel />}
              {tool === 'link' && <LinkPanel />}
              {tool === 'line' && <LinePanel />}
              {tool === 'legSmooth' && (
                <div>
                  <div className="eyebrow mb-1">Abschnitt glätten</div>
                  <p className="text-xs leading-snug text-white/50">Tippe auf eine Strecke zwischen zwei Stationen: Sie wird runder. Noch einmal tippen glättet weiter, zurück geht mit Rückgängig.</p>
                </div>
              )}
              {tool === 'legRebuild' && <LegPanel />}
              {(tool === 'city' || tool === 'suburb' || tool === 'airport' || tool === 'forest' || tool === 'mountain') && <ZonePanel kind={tool} />}
              {tool === 'zoneErase' && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="eyebrow">Gebiete wegradieren · Pinsel</span>
                    <span className="text-sm font-bold tabular-nums">{brush}</span>
                  </div>
                  <Slider value={brush} min={2} max={24} onChange={setBrush} />
                </div>
              )}
              {tool === 'poi' && <PoiPanel />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* tools of the open toolbox */}
      <AnimatePresence initial={false}>
        {box && (
          <motion.div key={box.id} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
            <div className="mb-1 flex gap-1 overflow-x-auto px-0.5 pt-1">
              {box.tools.map((t) => {
                const active = isActive(t)
                return (
                  <button
                    key={t.label}
                    onClick={() => pick(t)}
                    className={`relative flex shrink-0 items-center gap-2 rounded-2xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${active ? 'text-accent-ink' : 'bg-white/5 text-white/80'}`}
                  >
                    {active && <motion.span layoutId="toolPill" className="btn-primary absolute inset-0 rounded-2xl" transition={spring} />}
                    <span className="relative">
                      <Icon name={t.icon} size={18} />
                    </span>
                    <span className="relative">{t.label}</span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* toolboxes */}
      <div className="flex items-stretch gap-1">
        <button
          onClick={() => setTool('pan')}
          className={`relative flex w-12 shrink-0 flex-col items-center gap-1 rounded-2xl px-0.5 py-2 text-[9px] font-semibold transition-colors ${group === 'move' ? 'text-accent-ink' : 'text-white/70'}`}
        >
          {group === 'move' && <motion.span layoutId="boxPill" className="btn-primary absolute inset-0 rounded-2xl" transition={spring} />}
          <span className="relative">
            <Icon name="move" size={20} />
          </span>
          <span className="relative leading-none">Bewegen</span>
        </button>
        <div className="flex min-w-0 flex-1 gap-1">
          {TOOLBOXES.map((b) => {
            const active = group === b.id
            return (
              <button
                key={b.id}
                onClick={() => openBox(b)}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[9px] font-semibold transition-colors ${active ? 'text-accent-ink' : 'text-white/70'}`}
              >
                {active && <motion.span layoutId="boxPill" className="btn-primary absolute inset-0 rounded-2xl" transition={spring} />}
                <span className="relative">
                  <Icon name={b.icon} size={20} />
                </span>
                <span className="relative w-full text-center leading-[1.1]" style={{ hyphens: 'manual' }} lang="de">{b.label}</span>
              </button>
            )
          })}
        </div>
      </div>
      <button
        onClick={requestFit}
        aria-label="Karte zentrieren"
        className="glass absolute -top-14 right-1 grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-90"
      >
        <Icon name="fit" size={20} />
      </button>
    </motion.div>
  )
}
