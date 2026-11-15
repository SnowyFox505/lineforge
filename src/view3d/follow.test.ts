import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { cameraFor, FOLLOW_MODES, takeTrainPick, TRAIN_PICK_MS, trainPick } from './follow'
import type { CameraRig } from './follow'

const rig = (): CameraRig => ({ position: new THREE.Vector3(), look: new THREE.Vector3() })
const pos = new THREE.Vector3(10, 0.6, 5)
const dir = new THREE.Vector3(1, 0, 0) // the train drives along +x

describe('follow camera', () => {
  it('chases from behind and above, looking ahead of the train', () => {
    const r = cameraFor('chase', pos, dir, false, rig())
    expect(r.position.x).toBeLessThan(pos.x - 4)
    expect(r.position.y).toBeGreaterThan(pos.y + 1.5)
    expect(r.look.x).toBeGreaterThan(pos.x)
  })

  it('looks from the side at the train', () => {
    const r = cameraFor('side', pos, dir, false, rig())
    expect(Math.abs(r.position.z - pos.z)).toBeGreaterThan(4)
    expect(Math.abs(r.look.x - pos.x)).toBeLessThan(0.5)
  })

  it('sits at the nose in the cockpit view and looks down the track', () => {
    const r = cameraFor('cockpit', pos, dir, false, rig())
    expect(r.position.x).toBeGreaterThan(pos.x)
    expect(r.look.x - r.position.x).toBeGreaterThan(6)
    expect(r.position.y - pos.y).toBeLessThan(1)
  })

  it('goes a little higher underground so the tunnel is in view', () => {
    const up = cameraFor('chase', pos, dir, false, rig()).position.y
    const down = cameraFor('chase', pos, dir, true, rig()).position.y
    expect(down).toBeGreaterThan(up)
  })

  it('has three fixed views and a free one', () => {
    expect(FOLLOW_MODES.map((m) => m.id)).toEqual(['chase', 'side', 'cockpit', 'free'])
  })

  it('remembers the pressed train for a tap that lands on the track, once and not for long', () => {
    trainPick.id = 'T1'
    trainPick.at = 1000
    expect(takeTrainPick(1400)).toBe('T1')
    expect(takeTrainPick(1400)).toBeNull() // used up
    trainPick.id = 'T2'
    trainPick.at = 1000
    expect(takeTrainPick(1000 + TRAIN_PICK_MS + 1)).toBeNull() // too long ago
  })
})
