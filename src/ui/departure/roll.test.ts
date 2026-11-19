import { describe, expect, it } from 'vitest'
import { padTo, Roll } from './roll'

function run(r: Roll, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) r.step(dt)
}

describe('rolling text', () => {
  it('waits for its delay, rolls and ends on the new text', () => {
    const r = new Roll()
    r.set('A', 0.3)
    run(r, 0.2)
    expect(r.cur).toBe('')
    expect(r.next).toBeNull()
    run(r, 0.2)
    expect(r.next).toBe('A')
    expect(r.settled).toBe(false)
    run(r, 0.7)
    expect(r.cur).toBe('A')
    expect(r.settled).toBe(true)
  })

  it('takes a change that comes while it rolls afterwards', () => {
    const r = new Roll()
    r.set('A')
    run(r, 0.2)
    r.set('B')
    run(r, 2)
    expect(r.cur).toBe('B')
    expect(r.settled).toBe(true)
  })

  it('does nothing for the same text and can jump', () => {
    const r = new Roll()
    r.jump('X')
    r.set('X')
    expect(r.settled).toBe(true)
    expect(r.cur).toBe('X')
  })

  it('pads a text to the number of places', () => {
    expect(padTo('ab', 4)).toEqual(['a', 'b', ' ', ' '])
    expect(padTo('abcdef', 3)).toEqual(['a', 'b', 'c'])
  })
})
