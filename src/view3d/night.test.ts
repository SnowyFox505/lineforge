import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { glowEmissives, nightAmount, NIGHT_BOOST } from './night'

describe('night lights', () => {
  it('are off by day, fully on at night and come on gradually in between', () => {
    expect(nightAmount(1)).toBe(0)
    expect(nightAmount(0)).toBe(1)
    let prev = nightAmount(1)
    for (let d = 0.95; d >= 0; d -= 0.05) {
      const n = nightAmount(d)
      expect(n).toBeGreaterThanOrEqual(prev)
      prev = n
    }
  })

  it('make emissive materials shine brighter at night and bring them back by day', () => {
    const lamp = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffd070', emissiveIntensity: 0.8 })
    const wall = new THREE.MeshStandardMaterial({ color: '#ccc' }) // not emissive: stays as it is
    const root = new THREE.Group()
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), lamp), new THREE.Mesh(new THREE.BoxGeometry(), wall))
    glowEmissives(root, 1)
    expect(lamp.emissiveIntensity).toBeCloseTo(0.8 * NIGHT_BOOST, 5)
    expect(wall.emissiveIntensity).toBe(1)
    glowEmissives(root, 0)
    expect(lamp.emissiveIntensity).toBeCloseTo(0.8, 5)
  })
})
