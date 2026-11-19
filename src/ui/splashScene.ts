import { clamp01, easeInOut } from './netCanvas'
import type { P } from './netCanvas'

/**
 * The shapes and timings of the splash screens (loading a city, updating the app). No drawing in here, so it can be tested.
 * The emblem is a transit hub: four lines cross in one station, in a 400 x 400 design space.
 */
export const HUB: P = [200, 200]

export interface EmblemLine {
  color: string
  /** every segment is horizontal, vertical or a 45 degree diagonal, like on a real network plan */
  pts: P[]
}

/** The third line takes the accent colour of the player (`ACCENT_LINE`). */
export const ACCENT_LINE = 2

export const EMBLEM: EmblemLine[] = [
  { color: '#ff5470', pts: [[20, 100], [100, 100], [200, 200], [300, 300], [300, 380]] },
  { color: '#3db8ff', pts: [[380, 100], [300, 100], [200, 200], [100, 300], [100, 380]] },
  { color: '#c4f03a', pts: [[20, 150], [70, 200], [330, 200], [380, 150]] },
  { color: '#ffc233', pts: [[150, 20], [200, 70], [200, 330], [250, 380]] },
]

/** the progress ring around the hub */
export const DIAL_R = 42

/** seconds the closing animation takes */
export const FINISH_CITY = 1.3
/** the iris that opens onto the game is soft at its edge by this many pixels */
export const IRIS_FEATHER = 90

/**
 * How far the bar looks to be after `t` seconds while nobody knows how long loading takes:
 * it moves fast at first and then crawls towards (but never reaches) 92 %.
 */
export function loadProgress(t: number): number {
  return 0.92 * (1 - Math.exp(-Math.max(0, t) / 2.2))
}

/** The progress shown while closing: from where it was to 100 % in the first quarter of the closing animation. */
export function closingProgress(from: number, u: number): number {
  const q = clamp01(u / 0.25)
  return from + (1 - from) * (1 - (1 - q) ** 3)
}

/** Radius of the round hole through which the game appears. 0 until the burst at the hub has happened. */
export function irisRadius(u: number, w: number, h: number): number {
  const q = clamp01((u - 0.3) / 0.7)
  return easeInOut(q) * (Math.hypot(w, h) / 2 + IRIS_FEATHER + 20)
}

/** How big the emblem is on a screen, and where its centre sits. */
export function emblemBox(w: number, h: number): { size: number; cx: number; cy: number } {
  const portrait = h >= w
  const size = Math.min(w * 0.88, h * (portrait ? 0.46 : 0.52), 460)
  return { size, cx: w / 2, cy: h * (portrait ? 0.38 : 0.42) }
}

export function hexRgb(hex: string, fallback: [number, number, number] = [196, 240, 58]): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return fallback
  let v = m[1]
  if (v.length === 3) v = [...v].map((c) => c + c).join('')
  const n = parseInt(v, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
