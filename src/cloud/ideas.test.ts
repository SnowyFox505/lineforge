import { beforeEach, describe, expect, it } from 'vitest'
import { ideasAsText, MAX_IDEA, pendingIdeas, writeIdea } from './ideas'

describe('idea notes', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    }
  })

  it('keeps a note on the device until it is sent', () => {
    const n = writeIdea('  Laternen nachts  ', 'idea', '0.26.0')!
    expect(n.text).toBe('Laternen nachts')
    expect(pendingIdeas().map((p) => p.id)).toEqual([n.id])
  })

  it('ignores empty notes and cuts long ones', () => {
    expect(writeIdea('   ', 'bug', '1')).toBeNull()
    expect(writeIdea('x'.repeat(MAX_IDEA + 50), 'bug', '1')!.text).toHaveLength(MAX_IDEA)
  })

  it('lists only the open ones as text', () => {
    const base = { uid: 'u', by: 'Mango', at: Date.UTC(2026, 10, 19), version: '0.26.0' }
    const text = ideasAsText([
      { id: 'a', text: 'Offen', kind: 'bug', ...base },
      { id: 'b', text: 'Fertig', kind: 'idea', done: true, ...base },
    ])
    expect(text).toContain('[Fehler] Offen')
    expect(text).not.toContain('Fertig')
  })
})
