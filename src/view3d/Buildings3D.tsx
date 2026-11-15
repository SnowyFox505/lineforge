import { useMemo } from 'react'
import * as THREE from 'three'
import { lotsOf } from '../editor2d/streets'
import { urbanAlpha } from '../editor2d/zoneSoft'
import type { UrbanKind } from '../editor2d/streets'
import type { CityDoc } from '../model/types'
import { WATER } from '../model/types'
import { Boxes } from './Tracks3D'
import { UG_COVER } from '../model/profiles'
import { poiModel, POI_FOOTPRINT } from '../model/poi'
import type { Network3D } from './network3d'

const m4 = new THREE.Matrix4()
const pos = new THREE.Vector3()
const quat = new THREE.Quaternion()
const scl = new THREE.Vector3()
const Y_AXIS = new THREE.Vector3(0, 1, 0)

export interface Building {
  x: number
  z: number
  w: number
  d: number
  h: number
  rotY: number
  shade: 0 | 1 | 2
  kind: UrbanKind
}

/** Cells (in map coordinates) that must stay free: along the tracks and under the stations. */
function blockedCells(doc: CityDoc, net: Network3D): Uint8Array {
  const { size } = doc
  const half = size / 2
  const blocked = new Uint8Array(size * size)
  const mark = (x: number, z: number, r: number) => {
    const cx = Math.floor(x + half)
    const cy = Math.floor(z + half)
    const R = Math.ceil(r)
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const xx = cx + dx
        const yy = cy + dy
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue
        if (dx * dx + dy * dy <= r * r + 0.5) blocked[yy * size + xx] = 1
      }
    }
  }
  for (const ln of net.lines) {
    for (let i = 0; i < ln.n; i += 2) if (ln.cy[i] > UG_COVER + 0.1) mark(ln.cx[i], ln.cz[i], ln.line.operator === 'tram' ? 1 : 2)
  }
  for (const sn of Object.values(net.stations)) {
    for (const g of sn.groups) {
      if (g.lift <= UG_COVER) continue
      const l = g.layout.length / 2 + 2
      const w = g.layout.halfWidth + 2
      for (let u = -l; u <= l; u += 1) {
        for (let v = -w; v <= w; v += 1) mark(g.ox + g.ax * u - g.az * v, g.oz + g.az * u + g.ax * v, 1)
      }
    }
    if (sn.groups.some((g) => g.lift > UG_COVER) || !sn.groups.length) mark(sn.x, sn.z, 4)
  }
  // the models of the points of interest
  for (const p of doc.pois ?? []) mark(p.x + 0.5 - half, p.y + 0.5 - half, POI_FOOTPRINT[poiModel(p)])
  return blocked
}

/** Boxes for every free building lot inside a city or suburb area. */
export function buildBuildings(doc: CityDoc, net: Network3D): Building[] {
  const { size, zoneGrid, zones } = doc
  if (!zoneGrid || !zones?.length) return []
  const kindOf = new Map(zones.map((z) => [z.id, z.kind]))
  const half = size / 2
  const blocked = blockedCells(doc, net)
  const soft = urbanAlpha(doc)
  const cellKind = (x: number, y: number): UrbanKind | null => {
    const cx = Math.floor(x)
    const cy = Math.floor(y)
    if (cx < 0 || cy < 0 || cx >= size || cy >= size) return null
    const k = kindOf.get(zoneGrid[cy * size + cx])
    return k === 'city' || k === 'suburb' ? k : null
  }
  /** share of city cells around a point: the denser the centre, the taller the buildings */
  const density = (x: number, y: number) => {
    let n = 0
    let t = 0
    for (let dy = -6; dy <= 6; dy += 2) {
      for (let dx = -6; dx <= 6; dx += 2) {
        t++
        if (cellKind(x + dx, y + dy) === 'city') n++
      }
    }
    return n / t
  }
  const out: Building[] = []
  for (const kind of ['city', 'suburb'] as UrbanKind[]) {
    for (const lot of lotsOf(kind, size)) {
      if (cellKind(lot.x, lot.y) !== kind) continue
      // the whole lot must lie inside the area, on land and clear of the tracks
      const ca = Math.cos(lot.angle)
      const sa = Math.sin(lot.angle)
      const hw = lot.w * 0.45
      const hd = lot.d * 0.45
      const probe: [number, number][] = [
        [lot.x, lot.y],
        [lot.x + ca * hw, lot.y + sa * hw],
        [lot.x - ca * hw, lot.y - sa * hw],
        [lot.x - sa * hd, lot.y + ca * hd],
        [lot.x + sa * hd, lot.y - ca * hd],
      ]
      let ok = true
      for (const [px, py] of probe) {
        const cx = Math.floor(px)
        const cy = Math.floor(py)
        if (cellKind(px, py) !== kind || blocked[cy * size + cx] || doc.terrain[cy * size + cx] === WATER) {
          ok = false
          break
        }
      }
      if (!ok) continue
      // towards the edge of a town the houses thin out and get lower, like the ground fades into grass
      const edge = soft[Math.floor(lot.y) * size + Math.floor(lot.x)]
      if (edge < 0.12 || (edge < 0.75 && lot.rand > edge * 1.35)) continue
      const dens = kind === 'city' ? density(lot.x, lot.y) : 0.3
      let h: number
      if (kind === 'city') {
        // one cornice height per block, a little variation per house, taller towards the centre
        h = 1.0 + lot.blockRand * 0.5 + dens * 0.8 + (lot.rand - 0.5) * 0.3
        if (dens > 0.8 && lot.blockRand > 0.94 && lot.rand > 0.5) h += 1.4 + lot.rand * 1.2
      } else {
        h = 0.34 + lot.rand * 0.2
      }
      h *= 0.55 + 0.45 * edge
      out.push({
        x: lot.x - half,
        z: lot.y - half,
        w: lot.w,
        d: lot.d,
        h,
        rotY: -lot.angle,
        shade: Math.floor(((lot.rand * 13) % 1) * 2.99) as 0 | 1 | 2,
        kind,
      })
    }
  }
  return out
}

const SHADES = ['#dfe3e9', '#cfd4db', '#eceff3']
const ROOF = '#9aa2ad'

function matrixOf(b: Building, groundY: number, lift = 0): THREE.Matrix4 {
  pos.set(b.x, groundY + (b.h + lift) / 2, b.z)
  quat.setFromAxisAngle(Y_AXIS, b.rotY)
  scl.set(b.w, b.h + lift, b.d)
  return m4.compose(pos, quat, scl).clone()
}

/** Simple building blocks for the city and suburb areas (no detail, they just give the town its mass). */
export default function Buildings3D({ doc, net }: { doc: CityDoc; net: Network3D }) {
  const sets = useMemo(() => {
    const list = buildBuildings(doc, net)
    const bodies: THREE.Matrix4[][] = [[], [], []]
    const roofs: THREE.Matrix4[] = []
    const houses: THREE.Matrix4[] = []
    for (const b of list) {
      const g = net.groundAt(b.x, b.z)
      if (b.kind === 'suburb') {
        houses.push(matrixOf(b, g, 0.02))
        roofs.push(matrixOf({ ...b, h: 0.07, w: b.w * 1.04, d: b.d * 1.04 }, g + b.h + 0.02, 0))
      } else {
        bodies[b.shade].push(matrixOf(b, g, 0.02))
        if (b.h > 1.5) roofs.push(matrixOf({ ...b, h: 0.05, w: b.w * 0.55, d: b.d * 0.55 }, g + b.h + 0.02, 0))
      }
    }
    return { bodies, roofs, houses }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.zoneGrid, doc.zones, doc.terrain, doc.size, net])
  return (
    <group>
      {sets.bodies.map((items, i) => (
        <Boxes key={i} items={items} color={SHADES[i]} roughness={0.85} xray windows />
      ))}
      <Boxes items={sets.houses} color="#e9ecf0" roughness={0.9} xray windows />
      <Boxes items={sets.roofs} color={ROOF} roughness={0.8} xray />
    </group>
  )
}
