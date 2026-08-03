<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { gsap } from 'gsap'

const props = defineProps<{ label: string; selected: boolean }>()
const emit = defineEmits<{ select: [] }>()

interface LiquidBlob {
  x: number
  y: number
  size: number
  delay: number
}

const button = ref<HTMLButtonElement | null>(null)
const effectKey = ref(0)
const effectVisible = ref(false)
const blobs = ref<LiquidBlob[]>([])
let timeline: gsap.core.Timeline | null = null

function buildBlobs(width: number, height: number): LiquidBlob[] {
  const count = width < 260 ? 7 : 9
  const originX = Math.min(38, width * 0.15)
  const usableWidth = Math.max(40, width - originX - 18)
  return Array.from({ length: count }, (_, index) => ({
    x: originX + usableWidth * ((index + 0.35 + Math.random() * 0.3) / count),
    y: height * (0.28 + Math.random() * 0.44),
    size: Math.max(8, Math.min(18, height * (0.13 + Math.random() * 0.1))),
    delay: index * 0.018 + Math.random() * 0.035,
  }))
}

async function playSelectionFeedback(): Promise<void> {
  const node = button.value
  if (!node) return
  timeline?.kill()
  const rect = node.getBoundingClientRect()
  blobs.value = buildBlobs(rect.width, rect.height)
  effectKey.value += 1
  effectVisible.value = true
  await nextTick()

  const wash = node.querySelector<HTMLElement>('.gooey-option__wash')
  const blobNodes = node.querySelectorAll<HTMLElement>('.gooey-option__blob')
  const mark = node.querySelector<HTMLElement>('.gooey-option__mark')
  const label = node.querySelector<HTMLElement>('.gooey-option__label')
  if (!wash) return

  timeline = gsap.timeline({
    defaults: { overwrite: 'auto' },
    onComplete: () => {
      effectVisible.value = false
      blobs.value = []
      timeline = null
    },
  })
  timeline
    .fromTo(wash,
      { scaleX: 0.04, autoAlpha: 0, transformOrigin: 'left center' },
      { scaleX: 1, autoAlpha: 0.7, duration: 0.42, ease: 'power3.out' },
      0,
    )
    .fromTo(blobNodes,
      { x: 30, y: rect.height / 2, scale: 0, autoAlpha: 0 },
      {
        x: (index) => blobs.value[index]?.x ?? rect.width / 2,
        y: (index) => blobs.value[index]?.y ?? rect.height / 2,
        scale: 1,
        autoAlpha: 0.65,
        duration: 0.34,
        stagger: (index) => blobs.value[index]?.delay ?? 0,
        ease: 'back.out(1.45)',
      },
      0.04,
    )
    .to(blobNodes, { scale: 0.35, autoAlpha: 0, duration: 0.3, stagger: 0.012, ease: 'power2.in' }, 0.34)
    .to(wash, { autoAlpha: 0, duration: 0.24, ease: 'power1.out' }, 0.42)
    .fromTo(mark, { scale: 0.82 }, { scale: 1, duration: 0.34, ease: 'back.out(2)' }, 0.08)
    .fromTo(label, { x: -3 }, { x: 0, duration: 0.34, ease: 'power2.out' }, 0.1)
}

async function handleClick(): Promise<void> {
  const selecting = !props.selected
  emit('select')
  if (selecting) await playSelectionFeedback()
  else {
    timeline?.kill()
    timeline = null
    effectVisible.value = false
    blobs.value = []
  }
}

onBeforeUnmount(() => {
  timeline?.kill()
  timeline = null
})
</script>

<template>
  <span class="gooey-option-wrap">
    <button
      ref="button"
      type="button"
      class="gooey-option"
      :class="{ 'gooey-option--selected': props.selected }"
      :aria-pressed="props.selected"
      @click="handleClick"
    >
      <span v-if="effectVisible" :key="effectKey" class="gooey-option__effect" aria-hidden="true">
        <span class="gooey-option__wash" />
        <i
          v-for="(blob, index) in blobs"
          :key="index"
          class="gooey-option__blob"
          :style="{ width: `${blob.size}px`, height: `${blob.size}px` }"
        />
      </span>
      <span class="gooey-option__mark">{{ props.selected ? '✓' : '＋' }}</span>
      <span class="gooey-option__label">{{ props.label }}</span>
    </button>
  </span>
</template>
