import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { LATEST, RELEASES, releasesSince } from './changelog'
import { compareVersions, parseVersion } from './version'

describe('patch notes', () => {
  it('has an entry for the version in package.json at the top', () => {
    expect(LATEST.version).toBe(pkg.version)
  })

  it('lists the releases newest first, each version only once', () => {
    for (let i = 1; i < RELEASES.length; i++) expect(compareVersions(RELEASES[i - 1].version, RELEASES[i].version)).toBeGreaterThan(0)
  })

  it('explains every change: what, how and what it brings', () => {
    for (const r of RELEASES) {
      expect(r.headline.length).toBeGreaterThan(0)
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(r.changes.length).toBeGreaterThan(0)
      for (const c of r.changes) for (const text of [c.title, c.what, c.how, c.benefit]) expect(text.trim().length).toBeGreaterThan(5)
    }
  })

  it('shows what is new since the last version that was seen', () => {
    expect(releasesSince(null)).toEqual([LATEST])
    expect(releasesSince(LATEST.version)).toEqual([])
    expect(releasesSince('0.0.1').map((r) => r.version)).toEqual(RELEASES.map((r) => r.version))
  })
})

describe('versions', () => {
  it('compares numbers, not text', () => {
    expect(parseVersion('0.10.2')).toEqual([0, 10, 2])
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.8.0', '0.8.1')).toBeLessThan(0)
  })
})
