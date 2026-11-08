import * as THREE from 'three'

/**
 * "X-ray bubble" for the follow camera: while a train runs underground, everything above it within a radius
 * (terrain, buildings, tunnel roofs) dissolves, and a glowing ring marks the edge of the bubble.
 * All materials that call `xrayCompile` share these uniforms, so one update changes all of them.
 */
export const xray = {
  focus: { value: new THREE.Vector3() },
  radius: { value: 10 },
  strength: { value: 0 },
  /** how far above the train things start to dissolve: 0 underground, a little more at a station on the ground (the ground itself stays) */
  lift: { value: 0 },
  rim: { value: new THREE.Color('#c4f03a') },
}

const DECLARATIONS = /* glsl */ `
varying vec3 vXrWorld;
uniform vec3 uXrFocus;
uniform float uXrRadius;
uniform float uXrStrength;
uniform float uXrLift;
uniform vec3 uXrRim;
// x: 1 = keep the fragment, 0 = it dissolves;  y: glow of the ring around the bubble
vec2 xrayState(vec3 w) {
  float above = smoothstep(uXrFocus.y + uXrLift - 0.3, uXrFocus.y + uXrLift + 0.4, w.y);
  float d = length(w.xz - uXrFocus.xz);
  float inside = 1.0 - smoothstep(uXrRadius * 0.6, uXrRadius, d);
  float ring = smoothstep(uXrRadius * 0.78, uXrRadius * 0.96, d) * (1.0 - smoothstep(uXrRadius * 0.96, uXrRadius * 1.06, d));
  return vec2(1.0 - uXrStrength * above * inside, ring * above * uXrStrength);
}
// stable screen-door pattern (interleaved gradient noise): soft dissolve without needing transparency
float xrayDither(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
`

/** onBeforeCompile for MeshStandardMaterial: dissolve + rim. Works for instanced and plain meshes. */
export function xrayCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uXrFocus = xray.focus
  shader.uniforms.uXrRadius = xray.radius
  shader.uniforms.uXrStrength = xray.strength
  shader.uniforms.uXrLift = xray.lift
  shader.uniforms.uXrRim = xray.rim
  shader.vertexShader = 'varying vec3 vXrWorld;\n' + shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    vec4 xrPos = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      xrPos = instanceMatrix * xrPos;
    #endif
    vXrWorld = (modelMatrix * xrPos).xyz;`,
  )
  shader.fragmentShader =
    DECLARATIONS +
    shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{
        vec2 xr = xrayState(vXrWorld);
        if (xr.x < 0.999 && xr.x < xrayDither(gl_FragCoord.xy)) discard;
        outgoingLight += uXrRim * xr.y * 1.6;
      }
      #include <opaque_fragment>`,
    )
}

/** Props for a <meshStandardMaterial> that takes part in the x-ray effect. */
export const xrayMaterial = { onBeforeCompile: xrayCompile, customProgramCacheKey: () => 'lf-xray' }
