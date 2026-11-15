import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react'
import { lineWidthPx } from './trains2d'
import { legCurve } from '../model/geo'
import { nearestLeg, nearestLegAny } from '../model/lineEdit'
import { findBridges, makeSampler } from '../model/terrainField'
import { WATER } from '../model/types'
import { effectiveTypes } from '../plan/glyphs'
import { layoutLines } from '../plan/layout'
import { useEditor } from '../store/editorStore'
import type { Tool } from '../store/editorStore'
import { drawPoi, drawPoiReach, POI_STYLE } from './drawPoi'
import { useTheme, getAccent } from '../ui/theme'
import { penActive, pointerRole, usePen } from '../ui/pen'
import { useZoneLook } from './zoneLook'
import { drawStation } from './drawStation'
import { buildZoneGfx, drawZoneLabels } from './zoneGfx'
import { drawWaterLabels } from './waterLabels'
import { buildTerrainPaths } from './terrainRender'
import { drawTerrainCached, newTerrainCache } from './terrainCache'
import TrainLayer from './TrainLayer'
import { useDockFade } from '../ui/dockFade'
import { poiRadius, poiStations } from '../model/poi'
import { labelHolder } from '../model/links'

const isPaintTool = (t: Tool) => t === 'water' || t === 'erase' || t === 'city' || t === 'suburb' || t === 'airport' || t === 'forest' || t === 'mountain' || t === 'zoneErase'
const BRUSH_TINT = {
  water: ['rgba(90,190,255,0.18)', 'rgba(150,220,255,0.9)'],
  erase: ['rgba(170,230,120,0.18)', 'rgba(200,245,150,0.9)'],
  city: ['rgba(190,196,205,0.3)', 'rgba(235,239,244,0.95)'],
  suburb: ['rgba(205,210,217,0.3)', 'rgba(245,247,250,0.95)'],
  airport: ['rgba(70,76,86,0.4)', 'rgba(200,206,214,0.95)'],
  zoneErase: ['rgba(255,120,120,0.2)', 'rgba(255,170,170,0.95)'],
} as const

type Gesture = 'none' | 'pan' | 'paint' | 'pinch' | 'tap' | 'wp' | 'draw' | 'stationDrag'

interface Anim {
  from: number
  to: number
  t0: number
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)
const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  const x = Math.min(1, Math.max(0, t)) - 1
  return 1 + c3 * x * x * x + c1 * x * x
}

function polylineLength(pts: { x: number; y: number }[]) {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return len
}

/**
 * The control points of a line that get a handle on screen: when they sit very close together (a curve taken over from an
 * old route has many) only every few are shown, so the handles stay big enough to grab.
 */
function visibleHandles(line: { via?: { x: number; y: number }[][] }, s: number) {
  const out: { k: number; j: number; p: { x: number; y: number } }[] = []
  const minGap = 18 / s // cells
  line.via?.forEach((list, k) => {
    let last: { x: number; y: number } | null = null
    list.forEach((p, j) => {
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < minGap && j < list.length - 1) return
      out.push({ k, j, p })
      last = p
    })
  })
  return out
}

/** Space reserved for floating UI so the fitted map is never hidden behind it. */
export interface Insets {
  top: number
  bottom: number
}

export default function MapEditor({ insets }: { insets: Insets }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const view = useRef({ ox: 0, oy: 0, s: 6 })
  const userMoved = useRef(false)
  const fitMode = useRef<'content' | 'all'>('content')
  const needsFit = useRef(true)
  const lastTick = useRef(0)
  const drawRef = useRef<() => void>(() => {})
  const insetsRef = useRef(insets)
  insetsRef.current = insets
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  /** the pen that is on the screen right now (pen mode: fingers are ignored meanwhile, like a resting palm) */
  const penId = useRef<number | null>(null)
  const hover = useRef<{ x: number; y: number } | null>(null)
  const gesture = useRef<{
    kind: Gesture
    startX: number
    startY: number
    lastCell: { x: number; y: number } | null
    lastDist: number
  }>({ kind: 'none', startX: 0, startY: 0, lastCell: null, lastDist: 0 })

  if (import.meta.env.DEV) (window as unknown as { __map: unknown }).__map = { gesture, pointers, view, penId }

  // Animation bookkeeping (kept out of React state: it changes every frame)
  const lineAnim = useRef(new Map<string, Anim>())
  const stationBorn = useRef(new Map<string, number>())
  const seeded = useRef(false)
  const raf = useRef(0)
  const cacheRef = useRef(newTerrainCache())
  const settle = useRef(0)

  const doc = useEditor((s) => s.doc)
  const selectedStationId = useEditor((s) => s.selectedStationId)
  const activeLineId = useEditor((s) => s.activeLineId)
  const tool = useEditor((s) => s.tool)
  const brush = useEditor((s) => s.brush)
  const fitTick = useEditor((s) => s.fitTick)

  // Deferred so a fast brush stroke stays responsive on slow phones while the coastline catches up
  const deferredTerrain = useDeferredValue(doc.terrain)
  const terrainPaths = useMemo(() => buildTerrainPaths(deferredTerrain, doc.size), [deferredTerrain, doc.size])
  const deferredZones = useDeferredValue(doc.zoneGrid)
  const zoneGfx = useMemo(() => buildZoneGfx({ ...doc, zoneGrid: deferredZones }), [deferredZones, doc.zones, doc.size]) // eslint-disable-line react-hooks/exhaustive-deps
  const linePaths = useMemo(() => layoutLines(doc, 0.82, { source: 'geo', smooth: 10 }), [doc.lines, doc.stations]) // eslint-disable-line react-hooks/exhaustive-deps
  const types = useMemo(() => effectiveTypes(doc), [doc])
  const bridges = useMemo(() => {
    const sample = makeSampler(terrainPaths.field, doc.size)
    const out: Record<string, ReturnType<typeof findBridges>> = {}
    for (const [id, pts] of Object.entries(linePaths)) out[id] = findBridges(pts, sample)
    return out
  }, [terrainPaths, linePaths, doc.size])
  const selectedWaypoint = useEditor((s) => s.selectedWaypoint)
  const selectedLeg = useEditor((s) => s.selectedLeg)
  const selectedPoiId = useEditor((s) => s.selectedPoiId)
  const selectedWaterId = useEditor((s) => s.selectedWaterId)
  const wpDrag = useRef<{ lineId: string; k: number; j: number; moved: boolean } | null>(null)
  /** the stroke being drawn (lattice coordinates); `moved` once the finger has left the tap radius */
  const stroke = useRef<{ pts: { x: number; y: number }[]; moved: boolean } | null>(null)
  const stationDrag = useRef<{ id: string; moved: boolean } | null>(null)
  /** short message on the map (for example when a stroke fitted nowhere) */
  const flashMsg = useRef<{ text: string; until: number } | null>(null)

  /** Frame the network (or a comfortable close-up of an empty map), or the whole map. */
  const fit = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    const { top, bottom } = insetsRef.current
    const availH = Math.max(100, h - top - bottom)
    const whole = (Math.min(w, availH) / doc.size) * 0.94
    const sts = Object.values(doc.stations)
    let s = whole
    let cx = doc.size / 2
    let cy = doc.size / 2
    if (fitMode.current === 'content') {
      if (!sts.length) {
        s = Math.max(whole, w / 42)
      } else {
        const xs = sts.map((q) => q.x)
        const ys = sts.map((q) => q.y)
        const spanX = Math.max(Math.max(...xs) - Math.min(...xs) + 22, 24)
        const spanY = Math.max(Math.max(...ys) - Math.min(...ys) + 14, 24)
        s = Math.min(40, Math.max(whole, Math.min((w * 0.94) / spanX, (availH * 0.94) / spanY)))
        cx = (Math.min(...xs) + Math.max(...xs)) / 2 + 0.5
        cy = (Math.min(...ys) + Math.max(...ys)) / 2 + 0.5
      }
    }
    view.current = { s, ox: w / 2 - cx * s, oy: top + availH / 2 - cy * s }
  }, [doc.size, doc.stations])

  const accent = useTheme((s) => s.accent) // a new accent colour repaints the map
  const scheme = useTheme((s) => s.scheme) // so does light / dark (the backdrop around the map)
  const zoneWeight = useZoneLook((s) => s.weight) // and the look of the painted areas
  const zoneOutline = useZoneLook((s) => s.outline)
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    if (needsFit.current && w > 0) {
      fit()
      needsFit.current = false
    }

    const ctx = canvas.getContext('2d')!
    const now = performance.now()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Backdrop
    const bg = ctx.createRadialGradient(w / 2, h * 0.4, 20, w / 2, h * 0.4, Math.max(w, h) * 0.9)
    bg.addColorStop(0, scheme === 'light' ? '#f3f6fa' : '#111a24')
    bg.addColorStop(1, scheme === 'light' ? '#d9e0ea' : '#06080c')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    const v = view.current
    const { ox, oy, s } = v
    drawTerrainCached(ctx, v, doc.size, terrainPaths, w, h, zoneGfx, dpr, cacheRef.current, () => {
      // a zoom changed the picture: draw it sharp once the gesture rests
      window.clearTimeout(settle.current)
      settle.current = window.setTimeout(() => {
        cacheRef.current.force = true
        requestAnimationFrame(draw)
      }, 140)
    })
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawZoneLabels(ctx, v, zoneGfx)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawWaterLabels(ctx, v, doc, tool === 'waterName' ? selectedWaterId : null)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let animating = false

    // --- Lines (casing + glow + colour), animated draw-in ---------------------
    for (const line of Object.values(doc.lines)) {
      const pts = linePaths[line.id]
      if (!pts || pts.length < 2) continue
      const total = polylineLength(pts)
      let a = lineAnim.current.get(line.id)
      if (wpDrag.current?.moved) {
        // while a waypoint is being dragged the route changes every frame: no draw-in animation
        a = { from: total, to: total, t0: now - 1000 }
        lineAnim.current.set(line.id, a)
      } else if (!a) {
        a = { from: total, to: total, t0: now - 1000 }
        if (seeded.current) a = { from: 0, to: total, t0: now }
        lineAnim.current.set(line.id, a)
      } else if (Math.abs(a.to - total) > 0.6) {
        const cur = a.from + (a.to - a.from) * easeOut((now - a.t0) / 520)
        a = { from: cur, to: total, t0: now }
        lineAnim.current.set(line.id, a)
      } else if (Math.abs(a.to - total) > 1e-6) {
        // small shifts (e.g. lane changes in a bundle) are not worth an animation
        a = { from: total, to: total, t0: now - 1000 }
        lineAnim.current.set(line.id, a)
      }
      const p = easeOut((now - a.t0) / 520)
      const shown = a.from + (a.to - a.from) * p
      if (p < 1) animating = true
      if (shown <= 0.001) continue

      const w0 = lineWidthPx(line.operator, s)
      const path = new Path2D()
      pts.forEach((pt, i) => {
        const px = ox + (pt.x + 0.5) * s
        const py = oy + (pt.y + 0.5) * s
        if (i === 0) path.moveTo(px, py)
        else path.lineTo(px, py)
      })
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.setLineDash(shown >= total - 1e-6 ? [] : [shown * s, 1e9])
      ctx.globalAlpha = tool === 'line' && activeLineId && activeLineId !== line.id ? 0.5 : 1
      // soft coloured glow: two wide translucent strokes (a blurred shadow costs far too much on phones)
      const ga = ctx.globalAlpha
      ctx.strokeStyle = line.color
      ctx.globalAlpha = ga * 0.12
      ctx.lineWidth = w0 * 2.6
      ctx.stroke(path)
      ctx.globalAlpha = ga * 0.2
      ctx.lineWidth = w0 * 1.7
      ctx.stroke(path)
      ctx.globalAlpha = ga
      // dark casing
      ctx.strokeStyle = 'rgba(5,8,12,0.55)'
      ctx.lineWidth = w0 + 3
      ctx.stroke(path)
      // bridges: a pale deck outline where the track crosses water
      const runs = bridges[line.id]
      if (runs?.length && shown >= total - 1e-6) {
        ctx.save()
        ctx.setLineDash([])
        ctx.lineCap = 'butt'
        ctx.strokeStyle = 'rgba(236,241,248,0.96)'
        ctx.lineWidth = w0 + 5
        for (const run of runs) {
          const rp = new Path2D()
          run.pts.forEach((pt, i) => {
            const px = ox + (pt.x + 0.5) * s
            const py = oy + (pt.y + 0.5) * s
            if (i === 0) rp.moveTo(px, py)
            else rp.lineTo(px, py)
          })
          ctx.stroke(rp)
        }
        ctx.restore()
      }
      // colour on top for a crisp edge
      ctx.strokeStyle = line.color
      ctx.lineWidth = w0
      ctx.stroke(path)
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'
      ctx.lineWidth = Math.max(1, w0 * 0.22)
      ctx.stroke(path)
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }

    // --- The stretch chosen with the stretch tool --------------------------------
    const sl = tool === 'legRebuild' ? selectedLeg : null
    const slLine = sl ? doc.lines[sl.lineId] : undefined
    if (sl && slLine && sl.leg < slLine.stations.length - 1) {
      const curve = legCurve(doc, slLine, sl.leg)
      if (curve.length > 1) {
        ctx.save()
        ctx.beginPath()
        curve.forEach((q, i) => {
          const px = ox + (q.x + 0.5) * s
          const py = oy + (q.y + 0.5) * s
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(5,8,12,0.7)'
        ctx.lineWidth = lineWidthPx(slLine.operator, s) + 9
        ctx.stroke()
        ctx.strokeStyle = getAccent().hex
        ctx.lineWidth = lineWidthPx(slLine.operator, s) + 5
        ctx.setLineDash([10, 7])
        ctx.stroke()
        ctx.restore()
      }
    }

    // --- Waypoints of the line being edited -----------------------------------
    const al = tool === 'line' && activeLineId ? doc.lines[activeLineId] : undefined
    if (al) {
      const n = al.stations.length
      const tail = al.via?.[n - 1] ?? []
      const last = n ? doc.stations[al.stations[n - 1]] : undefined
      if (last && tail.length) {
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(ox + (last.x + 0.5) * s, oy + (last.y + 0.5) * s)
        for (const p of tail) ctx.lineTo(ox + (p.x + 0.5) * s, oy + (p.y + 0.5) * s)
        ctx.setLineDash([7, 7])
        ctx.lineCap = 'round'
        ctx.strokeStyle = al.color
        ctx.globalAlpha = 0.85
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.restore()
      }
      for (const { k, j, p } of visibleHandles(al, s)) {
        {
          const px = ox + (p.x + 0.5) * s
          const py = oy + (p.y + 0.5) * s
          const sel = selectedWaypoint?.lineId === al.id && selectedWaypoint.k === k && selectedWaypoint.j === j
          const rr = sel ? 9 : 7
          ctx.save()
          ctx.translate(px, py)
          ctx.rotate(Math.PI / 4)
          ctx.shadowColor = sel ? getAccent().hex : 'rgba(0,0,0,0.5)'
          ctx.shadowBlur = sel ? 14 : 6
          ctx.fillStyle = '#fff'
          ctx.strokeStyle = sel ? getAccent().hex : al.color
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.roundRect(-rr * 0.75, -rr * 0.75, rr * 1.5, rr * 1.5, 2.5)
          ctx.fill()
          ctx.shadowColor = 'transparent'
          ctx.stroke()
          ctx.restore()
        }
      }
    }

    // --- The stroke being drawn --------------------------------------------------------
    const sk = stroke.current
    if (sk && sk.moved && sk.pts.length > 1) {
      const color = (activeLineId && doc.lines[activeLineId]?.color) || '#ffffff'
      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      sk.pts.forEach((q, i) => {
        const px = ox + (q.x + 0.5) * s
        const py = oy + (q.y + 0.5) * s
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.strokeStyle = 'rgba(5,8,12,0.6)'
      ctx.lineWidth = 9
      ctx.stroke()
      ctx.strokeStyle = color
      ctx.lineWidth = 5.5
      ctx.stroke()
      // the stations the stroke would join
      const reach = Math.max(1.2, 26 / s)
      for (const q of [sk.pts[0], sk.pts[sk.pts.length - 1]]) {
        let best: { x: number; y: number } | null = null
        let bd = reach
        for (const st of Object.values(doc.stations)) {
          const d = Math.hypot(st.x - q.x, st.y - q.y)
          if (d <= bd) {
            bd = d
            best = st
          }
        }
        if (best) {
          ctx.beginPath()
          ctx.arc(ox + (best.x + 0.5) * s, oy + (best.y + 0.5) * s, 15, 0, Math.PI * 2)
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 3
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    // --- Short message ---------------------------------------------------------------
    const fm = flashMsg.current
    if (fm && fm.until > now) {
      ctx.save()
      ctx.font = "600 14px 'Space Grotesk Variable', system-ui, sans-serif"
      const tw = ctx.measureText(fm.text).width
      const bx = w / 2 - tw / 2 - 14
      const by = insetsRef.current.top + 14
      ctx.fillStyle = 'rgba(8,12,18,0.88)'
      ctx.beginPath()
      ctx.roundRect(bx, by, tw + 28, 34, 12)
      ctx.fill()
      ctx.fillStyle = '#f4f7fa'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(fm.text, bx + 14, by + 17)
      ctx.restore()
      animating = true
    }

    // --- Stations ------------------------------------------------------------
    const r = Math.max(5, Math.min(14, s * 0.5))
    // linked stations (a tram stop next to a station): a dashed walkway between them
    for (const [la, lb] of doc.links ?? []) {
      const A = doc.stations[la]
      const B = doc.stations[lb]
      if (!A || !B) continue
      const ax = ox + (A.x + 0.5) * s
      const ay = oy + (A.y + 0.5) * s
      const bx = ox + (B.x + 0.5) * s
      const by = oy + (B.y + 0.5) * s
      if (Math.max(ax, bx) < -20 || Math.min(ax, bx) > w + 20 || Math.max(ay, by) < -20 || Math.min(ay, by) > h + 20) continue
      ctx.save()
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.strokeStyle = 'rgba(6,10,14,0.85)'
      ctx.lineWidth = Math.max(4, r * 0.8)
      ctx.stroke()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = Math.max(2, r * 0.4)
      ctx.setLineDash([Math.max(3, r * 0.5), Math.max(4, r * 0.7)])
      ctx.stroke()
      ctx.restore()
    }
    const labelRects: { x: number; y: number; w: number; h: number }[] = []
    for (const st of Object.values(doc.stations)) {
      let born = stationBorn.current.get(st.id)
      if (born === undefined) {
        born = seeded.current ? now : now - 2000
        stationBorn.current.set(st.id, born)
      }
      const t = (now - born) / 420
      if (t < 1.4) animating = true
      const k = easeOutBack(t)
      const px = ox + (st.x + 0.5) * s
      const py = oy + (st.y + 0.5) * s
      if (px < -40 || py < -40 || px > w + 40 || py > h + 40) continue
      // ripple on arrival
      const rt = (now - born) / 700
      if (rt > 0 && rt < 1) {
        ctx.beginPath()
        ctx.arc(px, py, r * (1 + rt * 3.2), 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${getAccent().rgb},${0.55 * (1 - rt)})`
        ctx.lineWidth = 2
        ctx.stroke()
      }
      drawStation(ctx, types[st.id] ?? st.type, px, py, r, st.id === selectedStationId, k)
      if (s >= 3 && k > 0.8 && labelHolder(doc, st.id) === st.id) {
        const label = st.name
        const fs = Math.round(Math.min(15, Math.max(11, 9 + s * 0.4)))
        ctx.font = `600 ${fs}px 'Space Grotesk Variable', system-ui, sans-serif`
        const tw = ctx.measureText(label).width
        const lx = px + r * 1.9
        const rect = { x: lx - 2, y: py - fs / 2 - 1, w: tw + 4, h: fs + 2 }
        const clash = labelRects.some((o) => rect.x < o.x + o.w && rect.x + rect.w > o.x && rect.y < o.y + o.h && rect.y + rect.h > o.y)
        if (!clash) {
          labelRects.push(rect)
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          ctx.lineJoin = 'round'
          ctx.lineWidth = 4
          ctx.strokeStyle = 'rgba(6,10,14,0.85)'
          ctx.strokeText(label, lx, py)
          ctx.fillStyle = '#f4f7fa'
          ctx.fillText(label, lx, py)
        }
      }
    }
    seeded.current = true

    // --- Points of interest ----------------------------------------------------
    // the catchment of each one: stations inside it are where people travel from
    for (const poi of doc.pois ?? []) {
      const px = ox + (poi.x + 0.5) * s
      const py = oy + (poi.y + 0.5) * s
      const rr = poiRadius(poi) * s
      if (px + rr < 0 || py + rr < 0 || px - rr > w || py - rr > h) continue
      drawPoiReach(ctx, POI_STYLE[poi.kind].color, px, py, rr, poi.id === selectedPoiId)
      // a thin dotted line to the stations that serve it
      ctx.save()
      ctx.strokeStyle = POI_STYLE[poi.kind].color
      ctx.globalAlpha = poi.id === selectedPoiId ? 0.9 : 0.5
      ctx.lineWidth = 1.6
      ctx.setLineDash([2, 5])
      ctx.lineCap = 'round'
      for (const st of poiStations(doc, poi)) {
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(ox + (st.x + 0.5) * s, oy + (st.y + 0.5) * s)
        ctx.stroke()
      }
      ctx.restore()
    }
    for (const poi of doc.pois ?? []) {
      const px = ox + (poi.x + 0.5) * s
      const py = oy + (poi.y + 0.5) * s
      if (px < -40 || py < -40 || px > w + 40 || py > h + 40) continue
      drawPoi(ctx, poi.kind, px, py, Math.max(6, Math.min(13, s * 0.6)), poi.id === selectedPoiId, s >= 3 ? poi.name : undefined)
    }

    // --- Brush cursor -------------------------------------------------------
    const hv = hover.current
    if (isPaintTool(tool) && hv) {
      const cell = { x: Math.floor((hv.x - ox) / s), y: Math.floor((hv.y - oy) / s) }
      const rad = (brush - 1 + 0.6) * s
      ctx.beginPath()
      ctx.arc(ox + (cell.x + 0.5) * s, oy + (cell.y + 0.5) * s, Math.max(4, rad), 0, Math.PI * 2)
      const tint = BRUSH_TINT[tool as keyof typeof BRUSH_TINT]
      ctx.fillStyle = tint[0]
      ctx.strokeStyle = tint[1]
      ctx.lineWidth = 1.5
      ctx.fill()
      ctx.stroke()
    }

    if (animating) {
      cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(draw)
    }
  }, [doc, terrainPaths, zoneGfx, linePaths, types, bridges, selectedStationId, selectedWaypoint, selectedLeg, selectedPoiId, selectedWaterId, activeLineId, tool, brush, fit, accent, scheme, zoneWeight, zoneOutline])

  useEffect(() => {
    userMoved.current = false
    lineAnim.current.clear()
    stationBorn.current.clear()
    seeded.current = false
  }, [doc.id])

  useEffect(() => {
    draw()
    return () => cancelAnimationFrame(raf.current)
  }, [draw])

  useEffect(() => {
    drawRef.current = draw
  }, [draw])

  // Toolbar "Zentrieren": recentre on the network; when already there, show the whole map.
  useEffect(() => {
    if (fitTick === lastTick.current) return
    lastTick.current = fitTick
    fitMode.current = userMoved.current ? 'content' : fitMode.current === 'content' ? 'all' : 'content'
    userMoved.current = false
    needsFit.current = true
    drawRef.current()
  }, [fitTick])

  // A new city (or changed reserved UI space) frames the view again
  useEffect(() => {
    fitMode.current = 'content'
    userMoved.current = false
    needsFit.current = true
    drawRef.current()
  }, [doc.id, insets.top, insets.bottom])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => {
      if (!userMoved.current) needsFit.current = true
      drawRef.current()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // Wheel zoom (needs a non-passive listener)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015))
      draw()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [draw])

  function zoomAt(px: number, py: number, factor: number) {
    userMoved.current = true
    const v = view.current
    const s = Math.min(70, Math.max(0.5, v.s * factor))
    const k = s / v.s
    v.ox = px - (px - v.ox) * k
    v.oy = py - (py - v.oy) * k
    v.s = s
  }

  const local = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const toCell = (p: { x: number; y: number }) => ({
    x: Math.floor((p.x - view.current.ox) / view.current.s),
    y: Math.floor((p.y - view.current.oy) / view.current.s),
  })

  /** pointer position in lattice coordinates (the centre of a cell is +0.5 on screen, so a station sits at an integer) */
  const toLattice = (p: { x: number; y: number }) => ({
    x: Math.round(((p.x - view.current.ox) / view.current.s - 0.5) * 100) / 100,
    y: Math.round(((p.y - view.current.oy) / view.current.s - 0.5) * 100) / 100,
  })
  const inMap = (c: { x: number; y: number }) => c.x >= 0 && c.y >= 0 && c.x < doc.size && c.y < doc.size

  const zoneId = useRef(0)
  /** when the current brush stroke began: a second finger right after it means "zoom", not "paint" */
  const strokeStart = useRef(0)

  function paintAt(cell: { x: number; y: number }) {
    const st = useEditor.getState()
    const isZone = st.tool === 'city' || st.tool === 'suburb' || st.tool === 'airport' || st.tool === 'forest' || st.tool === 'mountain' || st.tool === 'zoneErase'
    const value = st.tool === 'water' ? WATER : 0
    const g = gesture.current
    // Interpolate between the last and current cell so fast strokes leave no gaps.
    const from = g.lastCell ?? cell
    const steps = Math.max(Math.abs(cell.x - from.x), Math.abs(cell.y - from.y), 1)
    for (let i = 1; i <= steps; i++) {
      const x = Math.round(from.x + ((cell.x - from.x) * i) / steps)
      const y = Math.round(from.y + ((cell.y - from.y) * i) / steps)
      if (isZone) st.paintZone(x, y, zoneId.current)
      else st.paint(x, y, value)
    }
    g.lastCell = cell
  }

  function hitStation(p: { x: number; y: number }) {
    const { ox, oy, s } = view.current
    const maxD = Math.max(20, s * 0.9)
    let best: string | null = null
    let bestD = maxD
    for (const st of Object.values(useEditor.getState().doc.stations)) {
      const d = Math.hypot(ox + (st.x + 0.5) * s - p.x, oy + (st.y + 0.5) * s - p.y)
      if (d < bestD) {
        bestD = d
        best = st.id
      }
    }
    return best
  }

  /** Waypoint handle of the active line under the pointer */
  function hitWaypoint(p: { x: number; y: number }) {
    const st = useEditor.getState()
    const line = st.activeLineId ? st.doc.lines[st.activeLineId] : undefined
    if (!line || st.tool !== 'line') return null
    const { ox, oy, s } = view.current
    let best = null as { lineId: string; k: number; j: number } | null
    let bestD = 20
    for (const { k, j, p: q } of visibleHandles(line, s)) {
      const d = Math.hypot(ox + (q.x + 0.5) * s - p.x, oy + (q.y + 0.5) * s - p.y)
      if (d < bestD) {
        bestD = d
        best = { lineId: line.id, k, j }
      }
    }
    return best
  }

  function hitPoi(p: { x: number; y: number }) {
    const { ox, oy, s } = view.current
    let best: string | null = null
    let bestD = Math.max(22, s * 1.2)
    for (const poi of useEditor.getState().doc.pois ?? []) {
      const d = Math.hypot(ox + (poi.x + 0.5) * s - p.x, oy + (poi.y + 0.5) * s - p.y)
      if (d < bestD) {
        bestD = d
        best = poi.id
      }
    }
    return best
  }

  function flash(text: string) {
    flashMsg.current = { text, until: performance.now() + 2600 }
    draw()
  }

  function handleTap(p: { x: number; y: number }) {
    const st = useEditor.getState()
    if (st.tool === 'waterName') {
      const c = toCell(p)
      st.tapWater(c.x, c.y)
      return
    }
    if (st.tool === 'poi') {
      const hitP = hitPoi(p)
      if (hitP) st.selectPoi(hitP)
      else {
        const c = toCell(p)
        st.addPoi(c.x, c.y)
      }
      return
    }
    const hit = hitStation(p)
    if (st.tool === 'link') {
      // first a station, then the one to link it with (a linked pair is unlinked again the same way)
      const first = st.selectedStationId
      if (!hit) st.selectStation(null)
      else if (first && first !== hit) {
        st.toggleLink(first, hit)
        st.selectStation(null)
      } else st.selectStation(hit)
      return
    }
    if (st.tool === 'legSmooth' || st.tool === 'legRebuild') {
      const near = nearestLegAny(st.doc, toLattice(p), Math.max(1, 22 / view.current.s))
      if (!near) {
        st.selectLeg(null)
        flash('Tippe genau auf eine Strecke zwischen zwei Stationen')
      } else if (st.tool === 'legSmooth') {
        if (!st.smoothLegAt(near.lineId, near.k)) flash('Diese Strecke ist schon glatt')
      } else {
        st.selectLeg({ lineId: near.lineId, leg: near.k })
      }
      return
    }
    if (st.tool === 'station') {
      if (hit) st.selectStation(hit)
      else {
        // a tap on a line (or a crossing of lines) puts the station on the line(s), else on the open ground
        const onLine = st.addStationOnLine(toLattice(p), Math.max(0.9, 14 / view.current.s))
        if (!onLine) {
          const c = toCell(p)
          st.addStation(c.x, c.y)
        }
      }
    } else if (st.tool === 'line') {
      if (st.lineMode === 'draw') {
        // drawing mode: a tap on a station selects it, a tap on the line puts a station there
        st.selectWaypoint(null)
        if (hit) {
          st.selectStation(hit)
          return
        }
        const line = st.activeLineId ? st.doc.lines[st.activeLineId] : undefined
        if (line) {
          const reach = Math.max(0.9, 20 / view.current.s)
          const near = nearestLeg(st.doc, line, toLattice(p))
          if (near && near.dist <= reach) st.splitLeg(line.id, toLattice(p), reach)
          else if (st.selectedStationId) st.selectStation(null)
        } else {
          flash('Wähle erst eine Linie oder lege eine neue an')
        }
      } else if (hit) {
        st.selectStation(hit)
        st.selectWaypoint(null)
        if (st.activeLineId) st.appendToLine(st.activeLineId, hit)
      } else if (st.activeLineId) {
        // tap on open ground: add a control point the line has to pass through
        const c = toLattice(p)
        if (inMap(c)) st.addWaypoint(st.activeLineId, c)
      }
    } else {
      st.selectStation(hit)
    }
  }

  // leaving the map (another tab) must not leave the menu faded out
  useEffect(() => () => useDockFade.getState().setDrawing(false), [])

  /** drawing began: the bottom menu fades out until the finger / mouse button lifts */
  const fadeMenu = () => useDockFade.getState().setDrawing(true)

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'pen') usePen.getState().markSeen()
    const penMode = penActive()
    // pen mode: a hand resting on the screen while the pen is down must not move the map
    if (penMode && e.pointerType === 'touch' && penId.current !== null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = local(e)
    const g = gesture.current
    if (penMode && e.pointerType === 'pen') {
      // the pen takes over: a finger gesture that was under way is dropped
      penId.current = e.pointerId
      pointers.current.clear()
      g.kind = 'none'
    }
    pointers.current.set(e.pointerId, p)
    hover.current = p
    if (pointers.current.size >= 2) {
      // two fingers came down almost together: the first one was the start of a pinch, so the dab it painted is taken back
      if (g.kind === 'paint' && performance.now() - strokeStart.current < 350) useEditor.getState().cancelStroke()
      // a stroke that was only just started is dropped too: zooming never draws
      stroke.current = null
      stationDrag.current = null
      const [a, b] = [...pointers.current.values()]
      g.kind = 'pinch'
      g.lastDist = Math.hypot(a.x - b.x, a.y - b.y)
      useDockFade.getState().setDrawing(false)
      return
    }
    g.startX = p.x
    g.startY = p.y
    g.lastCell = null
    const t = useEditor.getState().tool
    if (pointerRole(e.pointerType, penMode) === 'move') {
      // pen mode: a finger only moves (and with two fingers zooms) the map, whatever tool is chosen
      hover.current = null
      g.kind = 'pan'
    } else if (useEditor.getState().pickZone && isPaintTool(t) && t !== 'water' && t !== 'erase' && t !== 'zoneErase') {
      // area picker: the area under the finger becomes the one to paint with
      const c = toCell(p)
      if (!useEditor.getState().pickZoneAt(c.x, c.y)) flash('Hier ist kein Gebiet. Tippe auf eine bemalte Fläche.')
      g.kind = 'none'
    } else if (isPaintTool(t)) {
      if (t === 'water' || t === 'erase') useEditor.getState().checkpoint()
      else zoneId.current = useEditor.getState().beginZonePaint()
      g.kind = 'paint'
      strokeStart.current = performance.now()
      fadeMenu()
      paintAt(toCell(p))
    } else if (t === 'pan') {
      g.kind = 'pan'
    } else {
      const wp: { lineId: string; k: number; j: number } | null = t === 'line' ? hitWaypoint(p) : null
      const stNow = useEditor.getState()
      const hitSt = t === 'station' ? hitStation(p) : null
      if (wp) {
        // drawing mode: a handle is only grabbed once it is dragged, a plain tap on it puts a station on the line
        if (stNow.lineMode !== 'draw') stNow.selectWaypoint(wp)
        wpDrag.current = { lineId: wp.lineId, k: wp.k, j: wp.j, moved: false }
        g.kind = 'wp'
      } else if (t === 'line' && stNow.lineMode === 'draw' && stNow.activeLineId) {
        // a finger down on the map with a line chosen: a tap, or the start of a stroke once it moves
        stroke.current = { pts: [toLattice(p)], moved: false }
        g.kind = 'draw'
      } else if (hitSt) {
        stationDrag.current = { id: hitSt, moved: false }
        g.kind = 'stationDrag'
      } else {
        g.kind = 'tap'
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'pen') usePen.getState().markSeen()
    if (e.pointerType === 'touch' && penId.current !== null && penActive()) return
    const p = local(e)
    const prev = pointers.current.get(e.pointerId)
    if (!prev) {
      // Mouse hover (no button): only the brush cursor needs a redraw
      hover.current = p
      const t = useEditor.getState().tool
      if (isPaintTool(t)) draw()
      return
    }
    pointers.current.set(e.pointerId, p)
    hover.current = p
    const g = gesture.current
    const v = view.current
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      userMoved.current = true
      v.ox += (p.x - prev.x) / 2
      v.oy += (p.y - prev.y) / 2
      if (g.lastDist > 0) zoomAt(mid.x, mid.y, dist / g.lastDist)
      g.lastDist = dist
    } else if (g.kind === 'paint') {
      paintAt(toCell(p))
    } else if (g.kind === 'pan') {
      userMoved.current = true
      v.ox += p.x - prev.x
      v.oy += p.y - prev.y
    } else if (g.kind === 'wp' && wpDrag.current) {
      const d = wpDrag.current
      if (d.moved || Math.hypot(p.x - g.startX, p.y - g.startY) > 8) {
        const st = useEditor.getState()
        if (!d.moved) {
          st.checkpoint()
          d.moved = true
          st.selectWaypoint({ lineId: d.lineId, k: d.k, j: d.j })
          fadeMenu()
        }
        const c = toLattice(p)
        if (inMap(c)) st.moveWaypoint(d.lineId, d.k, d.j, c)
      }
    } else if (g.kind === 'draw' && stroke.current) {
      const sk = stroke.current
      if (!sk.moved && Math.hypot(p.x - g.startX, p.y - g.startY) > 8) {
        sk.moved = true
        fadeMenu()
      }
      if (sk.moved) {
        const c = toLattice(p)
        const last = sk.pts[sk.pts.length - 1]
        if (Math.hypot(c.x - last.x, c.y - last.y) >= 0.12) sk.pts.push(c)
      }
    } else if (g.kind === 'stationDrag' && stationDrag.current) {
      const d = stationDrag.current
      if (d.moved || Math.hypot(p.x - g.startX, p.y - g.startY) > 8) {
        const st = useEditor.getState()
        if (!d.moved) {
          st.checkpoint()
          d.moved = true
          fadeMenu()
        }
        const c = toLattice(p)
        const x = Math.round(c.x)
        const y = Math.round(c.y)
        if (inMap({ x, y })) st.moveStation(d.id, x, y)
      }
    } else if (g.kind === 'tap') {
      if (Math.hypot(p.x - g.startX, p.y - g.startY) > 8) g.kind = 'pan'
    }
    draw()
  }

  const onPointerUp = (e: React.PointerEvent) => {
    // a finger that lifts while the pen is still drawing is none of the stroke's business
    if (e.pointerType === 'touch' && penId.current !== null) {
      pointers.current.delete(e.pointerId)
      return
    }
    if (e.pointerId === penId.current) penId.current = null
    const p = local(e)
    const g = gesture.current
    pointers.current.delete(e.pointerId)
    useDockFade.getState().setDrawing(false)
    if (e.pointerType !== 'mouse') hover.current = null
    if (g.kind === 'tap' && Math.hypot(p.x - g.startX, p.y - g.startY) <= 8) handleTap(p)
    if (g.kind === 'wp') {
      const d = wpDrag.current
      wpDrag.current = null
      if (d && !d.moved && useEditor.getState().lineMode === 'draw') handleTap(p)
    }
    if (g.kind === 'draw' && stroke.current) {
      const sk = stroke.current
      stroke.current = null
      if (!sk.moved) handleTap(p)
      else if (sk.pts.length >= 3) {
        const st = useEditor.getState()
        if (st.activeLineId && !st.drawStroke(st.activeLineId, sk.pts, Math.max(1.2, 26 / view.current.s))) {
          flash(st.doc.lines[st.activeLineId]?.stations.length ? 'Beginne den Strich an einem Ende der Linie' : 'Der Strich passt hier nicht (Wasser?)')
        }
      }
    }
    if (g.kind === 'stationDrag') {
      const d = stationDrag.current
      stationDrag.current = null
      if (d && !d.moved) handleTap(p)
    }
    if (pointers.current.size === 0) g.kind = 'none'
    else if (g.kind === 'pinch') g.kind = 'none'
    draw()
  }

  const cursor = tool === 'pan' ? 'grab' : isPaintTool(tool) ? 'none' : 'crosshair'

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          hover.current = null
          draw()
        }}
      />
      <TrainLayer view={view} doc={doc} paths={linePaths} />
    </div>
  )
}
