import { describe, expect, it } from 'vitest'
import { penActive, pointerRole } from './pen'

describe('pen mode', () => {
  it('is on when chosen, off when switched off, and in automatic only once a pen has been seen', () => {
    expect(penActive({ mode: 'on', seen: false })).toBe(true)
    expect(penActive({ mode: 'off', seen: true })).toBe(false)
    expect(penActive({ mode: 'auto', seen: false })).toBe(false)
    expect(penActive({ mode: 'auto', seen: true })).toBe(true)
  })

  it('lets only fingers move the map in pen mode; pen and mouse use the tool', () => {
    expect(pointerRole('touch', true)).toBe('move')
    expect(pointerRole('pen', true)).toBe('tool')
    expect(pointerRole('mouse', true)).toBe('tool')
  })

  it('treats every pointer as a tool outside pen mode', () => {
    for (const t of ['touch', 'pen', 'mouse']) expect(pointerRole(t, false)).toBe('tool')
  })
})
