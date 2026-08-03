<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Camera, Geometry, Mesh, Program, Renderer } from 'ogl'

const root = ref<HTMLDivElement | null>(null)
const colors = ['#ffffff', '#9edcff', '#ffc4ae']
const vertex = `attribute vec3 position; attribute vec4 random; attribute vec3 color; uniform mat4 modelMatrix; uniform mat4 viewMatrix; uniform mat4 projectionMatrix; uniform float uTime; uniform float uSpread; uniform float uBaseSize; uniform float uSizeRandomness; varying vec4 vRandom; varying vec3 vColor; void main(){vRandom=random;vColor=color;vec3 pos=position*uSpread;pos.z*=10.;vec4 mPos=modelMatrix*vec4(pos,1.);float t=uTime;mPos.x+=sin(t*random.z+6.28*random.w)*mix(.1,1.5,random.x);mPos.y+=sin(t*random.y+6.28*random.x)*mix(.1,1.5,random.w);mPos.z+=sin(t*random.w+6.28*random.y)*mix(.1,1.5,random.z);vec4 mvPos=viewMatrix*mPos;gl_PointSize=(uBaseSize*(1.+uSizeRandomness*(random.x-.5)))/length(mvPos.xyz);gl_Position=projectionMatrix*mvPos;}`
const fragment = `precision highp float; uniform float uTime; varying vec4 vRandom; varying vec3 vColor; void main(){vec2 uv=gl_PointCoord.xy;float d=length(uv-.5);float circle=smoothstep(.5,.4,d)*.8;gl_FragColor=vec4(vColor+.2*sin(uv.yxx+uTime+vRandom.y*6.28),circle);}`
function hexToRgb(hex: string): [number, number, number] { const value = Number.parseInt(hex.replace('#', ''), 16); return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255] }

let renderer: Renderer | null = null
let camera: Camera | null = null
let program: Program | null = null
let particles: Mesh | null = null
let canvas: HTMLCanvasElement | null = null
let frame = 0
let initFrame = 0
let retryTimer = 0
let contextRecoveryTimer = 0
let resizeObserver: ResizeObserver | null = null
let mounted = false
let initAttempts = 0
let last = 0
let elapsed = 0

function hasUsableSize(container: HTMLElement): boolean {
  return container.clientWidth >= 2 && container.clientHeight >= 2
}

function resize(): void {
  const container = root.value
  if (!renderer || !camera || !container || !hasUsableSize(container)) return
  renderer.setSize(container.clientWidth, container.clientHeight)
  const width = renderer.gl.canvas.width
  const height = renderer.gl.canvas.height
  if (width < 2 || height < 2) return
  camera.perspective({ aspect: width / height })
}

function stopRendering(): void {
  cancelAnimationFrame(frame)
  frame = 0
}

function render(time: number): void {
  if (!mounted || document.visibilityState === 'hidden' || !renderer || !program || !particles || !camera) {
    frame = 0
    return
  }
  if (!last) last = time
  elapsed += (time - last) * 0.1
  last = time
  program.uniforms.uTime.value = elapsed * 0.001
  particles.rotation.x = Math.sin(elapsed * 0.0002) * 0.1
  particles.rotation.y = Math.cos(elapsed * 0.0005) * 0.15
  particles.rotation.z += 0.001
  renderer.render({ scene: particles, camera })
  frame = requestAnimationFrame(render)
}

function startRendering(): void {
  if (!frame && renderer && !renderer.gl.isContextLost() && document.visibilityState !== 'hidden') {
    last = performance.now()
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
  particles = null
  program = null
  camera = null
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
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.15 : 1.5)
    renderer = new Renderer({ dpr, depth: false, alpha: true })
    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)
    camera = new Camera(gl, { fov: 15 })
    camera.position.set(0, 0, 20)
    const count = mobile ? 360 : 520
    const positions = new Float32Array(count * 3)
    const randoms = new Float32Array(count * 4)
    const pointColors = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      let x = 0; let y = 0; let z = 0; let length = 0
      do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; length = x * x + y * y + z * z } while (length > 1 || length === 0)
      const radius = Math.cbrt(Math.random())
      positions.set([x * radius, y * radius, z * radius], i * 3)
      randoms.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
      pointColors.set(hexToRgb(colors[Math.floor(Math.random() * colors.length)]), i * 3)
    }
    const geometry = new Geometry(gl, { position: { size: 3, data: positions }, random: { size: 4, data: randoms }, color: { size: 3, data: pointColors } })
    program = new Program(gl, { vertex, fragment, uniforms: { uTime: { value: 0 }, uSpread: { value: 10 }, uBaseSize: { value: 74 * dpr }, uSizeRandomness: { value: 1 } }, transparent: true, depthTest: false })
    particles = new Mesh(gl, { mode: gl.POINTS, geometry, program })
    canvas = gl.canvas
    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)
    container.appendChild(canvas)
    initAttempts = 0
    resize()
    startRendering()
  } catch (error) {
    console.warn('[MMD HUD] 粒子 WebGL 初始化失败，将有限重试', error)
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
  window.removeEventListener('resize', resize)
  window.removeEventListener('orientationchange', onPageShow)
  window.removeEventListener('pageshow', onPageShow)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  disposeRenderer()
})
</script>

<template><div ref="root" class="opening-webgl opening-particles" aria-hidden="true" /></template>
