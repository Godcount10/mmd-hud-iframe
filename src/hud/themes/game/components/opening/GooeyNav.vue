<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface GooeyItem { label: string; value: string }
const props = defineProps<{ items: GooeyItem[]; activeValue: string | null }>()
const emit = defineEmits<{ select: [value: string] }>()
const container = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
const effect = ref<HTMLElement | null>(null)
const effectText = ref<HTMLElement | null>(null)
let timers: number[] = []
const pointer = ref(0)

function updatePosition(node: HTMLElement): void {
  if (!container.value || !effect.value || !effectText.value) return
  const base = container.value.getBoundingClientRect()
  const rect = node.getBoundingClientRect()
  const style = { left: `${rect.left - base.left}px`, top: `${rect.top - base.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }
  Object.assign(effect.value.style, style)
  Object.assign(effectText.value.style, style)
  effectText.value.textContent = node.textContent ?? ''
}
function particles(): void {
  if (!effect.value) return
  effect.value.querySelectorAll('.opening-gooey-particle').forEach((node) => node.remove())
  for (let index = 0; index < 12; index += 1) {
    const particle = document.createElement('i')
    particle.className = 'opening-gooey-particle'
    particle.style.setProperty('--angle', `${index * 30 + (Math.random() * 14 - 7)}deg`)
    particle.style.setProperty('--distance', `${18 + Math.random() * 42}px`)
    particle.style.setProperty('--delay', `${Math.random() * 100}ms`)
    effect.value.appendChild(particle)
    timers.push(window.setTimeout(() => particle.remove(), 680))
  }
}
async function select(item: GooeyItem, event: MouseEvent): Promise<void> {
  event.preventDefault()
  emit('select', item.value)
  await nextTick()
  const node = [...(list.value?.querySelectorAll<HTMLElement>('[data-value]') ?? [])].find((candidate) => candidate.dataset.value === item.value)
  if (!node) return
  updatePosition(node)
  effectText.value?.classList.remove('active')
  void effectText.value?.offsetWidth
  effectText.value?.classList.add('active')
  particles()
}
watch(() => props.activeValue, async (value) => {
  if (!value) return
  await nextTick()
  const node = [...(list.value?.querySelectorAll<HTMLElement>('[data-value]') ?? [])].find((candidate) => candidate.dataset.value === value)
  if (node) updatePosition(node)
})
onMounted(() => { pointer.value = requestAnimationFrame(() => { const node = list.value?.querySelector<HTMLElement>('[data-value]'); if (node) updatePosition(node) }) })
onBeforeUnmount(() => { cancelAnimationFrame(pointer.value); timers.forEach((timer) => window.clearTimeout(timer)) })
</script>

<template>
  <div ref="container" class="opening-gooey-nav">
    <nav>
      <ul ref="list">
        <li v-for="item in items" :key="item.value" :data-value="item.value" :class="{ active: activeValue === item.value }">
          <a href="#" @click="select(item, $event)">{{ item.label }}</a>
        </li>
      </ul>
    </nav>
    <span ref="effect" class="opening-gooey-effect opening-gooey-effect--filter" />
    <span ref="effectText" class="opening-gooey-effect opening-gooey-effect--text" />
  </div>
</template>
