import * as THREE from 'three'

/**
 * Night lights. `night.value` (0 by day, 1 at night) is written by DayNight every frame and read by
 * - `windowsCompile`: lit windows on the building blocks (a shader on the instanced boxes),
 * - `carGlassCompile` and `trainSpill`: lit windows on the trains and the warm light they throw on the ground,
 * - `glowEmissives`: every lamp, headlight, sign and screen that is emissive by design shines brighter.
 */
export const night = { value: 0 }

/** How much brighter the emissive parts get at full night (1 = unchanged) */
export const NIGHT_BOOST = 2.8

/** Night amount from the daylight: lights come on in the evening twilight and go out in the morning one. */
export function nightAmount(daylight: number): number {
  const t = Math.min(1, Math.max(0, (0.75 - daylight) / 0.55))
  return t * t * (3 - 2 * t)
}

const WIN_DECL = /* glsl */ `
varying vec3 vWinLocal;
varying vec3 vWinN;
varying vec3 vWinSize;
varying float vWinSeed;
`

const WIN_FRAG_DECL = /* glsl */ `
uniform float uNight;
float winHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
// 1 between a and b, with soft edges one pixel wide (w = size of a pixel in cell units): no shimmering
float winBand(float x, float a, float b, float w) {
  return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x));
}
`

/**
 * onBeforeCompile for the instanced building boxes: windows in the walls, a share of them lit at night.
 * The grid is laid out on each wall (whole columns and floors with a margin at the corners, the roof edge and
 * the ground floor), so no window is cut off. Edges are smoothed by the size of a pixel and the windows blend
 * into an average glow once they get smaller than a few pixels: that keeps the picture calm while the camera moves.
 * Chain it after `xrayCompile`, both only add to the shader.
 */
export function windowsCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uNight = night
  shader.vertexShader =
    WIN_DECL +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
    vec3 winScale = vec3(1.0);
    vWinSeed = 0.0;
    #ifdef USE_INSTANCING
      winScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      // a whole number per building (0..63): it stays exactly the same over the whole wall
      vWinSeed = floor(fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 64.0);
    #endif
    vWinSize = winScale;
    vWinLocal = position * winScale + vec3(0.0, winScale.y * 0.5, 0.0);
    vWinN = normal;`,
    )
  shader.fragmentShader =
    WIN_DECL +
    WIN_FRAG_DECL +
    shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        vec3 an = abs(vWinN);
        if (an.y < 0.5 && uNight > 0.01) {
          bool alongX = an.x > 0.5;
          float len = alongX ? vWinSize.z : vWinSize.x;
          float u = (alongX ? vWinLocal.z : vWinLocal.x) + len * 0.5;
          float v = vWinLocal.y;
          // a window every 2.4 m and a floor every 3 m (one cell is 8 m); ground floor and cornice are a little taller
          float mx = 0.12;
          float yLow = 0.2;
          float yHigh = vWinSize.y - 0.12;
          float cols = max(1.0, floor((len - 2.0 * mx) / 0.3));
          float rows = max(1.0, floor((yHigh - yLow) / 0.375));
          vec2 cell = vec2((u - mx) / ((len - 2.0 * mx) / cols), (v - yLow) / ((yHigh - yLow) / rows));
          vec2 fw = max(fwidth(cell), vec2(0.0001));
          float inRange = winBand(cell.x, 0.0, cols, max(fw.x, 0.02)) * winBand(cell.y, 0.0, rows, max(fw.y, 0.02));
          vec2 id = floor(cell);
          vec2 f = fract(cell);
          // whole numbers only: an interpolated float would differ a little from pixel to pixel and the hash would turn that into noise
          float seed = floor(vWinSeed + 0.5);
          float side = an.x > 0.5 ? (vWinN.x > 0.0 ? 1.0 : 2.0) : (vWinN.z > 0.0 ? 3.0 : 4.0);
          float h = winHash(id + vec2(seed, side * 17.0));
          float pane = winBand(f.x, 0.2, 0.8, fw.x) * winBand(f.y, 0.26, 0.82, fw.y);
          // every wall has its own share of lit windows (a quiet block, a busy one): near and far show the same share,
          // so a far-away city is a mix of darker and brighter houses and not one flat glow
          float frac = mix(0.1, 0.5, winHash(vec2(seed * 3.0 + 1.0, side)));
          float lit = step(1.0 - frac, h);
          vec3 tint = mix(vec3(1.0, 0.76, 0.4), vec3(0.78, 0.9, 1.0), step(0.86, h));
          // far away or at a grazing angle the panes are smaller than a pixel: show their average instead
          // (first the on/off pattern fades to its mean, then the panes to a flat glow)
          float fwMax = max(fw.x, fw.y);
          float litSoft = mix(lit, frac, smoothstep(0.08, 0.3, fwMax));
          // a little under the true mean: a whole city of walls glowing at the full mean looks like "every light is on"
          float average = 0.6 * 0.56 * frac * 0.6;
          float glow = mix(pane * litSoft, average, smoothstep(0.25, 0.6, fwMax)) * inRange;
          totalEmissiveRadiance += tint * glow * uNight * 1.5;
        }
      }`,
    )
}

/** Soft round light pool (white in the middle, fading out), made once. Null where there is no canvas (tests). */
let poolTex: THREE.CanvasTexture | null = null
export function poolTexture(): THREE.CanvasTexture | null {
  if (poolTex || typeof document === 'undefined') return poolTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  if (!g) return null
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  poolTex = new THREE.CanvasTexture(c)
  poolTex.colorSpace = THREE.SRGBColorSpace
  return poolTex
}

/** Warm light under every car at night (shared by all cars); DayNight sets its opacity. */
export const trainSpill = new THREE.MeshBasicMaterial({
  color: '#ffd9a0',
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
})

/** Lit windows on a vertex-coloured car body: the glass colour glows warm at night. */
export function carGlassCompile(glass: THREE.Color) {
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uNight = night
    shader.uniforms.uGlass = { value: glass }
    shader.fragmentShader =
      'uniform float uNight;\nuniform vec3 uGlass;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #ifdef USE_COLOR
          totalEmissiveRadiance += vec3(1.0, 0.82, 0.5) * (1.0 - smoothstep(0.0, 0.06, distance(vColor.rgb, uGlass))) * uNight * 1.1;
        #endif`,
      )
  }
}

/**
 * Makes everything that glows by design (lamps, headlights, signs, screens) brighter at night.
 * The design value is kept in `userData.lfGlow`; the scene is walked only when called.
 */
export function glowEmissives(root: THREE.Object3D, amount: number) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial
      if (!std.isMeshStandardMaterial) continue
      if (std.userData.lfGlow === undefined) std.userData.lfGlow = std.emissiveIntensity
      const base = std.userData.lfGlow as number
      if (base <= 0 || std.emissive.r + std.emissive.g + std.emissive.b < 0.01) continue
      std.emissiveIntensity = base * (1 + (NIGHT_BOOST - 1) * amount)
    }
  })
}
