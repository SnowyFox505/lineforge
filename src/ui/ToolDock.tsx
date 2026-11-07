import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { OPERATORS, STATION_TYPES } from '../model/constants'
import type { OperatorId, PoiKind, StationType, ZoneKind } from '../model/types'
import { useEditor } from '../store/editorStore'
import { groupOf } from '../store/editorStore'
import type { Tool, ToolGroup } from '../store/editorStore'
import { POI_STYLE } from '../editor2d/drawPoi'
import { ZONE_STYLE } from '../editor2d/zoneGfx'
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
    ],
  },
  {
    id: 'infra',
    label: 'Infra­struktur',
    icon: 'route',
    tools: [
      { id: 'line', label: 'Linie', icon: 'route' },
      { id: 'station', label: 'Station', icon: 'pin' },
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
      className="inline-flex min-w-[2.4rem] items-center justify-center px-2.5 py-1 text-sm font-bold text-white"
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
  if (!st) return null
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
        <button className="btn-soft grid h-10 w-10 shrink-0 place-items-center rounded-xl text-red-300" onClick={() => remove(st.id)} aria-label="Station löschen">
          <Icon name="trash" size={18} />
        </button>
        <button className="btn-soft grid h-10 w-10 shrink-0 place-items-center rounded-xl" onClick={() => select(null)} aria-label="Auswahl aufheben">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {(Object.keys(STATION_TYPES) as StationType[]).map((t) => (
          <Chip key={t} active={st.type === t} onClick={() => update(st.id, { type: t })}>
            <StationGlyph type={t} size={22} />
            {STATION_TYPES[t].label}
          </Chip>
        ))}
      </div>
      {st.type === 'landmark' && (
        <CommitInput
          value={st.landmarkLabel ?? 'Wahrzeichen'}
          onCommit={(landmarkLabel) => update(st.id, { landmarkLabel })}
          className="mt-2 w-full !py-2"
          placeholder="Bezeichnung, z. B. Bundestag"
        />
      )}
    </motion.div>
  )
}

/** Curve radius of a line in the 3D view; committed on release so the undo history stays clean. */
function CurveSlider({ lineId, value }: { lineId: string; value: number }) {
  const update = useEditor((s) => s.updateLine)
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = () => v !== value && update(lineId, { curve: v })
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="eyebrow">Kurven in 3D</span>
        <span className="text-sm font-bold tabular-nums">{v <= 1 ? 'eng' : v >= 7 ? 'weit' : v.toFixed(1)}</span>
      </div>
      <input
        type="range"
        className="slider"
        min={1}
        max={8}
        step={0.5}
        value={v}
        style={{ ['--p' as string]: `${((v - 1) / 7) * 100}%` }}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      <p className="text-xs text-white/40">Die 2D-Pläne behalten ihre Knicke, nur die Schienen in 3D werden gerundet.</p>
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
  const active = activeId ? doc.lines[activeId] : undefined
  const lines = Object.values(doc.lines)

  return (
    <div className="space-y-3">
      <div>
        <div className="eyebrow mb-2">Neue Linie</div>
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
        <p className="text-sm text-white/50">Lege eine Linie an, dann tippe die Stationen der Reihe nach an.</p>
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
            <CurveSlider lineId={active.id} value={active.curve ?? 3} />
            <div className="flex items-center gap-2 border-t border-white/8 pt-3">
              <p className="min-w-0 flex-1 text-xs leading-snug text-white/50">
                Tippe ins Freie, um Wegpunkte zu setzen. Die Linie führt dann dort entlang. Ziehen verschiebt sie.
              </p>
              {selectedWp && selectedWp.lineId === active.id && (
                <button className="btn-soft shrink-0 rounded-xl px-3 py-2 text-xs text-red-300" onClick={() => removeWaypoint(selectedWp.lineId, selectedWp.k, selectedWp.j)}>
                  Wegpunkt weg
                </button>
              )}
              {(active.via ?? []).some((v) => v.length > 0) && (
                <button className="btn-soft shrink-0 rounded-xl px-3 py-2 text-xs" onClick={() => resetRoute(active.id)}>
                  Route neu
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const ZONE_LABEL: Record<ZoneKind, { single: string; add: string; hint: string }> = {
  city: { single: 'Bezirk', add: 'Neuer Bezirk', hint: 'Male die Stadt und teile sie in benannte Bezirke.' },
  suburb: { single: 'Vorort', add: 'Neuer Vorort', hint: 'Zeigt, wo die Vororte liegen.' },
  airport: { single: 'Flughafen', add: 'Neuer Flughafen', hint: 'Ein Flughafen braucht eine große Fläche.' },
}

/** Paint areas: brush, the zones of this kind (named) and how to add, rename and delete them. */
function ZonePanel({ kind }: { kind: ZoneKind }) {
  const doc = useEditor((s) => s.doc)
  const brush = useEditor((s) => s.brush)
  const setBrush = useEditor((s) => s.setBrush)
  const active = useEditor((s) => s.activeZone[kind])
  const setActive = useEditor((s) => s.setActiveZone)
  const addZone = useEditor((s) => s.addZone)
  const renameZone = useEditor((s) => s.renameZone)
  const removeZone = useEditor((s) => s.removeZone)
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
      <div>
        <div className="eyebrow mb-2">{kind === 'city' ? 'Bezirke' : kind === 'suburb' ? 'Vororte' : 'Flughäfen'}</div>
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
          <button className="btn-soft grid h-10 w-10 shrink-0 place-items-center rounded-xl text-red-300" onClick={() => removeZone(current.id)} aria-label={`${L.single} löschen`}>
            <Icon name="trash" size={18} />
          </button>
        </div>
      )}
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
              <Chip key={k} active={poi.kind === k} onClick={() => updatePoi(poi.id, { kind: k })}>
                <span className="h-3 w-3 rounded-full" style={{ background: POI_STYLE[k].color }} />
                {POI_STYLE[k].label}
              </Chip>
            ))}
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
                    {(Object.keys(STATION_TYPES) as StationType[]).map((t) => (
                      <Chip key={t} active={stationType === t} onClick={() => setStationType(t)}>
                        <StationGlyph type={t} size={22} />
                        {STATION_TYPES[t].label}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              {tool === 'line' && <LinePanel />}
              {(tool === 'city' || tool === 'suburb' || tool === 'airport') && <ZonePanel kind={tool} />}
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
