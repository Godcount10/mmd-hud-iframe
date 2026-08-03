<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { gsap } from 'gsap'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  eyebrow?: string
  description?: string
  size?: 'small' | 'medium' | 'large'
  closeLabel?: string
}>(), {
  eyebrow: 'GAME SYSTEM',
  description: '',
  size: 'medium',
  closeLabel: '关闭',
})

const emit = defineEmits<{ close: [] }>()
const root = ref<HTMLElement | null>(null)
const dialog = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
let context: gsap.Context | null = null
let previousFocus: HTMLElement | null = null

async function enter(): Promise<void> {
  await nextTick()
  if (!root.value || !dialog.value) return
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  context?.revert()
  context = gsap.context(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.from('.game-dialog__scrim', { autoAlpha: 0, duration: 0.18 })
    gsap.from(dialog.value, { autoAlpha: 0, y: 24, scale: 0.975, duration: 0.38, ease: 'power3.out' })
  }, root.value)
  closeButton.value?.focus()
}

function restoreFocus(): void {
  context?.revert()
  context = null
  previousFocus?.focus()
  previousFocus = null
}

function close(): void {
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') close()
  if (event.key !== 'Tab' || !dialog.value) return
  const focusable = Array.from(dialog.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  if (props.open) enter()
  window.addEventListener('keydown', onKeydown)
})

watch(() => props.open, (open) => {
  if (open) void enter()
  else restoreFocus()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  restoreFocus()
})
</script>

<template>
  <div v-if="open" ref="root" class="game-dialog" role="presentation">
    <button class="game-dialog__scrim" type="button" tabindex="-1" aria-label="关闭弹窗" @click="close" />
    <section
      ref="dialog"
      class="game-dialog__panel"
      :class="`game-dialog__panel--${size}`"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`game-dialog-${title}`"
    >
      <header class="game-dialog__header">
        <div>
          <span>{{ eyebrow }}</span>
          <h2 :id="`game-dialog-${title}`">{{ title }}</h2>
          <p v-if="description">{{ description }}</p>
        </div>
        <button ref="closeButton" type="button" class="game-dialog__close" @click="close">{{ closeLabel }}</button>
      </header>
      <div class="game-dialog__body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="game-dialog__footer">
        <slot name="footer" />
      </footer>
    </section>
  </div>
</template>
