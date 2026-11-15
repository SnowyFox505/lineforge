import * as THREE from 'three'

/** `free`: you look around yourself (drag to turn, pinch or wheel to zoom) while the camera stays with the train */
export type FollowMode = 'chase' | 'side' | 'cockpit' | 'free'

/** The modes with a fixed camera place (everything but `free`) */
export type FixedFollowMode = Exclude<FollowMode, 'free'>

export const FOLLOW_MODES: { id: FollowMode; label: string }[] = [
  { id: 'chase', label: 'Verfolger' },
  { id: 'side', label: 'Seite' },
  { id: 'cockpit', label: 'Cockpit' },
  { id: 'free', label: 'Frei' },
]

/**
 * The train that was under the finger (or the mouse) when the pointer went down. Trains are fast: by the time the finger lifts
 * the train has moved on, and the tap would land on the track. Whoever handles that tap asks `takeTrainPick` first.
 */
export const trainPick = { id: null as string | null, at: 0 }

/** How long after pressing a train a tap still counts as a tap on that train (ms) */
export const TRAIN_PICK_MS = 900

/** The pressed train, once: null when none was pressed (or too long ago). */
export function takeTrainPick(now: number = performance.now()): string | null {
  const id = trainPick.id && now - trainPick.at < TRAIN_PICK_MS ? trainPick.id : null
  trainPick.id = null
  return id
}

/** Live data of the followed train: written by the train renderer every frame, read by the camera and the HUD. */
export const followState = {
  /** world position of the train's head (rail level) and its direction of travel */
  pos: new THREE.Vector3(),
  dir: new THREE.Vector3(1, 0, 0),
  /** true while the train is below the ground */
  underground: false,
  /** true while the train is in or just before a station: roofs and halls open up around it */
  inStation: false,
  line: '',
  color: '#ffffff',
  status: '',
  trainIds: [] as string[],
}

export interface CameraRig {
  position: THREE.Vector3
  look: THREE.Vector3
}

const up = new THREE.Vector3(0, 1, 0)
const right = new THREE.Vector3()

/** Where the camera wants to be for a mode (and what it looks at). */
export function cameraFor(mode: FixedFollowMode, pos: THREE.Vector3, dir: THREE.Vector3, underground: boolean, out: CameraRig): CameraRig {
  const flat = new THREE.Vector3(dir.x, 0, dir.z)
  if (flat.lengthSq() < 1e-6) flat.set(1, 0, 0)
  flat.normalize()
  right.crossVectors(flat, up).normalize()
  const lift = underground ? 1.15 : 1
  if (mode === 'chase') {
    out.position.copy(pos).addScaledVector(flat, -5.6).addScaledVector(up, 2.5 * lift)
    out.look.copy(pos).addScaledVector(flat, 2.6).addScaledVector(up, 0.3)
  } else if (mode === 'side') {
    out.position.copy(pos).addScaledVector(right, 5.4).addScaledVector(up, 2.1 * lift).addScaledVector(flat, -1.2)
    out.look.copy(pos).addScaledVector(up, 0.3)
  } else {
    out.position.copy(pos).addScaledVector(flat, 1.15).addScaledVector(up, 0.42)
    out.look.copy(pos).addScaledVector(flat, 9).addScaledVector(up, 0.25 + dir.y * 4)
  }
  return out
}
