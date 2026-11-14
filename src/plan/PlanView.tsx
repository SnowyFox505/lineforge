import { motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { OPERATORS } from '../model/constants'
import type { StationType } from '../model/types'
import { useEditor } from '../store/editorStore'
import Icon from '../ui/Icon'
import { downloadBlob } from '../ui/SettingsSheet'
import { effectiveTypes, planePath } from './glyphs'
import { placeLabels } from './labels'
import type { LabelRect } from './labels'
import { layoutLines } from './layout'
import { schematize } from './schematic'
import { stopsAt } from '../model/stops'
import { labelHolder } from '../model/links'

const TARGET_W = 500 // px the longer side of the network is scaled to
const MIN_U = 10
const MAX_U = 38
const PAD = 0
const MIN_ZOOM = 0.5
const MAX_ZOOM = 8
/** space the header and the tab bar cover (the plan is centred between them) */
const VIEW_TOP = 84
const VIEW_BOTTOM = 130
const FONT = 17
const SANS = "'Space Grotesk Variable', Helvetica, Arial, sans-serif"

type ThemeName = 'dark' | 'light'
const THEMES = {
  dark: {
    bgA: '#0d1219',
    bgB: '#131c2b',
    title: '#f4f7fa',
    sub: '#7d8898',
    label: '#f2f5f8',
    halo: '#0c1118',
    fill: '#ffffff',
    ink: '#0b0f15',
    casing: '#0a0e14',
    muted: '#7d8898',
    glow: true,
  },
  light: {
    bgA: '#f6f4ee',
    bgB: '#efece3',
    title: '#10151c',
    sub: '#6c7683',
    label: '#10151c',
    halo: '#f6f4ee',
    fill: '#ffffff',
    ink: '#10151c',
    casing: '#f6f4ee',
    muted: '#6c7683',
    glow: false,
  },
}

function markerRadius(type: StationType) {
  switch (type) {
    case 'interchange':
      return 13
    case 'hauptbahnhof':
      return 19
    case 'airport':
      return 17
    case 'tramstop':
      return 7
    default:
      return 8
  }
}

function Symbol({ type, x, y, ink, fill }: { type: StationType; x: number; y: number; ink: string; fill: string }) {
  switch (type) {
    case 'interchange':
      return <circle cx={x} cy={y} r={11} fill={fill} stroke={ink} strokeWidth={4.5} />
    case 'tramstop':
      return <rect x={x - 6.5} y={y - 6.5} width={13} height={13} rx={3.5} fill={fill} stroke={ink} strokeWidth={3.5} />
    case 'hauptbahnhof':
      return (
        <g>
          <rect x={x - 18} y={y - 14} width={36} height={28} rx={8} fill="url(#hbf)" stroke="#fff" strokeWidth={2.5} />
          <text x={x} y={y + 7} textAnchor="middle" fontSize={20} fontWeight={700} fill="#fff" fontFamily={SANS}>
            H
          </text>
        </g>
      )
    case 'airport':
      return (
        <g>
          <circle cx={x} cy={y} r={16} fill="url(#air)" stroke="#fff" strokeWidth={2.5} />
          <path d={planePath(x, y, 10)} fill="#fff" />
        </g>
      )
    default:
      return <circle cx={x} cy={y} r={6.5} fill={fill} stroke={ink} strokeWidth={3} />
  }
}

/** A stop in the style of the Berlin plan: a tick across the line, or a capsule across the bundle at an interchange. */
function StopMark({ m, ink, fill }: { m: { kind: 'tick' | 'capsule'; cx: number; cy: number; nx: number; ny: number; t0: number; t1: number }; ink: string; fill: string }) {
  const pad = m.kind === 'tick' ? 6.5 : 8
  const a = { x: m.cx + m.nx * (m.t0 - pad), y: m.cy + m.ny * (m.t0 - pad) }
  const b = { x: m.cx + m.nx * (m.t1 + pad), y: m.cy + m.ny * (m.t1 + pad) }
  const thick = m.kind === 'tick' ? 4 : 11
  return (
    <g strokeLinecap="round">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ink} strokeWidth={thick + 4.5} />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={fill} strokeWidth={thick} />
    </g>
  )
}

export default function PlanView() {
  const doc = useEditor((s) => s.doc)
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<ThemeName>('dark')
  const [box, setBox] = useState({ w: 0, h: 0 })
  const T = THEMES[theme]
  const hasStations = Object.keys(doc.stations).length > 0

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [hasStations])

  /** what the drag handlers need to turn a pointer position into a place in the plan */
  const planRef = useRef<{ U: number; minX: number; minY: number; vx: number; vy: number; mapW: number; totalH: number; offset: { x: number; y: number } } | null>(null)

  // --- pan and zoom: drag to move, pinch / mouse wheel / double tap to zoom (all around the fingers or cursor) ---
  const view = useRef({ zoom: 1, x: 0, y: 0, auto: true })
  const geo = useRef({ mapW: 1, totalH: 1, fit: 1, boxW: 0, boxH: 0 })
  const apply = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return
    const g = geo.current
    const v = view.current
    const s = g.fit * v.zoom
    const w = g.mapW * s
    const h = g.totalH * s
    const room = g.boxH - VIEW_TOP - VIEW_BOTTOM
    if (v.auto) {
      v.x = (g.boxW - w) / 2
      v.y = h > room ? VIEW_TOP : VIEW_TOP + (room - h) / 2
    } else {
      // never lose the plan completely
      v.x = Math.min(g.boxW - 70, Math.max(70 - w, v.x))
      v.y = Math.min(g.boxH - 70, Math.max(70 - h, v.y))
    }
    svg.setAttribute('width', String(w))
    svg.setAttribute('height', String(h))
    svg.style.transform = `translate(${v.x}px, ${v.y}px)`
  }, [])
  const zoomAt = useCallback(
    (factor: number, fx: number, fy: number) => {
      apply() // settles the automatic centring before the first manual change
      const v = view.current
      const g = geo.current
      const z1 = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
      if (z1 === v.zoom) return
      const s0 = g.fit * v.zoom
      const s1 = g.fit * z1
      v.x = fx - ((fx - v.x) / s0) * s1
      v.y = fy - ((fy - v.y) / s0) * s1
      v.zoom = z1
      v.auto = false
      apply()
    },
    [apply],
  )
  const centre = () => ({ x: geo.current.boxW / 2, y: VIEW_TOP + (geo.current.boxH - VIEW_TOP - VIEW_BOTTOM) / 2 })
  const resetView = useCallback(() => {
    view.current = { zoom: 1, x: 0, y: 0, auto: true }
    apply()
  }, [apply])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const pts = new Map<number, { x: number; y: number }>()
    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    // a station dragged to another place of the plan is pinned there
    let drag: { id: string; pointer: number; x0: number; y0: number; moved: boolean } | null = null
    let frame = 0
    let latest: { x: number; y: number } | null = null
    const stationOf = (t: EventTarget | null) => (t as Element | null)?.closest?.('[data-station]')?.getAttribute('data-station') ?? null
    const toPlan = (e: { clientX: number; clientY: number }) => {
      const pc = planRef.current
      const svg = svgRef.current
      if (!pc || !svg) return null
      const r = svg.getBoundingClientRect()
      const sx = pc.vx + ((e.clientX - r.left) / r.width) * pc.mapW
      const sy = pc.vy + ((e.clientY - r.top) / r.height) * pc.totalH
      return { x: Math.round((sx - PAD) / pc.U + pc.minX - pc.offset.x), y: Math.round((sy - PAD) / pc.U + pc.minY - pc.offset.y) }
    }
    const down = (e: PointerEvent) => {
      const sid = stationOf(e.target)
      if (sid && pts.size === 0) {
        drag = { id: sid, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false }
        el.setPointerCapture?.(e.pointerId)
        return
      }
      pts.set(e.pointerId, local(e))
      el.setPointerCapture?.(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (drag && drag.pointer === e.pointerId) {
        if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return
        if (!drag.moved) {
          useEditor.getState().checkpoint()
          drag.moved = true
        }
        latest = toPlan(e)
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0
            if (drag && latest) useEditor.getState().pinStation(drag.id, latest)
          })
        }
        return
      }
      const prev = pts.get(e.pointerId)
      if (!prev) return
      const cur = local(e)
      if (pts.size === 1) {
        apply()
        const v = view.current
        v.x += cur.x - prev.x
        v.y += cur.y - prev.y
        v.auto = false
        apply()
      } else if (pts.size === 2) {
        const [a, b] = [...pts.entries()]
        const other = a[0] === e.pointerId ? b[1] : a[1]
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y)
        const d1 = Math.hypot(cur.x - other.x, cur.y - other.y)
        const m0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 }
        const m1 = { x: (cur.x + other.x) / 2, y: (cur.y + other.y) / 2 }
        if (d0 > 4 && d1 > 4) zoomAt(d1 / d0, m0.x, m0.y)
        const v = view.current
        v.x += m1.x - m0.x
        v.y += m1.y - m0.y
        v.auto = false
        apply()
      }
      pts.set(e.pointerId, cur)
    }
    const up = (e: PointerEvent) => {
      if (drag && drag.pointer === e.pointerId) {
        cancelAnimationFrame(frame)
        frame = 0
        if (drag.moved && latest) useEditor.getState().pinStation(drag.id, latest)
        drag = null
        latest = null
        return
      }
      pts.delete(e.pointerId)
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = local(e)
      // a trackpad pinch arrives as ctrl + wheel with small steps
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y)
    }
    const dbl = (e: MouseEvent) => {
      // the pointer is captured by the plan, so look at what lies under it
      const under = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.closest('[data-station]'))
      const sid = under?.closest('[data-station]')?.getAttribute('data-station') ?? null
      if (sid) {
        useEditor.getState().unpinStation(sid)
        return
      }
      const p = local(e)
      if (view.current.zoom > 1.3) resetView()
      else zoomAt(2.4, p.x, p.y)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('dblclick', dbl)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('dblclick', dbl)
    }
  }, [hasStations, apply, zoomAt, resetView])

  // the map turned into a schematic plan (stations on a grid, every connection at 0/45/90 degrees)
  const sch = useMemo(() => schematize(doc), [doc.stations, doc.lines]) // eslint-disable-line react-hooks/exhaustive-deps
  const pd = sch.doc
  const plan = useMemo(() => {
    const stations = Object.values(pd.stations)
    if (!stations.length) return null
    const types = effectiveTypes(pd)
    const xs = stations.map((s) => s.x)
    const ys = stations.map((s) => s.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const spanX = Math.max(...xs) - minX
    const spanY = Math.max(...ys) - minY
    const U = Math.min(MAX_U, Math.max(MIN_U, TARGET_W / Math.max(spanX, spanY, 1)))
    const TOP = 0
    const px = (x: number) => (x - minX) * U + PAD
    const py = (y: number) => (y - minY) * U + PAD + TOP

    // Bundled lines: lanes sit one stroke width + breathing room apart
    const gap = 8 / U // the lines of a bundle lie directly side by side
    const paths = layoutLines(pd, gap)
    const lines = Object.values(pd.lines).map((l) => {
      const pts = (paths[l.id] ?? []).map((p) => ({ x: px(p.x), y: py(p.y) }))
      return { line: l, pts, d: pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') }
    })

    // Station marks in the style of the Berlin plan: a tick across the line where one line stops, a capsule across
    // the bundle where several stop (lines that cross at an angle keep the round marker)
    const marks: Record<string, { kind: 'tick' | 'capsule'; cx: number; cy: number; nx: number; ny: number; t0: number; t1: number }> = {}
    for (const st of stations) {
      const c = { x: px(st.x), y: py(st.y) }
      const hits: { q: { x: number; y: number }; tx: number; ty: number }[] = []
      for (const { line, pts } of lines) {
        if (!stopsAt(line, st.id) || pts.length < 2) continue
        let best = Infinity
        let hit: (typeof hits)[number] | null = null
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i]
          const b = pts[i + 1]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const l2 = dx * dx + dy * dy || 1
          const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2))
          const q = { x: a.x + dx * t, y: a.y + dy * t }
          const d = Math.hypot(q.x - c.x, q.y - c.y)
          if (d < best) {
            best = d
            const len = Math.sqrt(l2)
            hit = { q, tx: dx / len, ty: dy / len }
          }
        }
        if (hit) hits.push(hit)
      }
      if (!hits.length || types[st.id] === 'hauptbahnhof' || types[st.id] === 'airport') continue
      // all lines must run the same way through the station (either direction)
      const ref = hits[0]
      if (hits.some((h) => Math.abs(h.tx * ref.tx + h.ty * ref.ty) < 0.94)) continue
      const nx = -ref.ty
      const ny = ref.tx
      const offs = hits.map((h) => (h.q.x - c.x) * nx + (h.q.y - c.y) * ny)
      marks[st.id] = { kind: hits.length > 1 || types[st.id] === 'interchange' ? 'capsule' : 'tick', cx: c.x, cy: c.y, nx, ny, t0: Math.min(...offs), t1: Math.max(...offs) }
    }

    // Line badges at both termini, pushed away from the line direction
    const badges: { key: string; x: number; y: number; w: number; name: string; color: string; r: number }[] = []
    for (const { line, pts } of lines) {
      if (pts.length < 2) continue
      const w = Math.max(34, line.name.length * 10 + 16)
      const ends: [number, number][] = [
        [0, 1],
        [pts.length - 1, pts.length - 2],
      ]
      ends.forEach(([a, b], k) => {
        const dx = pts[a].x - pts[b].x
        const dy = pts[a].y - pts[b].y
        const len = Math.hypot(dx, dy) || 1
        const station = pd.stations[line.stations[a === 0 ? 0 : line.stations.length - 1]]
        const dist = (station ? markerRadius(types[station.id]) : 10) + 20
        badges.push({
          key: `${line.id}-${k}`,
          x: pts[a].x + (dx / len) * dist,
          y: pts[a].y + (dy / len) * dist,
          w,
          name: line.name,
          color: line.color,
          r: Math.min(OPERATORS[line.operator].badgeRadius, 10),
        })
      })
    }

    // Labels avoid tracks and badges
    const obstacles: LabelRect[] = badges.map((b) => ({ x: b.x - b.w / 2 - 2, y: b.y - 13, w: b.w + 4, h: 26 }))
    for (const { pts } of lines) {
      for (let i = 0; i < pts.length - 1; i++) {
        const steps = Math.max(1, Math.ceil(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) / 6))
        for (let k = 0; k <= steps; k++) {
          obstacles.push({
            x: pts[i].x + ((pts[i + 1].x - pts[i].x) * k) / steps - 5,
            y: pts[i].y + ((pts[i + 1].y - pts[i].y) * k) / steps - 5,
            w: 10,
            h: 10,
          })
        }
      }
    }
    const labels = placeLabels(
      stations.filter((st) => labelHolder(pd, st.id) === st.id).map((st) => ({
        stationId: st.id,
        text: st.name,
        cx: px(st.x),
        cy: py(st.y),
        radius: markerRadius(types[st.id]),
        fontSize: FONT,
      })),
      obstacles,
    )

    // Crop the canvas to what is actually drawn
    let bx0 = Infinity
    let by0 = Infinity
    let bx1 = -Infinity
    let by1 = -Infinity
    const grow = (x0: number, y0: number, x1: number, y1: number) => {
      bx0 = Math.min(bx0, x0)
      by0 = Math.min(by0, y0)
      bx1 = Math.max(bx1, x1)
      by1 = Math.max(by1, y1)
    }
    for (const st of stations) grow(px(st.x) - 20, py(st.y) - 20, px(st.x) + 20, py(st.y) + 20)
    for (const l of labels) grow(l.rect.x, l.rect.y, l.rect.x + l.rect.w, l.rect.y + l.rect.h)
    for (const b of badges) grow(b.x - b.w / 2, b.y - 12, b.x + b.w / 2, b.y + 12)
    for (const { pts } of lines) for (const p of pts) grow(p.x - 8, p.y - 8, p.x + 8, p.y + 8)
    const M = 36
    const HEAD = 84
    const contentW = bx1 - bx0 + M * 2
    const vw = Math.max(contentW, 380)
    const vx = bx0 - M - (vw - contentW) / 2
    const vy = by0 - M - HEAD
    const vh = by1 - by0 + M * 2 + HEAD
    const legendH = Object.keys(pd.lines).length ? 56 + Object.keys(pd.lines).length * 34 : 0
    return { stations, types, marks, px, py, lines, badges, labels, vx, vy, mapW: vw, mapH: vh, legendH, U, minX, minY }
  }, [pd])

  // sizes the plan and puts it where the user left it (after every render: the box size or the plan may have changed)
  useLayoutEffect(() => {
    apply()
  })

  function serialize() {
    const svg = svgRef.current!.cloneNode(true) as SVGSVGElement
    svg.removeAttribute('style')
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    if (plan) {
      svg.setAttribute('width', String(plan.mapW))
      svg.setAttribute('height', String(plan.mapH + plan.legendH))
    }
    return new XMLSerializer().serializeToString(svg)
  }

  function exportSvg() {
    downloadBlob(new Blob([serialize()], { type: 'image/svg+xml' }), `${doc.name}-netzplan.svg`)
  }

  function exportPng() {
    if (!plan) return
    const w = plan.mapW
    const h = plan.mapH + plan.legendH
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = w * 2
      c.height = h * 2
      const ctx = c.getContext('2d')!
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0, w, h)
      c.toBlob((b) => b && downloadBlob(b, `${doc.name}-netzplan.png`))
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialize())
  }

  if (!plan) {
    return (
      <div ref={wrapRef} className="grid h-full place-items-center px-10 text-center">
        <div>
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-white/8 text-white/70">
            <Icon name="plan" size={28} />
          </div>
          <div className="text-lg font-bold">Noch kein Netz</div>
          <p className="mt-1 text-sm text-white/55">Setze auf der Karte Stationen und verbinde sie zu Linien, dann entsteht hier dein Netzplan.</p>
        </div>
      </div>
    )
  }

  const { mapW, mapH, legendH, vx, vy } = plan
  const totalH = mapH + legendH
  // fit to the width; on landscape screens (desktop) the whole plan also has to fit in the height
  const widthFit = box.w > 0 ? Math.min((box.w - 24) / mapW, 1.6) : 1
  const heightFit = box.w > box.h && box.h > 300 ? (box.h - 214) / totalH : Infinity
  const fit = Math.max(0.2, Math.min(widthFit, heightFit))
  const lineList = Object.values(doc.lines)
  planRef.current = { U: plan.U, minX: plan.minX, minY: plan.minY, vx, vy, mapW, totalH, offset: sch.offset }
  const anyPin = Object.values(doc.stations).some((s) => s.planPin)
  geo.current = { mapW, totalH, fit, boxW: box.w, boxH: box.h }

  return (
    <div className="absolute inset-0">
      <div ref={wrapRef} className="relative h-full touch-none select-none overflow-hidden" style={{ touchAction: 'none', cursor: 'grab', background: `linear-gradient(180deg, ${T.bgA}, ${T.bgB})` }}>
        <div>
          <svg
            ref={svgRef}
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`${vx} ${vy} ${mapW} ${totalH}`}
            style={{ position: 'absolute', left: 0, top: 0, display: 'block', fontFamily: SANS, borderRadius: 24, boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6)', transformOrigin: '0 0', willChange: 'transform' }}
          >
            <defs>
              <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={T.bgA} />
                <stop offset="1" stopColor={T.bgB} />
              </linearGradient>
              <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ffe27a" />
                <stop offset="1" stopColor="#ffa928" />
              </linearGradient>
              <linearGradient id="hbf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#3a63ff" />
                <stop offset="1" stopColor="#1c2f9e" />
              </linearGradient>
              <linearGradient id="air" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2fb8ff" />
                <stop offset="1" stopColor="#0a5fbf" />
              </linearGradient>
              <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
            </defs>
            <rect x={vx} y={vy} width={mapW} height={totalH} fill="url(#bg)" />

            <text x={vx + 30} y={vy + 50} fontSize={30} fontWeight={700} fill={T.title} letterSpacing={-0.8}>
              {doc.name}
            </text>
            <text x={vx + 30} y={vy + 76} fontSize={13} fill={T.sub} letterSpacing={1.4}>
              LINIENNETZ · {plan.stations.length} STATIONEN · {lineList.length} LINIEN
            </text>

            {/* Tracks */}
            {(['glow', 'casing', 'colour'] as const).map((layer) => (
              <g key={layer} strokeLinecap="round" strokeLinejoin="round" fill="none">
                {plan.lines.map(({ line, d }, i) => {
                  const w = OPERATORS[line.operator].width + 1.4
                  const dl = 0.15 + i * 0.18
                  const style = { animationDelay: `${dl}s`, animationDuration: '1.3s' }
                  if (layer === 'glow') {
                    return T.glow ? <path key={line.id} className="draw-line" d={d} stroke={line.color} strokeWidth={w + 8} opacity={0.3} filter="url(#soft)" pathLength={1} strokeDasharray="1 2" style={style} /> : null
                  }
                  // one outline around the whole bundle: every line gets its casing before any colour is drawn
                  return <path key={line.id} className="draw-line" d={d} stroke={layer === 'casing' ? T.casing : line.color} strokeWidth={layer === 'casing' ? w + 5 : w} pathLength={1} strokeDasharray="1 2" style={style} />
                })}
              </g>
            ))}

            {/* Linked stations (a tram stop next to a station): a short walkway between them */}
            {(doc.links ?? []).map(([la, lb]) => {
              const A = plan.stations.find((s) => s.id === la)
              const B = plan.stations.find((s) => s.id === lb)
              if (!A || !B) return null
              const x1 = plan.px(A.x)
              const y1 = plan.py(A.y)
              const x2 = plan.px(B.x)
              const y2 = plan.py(B.y)
              return (
                <g key={`${la}-${lb}`} strokeLinecap="round">
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={T.casing} strokeWidth={9} />
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={T.ink} strokeWidth={4.5} strokeDasharray="1 7" />
                </g>
              )
            })}

            {/* Stations */}
            {plan.stations.map((st, idx) => {
              const delay = 0.1 + (idx + 1) * 0.035
              return (
                <g key={st.id} className="pop-dot" data-station={st.id} style={{ animationDelay: `${0.7 + delay}s`, cursor: 'grab' }}>
                  <circle cx={plan.px(st.x)} cy={plan.py(st.y)} r={20} fill="transparent" />
                  {doc.stations[st.id]?.planPin && <circle cx={plan.px(st.x)} cy={plan.py(st.y)} r={17} fill="none" stroke={T.ink === '#ffffff' ? '#fff' : '#c8ff3a'} strokeWidth={2} strokeDasharray="4 4" />}
                  {plan.marks[st.id] ? <StopMark m={plan.marks[st.id]} ink={T.ink} fill={T.fill} /> : <Symbol type={plan.types[st.id]} x={plan.px(st.x)} y={plan.py(st.y)} ink={T.ink} fill={T.fill} />}
                </g>
              )
            })}

            {/* Line badges at the termini */}
            {plan.badges.map((b, i) => (
              <g key={b.key} className="pop-dot" style={{ animationDelay: `${1.1 + i * 0.05}s` }}>
                <rect x={b.x - b.w / 2} y={b.y - 11} width={b.w} height={22} rx={b.r} fill={b.color} stroke={T.casing} strokeWidth={2} />
                <text x={b.x} y={b.y + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#fff" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                  {b.name}
                </text>
              </g>
            ))}

            {/* Station names */}
            {plan.labels.map((l, i) => (
              <motion.text
                key={l.stationId}
                x={l.tx}
                y={l.ty}
                textAnchor={l.anchor}
                fontSize={FONT}
                fontWeight={600}
                fill={T.label}
                stroke={T.halo}
                strokeWidth={4}
                strokeLinejoin="round"
                paintOrder="stroke"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 + i * 0.03, duration: 0.4 }}
              >
                {l.text}
              </motion.text>
            ))}

            {/* Legend */}
            {lineList.length > 0 && (
              <g transform={`translate(${vx + 30}, ${vy + mapH + 6})`}>
                <text y={0} fontSize={11} fontWeight={700} fill={T.muted} letterSpacing={1.6}>
                  LINIEN
                </text>
                {lineList.map((l, i) => {
                  const first = doc.stations[l.stations[0]]?.name
                  const last = doc.stations[l.stations[l.stations.length - 1]]?.name
                  const w = Math.max(40, l.name.length * 10 + 16)
                  return (
                    <g key={l.id} transform={`translate(0, ${18 + i * 34})`}>
                      <rect width={w} height={24} rx={Math.min(OPERATORS[l.operator].badgeRadius, 11)} fill={l.color} />
                      <text x={w / 2} y={17} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff">
                        {l.name}
                      </text>
                      <text x={w + 14} y={17} fontSize={14} fill={T.label}>
                        {OPERATORS[l.operator].label}
                        {first && last && first !== last ? ` · ${first} – ${last}` : ''}
                      </text>
                    </g>
                  )
                })}
              </g>
            )}
            <text x={vx + mapW - 30} y={vy + totalH - 16} textAnchor="end" fontSize={11} fill={T.muted} letterSpacing={1.4}>
              LINEFORGE
            </text>
          </svg>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-[98px] right-3 z-10 flex flex-col gap-2">
        {[
          { icon: 'zoomin' as const, on: () => zoomAt(1.4, centre().x, centre().y), label: 'Vergrößern' },
          { icon: 'zoomout' as const, on: () => zoomAt(1 / 1.4, centre().x, centre().y), label: 'Verkleinern' },
          { icon: 'fit' as const, on: resetView, label: 'Einpassen' },
          ...(anyPin ? [{ icon: 'refresh' as const, on: () => useEditor.getState().clearPins(), label: 'Plan neu berechnen' }] : []),
          { icon: (theme === 'dark' ? 'sun' : 'moon') as 'sun' | 'moon', on: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), label: 'Hell/Dunkel' },
          { icon: 'download' as const, on: exportSvg, label: 'SVG exportieren' },
          { icon: 'image' as const, on: exportPng, label: 'PNG exportieren' },
        ].map((b) => (
          <button key={b.label} onClick={b.on} aria-label={b.label} className="glass pointer-events-auto grid h-11 w-11 place-items-center rounded-full active:scale-90">
            <Icon name={b.icon} size={19} />
          </button>
        ))}
      </div>
    </div>
  )
}
