import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { OPERATORS } from '../model/constants'
import type { StationType } from '../model/types'
import { useEditor } from '../store/editorStore'
import Icon from '../ui/Icon'
import { downloadBlob } from '../ui/SettingsSheet'
import { effectiveTypes, planePath } from './glyphs'
import { placeLabels } from './labels'
import type { LabelRect } from './labels'
import { layoutLines } from './layout'

const TARGET_W = 500 // px the longer side of the network is scaled to
const MIN_U = 10
const MAX_U = 38
const PAD = 0
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
    case 'landmark':
      return 13
    default:
      return 8
  }
}

function Symbol({ type, x, y, ink, fill }: { type: StationType; x: number; y: number; ink: string; fill: string }) {
  switch (type) {
    case 'interchange':
      return <circle cx={x} cy={y} r={11} fill={fill} stroke={ink} strokeWidth={4.5} />
    case 'landmark':
      return (
        <polygon
          points={`${x},${y - 12} ${x + 12},${y} ${x},${y + 12} ${x - 12},${y}`}
          fill="url(#gold)"
          stroke={ink}
          strokeWidth={3}
          strokeLinejoin="round"
        />
      )
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

export default function PlanView() {
  const doc = useEditor((s) => s.doc)
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
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

  const plan = useMemo(() => {
    const stations = Object.values(doc.stations)
    if (!stations.length) return null
    const types = effectiveTypes(doc)
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
    const gap = 11 / U
    const paths = layoutLines(doc, gap)
    const lines = Object.values(doc.lines).map((l) => {
      const pts = (paths[l.id] ?? []).map((p) => ({ x: px(p.x), y: py(p.y) }))
      return { line: l, pts, d: pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') }
    })

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
        const station = doc.stations[line.stations[a === 0 ? 0 : line.stations.length - 1]]
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
      stations.map((st) => ({
        stationId: st.id,
        text: st.type === 'landmark' && st.landmarkLabel ? st.landmarkLabel : st.name,
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
    const legendH = Object.keys(doc.lines).length ? 56 + Object.keys(doc.lines).length * 34 : 0
    return { stations, types, px, py, lines, badges, labels, vx, vy, mapW: vw, mapH: vh, legendH }
  }, [doc])

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
  const scale = fit * zoom
  const lineList = Object.values(doc.lines)

  return (
    <div className="absolute inset-0">
      <div ref={wrapRef} className="h-full overflow-auto" style={{ background: `linear-gradient(180deg, ${T.bgA}, ${T.bgB})` }}>
        <div className="flex min-h-full items-center justify-center px-3 pb-[130px] pt-[84px]">
          <svg
            ref={svgRef}
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`${vx} ${vy} ${mapW} ${totalH}`}
            width={mapW * scale}
            height={totalH * scale}
            style={{ display: 'block', flexShrink: 0, fontFamily: SANS, borderRadius: 24, boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6)' }}
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
            {plan.lines.map(({ line, d }, i) => {
              const w = OPERATORS[line.operator].width + 1
              const dl = 0.15 + i * 0.18
              return (
                <g key={line.id} strokeLinecap="round" strokeLinejoin="round" fill="none">
                  {T.glow && (
                    <motion.path d={d} stroke={line.color} strokeWidth={w + 8} opacity={0.35} filter="url(#soft)" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, delay: dl, ease: [0.22, 1, 0.36, 1] }} />
                  )}
                  <motion.path d={d} stroke={T.casing} strokeWidth={w + 4} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, delay: dl, ease: [0.22, 1, 0.36, 1] }} />
                  <motion.path d={d} stroke={line.color} strokeWidth={w} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, delay: dl, ease: [0.22, 1, 0.36, 1] }} />
                </g>
              )
            })}

            {/* Stations */}
            {plan.stations.map((st, idx) => {
              const delay = 0.1 + (idx + 1) * 0.035
              return (
                <motion.g
                  key={st.id}
                  style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.7 + delay }}
                >
                  <Symbol type={plan.types[st.id]} x={plan.px(st.x)} y={plan.py(st.y)} ink={T.ink} fill={T.fill} />
                </motion.g>
              )
            })}

            {/* Line badges at the termini */}
            {plan.badges.map((b, i) => (
              <motion.g key={b.key} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} transition={{ delay: 1.1 + i * 0.05, type: 'spring', stiffness: 300, damping: 20 }}>
                <rect x={b.x - b.w / 2} y={b.y - 11} width={b.w} height={22} rx={b.r} fill={b.color} stroke={T.casing} strokeWidth={2} />
                <text x={b.x} y={b.y + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#fff" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                  {b.name}
                </text>
              </motion.g>
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
          { icon: 'zoomin' as const, on: () => setZoom((z) => Math.min(3, z * 1.3)), label: 'Vergrößern' },
          { icon: 'zoomout' as const, on: () => setZoom((z) => Math.max(0.5, z / 1.3)), label: 'Verkleinern' },
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
