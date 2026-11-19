import { describe, expect, it } from 'vitest'
import { Flap, padTo, RING } from './flap'

function run(f: Flap, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) f.step(dt)
}

describe('split-flap tile', () => {
  it('turns forwards through the characters in between and ends on the target', () => {
    const f = new Flap(20, 'A')
    f.set('D')
    const seen: string[] = []
    for (let i = 0; i < 400; i++) {
      f.step(1 / 120)
      if (f.next && seen[seen.length - 1] !== f.next) seen.push(f.next)
    }
    expect(seen).toEqual(['B', 'C', 'D'])
    expect(f.cur).toBe('D')
    expect(f.settled).toBe(true)
  })

  it('waits for its delay before the first flip', () => {
    const f = new Flap(20, 'A')
    f.set('B', 0.5)
    run(f, 0.4)
    expect(f.cur).toBe('A')
    expect(f.next).toBeNull()
    run(f, 0.3)
    expect(f.cur).toBe('B')
  })

  it('never turns more than a bounded number of flips, even for a long way round', () => {
    const f = new Flap(15, 'Ü')
    f.set('A') // the long way round the drum
    let flips = 0
    let last: string | null = null
    for (let i = 0; i < 2000; i++) {
      f.step(1 / 120)
      if (f.next && f.next !== last) flips++
      last = f.next
    }
    expect(flips).toBeLessThanOrEqual(16)
    expect(f.cur).toBe('A')
  })

  it('adds spins before the target and still lands on it', () => {
    const f = new Flap(30, 'A')
    f.set('A', 0, 5)
    run(f, 1)
    expect(f.cur).toBe('A')
    expect(f.settled).toBe(true)
  })

  it('ignores characters that are not on the drum and does nothing for the same target', () => {
    const f = new Flap(30, 'A')
    f.set('A')
    expect(f.settled).toBe(true)
    f.set('€')
    run(f, 1)
    expect(f.cur).toBe(' ')
    expect(RING.includes('Ü')).toBe(true)
  })

  it('pads a text to the number of tiles', () => {
    expect(padTo('abc', 5)).toEqual(['A', 'B', 'C', ' ', ' '])
    expect(padTo('abcdef', 3)).toEqual(['A', 'B', 'C'])
  })
})
