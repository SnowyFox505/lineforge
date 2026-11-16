import { describe, expect, it } from 'vitest'
import { UPLOAD_DEBOUNCE, UPLOAD_MAX_WAIT, uploadDelay } from './schedule'

describe('upload timing', () => {
  it('waits a moment after a change so a burst of changes becomes one upload', () => {
    expect(uploadDelay(1000, 1000)).toBe(UPLOAD_DEBOUNCE)
  })

  it('uploads at the latest after the maximum wait, however long the player keeps changing things', () => {
    expect(uploadDelay(0, UPLOAD_MAX_WAIT - 400)).toBe(400)
    expect(uploadDelay(0, UPLOAD_MAX_WAIT)).toBe(0)
    expect(uploadDelay(0, UPLOAD_MAX_WAIT + 5000)).toBe(0)
  })
})
