<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Mesh, Program, Renderer, Texture, Triangle } from 'ogl'

const root = ref<HTMLDivElement | null>(null)

function hexToVec3(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  ]
}

function generateNoiseTexture(size = 256): Uint8Array {
  const data = new Uint8Array(size * size * 4)
  function hash(x: number, y: number, seed: number): number {
    let value = x * 374761393 + y * 668265263 + seed * 1274126177
    value = Math.imul(value ^ (value >>> 13), 1274126177)
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296
  }
  function noise(px: number, py: number, frequency: number, seed: number): number {
    const fx = (px / size) * frequency
    const fy = (py / size) * frequency
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const tx = fx - ix
    const ty = fy - iy
    const width = frequency | 0
    const v00 = hash(((ix % width) + width) % width, ((iy % width) + width) % width, seed)
    const v10 = hash((((ix + 1) % width) + width) % width, ((iy % width) + width) % width, seed)
    const v01 = hash(((ix % width) + width) % width, (((iy + 1) % width) + width) % width, seed)
    const v11 = hash((((ix + 1) % width) + width) % width, (((iy + 1) % width) + width) % width, seed)
    return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let value = 0
      let amplitude = 0.4
      let totalAmplitude = 0
      for (let octave = 0; octave < 8; octave += 1) {
        const frequency = 32 * (1 << octave)
        value += amplitude * noise(x, y, frequency, octave * 31)
        totalAmplitude += amplitude
        amplitude *= 0.65
      }
      value /= totalAmplitude
      value = Math.max(0, Math.min(1, (value - 0.5) * 2.2 + 0.5))
      const channel = Math.round(value * 255)
      const index = (y * size + x) * 4
      data[index] = channel
      data[index + 1] = channel
      data[index + 2] = channel
      data[index + 3] = 255
    }
  }
  return data
}

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`

const fragmentShader = `
precision highp float;
uniform float uTime;
uniform vec3 uResolution;
uniform sampler2D uNoiseTexture;
uniform float uPupilSize;
uniform float uIrisWidth;
uniform float uGlowIntensity;
uniform float uIntensity;
uniform float uScale;
uniform float uNoiseScale;
uniform vec2 uMouse;
uniform float uPupilFollow;
uniform float uFlameSpeed;
uniform vec3 uEyeColor;
uniform vec3 uBgColor;
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / uResolution.y;
  uv /= uScale;
  float ft = uTime * uFlameSpeed;
  float polarRadius = length(uv) * 2.0;
  float polarAngle = (2.0 * atan(uv.x, uv.y)) / 6.28 * 0.3;
  vec2 polarUv = vec2(polarRadius, polarAngle);
  vec4 noiseA = texture2D(uNoiseTexture, polarUv * vec2(0.2, 7.0) * uNoiseScale + vec2(-ft * 0.1, 0.0));
  vec4 noiseB = texture2D(uNoiseTexture, polarUv * vec2(0.3, 4.0) * uNoiseScale + vec2(-ft * 0.2, 0.0));
  vec4 noiseC = texture2D(uNoiseTexture, polarUv * vec2(0.1, 5.0) * uNoiseScale + vec2(-ft * 0.1, 0.0));
  float eyeDistance = length(uv);
  float distanceMask = 1.0 - eyeDistance;
  float innerRing = clamp(-1.0 * ((distanceMask - 0.7) / uIrisWidth), 0.0, 1.0);
  innerRing = (innerRing * distanceMask - 0.2) / 0.28;
  innerRing = clamp((innerRing + noiseA.r - 0.5) * 1.3, 0.0, 1.0);
  float outerRing = clamp(-1.0 * ((distanceMask - 0.5) / 0.2), 0.0, 1.0);
  outerRing = (outerRing * distanceMask - 0.1) / 0.38;
  outerRing = clamp((outerRing + noiseC.r - 0.5) * 1.3, 0.0, 1.0);
  innerRing += outerRing;
  float innerEye = (distanceMask - 0.1 * 2.0) * noiseB.r * 2.0;
  vec2 pupilOffset = uMouse * uPupilFollow * 0.12;
  vec2 pupilUv = uv - pupilOffset;
  float slitDistance = length(pupilUv * vec2(10.5, 2.35));
  float pupil = clamp((1.0 - slitDistance) * uPupilSize, 0.0, 1.0) / 0.35;
  float eyeSignal = clamp(max(innerRing + innerEye, pupil * 1.4), 0.0, 3.0);
  float outerEyeGlow = clamp(1.0 - length(uv * vec2(0.5, 1.5)) + 0.5, 0.0, 1.0);
  outerEyeGlow += noiseC.r - 0.5;
  float outerBgGlow = outerEyeGlow;
  outerEyeGlow = clamp(pow(outerEyeGlow, 2.0) + distanceMask, 0.0, 1.0);
  outerEyeGlow *= uGlowIntensity * pow(1.0 - distanceMask, 2.0) * 2.5;
  outerBgGlow = pow(outerBgGlow + distanceMask, 0.5) * 0.15;
  float signal = clamp(max(eyeSignal, outerEyeGlow + outerBgGlow), 0.0, 3.0);
  vec3 color = uEyeColor * uIntensity * signal;
  color += uBgColor;
  gl_FragColor = vec4(color, clamp(signal, 0.0, 1.0));
}
`

let renderer: Renderer | null = null
let program: Program | null = null
let mesh: Mesh | null = null
let frame = 0
let initFrame = 0
let retryTimer = 0
let contextRecoveryTimer = 0
let resizeObserver: ResizeObserver | null = null
let canvas: HTMLCanvasElement | null = null
let mounted = false
let initAttempts = 0
const mouse = { x: 0, y: 0, tx: 0, ty: 0 }

function hasUsableSize(container: HTMLElement): boolean {
  return container.clientWidth >= 2 && container.clientHeight >= 2
}

function resize(): void {
  const container = root.value
  if (!renderer || !program || !container || !hasUsableSize(container)) return
  renderer.setSize(container.clientWidth, container.clientHeight)
  const width = renderer.gl.canvas.width
  const height = renderer.gl.canvas.height
  if (width < 2 || height < 2) return
  program.uniforms.uResolution.value = [width, height, width / height]
}

function stopRendering(): void {
  cancelAnimationFrame(frame)
  frame = 0
}

function render(time: number): void {
  if (!mounted || document.visibilityState === 'hidden' || !renderer || !program || !mesh) {
    frame = 0
    return
  }
  mouse.x += (mouse.tx - mouse.x) * 0.09
  mouse.y += (mouse.ty - mouse.y) * 0.09
  program.uniforms.uMouse.value = [mouse.x, mouse.y]
  program.uniforms.uTime.value = time * 0.001
  renderer.render({ scene: mesh })
  frame = requestAnimationFrame(render)
}

function startRendering(): void {
  if (!frame && renderer && !renderer.gl.isContextLost() && document.visibilityState !== 'hidden') {
    frame = requestAnimationFrame(render)
  }
}

function disposeRenderer(): void {
  stopRendering()
  if (canvas) {
    canvas.removeEventListener('webglcontextlost', onContextLost)
    canvas.removeEventListener('webglcontextrestored', onContextRestored)
    canvas.remove()
  }
  canvas = null
  mesh = null
  program = null
  renderer = null
}

function scheduleInitialize(delay = 0): void {
  window.clearTimeout(retryTimer)
  retryTimer = window.setTimeout(() => {
    cancelAnimationFrame(initFrame)
    initFrame = requestAnimationFrame(() => {
      initFrame = requestAnimationFrame(initialize)
    })
  }, delay)
}

function initialize(): void {
  const container = root.value
  if (!mounted || renderer || !container) return
  if (!hasUsableSize(container) || document.visibilityState === 'hidden') {
    if (initAttempts < 12) {
      initAttempts += 1
      scheduleInitialize(120)
    }
    return
  }

  try {
    const mobile = window.matchMedia('(max-width: 800px), (hover: none) and (pointer: coarse)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.2 : 1.5)
    renderer = new Renderer({ dpr, alpha: true, premultipliedAlpha: false })
    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)
    const noiseTexture = new Texture(gl, { image: generateNoiseTexture(), width: 256, height: 256, generateMipmaps: false, flipY: false })
    noiseTexture.minFilter = gl.LINEAR
    noiseTexture.magFilter = gl.LINEAR
    noiseTexture.wrapS = gl.REPEAT
    noiseTexture.wrapT = gl.REPEAT
    program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [1, 1, 1] },
        uNoiseTexture: { value: noiseTexture },
        uPupilSize: { value: 0.6 },
        uIrisWidth: { value: 0.25 },
        uGlowIntensity: { value: 0.35 },
        uIntensity: { value: 1.5 },
        uScale: { value: 0.8 },
        uNoiseScale: { value: 1 },
        uMouse: { value: [0, 0] },
        uPupilFollow: { value: 0.56 },
        uFlameSpeed: { value: 1 },
        uEyeColor: { value: hexToVec3('#d5b091') },
        uBgColor: { value: hexToVec3('#000000') },
      },
    })
    mesh = new Mesh(gl, { geometry: new Triangle(gl), program })
    canvas = gl.canvas
    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)
    container.appendChild(canvas)
    initAttempts = 0
    resize()
    startRendering()
  } catch (error) {
    console.warn('[MMD HUD] 邪眼 WebGL 初始化失败，将有限重试', error)
    disposeRenderer()
    if (mounted && initAttempts < 3) {
      initAttempts += 1
      scheduleInitialize(300 * initAttempts)
    }
  }
}

function onContextLost(event: Event): void {
  event.preventDefault()
  stopRendering()
  window.clearTimeout(contextRecoveryTimer)
  contextRecoveryTimer = window.setTimeout(() => {
    if (!mounted || !renderer?.gl.isContextLost()) return
    disposeRenderer()
    scheduleInitialize(120)
  }, 500)
}

function onContextRestored(): void {
  window.clearTimeout(contextRecoveryTimer)
  disposeRenderer()
  if (mounted) scheduleInitialize(120)
}

function onMouseMove(event: MouseEvent): void {
  const container = root.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return
  mouse.tx = Math.max(-0.92, Math.min(0.92, ((event.clientX - rect.left) / rect.width) * 2 - 1))
  mouse.ty = Math.max(-0.68, Math.min(0.68, -(((event.clientY - rect.top) / rect.height) * 2 - 1)))
}

function onMouseLeave(): void {
  mouse.tx = 0
  mouse.ty = 0
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    stopRendering()
    return
  }
  if (!renderer || renderer.gl.isContextLost()) {
    disposeRenderer()
    scheduleInitialize(120)
  } else {
    resize()
    startRendering()
  }
}

function onPageShow(): void {
  onVisibilityChange()
}

onMounted(() => {
  mounted = true
  const container = root.value
  if (!container) return
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (renderer) resize()
      else scheduleInitialize(60)
    })
    resizeObserver.observe(container)
  }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseleave', onMouseLeave)
  window.addEventListener('resize', resize)
  window.addEventListener('orientationchange', onPageShow)
  window.addEventListener('pageshow', onPageShow)
  document.addEventListener('visibilitychange', onVisibilityChange)
  scheduleInitialize()
})

onBeforeUnmount(() => {
  mounted = false
  window.clearTimeout(retryTimer)
  window.clearTimeout(contextRecoveryTimer)
  cancelAnimationFrame(initFrame)
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseleave', onMouseLeave)
  window.removeEventListener('resize', resize)
  window.removeEventListener('orientationchange', onPageShow)
  window.removeEventListener('pageshow', onPageShow)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  disposeRenderer()
})
</script>

<template><div ref="root" class="opening-webgl opening-eye" aria-hidden="true" /></template>
