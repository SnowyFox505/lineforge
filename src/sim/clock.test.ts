import { describe, expect, it } from 'vitest'
import { exportCityJson, importCityJson } from '../persistence/db'
import { createCity } from '../model/factory'
import { clockHands, formatClock, gameTime, GAME_MINUTES_PER_SECOND, GAME_START, minuteOfDay, startGameTime, sunAt, SUNRISE, SUNSET } from './clock'

describe('game clock', () => {
  it('runs one game hour per real minute', () => {
    expect(GAME_MINUTES_PER_SECOND * 60).toBe(60)
  })

  it('starts at eight and wraps around midnight', () => {
    expect(formatClock(GAME_START)).toBe('08:00')
    expect(formatClock(GAME_START + 60 * 17 + 5)).toBe('01:05')
    expect(minuteOfDay(-30)).toBe(1410)
  })

  it('puts the hands where a real clock has them', () => {
    expect(clockHands(0)).toEqual({ hour: 0, minute: 0 })
    // three o'clock: hour hand a quarter round, minute hand at twelve
    expect(clockHands(15 * 60)).toEqual({ hour: 0.25, minute: 0 })
    // half past six: minute hand at the bottom, hour hand between six and seven
    const h = clockHands(6 * 60 + 30)
    expect(h.minute).toBe(0.5)
    expect(h.hour).toBeCloseTo(6.5 / 12, 10)
  })

  it('saves the running game time with the city and starts from it again', () => {
    const doc = createCity('T', 'creative', 32)
    startGameTime(doc.id, 13 * 60 + 20)
    expect(formatClock(gameTime.minutes)).toBe('13:20')
    gameTime.minutes += 45 // the game goes on
    const back = importCityJson(exportCityJson(doc), true)
    expect(formatClock(back.clock!)).toBe('14:05')
    // a city that was never saved starts in the morning
    startGameTime(doc.id, undefined)
    expect(gameTime.minutes).toBe(GAME_START)
    startGameTime('')
  })
})

describe('the sun', () => {
  it('is up at noon, down at midnight and on the horizon at sunrise and sunset', () => {
    expect(sunAt(12 * 60).daylight).toBe(1)
    expect(sunAt(12 * 60).elevation).toBeCloseTo(1, 5)
    expect(sunAt(0).daylight).toBe(0)
    expect(sunAt(0).elevation).toBeLessThan(0)
    expect(sunAt(SUNRISE).elevation).toBeCloseTo(0, 5)
    expect(sunAt(SUNSET).elevation).toBeCloseTo(0, 5)
    // east in the morning, west in the evening
    expect(sunAt(SUNRISE + 30).dir.x).toBeGreaterThan(0)
    expect(sunAt(SUNSET - 30).dir.x).toBeLessThan(0)
  })

  it('has a glow at dawn and dusk but not at noon or at night', () => {
    expect(sunAt(SUNRISE).glow).toBeGreaterThan(0.9)
    expect(sunAt(SUNSET).glow).toBeGreaterThan(0.9)
    expect(sunAt(12 * 60).glow).toBeLessThan(0.05)
    expect(sunAt(0).glow).toBeLessThan(0.05)
  })

  it('changes smoothly and repeats every day', () => {
    let prev = sunAt(0).daylight
    for (let m = 5; m <= 1440; m += 5) {
      const d = sunAt(m).daylight
      expect(Math.abs(d - prev)).toBeLessThan(0.12)
      prev = d
    }
    expect(sunAt(9 * 60).daylight).toBe(sunAt(9 * 60 + 1440).daylight)
  })
})
