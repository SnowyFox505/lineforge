import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { ReactNode } from 'react'

/** Longest straight piece of a bent surface (smaller = rounder, but more vertices) */
const SEG = 0.45

/**
 * Bends everything inside it along a circular arc: the local x axis becomes the arc, z stays across it, y up.
 * `k` is the curvature (1/units). Used for station platforms and roofs on a bend, so a curved track is
 * followed by a curved platform instead of a straight one. Boxes are cut into short pieces first so they can bend.
 * Done in the vertex shader, so it also works for instanced meshes.
 */
export default function Bend({ k, children }: { k: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const uniforms = useMemo(() => ({ uBendK: { value: 0 }, uBendFrame: { value: new THREE.Matrix4() }, uBendInv: { value: new THREE.Matrix4() } }), [])
  uniforms.uBendK.value = k

  useLayoutEffect(() => {
    const root = ref.current
    if (!root || Math.abs(k) < 1e-6) return
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.frustumCulled = false
      // cut boxes into pieces that can follow the bend
      const geo = mesh.geometry as THREE.BufferGeometry & { parameters?: { width?: number; height?: number; depth?: number } }
      if (geo && geo.type === 'BoxGeometry' && !geo.userData.bendCut) {
        const p = geo.parameters ?? {}
        const inst = (mesh as THREE.InstancedMesh).isInstancedMesh === true
        // instanced unit boxes are stretched by their matrices (x = along the track); plain boxes know their size
        const segs = (len: number) => Math.min(48, Math.max(1, Math.ceil(len / SEG)))
        const sx = inst ? 24 : segs(Math.max(p.width ?? 1, p.depth ?? 1))
        const sz = inst ? 3 : sx
        const cut = new THREE.BoxGeometry(p.width ?? 1, p.height ?? 1, p.depth ?? 1, sx, 1, sz)
        cut.userData.bendCut = true
        mesh.geometry = cut
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        if (!m || m.userData.bendHook === uniforms) continue
        const before = m.onBeforeCompile
        const key = m.customProgramCacheKey?.bind(m)
        m.onBeforeCompile = (shader, renderer) => {
          before?.call(m, shader, renderer)
          shader.uniforms.uBendK = uniforms.uBendK
          shader.uniforms.uBendFrame = uniforms.uBendFrame
          shader.uniforms.uBendInv = uniforms.uBendInv
          shader.vertexShader =
            'uniform float uBendK;\nuniform mat4 uBendFrame;\nuniform mat4 uBendInv;\n' +
            shader.vertexShader.replace(
              '#include <project_vertex>',
              /* glsl */ `
              vec4 bendPos = vec4(transformed, 1.0);
              #ifdef USE_INSTANCING
                bendPos = instanceMatrix * bendPos;
              #endif
              bendPos = uBendInv * (modelMatrix * bendPos);
              if (abs(uBendK) > 1e-6) {
                float th = uBendK * bendPos.x;
                float sn = sin(th);
                float cs = cos(th);
                float x = sn / uBendK - sn * bendPos.z;
                float z = (1.0 - cs) / uBendK + cs * bendPos.z;
                bendPos.x = x;
                bendPos.z = z;
              }
              vec4 mvPosition = viewMatrix * (uBendFrame * bendPos);
              gl_Position = projectionMatrix * mvPosition;
              `,
            )
        }
        m.customProgramCacheKey = () => `${key ? key() : ''}|bend`
        m.userData.bendHook = uniforms
        m.needsUpdate = true
      }
    })
  })

  // the station does not move, but the frame is only known once it is in the scene
  useFrame(() => {
    const g = ref.current
    if (!g || Math.abs(k) < 1e-6) return
    g.updateWorldMatrix(true, false)
    if (!uniforms.uBendFrame.value.equals(g.matrixWorld)) {
      uniforms.uBendFrame.value.copy(g.matrixWorld)
      uniforms.uBendInv.value.copy(g.matrixWorld).invert()
    }
  })

  return <group ref={ref}>{children}</group>
}
