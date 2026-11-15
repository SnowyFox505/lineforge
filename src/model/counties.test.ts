import { describe, expect, it } from 'vitest'
import { addCounty, countyAt, divideIntoCounties, nextCountyId } from './counties'
import { createCity } from './factory'
import { applyMap } from './mapGen'
import { exportCityJson, importCityJson } from '../persistence/db'
import { WATER } from './types'

describe('counties', () => {
  it('adds a county with a made-up name and the next free colour and id', () => {
    const doc = createCity('T', 'creative', 96)
    const a = addCounty(doc)!
    const b = addCounty(a.doc)!
    expect(a.id).toBe(1)
    expect(b.id).toBe(2)
    expect(b.doc.counties).toHaveLength(2)
    expect(b.doc.counties![0].name).not.toBe(b.doc.counties![1].name)
    expect(b.doc.counties![0].color).not.toBe(b.doc.counties![1].color)
  })

  it('takes the name the player wished for first', () => {
    const doc = { ...createCity('T', 'creative', 96), nameQueues: { county: ['Frankenwinkel'] } }
    expect(addCounty(doc)!.doc.counties![0].name).toBe('Frankenwinkel')
  })

  it('reuses an id that became free', () => {
    const a = addCounty(addCounty(createCity('T', 'creative', 96))!.doc)!
    const without = { ...a.doc, counties: a.doc.counties!.filter((c) => c.id !== 1) }
    expect(nextCountyId(without)).toBe(1)
  })

  it('divides the land into counties of similar size and keeps water out', () => {
    const doc = applyMap(createCity('T', 'creative', 128), 'seen', 3)
    const out = divideIntoCounties(doc, 4, 9)
    expect(out.counties).toHaveLength(4)
    const counts = new Map<number, number>()
    for (let i = 0; i < out.countyGrid!.length; i++) {
      const c = out.countyGrid![i]
      if (doc.terrain[i] === WATER) expect(c).toBe(0)
      else {
        expect(c).toBeGreaterThan(0)
        counts.set(c, (counts.get(c) ?? 0) + 1)
      }
    }
    expect(counts.size).toBe(4)
    const sizes = [...counts.values()]
    expect(Math.min(...sizes) / Math.max(...sizes)).toBeGreaterThan(0.15)
    // the same seed gives the same division
    expect(Array.from(divideIntoCounties(doc, 4, 9).countyGrid!)).toEqual(Array.from(out.countyGrid!))
  })

  it('finds the county at a cell', () => {
    const out = divideIntoCounties(createCity('T', 'creative', 64), 3, 2)
    const c = countyAt(out, 10, 10)
    expect(c).toBeTruthy()
    expect(out.counties).toContainEqual(c)
    expect(countyAt(out, -1, 3)).toBeUndefined()
  })

  it('survives saving and loading', () => {
    const out = divideIntoCounties(createCity('T', 'creative', 64), 3, 2)
    const back = importCityJson(exportCityJson(out))
    expect(back.counties).toEqual(out.counties)
    expect(Array.from(back.countyGrid!)).toEqual(Array.from(out.countyGrid!))
    // a city without counties stays without
    const plain = importCityJson(exportCityJson(createCity('P', 'creative', 64)))
    expect(plain.counties).toBeUndefined()
    expect(plain.countyGrid).toBeUndefined()
  })
})
