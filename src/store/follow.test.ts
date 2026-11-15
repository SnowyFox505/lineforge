import { beforeEach, describe, expect, it } from 'vitest'
import { useEditor } from './editorStore'

const S = () => useEditor.getState()

describe('following a train', () => {
  beforeEach(() => {
    S().newCity('Folgen', 'creative', 64)
    S().setFollow(null)
    S().setFollowMode('chase')
  })

  it('keeps the chosen fixed view for the next train', () => {
    S().setFollowMode('side')
    S().setFollow('a#0')
    expect(S().followMode).toBe('side')
    S().setFollow(null)
    S().setFollow('b#0')
    expect(S().followMode).toBe('side')
  })

  it('starts in the chase view again after the free view (which a drag makes of a fixed one)', () => {
    S().setFollow('a#0')
    S().setFollowMode('free')
    S().setFollow(null)
    S().setFollow('b#0')
    expect(S().followMode).toBe('chase')
  })

  it('stays free while you switch from one train to the next', () => {
    S().setFollow('a#0')
    S().setFollowMode('free')
    S().setFollow('b#0')
    expect(S().followMode).toBe('free')
  })
})
