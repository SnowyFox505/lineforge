import { useMemo } from 'react'
import * as THREE from 'three'
import type { CityDoc } from '../model/types'
import { WATER } from '../model/types'
import { Boxes } from './Tracks3D'
import type { Network3D } from './network3d'

export interface Trees {
  /** crowns in two shades of green, and the trunks */
  crowns: [THREE.Matrix4[], THREE.Matrix4[]]
  trunks: THREE.Matrix4[]
}

const TREES_PER_CELL = 2
/** Trees keep off the rails: no tree where the spot is less free than this (see `Network3D.railClearance`) */
const MIN_CLEARANCE = 0.4

const hash = (x: number, y: number, salt: number) => {
  let h = Math.imul(x + 1013, 374761393) ^ Math.imul(y + 7919, 668265263) ^ Math.imul(salt + 31, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** The trees of all forest areas: a few per cell, on land, off the tracks and stations. */
export function buildTrees(doc: CityDoc, net: Pick<Network3D, 'groundAt' | 'railClearance'>): Trees {
  const out: Trees = { crowns: [[], []], trunks: [] }
  const { zoneGrid, zones, size } = doc
  if (!zoneGrid || !zones?.length) return out
  const forest = new Set(zones.filter((z) => z.kind === 'forest').map((z) => z.id))
  if (!forest.size) return out
  const half = size / 2
  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scl = new THREE.Vector3()
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      if (!forest.has(zoneGrid[i]) || doc.terrain[i] === WATER) continue
      for (let k = 0; k < TREES_PER_CELL; k++) {
        const wx = x + 0.1 + hash(x, y, k * 7 + 1) * 0.8 - half
        const wz = y + 0.1 + hash(x, y, k * 7 + 2) * 0.8 - half
        if (net.railClearance(wx, wz) < MIN_CLEARANCE) continue
        const gy = net.groundAt(wx, wz)
        const h = 0.55 + hash(x, y, k * 7 + 3) * 0.5
        const r = 0.2 + hash(x, y, k * 7 + 4) * 0.13
        const trunk = h * 0.3
        pos.set(wx, gy, wz)
        scl.set(0.045, trunk, 0.045)
        out.trunks.push(new THREE.Matrix4().compose(pos, quat, scl))
        pos.set(wx, gy + trunk * 0.8, wz)
        scl.set(r, h - trunk * 0.8, r)
        out.crowns[hash(x, y, k * 7 + 5) > 0.5 ? 0 : 1].push(m.compose(pos, quat, scl).clone())
      }
    }
  }
  return out
}

/** Trees on the forest areas (instanced cones on thin trunks). */
export default function Forests3D({ doc, net }: { doc: CityDoc; net: Network3D }) {
  const trees = useMemo(() => buildTrees(doc, net), [doc, net])
  const cone = useMemo(() => new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), [])
  const trunk = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 5).translate(0, 0.5, 0), [])
  return (
    <group>
      <Boxes items={trees.trunks} color="#5a4632" geo={trunk} roughness={1} />
      <Boxes items={trees.crowns[0]} color="#2b6a40" geo={cone} roughness={0.95} />
      <Boxes items={trees.crowns[1]} color="#357a4a" geo={cone} roughness={0.95} />
    </group>
  )
}
