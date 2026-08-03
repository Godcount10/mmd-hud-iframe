<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type {
  ActionResult,
  CapabilityMap,
  ModelConfigurationSnapshot,
  ModelOptionSnapshot,
  ModelPanelSnapshot,
  NativeAction,
} from '../../../../contracts'

export type ModelBridgeAction = Extract<NativeAction,
  | 'openModelSettings'
  | 'closeModelSettings'
  | 'selectModelFilter'
  | 'selectModel'
  | 'openModelConfiguration'
  | 'setModelSetting'
  | 'submitModelConfiguration'
  | 'closeModelConfiguration'>

const props = defineProps<{
  open: boolean
  panel: ModelPanelSnapshot
  configuration: ModelConfigurationSnapshot
  capabilities: Pick<CapabilityMap, ModelBridgeAction>
  pending: boolean
  loading: boolean
  pendingAction: NativeAction | null
  error: string
  anchor: HTMLElement | null
  execute: (action: ModelBridgeAction, payload?: unknown) => Promise<ActionResult>
}>()

const emit = defineEmits<{
  close: []
  selected: [model: ModelOptionSnapshot]
}>()

const dialog = ref<HTMLElement | null>(null)
const activeIndex = ref(0)
let closing = false

function optionNodes(): HTMLButtonElement[] {
  return dialog.value ? [...dialog.value.querySelectorAll<HTMLButtonElement>('[role="option"]')] : []
}

async function focusOption(): Promise<void> {
  await nextTick()
  const options = optionNodes()
  if (!options.length) return
  activeIndex.value = Math.max(0, Math.min(activeIndex.value, options.length - 1))
  options[activeIndex.value]?.focus()
}

function capabilityTitle(action: ModelBridgeAction, fallback: string): string {
  return props.capabilities[action].reason || fallback
}

async function waitForPanelState(readOpen: () => boolean, expected: boolean, timeoutMs = 1_000): Promise<boolean> {
  const startedAt = performance.now()
  while (readOpen() !== expected && performance.now() - startedAt < timeoutMs) {
    await new Promise(resolve => window.setTimeout(resolve, 16))
  }
  return readOpen() === expected
}

async function finishClose(): Promise<void> {
  if (closing || props.pending) return
  closing = true
  try {
    if (props.configuration.open) {
      const result = await props.execute('closeModelConfiguration')
      if (!result.ok) return
      await waitForPanelState(() => props.configuration.open, false)
    }
    if (props.panel.open || props.capabilities.closeModelSettings.available || props.loading) {
      const result = await props.execute('closeModelSettings')
      if (!result.ok) return
      await waitForPanelState(() => props.panel.open, false)
    }
    emit('close')
    await nextTick()
    props.anchor?.focus()
  } finally {
    closing = false
  }
}

async function choose(model: ModelOptionSnapshot): Promise<void> {
  const result = await props.execute('selectModel', { modelId: model.id })
  if (!result.ok) return
  emit('selected', model)
  emit('close')
}

async function openConfiguration(model: ModelOptionSnapshot): Promise<void> {
  await props.execute('openModelConfiguration', { modelId: model.id })
}

async function submitConfiguration(): Promise<void> {
  const result = await props.execute('submitModelConfiguration')
  if (!result.ok) return
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    void finishClose()
    return
  }
  if (event.key === 'Tab') {
    const focusable = dialog.value
      ? [...dialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      : []
    if (!focusable.length) {
      event.preventDefault()
      dialog.value?.focus()
      return
    }
    const first = focusable[0]!
    const last = focusable.at(-1)!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
    return
  }
  if (props.configuration.open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const length = props.panel.models.length
  if (!length) return
  if (event.key === 'Home') activeIndex.value = 0
  else if (event.key === 'End') activeIndex.value = length - 1
  else activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + length) % length
  void focusOption()
}

watch(() => props.open, async open => {
  if (!open) return
  const selectedId = props.panel.selectedModelId ?? props.panel.models.find(item => item.selected)?.id
  const currentIndex = props.panel.models.findIndex(model => model.id === selectedId)
  activeIndex.value = currentIndex >= 0 ? currentIndex : 0
  await nextTick()
  if (props.panel.models.length) await focusOption()
  else dialog.value?.focus()
}, { immediate: true })

watch(() => props.panel.models.length, length => {
  if (props.open && length && !props.configuration.open) void focusOption()
})

onBeforeUnmount(() => {
  void (async () => {
    if (props.configuration.open && props.capabilities.closeModelConfiguration.available) {
      await props.execute('closeModelConfiguration').catch(() => undefined)
      await waitForPanelState(() => props.configuration.open, false)
    }
    if (props.panel.open && props.capabilities.closeModelSettings.available) {
      await props.execute('closeModelSettings').catch(() => undefined)
    }
  })()
})
</script>

<template>
  <div v-if="open" class="model-switcher-backdrop" @click.self="finishClose">
    <section
      ref="dialog"
      class="model-switcher"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="configuration.open ? 'model-config-title' : 'model-switcher-title'"
      tabindex="-1"
      @keydown="handleKeydown"
    >
      <header>
        <div>
          <span class="micro-label">MMD NATIVE MODEL BRIDGE</span>
          <h2 v-if="!configuration.open" id="model-switcher-title">{{ panel.title || '模型控制台' }}</h2>
          <h2 v-else id="model-config-title">{{ configuration.title || '模型配置' }}</h2>
        </div>
        <button type="button" class="lab-icon-button" :disabled="pending" aria-label="关闭模型控制台" title="关闭原生模型面板" @click="finishClose">×</button>
      </header>

      <p v-if="error" class="model-switcher__error" role="alert">{{ error }}</p>
      <p v-if="pending" class="model-switcher__pending" role="status">{{ pendingAction || 'model bridge' }} 正在执行…</p>
      <p v-else-if="loading" class="model-switcher__pending" role="status">正在同步 MMD 原生模型列表…</p>

      <template v-if="configuration.open">
        <div class="model-configuration__summary">
          <div><small>MODEL</small><strong>{{ configuration.modelName || '未识别模型' }}</strong></div>
          <span>{{ configuration.energyLabel || '未返回能耗信息' }}</span>
        </div>

        <div v-if="!configuration.controls.length" class="model-switcher__state" role="status">
          <strong>原生配置没有可用控件</strong><span>可关闭配置并返回模型列表。</span>
        </div>
        <div v-else class="model-configuration__controls">
          <section v-for="control in configuration.controls" :key="control.id" class="model-configuration__control">
            <header><div><strong>{{ control.label || control.id }}</strong><small>{{ control.description || 'MMD 动态配置项' }}</small></div>
              <button
                v-if="control.type === 'toggle'"
                type="button"
                :class="{ active: control.value === true }"
                :disabled="pending || !capabilities.setModelSetting.available"
                :title="capabilityTitle('setModelSetting', '切换该配置项')"
                @click="execute('setModelSetting', { controlId: control.id })"
              >{{ control.value === true ? 'ON' : 'OFF' }}</button>
            </header>
            <div v-if="control.type === 'choice'" class="model-configuration__choices">
              <button
                v-for="choice in control.choices"
                :key="choice.id"
                type="button"
                :class="{ active: choice.selected }"
                :disabled="pending || !capabilities.setModelSetting.available || control.choices.length < 2"
                :title="capabilityTitle('setModelSetting', `选择 ${choice.label}`)"
                @click="execute('setModelSetting', { controlId: control.id, choiceId: choice.id })"
              >{{ choice.label }}</button>
            </div>
          </section>
        </div>

        <footer class="model-configuration__footer">
          <button type="button" class="lab-button lab-button--quiet" :disabled="pending || !capabilities.closeModelConfiguration.available" :title="capabilityTitle('closeModelConfiguration', '关闭配置')" @click="execute('closeModelConfiguration')">取消配置</button>
          <button type="button" class="lab-button" :disabled="pending || !capabilities.submitModelConfiguration.available" :title="capabilityTitle('submitModelConfiguration', '提交配置')" @click="submitConfiguration">提交配置</button>
        </footer>
      </template>

      <template v-else>
        <nav v-if="panel.filters.length" class="model-switcher__filters" aria-label="模型分类">
          <button
            v-for="filter in panel.filters"
            :key="filter.id"
            type="button"
            :class="{ active: filter.active || filter.id === panel.activeFilterId }"
            :disabled="pending || !capabilities.selectModelFilter.available"
            :title="capabilityTitle('selectModelFilter', `切换到 ${filter.label}`)"
            @click="execute('selectModelFilter', { filterId: filter.id })"
          >{{ filter.label }}</button>
        </nav>

        <div v-if="!panel.models.length" class="model-switcher__state" role="status">
          <strong>原生面板未返回模型</strong><span>请关闭后重新打开模型控制台。</span>
        </div>
        <div v-else class="model-switcher__list" role="listbox" aria-label="可用模型">
          <article v-for="(model, index) in panel.models" :key="model.id" :class="['model-switcher__model', { active: model.id === panel.selectedModelId || model.selected }]">
            <button
              type="button"
              class="model-switcher__main"
              role="option"
              :aria-selected="model.id === panel.selectedModelId || model.selected"
              :tabindex="index === activeIndex ? 0 : -1"
              :disabled="pending || !capabilities.selectModel.available"
              :title="capabilityTitle('selectModel', `切换到 ${model.name}`)"
              @focus="activeIndex = index"
              @click="choose(model)"
            >
              <span><strong>{{ model.name }}</strong><small>{{ model.description || 'MMD 原生模型' }}</small></span>
              <em>{{ model.batteryLabel || '能耗未知' }}</em>
              <i v-if="model.id === panel.selectedModelId || model.selected">CURRENT</i>
              <small class="model-switcher__meta">{{ [model.permission, model.successRate].filter(Boolean).join(' · ') }}</small>
            </button>
            <button
              type="button"
              class="model-switcher__configure"
              :disabled="pending || !capabilities.openModelConfiguration.available"
              :title="capabilityTitle('openModelConfiguration', `打开 ${model.name} 的原生配置`)"
              @click="openConfiguration(model)"
            >设置</button>
          </article>
        </div>
      </template>
    </section>
  </div>
</template>
