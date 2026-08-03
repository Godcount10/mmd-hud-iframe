<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { gsap } from 'gsap'
import GooeyOption from './opening/GooeyOption.vue'
import LineSidebar from './opening/LineSidebar.vue'
import ParticlesCanvas from './opening/ParticlesCanvas.vue'
import EvilEyeCanvas from './opening/EvilEyeCanvas.vue'
import GradientText from './opening/GradientText.vue'

defineProps<{ characterName: string }>()
const emit = defineEmits<{ close: []; confirm: [text: string] }>()
const started = ref(false)
const transitioning = ref(false)
const landingRoot = ref<HTMLElement | null>(null)
const workspaceRoot = ref<HTMLElement | null>(null)
const activeModule = ref(0)
const selected = ref<string[]>([])
const moduleScroll = ref<HTMLElement | null>(null)
const showSecondaryEye = ref(true)
const mobileLayout = ref(false)
const selectedDrawerOpen = ref(false)
let mobileQuery: MediaQueryList | null = null
let transitionTimeline: gsap.core.Timeline | null = null
let moduleRevealObserver: IntersectionObserver | null = null
const revealTimelines: gsap.core.Timeline[] = []
const revealedModules = new Set<number>()
let scrollFrame = 0
let programmaticScrollTarget: number | null = null
let programmaticUnlockTimer = 0
const modules = [
  { label: '身份设定', value: 'identity', options: ['流浪的观测者', '沉默的继承者', '不稳定的龙血种', '被遗忘的调查员', '新世界的来客'] },
  { label: '初始倾向', value: 'tendency', options: ['谨慎观察', '主动试探', '危险直觉', '温柔共情', '冷静计算'] },
  { label: '起始地点', value: 'origin', options: ['雨夜的港口', '旧学院塔楼', '尼伯龙根入口', '无名列车', '城市边缘的灯塔'] },
  { label: '特殊记忆', value: 'memory', options: ['一段被删去的童年', '梦中反复出现的红月', '陌生人的半句遗言', '手腕上的旧刻痕', '尚未解开的密码'] },
  { label: '同行契约', value: 'bond', options: ['与未知者同行', '拒绝任何命运', '寻找失落之名', '守护一件秘密', '等待某个信号'] },
]
const currentModule = computed(() => modules[activeModule.value])
const selectedItems = computed(() => selected.value.map((value) => modules.flatMap((module) => module.options.map((label) => ({ label, value: `${module.value}:${label}` }))).find((item) => item.value === value)).filter(Boolean) as Array<{ label: string; value: string }>)
const canFinish = computed(() => selected.value.length > 0)
const draftText = computed(() => selectedItems.value.map((item) => `【${item.label}】`).join('、'))
async function startGame(): Promise<void> {
  if (transitioning.value) return
  const landing = landingRoot.value
  if (!landing) {
    started.value = true
    return
  }
  transitioning.value = true
  transitionTimeline?.kill()

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion) {
    started.value = true
    transitioning.value = false
    return
  }

  const titleChars = landing.querySelectorAll<HTMLElement>('[data-split-char]')
  const startButton = landing.querySelector<HTMLElement>('.opening-panel__start')
  const supporting = landing.querySelectorAll<HTMLElement>('.opening-panel__eyebrow, .opening-panel__subtitle')
  transitionTimeline = gsap.timeline({
    defaults: { overwrite: 'auto' },
    onComplete: async () => {
      started.value = true
      await nextTick()
      playWorkspaceEntrance()
    },
  })
  transitionTimeline
    .to(startButton, { scale: 0.92, letterSpacing: '.28em', autoAlpha: 0, y: -10, duration: 0.32, ease: 'power2.in' }, 0)
    .to(supporting, { autoAlpha: 0, y: -14, duration: 0.3, stagger: 0.04, ease: 'power2.in' }, 0.06)
    .to(titleChars, { autoAlpha: 0, y: -28, rotationX: -50, duration: 0.42, stagger: { each: 0.035, from: 'center' }, ease: 'power3.in' }, 0.08)
    .to(landing, { autoAlpha: 0, scale: 1.025, duration: 0.36, ease: 'power2.inOut' }, 0.2)
}

function prepareModuleRevealStates(): void {
  const root = moduleScroll.value
  if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const blocks = root.querySelectorAll<HTMLElement>('[data-module-index]')
  blocks.forEach((block, index) => {
    if (index === 0) {
      revealedModules.add(0)
      return
    }
    const head = block.querySelector<HTMLElement>('.opening-panel__choice-head')
    const items = block.querySelectorAll<HTMLElement>('.gooey-option-wrap')
    gsap.set(head, { autoAlpha: 0, y: 24 })
    gsap.set(items, { autoAlpha: 0, y: 20, scale: 0.975 })
    block.dataset.revealPrepared = 'true'
  })
}

function playWorkspaceEntrance(): void {
  const workspace = workspaceRoot.value
  if (!workspace) {
    transitioning.value = false
    return
  }
  prepareModuleRevealStates()
  const modulesNode = workspace.querySelector<HTMLElement>('.opening-panel__modules')
  const selectedNode = workspace.querySelector<HTMLElement>('.opening-panel__selected')
  const choiceHead = workspace.querySelector<HTMLElement>('.opening-panel__choice-head')
  const optionItems = workspace.querySelectorAll<HTMLElement>('[data-module-index="0"] .gooey-option-wrap')
  transitionTimeline = gsap.timeline({
    defaults: { ease: 'power3.out' },
    onComplete: () => {
      transitioning.value = false
      transitionTimeline = null
      updateActiveModule()
      setupModuleRevealObserver()
    },
  })
  transitionTimeline
    .from(workspace, { autoAlpha: 0, scale: 0.985, duration: 0.48 }, 0)
    .from(modulesNode, { autoAlpha: 0, x: mobileLayout.value ? 0 : -30, y: mobileLayout.value ? -14 : 0, duration: 0.45 }, 0.08)
    .from(choiceHead, { autoAlpha: 0, y: 22, duration: 0.42 }, 0.12)
    .from(optionItems, { autoAlpha: 0, y: 18, scale: 0.97, duration: 0.38, stagger: 0.055 }, 0.18)
    .from(selectedNode, { autoAlpha: 0, x: mobileLayout.value ? 0 : 26, y: mobileLayout.value ? 18 : 0, duration: 0.42 }, 0.24)
}

function revealModule(node: HTMLElement): void {
  const index = Number(node.dataset.moduleIndex)
  if (!Number.isFinite(index) || revealedModules.has(index)) return
  revealedModules.add(index)
  if (index === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    node.dataset.revealPrepared = 'false'
    return
  }
  const head = node.querySelector<HTMLElement>('.opening-panel__choice-head')
  const items = node.querySelectorAll<HTMLElement>('.gooey-option-wrap')
  const timeline = gsap.timeline({
    defaults: { ease: 'power2.out', overwrite: 'auto' },
    onStart: () => { node.dataset.revealPrepared = 'false' },
  })
    .to(head, { autoAlpha: 1, y: 0, duration: 0.36 }, 0)
    .to(items, {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.34,
      stagger: 0.045,
    }, 0.08)
  revealTimelines.push(timeline)
}

function setupModuleRevealObserver(): void {
  moduleRevealObserver?.disconnect()
  moduleRevealObserver = null
  const root = moduleScroll.value
  if (!root) return
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-module-index]'))
  if (typeof IntersectionObserver === 'undefined') {
    blocks.forEach(revealModule)
    return
  }
  moduleRevealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.18) return
      const node = entry.target as HTMLElement
      revealModule(node)
      moduleRevealObserver?.unobserve(node)
    })
  }, {
    root,
    rootMargin: '0px 0px -8% 0px',
    threshold: [0.18, 0.35],
  })
  blocks.forEach((block, index) => {
    if (index === 0) {
      revealedModules.add(0)
      return
    }
    moduleRevealObserver?.observe(block)
  })
  requestAnimationFrame(() => {
    const rootRect = root.getBoundingClientRect()
    blocks.forEach((block, index) => {
      if (index === 0 || revealedModules.has(index)) return
      const rect = block.getBoundingClientRect()
      if (rect.top < rootRect.bottom * 0.92 && rect.bottom > rootRect.top) {
        revealModule(block)
        moduleRevealObserver?.unobserve(block)
      }
    })
  })
}

function updateActiveModule(): void {
  scrollFrame = 0
  const root = moduleScroll.value
  if (!root) return
  if (programmaticScrollTarget !== null) {
    activeModule.value = programmaticScrollTarget
    return
  }
  const maxScroll = root.scrollHeight - root.clientHeight
  if (maxScroll > 0 && root.scrollTop >= maxScroll - 8) {
    activeModule.value = modules.length - 1
    return
  }
  const rootTop = root.getBoundingClientRect().top
  const activationLine = rootTop + Math.min(120, root.clientHeight * 0.24)
  let nearest = activeModule.value
  let nearestDistance = Number.POSITIVE_INFINITY
  root.querySelectorAll<HTMLElement>('[data-module-index]').forEach((node) => {
    const rect = node.getBoundingClientRect()
    const distance = rect.top <= activationLine && rect.bottom >= activationLine
      ? 0
      : Math.min(Math.abs(rect.top - activationLine), Math.abs(rect.bottom - activationLine))
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = Number(node.dataset.moduleIndex)
    }
  })
  if (nearest !== activeModule.value) activeModule.value = nearest
}
function handleModuleScroll(): void {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(updateActiveModule)
}
function selectModule(index: number): void {
  const root = moduleScroll.value
  const target = root?.querySelector<HTMLElement>(`[data-module-index="${index}"]`)
  activeModule.value = index
  programmaticScrollTarget = index
  window.clearTimeout(programmaticUnlockTimer)
  if (root && target) {
    const top = target.offsetTop - 24
    root.scrollTo({ top, behavior: 'smooth' })
  }
  programmaticUnlockTimer = window.setTimeout(() => {
    programmaticScrollTarget = null
    updateActiveModule()
  }, 650)
}
function choose(option: string, moduleValue = currentModule.value.value): void {
  const value = `${moduleValue}:${option}`
  if (selected.value.includes(value)) selected.value = selected.value.filter((item) => item !== value)
  else selected.value = [...selected.value, value]
}
function remove(value: string): void { selected.value = selected.value.filter((item) => item !== value) }
function finish(): void { if (canFinish.value) emit('confirm', `我的开局选择：${draftText.value}`) }
function openSelectedDrawer(): void { selectedDrawerOpen.value = true }
function closeSelectedDrawer(): void { selectedDrawerOpen.value = false }
function syncDeviceLayout(): void {
  mobileLayout.value = mobileQuery?.matches ?? false
  showSecondaryEye.value = !mobileLayout.value
  if (!mobileLayout.value) selectedDrawerOpen.value = false
}
onMounted(() => {
  mobileQuery = window.matchMedia('(max-width: 800px), (hover: none) and (pointer: coarse)')
  syncDeviceLayout()
  mobileQuery.addEventListener('change', syncDeviceLayout)
})
onBeforeUnmount(() => {
  transitionTimeline?.kill()
  moduleRevealObserver?.disconnect()
  revealTimelines.forEach((timeline) => timeline.kill())
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  window.clearTimeout(programmaticUnlockTimer)
  mobileQuery?.removeEventListener('change', syncDeviceLayout)
  mobileQuery = null
})
</script>

<template>
  <section class="opening-panel" :class="{ 'opening-panel--started': started, 'opening-panel--transitioning': transitioning }" role="dialog" aria-modal="true" aria-label="开局面板">
    <ParticlesCanvas class="opening-panel__particles" />
    <div v-if="!started" class="opening-panel__eye-stage opening-panel__eye-stage--center">
      <EvilEyeCanvas class="opening-panel__eye" />
    </div>
    <div class="opening-panel__veil" />
    <div class="opening-panel__scanlines" />

    <template v-if="!started">
      <div ref="landingRoot" class="opening-panel__landing">
        <p class="opening-panel__eyebrow">INITIALIZATION // 00</p>
        <h1 class="opening-panel__title">
          <span v-for="char in '开局面板'" :key="char" data-split-char class="opening-panel__title-char">{{ char }}</span>
        </h1>
        <p class="opening-panel__subtitle">准备进入未知叙事空间</p>
        <button type="button" class="opening-panel__start" :disabled="transitioning" @click="startGame"><span>开始游戏</span></button>
      </div>
    </template>

    <template v-else>
      <div ref="workspaceRoot" class="opening-panel__workspace">
        <aside class="opening-panel__modules">
          <LineSidebar :items="modules.map((module) => module.label)" :active-index="activeModule" :scroll-root="moduleScroll" @select="selectModule" />
        </aside>
        <section ref="moduleScroll" class="opening-panel__choice-area" @scroll.passive="handleModuleScroll">
          <div v-for="(module, moduleIndex) in modules" :key="module.value" :data-module-index="moduleIndex" class="opening-panel__module-block">
            <header class="opening-panel__choice-head">
              <p class="opening-panel__eyebrow">MODULE // {{ String(moduleIndex + 1).padStart(2, '0') }}</p>
              <h1>{{ module.label }}</h1>
              <p>选择一项或多项，选择会实时记录在右侧。</p>
            </header>
            <div class="opening-panel__choice-scroll">
              <div class="opening-panel__option-grid">
                <GooeyOption
                  v-for="option in module.options"
                  :key="option"
                  :label="option"
                  :selected="selected.includes(`${module.value}:${option}`)"
                  @select="choose(option, module.value)"
                />
              </div>
            </div>
          </div>
        </section>
        <aside class="opening-panel__selected">
          <div v-if="showSecondaryEye" class="opening-panel__selected-eye">
            <EvilEyeCanvas class="opening-panel__eye" />
          </div>
          <template v-if="!mobileLayout">
            <div class="opening-panel__selected-head"><span>已选择</span><b>{{ selectedItems.length }}</b></div>
            <div class="opening-panel__selected-list">
              <button v-for="item in selectedItems" :key="item.value" type="button" class="opening-panel__selected-item" @click="remove(item.value)">{{ item.label }} <span>×</span></button>
              <p v-if="!selectedItems.length" class="opening-panel__selected-empty">尚未选择命运分支</p>
            </div>
          </template>
          <div v-else class="opening-panel__mobile-summary">
            <button type="button" class="opening-panel__selected-trigger" @click="openSelectedDrawer">
              <span>已选择</span><b>{{ selectedItems.length }}</b><em>查看 / 修改</em>
            </button>
            <p>完成选择后，结果会写入对话输入框供你确认。</p>
          </div>
          <GradientText class="opening-panel__finish" :class="{ 'opening-panel__finish--disabled': !canFinish }" @click="finish">选择完毕</GradientText>
        </aside>
      </div>

      <div v-if="mobileLayout && selectedDrawerOpen" class="opening-selected-drawer" role="dialog" aria-modal="true" aria-label="已选择的开局选项">
        <button type="button" class="opening-selected-drawer__scrim" aria-label="关闭已选择界面" @click="closeSelectedDrawer" />
        <section class="opening-selected-drawer__panel">
          <header>
            <div><span>SELECTED PATHS</span><h2>已选择</h2></div>
            <button type="button" aria-label="关闭" @click="closeSelectedDrawer">关闭</button>
          </header>
          <div class="opening-selected-drawer__list">
            <button v-for="item in selectedItems" :key="item.value" type="button" @click="remove(item.value)">
              <span>{{ item.label }}</span><em>移除 ×</em>
            </button>
            <p v-if="!selectedItems.length">尚未选择命运分支</p>
          </div>
          <footer><span>共 {{ selectedItems.length }} 项</span><button type="button" @click="closeSelectedDrawer">返回选择</button></footer>
        </section>
      </div>
    </template>
  </section>
</template>
