<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { gsap } from 'gsap'

export interface StaggeredMenuAction {
  id: 'back' | 'archives' | 'comments' | 'settings' | 'exit'
  label: string
  description: string
  tone?: 'default' | 'danger'
  disabled?: boolean
  disabledReason?: string
}

const props = withDefaults(defineProps<{
  open: boolean
  items: StaggeredMenuAction[]
  colors?: string[]
  accentColor?: string
}>(), {
  colors: () => ['#c76c6a', '#d80e0e'],
  accentColor: '#d5b091',
})

const emit = defineEmits<{
  close: []
  select: [item: StaggeredMenuAction]
}>()

const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const underlays = ref<HTMLElement[]>([])
let context: gsap.Context | null = null
let timeline: gsap.core.Timeline | null = null

function setUnderlay(element: Element | null, index: number): void {
  if (element instanceof HTMLElement) underlays.value[index] = element
}

function createTimeline(): void {
  if (!root.value || !panel.value) return
  timeline?.kill()
  context?.revert()
  context = gsap.context(() => {
    gsap.set(root.value, { autoAlpha: 0, pointerEvents: 'none' })
    gsap.set(panel.value, { xPercent: 104 })
    gsap.set(underlays.value, { xPercent: 104 })
    gsap.set('.staggered-menu__item', { x: 90, autoAlpha: 0 })
    timeline = gsap.timeline({
      paused: true,
      onReverseComplete: () => {
        gsap.set(root.value, { autoAlpha: 0, pointerEvents: 'none' })
      },
    })
      .to(underlays.value, {
        xPercent: 0,
        duration: 0.62,
        stagger: 0.07,
        ease: 'power4.inOut',
      }, 0)
      .to(panel.value, { xPercent: 0, duration: 0.68, ease: 'power4.inOut' }, 0.1)
      .to('.staggered-menu__item', {
        x: 0,
        autoAlpha: 1,
        duration: 0.62,
        stagger: 0.09,
        ease: 'power3.out',
      }, 0.34)
  }, root.value)
}

async function syncMenu(open: boolean): Promise<void> {
  await nextTick()
  if (!timeline) createTimeline()
  if (!timeline || !root.value) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    timeline.progress(open ? 1 : 0).pause()
    gsap.set(root.value, { autoAlpha: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' })
    return
  }
  if (open) {
    gsap.set(root.value, { autoAlpha: 1, pointerEvents: 'auto' })
    timeline.timeScale(1).play()
  } else {
    timeline.timeScale(1.35).reverse()
  }
}

function select(item: StaggeredMenuAction): void {
  if (item.disabled) return
  emit('select', item)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.open) emit('close')
}

onMounted(() => {
  createTimeline()
  syncMenu(props.open)
  window.addEventListener('keydown', onKeydown)
})

watch(() => props.open, syncMenu)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  timeline?.kill()
  context?.revert()
})
</script>

<template>
  <aside ref="root" class="staggered-menu" :aria-hidden="!open">
    <button class="staggered-menu__scrim" type="button" aria-label="关闭菜单" @click="emit('close')" />
    <div
      v-for="(color, index) in colors"
      :key="`${color}-${index}`"
      :ref="(element) => setUnderlay(element as Element | null, index)"
      class="staggered-menu__underlay"
      :style="{ backgroundColor: color, right: `${(colors.length - index - 1) * 7}px` }"
    />
    <section ref="panel" class="staggered-menu__panel" aria-label="游戏菜单">
      <header class="staggered-menu__head">
        <div>
          <span>GAME SYSTEM</span>
          <strong>导航菜单</strong>
        </div>
        <button type="button" class="staggered-menu__close" aria-label="关闭菜单" @click="emit('close')">
          <span />
          <span />
        </button>
      </header>
      <nav class="staggered-menu__nav">
        <button
          v-for="(item, index) in items"
          :key="item.id"
          type="button"
          class="staggered-menu__item"
          :class="{
            'staggered-menu__item--danger': item.tone === 'danger',
            'staggered-menu__item--disabled': item.disabled,
          }"
          :style="{ '--menu-accent': accentColor }"
          :disabled="item.disabled"
          :title="item.disabled ? item.disabledReason : undefined"
          @click="select(item)"
        >
          <small>{{ String(index + 1).padStart(2, '0') }}</small>
          <span>
            <strong>{{ item.label }}</strong>
            <em>{{ item.description }}</em>
          </span>
          <i aria-hidden="true">↗</i>
        </button>
      </nav>
      <footer class="staggered-menu__footer">MMD HUD // LOCAL NAVIGATION</footer>
    </section>
  </aside>
</template>
