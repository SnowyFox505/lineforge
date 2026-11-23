import { clamp01, easeInOut, easeOut, easeOutBack } from './netCanvas'
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

// --- opening a city without a connection ---------------------------------------------------------------------------------
// The city splash notices the missing connection, breaks off (ABORT_MS) and the offline splash fades in over it
// (OFFLINE_FADE_IN). That one shows "no signal", then reads the city from the memory of the device and rebuilds the network from it.

export const OFFLINE_AMBER = '#ffb02e'
export const OFFLINE_RED = '#ff5a4a'
/** an offline start lets the city splash run this long (it looks like the connection is being tried) before it breaks off */
export const OFFLINE_CHECK_MS = 1300
/** a connection that drops later than this after the start is ignored (the city splash is about to close anyway) */
export const OFFLINE_LATE_MS = 2400
/** the city splash shakes, flickers and goes red for this long */
export const ABORT_MS = 800
/** the offline splash fades in over the breaking city splash during this many seconds */
export const OFFLINE_FADE_IN = 0.9
/** the city splash is removed this long after the break (the offline splash is fully there by then) */
export const OFFLINE_SWAP_MS = 1000
/** the offline splash is shown at least this long, there is more to see than in the city splash (and every text needs time to be read) */
export const OFFLINE_MIN_MS = 6900
/** seconds into the offline splash at which the network is rebuilt from the memory */
export const RESTORE_AT = 2.5
/** cells of the memory ring around the dial */
export const MEMORY_CELLS = 28

export type OfflineStage = 'city' | 'abort' | 'offline'

/** The symbols in the dial over time: the connection symbol flickers and is crossed out, then turns into the memory of the device. */
export function offlineSymbols(t: number): { wifi: number; slash: number; store: number } {
  const wifiIn = easeOut((t - 0.15) / 0.6)
  const wifiOut = easeInOut((t - 1.9) / 0.5)
  return { wifi: wifiIn * (1 - wifiOut), slash: easeOut((t - 0.9) / 0.4), store: easeOutBack((t - 2.1) / 0.6) }
}

/** How far the rebuilt part of line `i` reaches (0..1): it grows out of the hub, one line after the other. */
export function restoreFront(t: number, i: number): number {
  return easeInOut((t - RESTORE_AT - i * 0.35) / 1.7)
}

/** The pace of the ring: it waits until the network is rebuilt and then fills up by the time `minMs` is over. */
export function offlinePace(el: number, minMs: number): number {
  const from = RESTORE_AT - 0.1
  const to = Math.max(from + 1, minMs / 1000 - 0.3)
  return easeInOut((el - from) / (to - from))
}

/** how many of the memory cells are lit when the ring is `progress` full */
export function litCells(progress: number, n = MEMORY_CELLS): number {
  return Math.min(n, Math.floor(clamp01(progress) * n + 1e-6))
}

export const OFFLINE_MESSAGES = ['Keine Verbindung', 'Gerätespeicher wird gelesen', 'Stadt wird aus dem Speicher geholt', 'Gleich geht es los']
/** seconds into the offline splash at which the text changes to the next one: each one stays long enough to be read */
export const OFFLINE_MESSAGE_AT = [0, 2.5, 4.5, 6.4]

/** which of the OFFLINE_MESSAGES is shown `el` real seconds in (it only depends on time, not on how fast the loading is) */
export function offlineMessage(el: number, closing: boolean): number {
  if (closing) return OFFLINE_MESSAGES.length - 1
  let m = 0
  OFFLINE_MESSAGE_AT.forEach((at, i) => {
    if (el >= at) m = i
  })
  return m
}

export function lerpRgb(a: [number, number, number], b: [number, number, number], k: number): [number, number, number] {
  const q = clamp01(k)
  return [Math.round(a[0] + (b[0] - a[0]) * q), Math.round(a[1] + (b[1] - a[1]) * q), Math.round(a[2] + (b[2] - a[2]) * q)]
}

export function hexRgb(hex: string, fallback: [number, number, number] = [196, 240, 58]): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return fallback
  let v = m[1]
  if (v.length === 3) v = [...v].map((c) => c + c).join('')
  const n = parseInt(v, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
