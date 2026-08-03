<template>
  <div ref="containerRef" class="click-spark" @click="handleClick">
    <canvas ref="canvasRef" class="click-spark__canvas" aria-hidden="true" />
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'

interface Spark { x: number; y: number; angle: number; startTime: number }
interface Props {
  sparkColor?: string
  sparkSize?: number
  sparkRadius?: number
  sparkCount?: number
  duration?: number
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  extraScale?: number
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  sparkColor: '#ff72b4', sparkSize: 10, sparkRadius: 28, sparkCount: 8,
  duration: 400, easing: 'ease-out', extraScale: 1, disabled: false,
})
const containerRef = useTemplateRef<HTMLDivElement>('containerRef')
const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef')
const sparks: Spark[] = []
const reducedMotion = ref(false)
const pageVisible = ref(true)
let animationId: number | null = null
let resizeObserver: ResizeObserver | null = null
let mediaQuery: MediaQueryList | null = null
let context: CanvasRenderingContext2D | null = null
let dpr = 1

const inactive = computed(() => props.disabled || reducedMotion.value || !pageVisible.value)
const ease = (t: number): number => {
  if (props.easing === 'linear') return t
  if (props.easing === 'ease-in') return t * t
  if (props.easing === 'ease-in-out') return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  return t * (2 - t)
}

function resizeCanvas(): void {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container || !context) return
  const rect = container.getBoundingClientRect()
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.max(1, Math.round(rect.width * dpr))
  canvas.height = Math.max(1, Math.round(rect.height * dpr))
  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function clear(): void {
  if (!context || !canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  context.clearRect(0, 0, rect.width, rect.height)
}

function stop(): void {
  if (animationId !== null) cancelAnimationFrame(animationId)
  animationId = null
  sparks.length = 0
  clear()
}

function draw(timestamp: number): void {
  animationId = null
  if (inactive.value || !context) return stop()
  clear()
  let write = 0
  for (const spark of sparks) {
    const elapsed = timestamp - spark.startTime
    if (elapsed >= props.duration) continue
    sparks[write++] = spark
    const eased = ease(Math.max(0, elapsed / props.duration))
    const distance = eased * props.sparkRadius * props.extraScale
    const lineLength = props.sparkSize * (1 - eased)
    const cos = Math.cos(spark.angle)
    const sin = Math.sin(spark.angle)
    context.strokeStyle = props.sparkColor
    context.lineWidth = 2
    context.globalAlpha = 1 - eased
    context.beginPath()
    context.moveTo(spark.x + distance * cos, spark.y + distance * sin)
    context.lineTo(spark.x + (distance + lineLength) * cos, spark.y + (distance + lineLength) * sin)
    context.stroke()
  }
  sparks.length = write
  context.globalAlpha = 1
  if (sparks.length) animationId = requestAnimationFrame(draw)
}

function requestDraw(): void {
  if (animationId === null && sparks.length && !inactive.value) animationId = requestAnimationFrame(draw)
}

function handleClick(event: MouseEvent): void {
  const canvas = canvasRef.value
  if (!canvas || inactive.value) return
  const rect = canvas.getBoundingClientRect()
  const now = performance.now()
  const count = Math.max(1, props.sparkCount)
  for (let index = 0; index < count; index += 1) {
    sparks.push({ x: event.clientX - rect.left, y: event.clientY - rect.top, angle: Math.PI * 2 * index / count, startTime: now })
  }
  requestDraw()
}

function syncMotion(): void { reducedMotion.value = mediaQuery?.matches ?? false }
function syncVisibility(): void {
  pageVisible.value = document.visibilityState !== 'hidden'
  if (pageVisible.value) requestDraw()
  else stop()
}

onMounted(() => {
  context = canvasRef.value?.getContext('2d') ?? null
  mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncMotion()
  syncVisibility()
  resizeCanvas()
  resizeObserver = new ResizeObserver(resizeCanvas)
  if (containerRef.value) resizeObserver.observe(containerRef.value)
  mediaQuery.addEventListener('change', syncMotion)
  document.addEventListener('visibilitychange', syncVisibility)
})

watch(inactive, value => { if (value) stop() })

onBeforeUnmount(() => {
  stop()
  resizeObserver?.disconnect()
  mediaQuery?.removeEventListener('change', syncMotion)
  document.removeEventListener('visibilitychange', syncVisibility)
})
</script>

<style scoped>
.click-spark { position: relative; width: 100%; height: 100%; overflow: hidden; }
.click-spark__canvas { position: absolute; inset: 0; z-index: 1000; pointer-events: none; }
</style>
