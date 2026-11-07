export interface LabelRect {
  x: number
  y: number
  w: number
  h: number
}

export interface PlacedLabel {
  stationId: string
  text: string
  /** SVG text position and anchor */
  tx: number
  ty: number
  anchor: 'start' | 'middle' | 'end'
  rect: LabelRect
}

export interface LabelInput {
  stationId: string
  text: string
  /** Station centre in px */
  cx: number
  cy: number
  /** Marker radius in px (clearance around the station) */
  radius: number
  fontSize: number
}

const overlap = (a: LabelRect, b: LabelRect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

/**
 * Greedy label placement: try 8 positions around every station and keep the
 * one that overlaps the least with already placed labels and station markers.
 */
export function placeLabels(inputs: LabelInput[], obstacles: LabelRect[] = []): PlacedLabel[] {
  const placed: PlacedLabel[] = []
  const markers: LabelRect[] = inputs.map((i) => ({
    x: i.cx - i.radius,
    y: i.cy - i.radius,
    w: i.radius * 2,
    h: i.radius * 2,
  }))

  // Longer names first: they have the fewest placement options.
  const order = [...inputs].sort((a, b) => b.text.length - a.text.length)
  for (const inp of order) {
    const w = inp.text.length * inp.fontSize * 0.56 + 4
    const h = inp.fontSize + 2
    const gap = inp.radius + 4
    const candidates: { anchor: PlacedLabel['anchor']; x: number; y: number }[] = [
      { anchor: 'start', x: inp.cx + gap, y: inp.cy + h / 4 },
      { anchor: 'end', x: inp.cx - gap, y: inp.cy + h / 4 },
      { anchor: 'middle', x: inp.cx, y: inp.cy - gap },
      { anchor: 'middle', x: inp.cx, y: inp.cy + gap + h * 0.7 },
      { anchor: 'start', x: inp.cx + gap * 0.7, y: inp.cy - gap * 0.7 },
      { anchor: 'end', x: inp.cx - gap * 0.7, y: inp.cy - gap * 0.7 },
      { anchor: 'start', x: inp.cx + gap * 0.7, y: inp.cy + gap * 0.7 + h * 0.6 },
      { anchor: 'end', x: inp.cx - gap * 0.7, y: inp.cy + gap * 0.7 + h * 0.6 },
    ]
    let best: PlacedLabel | null = null
    let bestCost = Infinity
    for (const c of candidates) {
      const rx = c.anchor === 'start' ? c.x : c.anchor === 'end' ? c.x - w : c.x - w / 2
      const rect: LabelRect = { x: rx, y: c.y - h * 0.8, w, h }
      let cost = 0
      for (const p of placed) cost += overlap(rect, p.rect) * 3
      for (const o of obstacles) cost += overlap(rect, o) * 2
      markers.forEach((m, i) => {
        if (inputs[i].stationId !== inp.stationId) cost += overlap(rect, m)
      })
      if (cost < bestCost) {
        bestCost = cost
        best = { stationId: inp.stationId, text: inp.text, tx: c.x, ty: c.y, anchor: c.anchor, rect }
        if (cost === 0) break
      }
    }
    if (best) placed.push(best)
  }
  return placed
}
