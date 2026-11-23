import { describe, expect, it } from 'vitest'
import {
  closingProgress,
  DIAL_R,
  EMBLEM,
  emblemBox,
  hexRgb,
  HUB,
  irisRadius,
  lerpRgb,
  litCells,
  loadProgress,
  MEMORY_CELLS,
  OFFLINE_MESSAGE_AT,
  OFFLINE_MESSAGES,
  OFFLINE_MIN_MS,
  offlineMessage,
  offlinePace,
  offlineSymbols,
  restoreFront,
  RESTORE_AT,
} from './splashScene'

describe('splash scene', () => {
  it('draws an octilinear emblem whose lines all run through the hub', () => {
    for (const l of EMBLEM) {
      for (let i = 1; i < l.pts.length; i++) {
        const dx = l.pts[i][0] - l.pts[i - 1][0]
        const dy = l.pts[i][1] - l.pts[i - 1][1]
        expect(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)).toBe(true)
      }
      // the hub is a vertex or lies on a segment
      const through = l.pts.some((p, i) => {
        if (p[0] === HUB[0] && p[1] === HUB[1]) return true
        if (i === 0) return false
        const a = l.pts[i - 1]
        const cross = (p[0] - a[0]) * (HUB[1] - a[1]) - (p[1] - a[1]) * (HUB[0] - a[0])
        const within = Math.min(a[0], p[0]) <= HUB[0] && HUB[0] <= Math.max(a[0], p[0]) && Math.min(a[1], p[1]) <= HUB[1] && HUB[1] <= Math.max(a[1], p[1])
        return cross === 0 && within
      })
      expect(through).toBe(true)
    }
    expect(DIAL_R).toBeGreaterThan(20)
  })

  it('lets the progress rise but never reach the end by itself', () => {
    let last = -1
    for (let t = 0; t <= 60; t += 0.5) {
      const p = loadProgress(t)
      expect(p).toBeGreaterThanOrEqual(last)
      expect(p).toBeLessThan(0.93)
      last = p
    }
    expect(loadProgress(-3)).toBe(0)
  })

  it('closes the progress to 100 % and opens the iris only after the burst', () => {
    expect(closingProgress(0.6, 0)).toBeCloseTo(0.6)
    expect(closingProgress(0.6, 0.25)).toBeCloseTo(1)
    expect(closingProgress(0.6, 1)).toBeCloseTo(1)
    expect(irisRadius(0.2, 400, 800)).toBe(0)
    expect(irisRadius(1, 400, 800)).toBeGreaterThan(Math.hypot(400, 800) / 2)
  })

  it('fits the emblem on portrait and landscape screens', () => {
    const p = emblemBox(390, 844)
    expect(p.size).toBeLessThanOrEqual(390)
    expect(p.cy + p.size / 2).toBeLessThan(844 * 0.7)
    const l = emblemBox(1000, 500)
    expect(l.size).toBeLessThanOrEqual(500)
  })

  it('plays the offline story in order: signal lost, crossed out, memory, rebuild', () => {
    expect(offlineSymbols(0).wifi).toBe(0)
    expect(offlineSymbols(1.2).wifi).toBeGreaterThan(0.9)
    expect(offlineSymbols(1.2).slash).toBeGreaterThan(0.5)
    expect(offlineSymbols(2.2).wifi).toBeLessThan(0.5)
    expect(offlineSymbols(3).wifi).toBeCloseTo(0)
    expect(offlineSymbols(1).store).toBe(0)
    expect(offlineSymbols(3)).toMatchObject({ store: expect.closeTo(1, 1) })
    // nothing is rebuilt before the memory is shown, the lines follow one after the other
    expect(restoreFront(RESTORE_AT - 0.01, 0)).toBe(0)
    expect(restoreFront(RESTORE_AT + 0.7, 0)).toBeGreaterThan(restoreFront(RESTORE_AT + 0.7, 3))
    expect(restoreFront(RESTORE_AT + 4, 3)).toBe(1)
  })

  it('holds the ring back until the rebuild and has it full when the minimum time is over', () => {
    expect(offlinePace(1, OFFLINE_MIN_MS)).toBe(0)
    expect(offlinePace(OFFLINE_MIN_MS / 1000, OFFLINE_MIN_MS)).toBe(1)
    let last = -1
    for (let s = 0; s <= 6; s += 0.25) {
      const p = offlinePace(s, OFFLINE_MIN_MS)
      expect(p).toBeGreaterThanOrEqual(last)
      last = p
    }
  })

  it('lights the memory cells with the ring and picks fitting texts', () => {
    expect(litCells(0)).toBe(0)
    expect(litCells(0.5)).toBe(MEMORY_CELLS / 2)
    expect(litCells(1)).toBe(MEMORY_CELLS)
    expect(litCells(2)).toBe(MEMORY_CELLS)
    expect(offlineMessage(0.5, false)).toBe(0)
    expect(offlineMessage(3, false)).toBe(1)
    expect(offlineMessage(4.6, false)).toBe(2)
    expect(offlineMessage(6.5, false)).toBe(3)
    expect(offlineMessage(1, true)).toBe(3)
    expect(OFFLINE_MESSAGES).toHaveLength(OFFLINE_MESSAGE_AT.length)
    // every text stays on screen for at least a second and a half before the loading may close
    for (let i = 1; i < OFFLINE_MESSAGE_AT.length; i++) expect(OFFLINE_MESSAGE_AT[i] - OFFLINE_MESSAGE_AT[i - 1]).toBeGreaterThanOrEqual(1.5)
    expect(OFFLINE_MIN_MS / 1000).toBeGreaterThanOrEqual(OFFLINE_MESSAGE_AT[OFFLINE_MESSAGE_AT.length - 1])
    expect(lerpRgb([0, 0, 0], [100, 200, 50], 0.5)).toEqual([50, 100, 25])
  })

  it('reads colours', () => {
    expect(hexRgb('#ff0000')).toEqual([255, 0, 0])
    expect(hexRgb('#0f0')).toEqual([0, 255, 0])
    expect(hexRgb('nonsense')).toEqual([196, 240, 58])
  })
})
