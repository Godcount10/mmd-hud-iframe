<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Renderer, Program, Mesh, Triangle, Color } from 'ogl'

const root = ref<HTMLDivElement | null>(null)
const vertex = `attribute vec2 uv; attribute vec2 position; varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,0,1);}`
const fragment = `precision highp float; uniform float uTime; uniform vec3 uResolution; varying vec2 vUv; float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);} float star(vec2 p){float d=length(fract(p)-.5);return smoothstep(.06,0.,d)*hash(floor(p));} void main(){vec2 uv=(vUv-.5)*uResolution.xy/uResolution.y; uv*=1.2+sin(uTime*.08)*.03; float t=uTime*.035; vec3 c=vec3(0.0); for(float i=0.;i<3.;i+=1.){float scale=10.+i*8.; vec2 p=uv*scale+vec2(t*(i+1.)*.8,-t*.35); c+=star(p)*vec3(.28,.58,1.)*(1.-i*.22);} float haze=exp(-length(uv)*1.4); c+=haze*vec3(.025,.04,.11); gl_FragColor=vec4(c,1.);}`
let frame = 0
let renderer: Renderer | null = null
let mesh: Mesh | null = null

function resize(): void {
  if (!renderer || !root.value) return
  renderer.setSize(root.value.offsetWidth, root.value.offsetHeight)
  const program = mesh?.program as Program | undefined
  if (program) program.uniforms.uResolution.value = new Color(renderer.gl.canvas.width, renderer.gl.canvas.height, renderer.gl.canvas.width / renderer.gl.canvas.height)
}
function tick(time: number): void {
  if (!renderer || !mesh) return
  frame = requestAnimationFrame(tick)
  mesh.program.uniforms.uTime.value = time * 0.001
  renderer.render({ scene: mesh })
}
onMounted(() => {
  if (!root.value) return
  renderer = new Renderer({ alpha: true, premultipliedAlpha: false })
  const gl = renderer.gl
  gl.clearColor(0, 0, 0, 0)
  const program = new Program(gl, { vertex, fragment, uniforms: { uTime: { value: 0 }, uResolution: { value: new Color(1, 1, 1) } } })
  mesh = new Mesh(gl, { geometry: new Triangle(gl), program })
  root.value.appendChild(gl.canvas)
  window.addEventListener('resize', resize)
  resize()
  frame = requestAnimationFrame(tick)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('resize', resize)
  const gl = renderer?.gl
  if (root.value && gl?.canvas.parentNode === root.value) root.value.removeChild(gl.canvas)
  gl?.getExtension('WEBGL_lose_context')?.loseContext()
  renderer = null
  mesh = null
})
</script>

<template><div ref="root" class="opening-webgl opening-galaxy" aria-hidden="true" /></template>
