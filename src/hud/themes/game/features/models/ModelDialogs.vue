<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { gsap } from 'gsap'
import type { ActionResult, NativeAction } from '../../../../../contracts'
import { useHudContext } from '../../../../context'
import AppDialog from '../../overlays/AppDialog.vue'

const emit = defineEmits<{ actionResult: [result: ActionResult] }>()
const context = useHudContext()
const snapshot = context.snapshot
const pending = ref<string | null>(null)
const pickerRoot = ref<HTMLElement | null>(null)
let pickerTimeline: gsap.core.Timeline | null = null
let modelNameTimeline: gsap.core.Timeline | null = null

function playPickerEntrance(): void {
  const root = pickerRoot.value
  if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  pickerTimeline?.kill()
  const filters = root.querySelectorAll<HTMLElement>('.model-picker__filters button')
  const cards = root.querySelectorAll<HTMLElement>('.model-picker__card')
  pickerTimeline = gsap.timeline({ defaults: { ease: 'power3.out', overwrite: 'auto' } })
    .fromTo(filters, { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.035 }, 0)
    .fromTo(cards, { autoAlpha: 0, y: 18, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.38, stagger: 0.055 }, 0.1)
}

function playModelCalibration(modelId: string): void {
  const root = pickerRoot.value
  const card = root?.querySelector<HTMLElement>(`[data-model-id="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(modelId) : modelId}"]`)
  if (!card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const name = card.querySelector<HTMLElement>('.model-picker__name')
  const scan = card.querySelector<HTMLElement>('.model-picker__scan')
  modelNameTimeline?.kill()
  modelNameTimeline = gsap.timeline({ defaults: { overwrite: 'auto' } })
    .fromTo(scan, { xPercent: -110, autoAlpha: 0 }, { xPercent: 130, autoAlpha: 0.75, duration: 0.48, ease: 'power2.inOut' }, 0)
    .fromTo(card, { scale: 0.985 }, { scale: 1, duration: 0.38, ease: 'back.out(1.5)' }, 0.06)
    .fromTo(name, { autoAlpha: 0.25, letterSpacing: '.22em' }, { autoAlpha: 1, letterSpacing: '0em', duration: 0.4, ease: 'power2.out' }, 0.08)
}

async function invoke(action: NativeAction, payload?: unknown): Promise<ActionResult> {
  if (pending.value) return { ok: false, action, error: { code: 'NOT_AVAILABLE', message: '模型操作仍在执行' } }
  pending.value = action
  try {
    const result = await context.invokeDynamic(action, payload)
    emit('actionResult', result)
    if (result.ok && action === 'selectModel' && payload && typeof payload === 'object' && 'modelId' in payload) {
      await nextTick()
      playModelCalibration(String(payload.modelId))
    }
    return result
  } finally {
    pending.value = null
  }
}

function closePicker(): void {
  void invoke('closeModelSettings')
}

function closeConfiguration(): void {
  void invoke('closeModelConfiguration')
}

watch(
  () => snapshot.value.modelPanel.open,
  (open, previous) => {
    if (open && !previous) void nextTick(playPickerEntrance)
  },
)

watch(
  () => snapshot.value.modelPanel.activeFilterId,
  (current, previous) => {
    if (current && previous && current !== previous && snapshot.value.modelPanel.open) void nextTick(playPickerEntrance)
  },
)

onBeforeUnmount(() => {
  pickerTimeline?.kill()
  modelNameTimeline?.kill()
})
</script>

<template>
  <AppDialog
    :open="snapshot.modelPanel.open"
    :title="snapshot.modelPanel.title || '切换模型'"
    eyebrow="NATIVE MIRROR // MODEL"
    description="模型数据、权限和能耗均来自当前 MMD 原生面板。"
    size="large"
    @close="closePicker"
  >
    <div ref="pickerRoot" class="model-picker">
      <nav class="model-picker__filters" aria-label="模型分类">
      <button
        v-for="filter in snapshot.modelPanel.filters"
        :key="filter.id"
        type="button"
        :class="{ active: filter.active }"
        :disabled="pending !== null"
        @click="invoke('selectModelFilter', { filterId: filter.id })"
      >{{ filter.label }}</button>
      </nav>
      <div class="model-picker__list">
        <article v-for="model in snapshot.modelPanel.models" :key="model.id" class="model-picker__card" :class="{ active: model.selected }" :data-model-id="model.id">
          <i class="model-picker__scan" aria-hidden="true" />
          <button type="button" class="model-picker__main" :disabled="pending !== null" @click="invoke('selectModel', { modelId: model.id })">
            <strong class="model-picker__name">{{ model.name }}</strong>
          <span>{{ model.description || '暂无模型说明' }}</span>
          <small>{{ model.batteryLabel }}<template v-if="model.permission"> · {{ model.permission }}</template><template v-if="model.successRate"> · {{ model.successRate }}</template></small>
          </button>
          <button type="button" class="model-picker__configure" :disabled="pending !== null" @click="invoke('openModelConfiguration', { modelId: model.id })">设置</button>
        </article>
      </div>
    </div>
  </AppDialog>

  <AppDialog
    :open="snapshot.modelConfiguration.open"
    :title="snapshot.modelConfiguration.title || '模型设置'"
    eyebrow="NATIVE MIRROR // CONFIG"
    :description="snapshot.modelConfiguration.modelName"
    size="large"
    @close="closeConfiguration"
  >
    <div class="model-config__energy">{{ snapshot.modelConfiguration.energyLabel }}</div>
    <div class="model-config__controls">
      <section v-for="control in snapshot.modelConfiguration.controls" :key="control.id" class="model-config__control">
        <header>
          <div><strong>{{ control.label }}</strong><small>{{ control.description }}</small></div>
          <button
            v-if="control.type === 'toggle'"
            type="button"
            :class="{ active: control.value === true }"
            :disabled="pending !== null"
            @click="invoke('setModelSetting', { controlId: control.id })"
          >{{ control.value === true ? '已开启' : '已关闭' }}</button>
        </header>
        <div v-if="control.type === 'choice'" class="model-config__choices">
          <button
            v-for="choice in control.choices"
            :key="choice.id"
            type="button"
            :class="{ active: choice.selected }"
            :disabled="pending !== null || control.choices.length < 2"
            @click="invoke('setModelSetting', { controlId: control.id, choiceId: choice.id })"
          >{{ choice.label }}</button>
        </div>
      </section>
    </div>
    <template #footer>
      <small>设置项由当前模型动态提供。</small>
      <button type="button" class="game-button game-button--primary" :disabled="pending !== null" @click="invoke('submitModelConfiguration')">确定</button>
    </template>
  </AppDialog>
</template>
