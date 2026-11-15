import { useEffect, useRef } from 'react'
import { getAccent, useTheme } from '../ui/theme'
import { clamp01, drawLight, drawStation, easeOut, easeOutBack, prepareNet, REDUCED_MOTION, strokeGlowing } from '../ui/netCanvas'

const INTRO = 3.6 // seconds until the network is complete
const FRAME_MS = 31 // about 30 frames per second: smooth enough, easy on the battery

const CLOUDS = [
  { cls: '-left-24 top-10 h-96 w-96 opacity-40', color: '#2b6cff', d: 22, x1: '50px', y1: '40px', x2: '-20px', y2: '70px' },
  { cls: '-right-32 top-1/3 h-[26rem] w-[26rem] opacity-30', color: 'var(--color-accent)', d: 26, x1: '-60px', y1: '-30px', x2: '10px', y2: '50px' },
  { cls: '-bottom-20 left-1/4 h-80 w-80 opacity-30', color: '#e055c4', d: 30, x1: '40px', y1: '-40px', x2: '-40px', y2: '10px' },
]

/**
 * Animated network that draws itself, with little lights running along the lines.
 * One canvas, drawn at ~30 fps; once the network is complete it is cached as a bitmap and only the lights move.
 */
export default function MenuBackdrop({ dim = false }: { dim?: boolean }) {
  // two stacked canvases: the network (drawn once it is complete, then left alone) and the moving lights (tiny dirty rects only)
  const netRef = useRef<HTMLCanvasElement>(null)
  const lightRef = useRef<HTMLCanvasElement>(null)
  const dimRef = useRef(dim)

  useEffect(() => {
    dimRef.current = dim
  }, [dim])

  useEffect(() => {
    const netCanvas = netRef.current
    const lightCanvas = lightRef.current
    if (!netCanvas || !lightCanvas) return
    const nctx = netCanvas.getContext('2d')
    const lctx = lightCanvas.getContext('2d')
    if (!nctx || !lctx) return
    const net = prepareNet()
    const reduced = REDUCED_MOTION()
    const wide = window.matchMedia('(min-width: 768px)')
    let dpr = 1
    let k = 1
    let ox = 0
    let oy = 0
    let cssW = 1
    let left = 0
    // touch devices: the colour glows are painted into the network canvas instead of being separate moving layers
    const bakeGlows = !window.matchMedia('(hover: hover) and (pointer: fine)').matches
    let t = 0
    let last = 0
    let raf = 0
    let netDone = false
    let prev: { x: number; y: number; r: number }[] = []

    const setView = (c: CanvasRenderingContext2D) => c.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy)

    const paintGlows = () => {
      if (!bakeGlows) return
      nctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const vw = window.innerWidth
      const vh = window.innerHeight
      const blobs = [
        { x: -96 + 192, y: 40 + 192, r: 192, color: '43,108,255', a: 0.4 },
        { x: vw + 128 - 208, y: vh / 3 + 208, r: 208, color: getAccent().rgb, a: 0.3 },
        { x: vw / 4 + 160, y: vh + 80 - 160, r: 160, color: '224,85,196', a: 0.3 },
      ]
      for (const b of blobs) {
        const g = nctx.createRadialGradient(b.x - left, b.y, 0, b.x - left, b.y, b.r)
        g.addColorStop(0, `rgba(${b.color},${b.a})`)
        g.addColorStop(0.7, `rgba(${b.color},0)`)
        nctx.fillStyle = g
        nctx.fillRect(b.x - left - b.r, b.y - b.r, b.r * 2, b.r * 2)
      }
    }

    const drawComplete = () => {
      paintGlows()
      setView(nctx)
      for (const l of net) {
        strokeGlowing(nctx, l.track, 0, l.track.total, l.color)
        for (const s of l.stationAt) drawStation(nctx, s.p, s.big, 1)
      }
    }

    const fadeEdge = () => {
      // on wide screens the network fades out towards the text on the left
      if (!wide.matches) return
      nctx.setTransform(1, 0, 0, 1, 0, 0)
      nctx.globalCompositeOperation = 'destination-out'
      const g = nctx.createLinearGradient(0, 0, netCanvas.width * 0.3, 0)
      g.addColorStop(0, 'rgba(0,0,0,1)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      nctx.fillStyle = g
      nctx.fillRect(0, 0, netCanvas.width * 0.3, netCanvas.height)
      nctx.globalCompositeOperation = 'source-over'
    }

    /** the network while it is being drawn (only the first seconds) */
    const drawIntro = (time: number) => {
      nctx.setTransform(1, 0, 0, 1, 0, 0)
      nctx.clearRect(0, 0, netCanvas.width, netCanvas.height)
      paintGlows()
      setView(nctx)
      net.forEach((l, i) => {
        const p = easeOut((time - 0.3 - i * 0.28) / 1.9)
        if (p <= 0) return
        strokeGlowing(nctx, l.track, 0, l.track.total * p, l.color)
        l.stationAt.forEach((s, n) => {
          const delay = 1.1 + i * 0.28 + n * 0.12
          if (s.d <= l.track.total * p + 2) drawStation(nctx, s.p, s.big, easeOutBack((time - delay) / 0.55))
        })
      })
      fadeEdge()
    }

    const drawLights = (time: number) => {
      lctx.setTransform(1, 0, 0, 1, 0, 0)
      for (const r of prev) lctx.clearRect(r.x - r.r, r.y - r.r, r.r * 2, r.r * 2)
      prev = []
      if (reduced) return
      setView(lctx)
      const size = 22
      net.forEach((l, i) => {
        const begin = 2.6 + i * 0.9
        if (time < begin) return
        const period = 9 + i * 1.7
        const c = ((time - begin) % period) / period
        const p = l.track.at(c * l.track.total)
        const sx = ox + p[0] * k
        const edge = wide.matches ? clamp01(sx / (cssW * 0.3)) : 1
        drawLight(lctx, p, size, clamp01(Math.min(c / 0.06, (1 - c) / 0.06)) * edge)
        const r = (size / 2) * k * dpr + 2
        prev.push({ x: dpr * (ox + p[0] * k), y: dpr * (oy + p[1] * k), r })
      })
    }

    const render = (time: number) => {
      if (reduced || time >= INTRO) {
        if (!netDone) {
          nctx.setTransform(1, 0, 0, 1, 0, 0)
          nctx.clearRect(0, 0, netCanvas.width, netCanvas.height)
          drawComplete()
          fadeEdge()
          netDone = true
        }
      } else {
        netDone = false
        drawIntro(time)
      }
      drawLights(time)
    }

    const resize = () => {
      const r = netCanvas.getBoundingClientRect()
      if (!r.width || !r.height) return
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      cssW = r.width
      left = r.left
      for (const c of [netCanvas, lightCanvas]) {
        c.width = Math.round(r.width * dpr)
        c.height = Math.round(r.height * dpr)
      }
      // same as preserveAspectRatio="xMidYMid slice" on a 400 x 800 viewBox
      k = Math.max(r.width / 400, r.height / 800)
      ox = (r.width - 400 * k) / 2
      oy = (r.height - 800 * k) / 2
      netDone = false
      prev = []
      render(t)
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden || dimRef.current) {
        last = now
        return
      }
      if (now - last < FRAME_MS) return
      t += Math.min(0.1, (now - last) / 1000)
      last = now
      render(t)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(netCanvas)
    // a new accent colour repaints the baked glow
    const unsub = useTheme.subscribe(() => {
      netDone = false
      render(t)
    })
    resize()
    if (!reduced) {
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      unsub()
    }
  }, [])

  // the veils that keep text readable take the colour of the page: dark in dark mode, light in light mode
  const veil = useTheme((s) => s.scheme) === 'light' ? '238,241,245' : '7,9,13'
  return (
    <div className="absolute inset-0 overflow-hidden" data-dim={dim}>
      {/* drifting colour glows: plain gradients moved with transform only (no blur filter) */}
      {CLOUDS.map((c) => (
        <div
          key={c.color}
          className={`menu-cloud absolute rounded-full ${c.cls}`}
          style={{ background: `radial-gradient(circle, ${c.color} 0%, transparent 70%)`, ['--d' as string]: `${c.d}s`, ['--x1' as string]: c.x1, ['--y1' as string]: c.y1, ['--x2' as string]: c.x2, ['--y2' as string]: c.y2, animationPlayState: dim ? 'paused' : 'running' }}
        />
      ))}

      <canvas ref={netRef} className="absolute inset-0 h-full w-full md:left-auto md:w-[58%]" aria-hidden />
      <canvas ref={lightRef} className="absolute inset-0 h-full w-full md:left-auto md:w-[58%]" aria-hidden />

      {/* sub-screens: calm the background so forms stay readable (a plain dark veil, no live blur) */}
      <div className="absolute inset-0 transition-opacity duration-[400ms]" style={{ background: `rgba(${veil},0.84)`, opacity: dim ? 1 : 0 }} />

      {/* fade so text and buttons stay readable */}
      <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(${veil},0.55) 0%, rgba(${veil},0.15) 30%, rgba(${veil},0.55) 62%, rgba(${veil},0.96) 100%)` }} />
    </div>
  )
}
