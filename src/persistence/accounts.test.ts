import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { decodeCity, encodeCity, MAX_BYTES } from '../cloud/codec'
import { planSync } from '../cloud/sync'
import { createCity } from '../model/factory'
import { adoptGuestCities, clearOwner, countGuestCities, deleteCity, GUEST, listCityDocs, onCitySaved, saveCity, setOwner } from './db'

const city = (name: string) => createCity(name, 'creative', 128)

describe('cities per person', () => {
  beforeEach(async () => {
    setOwner('anna')
    await clearOwner('anna')
    await clearOwner('ben')
    await clearOwner(GUEST)
    onCitySaved(null)
  })

  it('keeps the cities of different people apart on one device', async () => {
    setOwner('anna')
    await saveCity(city('Annastadt'))
    setOwner('ben')
    await saveCity(city('Benhausen'))
    expect((await listCityDocs()).map((c) => c.name)).toEqual(['Benhausen'])
    setOwner('anna')
    expect((await listCityDocs()).map((c) => c.name)).toEqual(['Annastadt'])
    setOwner(GUEST)
    expect(await listCityDocs()).toHaveLength(0)
  })

  it('does not let somebody delete the city of another person', async () => {
    setOwner('anna')
    const c = city('Annastadt')
    await saveCity(c)
    setOwner('ben')
    await deleteCity(c.id)
    setOwner('anna')
    expect(await listCityDocs()).toHaveLength(1)
  })

  it('moves guest cities into an account and empties an account on sign-out', async () => {
    setOwner(GUEST)
    await saveCity(city('Gast 1'))
    await saveCity(city('Gast 2'))
    expect(await countGuestCities()).toBe(2)
    const moved = await adoptGuestCities('anna')
    expect(moved).toHaveLength(2)
    expect(await countGuestCities()).toBe(0)
    expect(await listCityDocs('anna')).toHaveLength(2)
    await clearOwner('anna')
    expect(await listCityDocs('anna')).toHaveLength(0)
  })

  it('tells the cloud sync about every save with the person it belongs to', async () => {
    const seen: string[] = []
    onCitySaved((doc, _at, owner) => seen.push(`${owner}:${doc.name}`))
    setOwner('anna')
    await saveCity(city('A'))
    setOwner(GUEST)
    await saveCity(city('B'))
    expect(seen).toEqual(['anna:A', 'guest:B'])
  })
})

describe('cloud copy', () => {
  it('compresses a city and gets exactly the same city back', async () => {
    const c = city('Cloudstadt')
    c.terrain[500] = 1
    c.zoneGrid![700] = 3
    c.zones = [{ id: 3, kind: 'city', name: 'Mitte' }]
    const bytes = await encodeCity(c)
    expect(bytes.length).toBeLessThan(MAX_BYTES / 10) // mostly empty cells: a few KB
    const back = await decodeCity(bytes)
    expect(back.id).toBe(c.id)
    expect(back.name).toBe('Cloudstadt')
    expect([...back.terrain]).toEqual([...c.terrain])
    expect([...back.zoneGrid!]).toEqual([...c.zoneGrid!])
    expect(back.zones).toEqual(c.zones)
  })

  it('compresses even the biggest map far below the cloud limit', async () => {
    const big = createCity('Groß', 'normal', 384)
    for (let i = 0; i < big.terrain.length; i += 7) big.terrain[i] = 1
    expect((await encodeCity(big)).length).toBeLessThan(MAX_BYTES)
  })
})

describe('sync plan', () => {
  it('uploads new and newer local cities, downloads new and newer cloud cities', () => {
    const plan = planSync(
      [
        { id: 'a', updatedAt: 10 }, // same on both sides
        { id: 'b', updatedAt: 30 }, // newer here
        { id: 'c', updatedAt: 5 }, // newer in the cloud
        { id: 'd', updatedAt: 1 }, // only here
      ],
      [
        { id: 'a', name: '', updatedAt: 10 },
        { id: 'b', name: '', updatedAt: 20 },
        { id: 'c', name: '', updatedAt: 15 },
        { id: 'e', name: '', updatedAt: 3 }, // only in the cloud
      ],
    )
    expect(plan.push.sort()).toEqual(['b', 'd'])
    expect(plan.pull.sort()).toEqual(['c', 'e'])
  })
})
