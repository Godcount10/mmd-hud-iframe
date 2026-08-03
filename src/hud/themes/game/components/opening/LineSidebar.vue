<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ items: string[]; activeIndex: number; scrollRoot?: HTMLElement | null }>()
const emit = defineEmits<{ select: [index: number] }>()
const list = ref<HTMLElement | null>(null)
const itemNodes = ref<HTMLElement[]>([])
const hoverEffects = ref<number[]>([])
const current = ref<number[]>([])
let frame = 0
let lastTime = 0

function ensureState(): void {
  const count = itemNodes.value.length
  hoverEffects.value = Array.from({ length: count }, (_, index) => hoverEffects.value[index] ?? 0)
  current.value = Array.from({ length: count }, (_, index) => current.value[index] ?? 0)
}
function startFrame(): void {
  if (frame) return
  lastTime = performance.now()
  frame = requestAnimationFrame(runFrame)
}
function runFrame(time: number): void {
  frame = 0
  const dt = Math.min((time - lastTime) / 1000, 0.05)
  lastTime = time
  const ease = 1 - Math.exp(-dt / 0.095)
  let moving = false
  itemNodes.value.forEach((node, index) => {
    const target = index === props.activeIndex ? 1 : (hoverEffects.value[index] ?? 0)
    const value = (current.value[index] ?? 0) + (target - (current.value[index] ?? 0)) * ease
    current.value[index] = value
    node.style.setProperty('--effect', value.toFixed(4))
    if (Math.abs(target - value) > 0.001) moving = true
  })
  if (moving) frame = requestAnimationFrame(runFrame)
}
function handleMove(event: PointerEvent): void {
  const node = list.value
  if (!node || event.pointerType === 'touch') return
  const rect = node.getBoundingClientRect()
  const horizontal = rect.width > rect.height * 1.5
  const pointerPosition = horizontal ? event.clientX - rect.left : event.clientY - rect.top
  hoverEffects.value = itemNodes.value.map((item, index) => {
    if (index === props.activeIndex) return 0
    const center = horizontal
      ? item.offsetLeft + item.offsetWidth / 2
      : item.offsetTop + item.offsetHeight / 2
    const distance = Math.abs(pointerPosition - center)
    const progress = Math.max(0, 1 - distance / 120)
    return progress * progress * (3 - 2 * progress)
  })
  startFrame()
}
function handleLeave(): void {
  hoverEffects.value = hoverEffects.value.map(() => 0)
  startFrame()
}
function setNode(node: HTMLElement | null, index: number): void {
  if (node) itemNodes.value[index] = node
}
watch(() => props.activeIndex, () => {
  hoverEffects.value = hoverEffects.value.map(() => 0)
  startFrame()
  const activeNode = itemNodes.value[props.activeIndex]
  activeNode?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
})
watch(() => itemNodes.value.length, ensureState)
onMounted(() => { ensureState(); startFrame() })
onBeforeUnmount(() => { if (frame) cancelAnimationFrame(frame) })
</script>

<template>
  <nav class="opening-line-sidebar" aria-label="开局模块导航">
    <ul ref="list" class="opening-line-sidebar__list" @pointermove="handleMove" @pointerleave="handleLeave">
      <li
        v-for="(item, index) in items"
        :key="item"
        :ref="(node) => setNode(node as HTMLElement | null, index)"
        class="opening-line-sidebar__item"
        :class="{ active: activeIndex === index }"
        @click="emit('select', index)"
      >
        <span class="opening-line-sidebar__marker" aria-hidden="true" />
        <span class="opening-line-sidebar__label">
          <span class="opening-line-sidebar__index">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="opening-line-sidebar__text">{{ item }}</span>
        </span>
      </li>
    </ul>
  </nav>
</template>
