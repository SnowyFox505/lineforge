import * as THREE from 'three'

/**
 * Small building blocks for the detailed vehicle models. Everything returned is non-indexed with exactly the attributes
 * `position`, `normal` and `color`, so the pieces of a car can be merged with its body shell (`mergeGeometries`).
 * Car frame: +x is the direction of travel, y is up from the underside of the body, z is across the car.
 */

/** Window glass: the night shader lights every face of exactly this colour from inside (see night.ts `carGlassCompile`) */
export const GLASS = '#25384c'
export const DARK = '#2a2f36'

export function paint(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex)
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

/** Make a geometry mergeable: non-indexed, no uv, normals present. */
function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g
  if (ng !== g) g.dispose()
  ng.deleteAttribute('uv')
  if (!ng.attributes.normal) ng.computeVertexNormals()
  return ng
}

/** A box of size w (x) x h (y) x d (z) centred on (x, y, z), optionally tilted about z (rotZ) or about x (rotX). */
export function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: string, rotZ = 0, rotX = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  if (rotZ) g.rotateZ(rotZ)
  if (rotX) g.rotateX(rotX)
  g.translate(x, y, z)
  return paint(plain(g), hex)
}

/** A cylinder whose axis runs across the car (wheels, rollers): radius r, length len along z, centred on (x, y, z). */
export function cylZ(r: number, len: number, x: number, y: number, z: number, hex: string, seg = 10): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg)
  g.rotateX(Math.PI / 2)
  g.translate(x, y, z)
  return paint(plain(g), hex)
}

/** A cylinder whose axis runs along the car (x): used for lamps and round vents on the front. */
export function cylX(r: number, len: number, x: number, y: number, z: number, hex: string, seg = 12): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg)
  g.rotateZ(Math.PI / 2)
  g.translate(x, y, z)
  return paint(plain(g), hex)
}

/** Rounded rectangle outline in a plane, centred on the origin: `w` wide (u), `h` high (v), corner radius `r`. */
export function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  const rr = Math.min(r, w / 2, h / 2)
  s.moveTo(x + rr, y)
  s.lineTo(x + w - rr, y)
  s.quadraticCurveTo(x + w, y, x + w, y + rr)
  s.lineTo(x + w, y + h - rr)
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  s.lineTo(x + rr, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - rr)
  s.lineTo(x, y + rr)
  s.quadraticCurveTo(x, y, x + rr, y)
  return s
}

/**
 * A raised rounded plate on the front face of a car (the plane x = const, facing +x): `w` across, `h` high, centre at
 * (x, y, z), standing `depth` proud of the face. Used for windscreens, vents and light housings.
 */
export function frontPlate(w: number, h: number, r: number, x: number, y: number, z: number, depth: number, hex: string): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth, bevelEnabled: false, curveSegments: 5 })
  // shape u -> across the car, shape v -> up, extrusion -> forward (+x)
  g.rotateY(Math.PI / 2)
  g.translate(x, y, z)
  return paint(plain(g), hex)
}

/** The same plate for a face that looks sideways (the plane z = const, facing +z): x along the car. */
export function sidePlate(w: number, h: number, r: number, x: number, y: number, z: number, depth: number, hex: string): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth, bevelEnabled: false, curveSegments: 4 })
  g.translate(x, y, z)
  return paint(plain(g), hex)
}

/** Turn a part built for the front end into the one for the rear end (half a turn about the vertical axis). */
export function toRear(parts: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  return parts.map((p) => p.rotateY(Math.PI))
}
