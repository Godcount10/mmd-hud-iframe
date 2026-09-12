<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { gsap } from 'gsap'
import { ALL_NATIVE_ACTIONS, type ActionResult, type ModelOptionSnapshot, type NativeAction } from '../../../contracts'
import { ACTION_DEBUG_MANIFEST, resolveActionDefinition } from './actionDebugManifest'
import { DEBUG_WORKFLOWS } from './workflowManifest'
import { useBridgeLab } from './composables/useBridgeLab'
import { useActionExecutor } from './composables/useActionExecutor'
import { useSnapshotHistory } from './composables/useSnapshotHistory'
import { useEffectSettings } from './composables/useEffectSettings'
import { buildBridgeDebugExport, downloadBridgeDebugExport } from './composables/useLabExport'
import { cloneDebugValue } from './utils/cloneDebugValue'
import { pendingConfirmationFromResult } from './utils/pendingConfirmation'
import { diffJson } from './utils/jsonDiff'
import JsonTree from './components/JsonTree.vue'
import PayloadForm from './components/PayloadForm.vue'
import SafetyConfirmDialog from './components/SafetyConfirmDialog.vue'
import LetterGlitch from './components/LetterGlitch.vue'
import ClickSpark from './components/ClickSpark.vue'
import EffectsSettingsPanel, { type EffectsRuntimeState } from './components/EffectsSettingsPanel.vue'
import MessageStreamPanel from './components/MessageStreamPanel.vue'
import type { ModelBridgeAction } from './components/ModelQuickSwitcher.vue'

const { context, events, droppedEvents, clearEvents } = useBridgeLab()
const { snapshots, droppedSnapshots, clearSnapshots } = useSnapshotHistory(context.snapshot)
// Support status follows the connected Host's live registry (from the handshake),
// not the built-in static manifest — a host-provided bridge can register actions
// the DOM adapter leaves contract-only.
const registeredSet = computed(() => new Set(context.registeredActions.value))
const supportOf = (action: NativeAction) => resolveActionDefinition(action, registeredSet.value).support
const executor = useActionExecutor(context.snapshot, context.invokeDynamic, (action) => registeredSet.value.has(action))
const effects = useEffectSettings()

type SurfaceMode = 'chat' | 'debug' | 'effects'
const SURFACE_MODES: SurfaceMode[] = ['chat', 'debug', 'effects']

const selectedAction = ref<NativeAction>('sendMessage')
const activeAction = ref<NativeAction | null>(null)
const payload = ref<unknown>(undefined)
const query = ref('')
const group = ref('全部')
const supportFilter = ref<'all' | 'registered' | 'contract-only'>('all')
const availabilityFilter = ref<'all' | 'available' | 'unavailable'>('all')
const rightTab = ref<'result' | 'snapshot' | 'diff' | 'events' | 'workflows'>('result')
const surfaceMode = ref<SurfaceMode>('debug')
const booting = ref(true)
const bootLeaving = ref(false)
const hyperspeedFallback = ref(false)
const cachedModelName = ref('')
const labRoot = ref<HTMLElement | null>(null)
const surfaceRoot = ref<HTMLElement | null>(null)
const surfaceTabs = ref<HTMLElement | null>(null)
const confirmOpen = ref(false)
const confirmedPayload = ref<unknown>(undefined)
const confirmedRevision = ref<number | null>(null)
const confirmationMode = ref<'execute' | 'commit-token'>('execute')
const fullExportConfirm = ref(false)
const baseRevision = ref<number | null>(null)
const targetRevision = ref<number | null>(null)

const definition = computed(() => resolveActionDefinition(selectedAction.value, registeredSet.value))
const registeredCount = computed(() => ALL_NATIVE_ACTIONS.filter((action) => registeredSet.value.has(action)).length)
const contractOnlyCount = computed(() => ALL_NATIVE_ACTIONS.length - registeredCount.value)
const selectedCapability = computed(() => context.snapshot.value.capabilities[selectedAction.value])
const groups = computed(() => ['全部', ...new Set(Object.values(ACTION_DEBUG_MANIFEST).map((item) => item.group))])
const filteredActions = computed(() => ALL_NATIVE_ACTIONS.filter((action) => {
  const item = ACTION_DEBUG_MANIFEST[action]
  const capability = context.snapshot.value.capabilities[action]
  const matchesText = `${action} ${item.label} ${item.description}`.toLowerCase().includes(query.value.toLowerCase())
  const matchesGroup = group.value === '全部' || item.group === group.value
  const matchesSupport = supportFilter.value === 'all' || supportOf(action) === supportFilter.value
  const matchesAvailability = availabilityFilter.value === 'all'
    || (availabilityFilter.value === 'available' ? capability.available : !capability.available)
  return matchesText && matchesGroup && matchesSupport && matchesAvailability
}))

const canExecute = computed(() => definition.value.support === 'registered'
  && selectedCapability.value.available
  && !executor.pending.value
  && (definition.value.payloadKind === 'none' || payload.value !== undefined)
  && (selectedAction.value !== 'deleteConversation' || executor.pendingConfirmation.value?.kind === 'conversation-delete'))

const canExecuteReason = computed(() => {
  if (definition.value.support === 'contract-only') return '没有 handler，不允许执行'
  if (selectedAction.value === 'deleteConversation' && executor.pendingConfirmation.value?.kind !== 'conversation-delete') {
    return '请先执行“请求删除会话”，等待 Bridge 生成确认 token'
  }
  return selectedCapability.value.reason || '请选择完整的当前快照 payload'
})

const latestRun = computed(() => executor.actionRuns.value[0] ?? null)
const baseSnapshot = computed(() => snapshots.value.find((item) => item.revision === baseRevision.value)?.snapshot ?? null)
const targetSnapshot = computed(() => snapshots.value.find((item) => item.revision === targetRevision.value)?.snapshot ?? context.snapshot.value)
const snapshotDiff = computed(() => baseSnapshot.value ? diffJson(baseSnapshot.value, targetSnapshot.value) : [])
const eventRows = computed(() => [...events.value].reverse())
const availableCount = computed(() => ALL_NATIVE_ACTIONS.filter((action) => context.snapshot.value.capabilities[action].available).length)
const currentModelName = computed(() => cachedModelName.value || context.snapshot.value.modelPanel.models.find(model => model.selected)?.name || '选择模型')
const hyperspeedEnabled = computed(() => !booting.value && surfaceMode.value === 'effects' && effects.canRun.value && !hyperspeedFallback.value)
const effectsRuntimeState = computed<EffectsRuntimeState>(() => {
  if (hyperspeedFallback.value) return 'fallback'
  if (!effects.settings.value.enabled) return 'disabled'
  if (effects.reducedMotion.value) return 'reduced-motion'
  if (!effects.pageVisible.value) return 'page-hidden'
  if (effects.mobile.value && (effects.settings.value.mobile === 'off'
    || (effects.settings.value.mobile === 'auto'
      && (effects.settings.value.intensity === 'hyper' || effects.settings.value.density === 'high')))) return 'mobile-blocked'
  return hyperspeedEnabled.value ? 'active' : 'ready'
})
const hudVersion = __MMD_HUD_VERSION__
let modeTimeline: gsap.core.Timeline | null = null
let modeContext: gsap.Context | null = null

async function enterLab(): Promise<void> {
  if (!booting.value || bootLeaving.value) return
  bootLeaving.value = true
  surfaceMode.value = 'debug'
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduced) await gsap.to('.boot-sequence', { autoAlpha: 0, scale: 1.025, filter: 'blur(6px)', duration: .34, ease: 'power2.in' })
  booting.value = false
  bootLeaving.value = false
  await nextTick()
  animateCurrentSurface()
}

function animateCurrentSurface(): void {
  const node = surfaceRoot.value
  modeContext?.revert()
  modeContext = null
  if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  modeTimeline?.kill()
  const selectors: Record<SurfaceMode, string> = {
    chat: '.stream-console',
    debug: '.lab-grid',
    effects: '.effects-surface',
  }
  const target = node.querySelector<HTMLElement>(selectors[surfaceMode.value])
  if (!target) return
  modeContext = gsap.context(() => {
    modeTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
      .fromTo(target, { autoAlpha: 0, y: 18, clipPath: 'inset(0 0 8% 0)' }, { autoAlpha: 1, y: 0, clipPath: 'inset(0 0 0% 0)', duration: 0.48 })
    if (surfaceMode.value === 'debug') {
      modeTimeline.fromTo(target.children, { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, duration: 0.3, stagger: 0.07 }, 0.12)
    }
  }, node)
}

async function setSurfaceMode(mode: SurfaceMode, focusHeading = false): Promise<void> {
  if (surfaceMode.value !== mode) surfaceMode.value = mode
  await nextTick()
  animateCurrentSurface()
  if (focusHeading && mode === 'effects') document.querySelector<HTMLElement>('#effects-title')?.focus()
}

function handleSurfaceKeydown(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const current = SURFACE_MODES.indexOf(surfaceMode.value)
  const next = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? SURFACE_MODES.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + SURFACE_MODES.length) % SURFACE_MODES.length
  const mode = SURFACE_MODES[next]!
  void setSurfaceMode(mode).then(() => {
    surfaceTabs.value?.querySelector<HTMLButtonElement>(`[data-surface-tab="${mode}"]`)?.focus()
  })
}

async function executeTrackedAction(action: NativeAction, payload?: unknown): Promise<ActionResult> {
  activeAction.value = action
  try {
    return await executor.execute(action, payload)
  } finally {
    activeAction.value = null
  }
}

async function sendChatMessage(text: string): Promise<ActionResult> {
  const result = await executeTrackedAction('sendMessage', { text })
  if (!result.ok) rightTab.value = 'result'
  return result
}

async function executeModelAction(action: ModelBridgeAction, payload?: unknown): Promise<ActionResult> {
  const result = await executeTrackedAction(action, payload)
  if (!result.ok) rightTab.value = 'result'
  return result
}

function cacheModel(model: ModelOptionSnapshot): void {
  cachedModelName.value = model.name
}

async function hideLab(): Promise<void> {
  await context.hideHud()
}

watch(
  () => ({
    open: context.snapshot.value.modelPanel.open,
    selectedId: context.snapshot.value.modelPanel.selectedModelId,
    models: context.snapshot.value.modelPanel.models,
  }),
  ({ open, selectedId, models }) => {
    if (!open) return
    const selected = models.find(model => model.id === selectedId || model.selected)
    if (selected) cachedModelName.value = selected.name
  },
)

watch(surfaceMode, () => {
  document.title = 'GC的实验室'
})

onBeforeUnmount(() => {
  modeTimeline?.kill()
  modeContext?.revert()
})

watch(snapshots, (value) => {
  if (targetRevision.value == null) targetRevision.value = value.at(-1)?.revision ?? null
  if (baseRevision.value == null && value.length > 1) baseRevision.value = value.at(-2)?.revision ?? null
}, { deep: true, immediate: true })

watch(selectedAction, () => {
  payload.value = undefined
  confirmOpen.value = false
})

function runRequested(): void {
  if (!canExecute.value) return
  if (definition.value.confirm) {
    confirmationMode.value = 'execute'
    confirmedPayload.value = payload.value === undefined ? undefined : cloneDebugValue(payload.value)
    confirmedRevision.value = context.snapshot.value.revision
    confirmOpen.value = true
  } else {
    void executeSelected()
  }
}

function readConfirmation(result: ActionResult): void {
  const confirmation = pendingConfirmationFromResult(result)
  if (confirmation) executor.setConfirmation(confirmation)
}

async function executeSelected(): Promise<void> {
  const actualPayload = selectedAction.value === 'deleteConversation'
    ? executor.pendingConfirmation.value?.payload
    : confirmationMode.value === 'execute' && confirmedRevision.value !== null
      ? confirmedPayload.value
      : payload.value
  confirmOpen.value = false
  confirmedPayload.value = undefined
  confirmedRevision.value = null
  const result = await executor.execute(selectedAction.value, actualPayload)
  readConfirmation(result)
  rightTab.value = 'result'
}

function requestTokenCommit(): void {
  const pending = executor.pendingConfirmation.value
  if (!pending) return
  selectedAction.value = pending.action
  payload.value = pending.payload
  confirmationMode.value = 'commit-token'
  confirmedPayload.value = cloneDebugValue(pending.payload)
  confirmedRevision.value = context.snapshot.value.revision
  confirmOpen.value = true
}

async function confirmSafety(): Promise<void> {
  if (confirmationMode.value === 'commit-token') {
    const pending = executor.pendingConfirmation.value
    if (!pending) return
    confirmOpen.value = false
    confirmedPayload.value = undefined
    confirmedRevision.value = null
    const result = await executor.execute(pending.action, pending.payload)
    if (result.ok) executor.clearConfirmation()
    rightTab.value = 'result'
    return
  }
  await executeSelected()
}

function exportLab(full = false): void {
  downloadBridgeDebugExport(buildBridgeDebugExport({
    registeredActions: context.registeredActions.value,
    snapshots: snapshots.value,
    events: events.value,
    actionRuns: executor.actionRuns.value,
    droppedSnapshots: droppedSnapshots.value,
    droppedEvents: droppedEvents.value,
    droppedActionRuns: executor.droppedActionRuns.value,
    full,
  }))
  fullExportConfirm.value = false
}
</script>

<template>
  <ClickSpark :disabled="effects.reducedMotion.value" spark-color="#ff72b4" :spark-count="8" :duration="400" :spark-radius="28">
  <main ref="labRoot" class="bridge-lab">
    <!--
    THESIS: 原生桥不是后台表格，而是一台可对话、可诊断的“神谕终端”；拒绝普通三栏管理台。
    OWN-WORLD: 墨黑紫晶舱体、绘梨衣樱粉主信号、冰蓝数据链、锐角切片和刻蚀线路。
    STORY: 启动校准后先进入消息链路；需要时切到完整 Bridge 实验室，所有原生边界仍可见。
    FIRST VIEWPORT: 启动仪式退场后，顶部模式闸门常驻；消息流占据主舞台，诊断状态沿边缘巡航。
    FORM: 游戏内调试终端扩展；用户已固定游戏化 HUD 与高级动效方向。
    FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
    -->
    <section v-if="booting" class="boot-sequence" aria-label="GC 调试室启动门">
      <LetterGlitch class="boot-sequence__background" :glitch-colors="['#2b4539', '#61dca3', '#61b3dc']" :glitch-speed="55" :smooth="!effects.reducedMotion.value" :paused="effects.reducedMotion.value" center-vignette outer-vignette />
      <div class="boot-sequence__veil" aria-hidden="true" />
      <div
        class="boot-gate"
        style="position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;box-sizing:border-box;width:100vw;height:100vh;margin:0;padding:24px;color:#61dca3;text-align:center;pointer-events:none"
      >
        <span>v{{ hudVersion }}</span>
        <h1>欢迎来到GC的实验室</h1>
        <button style="pointer-events:auto" type="button" :disabled="bootLeaving" @click="enterLab">{{ bootLeaving ? '正在进入…' : '开始调试' }}</button>
      </div>
    </section>

    <header v-if="!booting" class="lab-header">
      <div class="lab-identity">
        <svg viewBox="0 0 44 44" aria-hidden="true"><path d="m22 3 17 10v18L22 41 5 31V13Z"/><path d="M13 22h18M22 11v22"/></svg>
        <div>
          <span class="micro-label">GC DEBUG // MMD BRIDGE</span>
          <h1>GC的实验室</h1>
        </div>
      </div>

      <nav ref="surfaceTabs" class="surface-switcher" role="tablist" aria-label="实验室主界面" @keydown="handleSurfaceKeydown">
        <button id="surface-tab-chat" data-surface-tab="chat" type="button" role="tab" aria-controls="surface-panel" :aria-selected="surfaceMode === 'chat'" :tabindex="surfaceMode === 'chat' ? 0 : -1" :class="{ active: surfaceMode === 'chat' }" @click="setSurfaceMode('chat')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4Z"/><path d="M8 9h8M8 12h5"/></svg>
          <span><small>CHANNEL</small>消息流</span>
        </button>
        <button id="surface-tab-debug" data-surface-tab="debug" type="button" role="tab" aria-controls="surface-panel" :aria-selected="surfaceMode === 'debug'" :tabindex="surfaceMode === 'debug' ? 0 : -1" :class="{ active: surfaceMode === 'debug' }" @click="setSurfaceMode('debug')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l1 3 3 1v8l-3 1-1 3H9l-1-3-3-1V8l3-1Z"/><circle cx="12" cy="12" r="3"/></svg>
          <span><small>BRIDGE</small>调试台</span>
        </button>
        <button id="surface-tab-effects" data-surface-tab="effects" type="button" role="tab" aria-controls="surface-panel" :aria-selected="surfaceMode === 'effects'" :tabindex="surfaceMode === 'effects' ? 0 : -1" :class="{ active: surfaceMode === 'effects' }" @click="setSurfaceMode('effects')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>
          <span><small>VISUAL</small>特效舱</span>
        </button>
      </nav>

      <div class="lab-header__telemetry">
        <span :class="['status-dot', `status-dot--${context.snapshot.value.connection.status}`]" />
        <strong>{{ context.snapshot.value.connection.status }}</strong>
        <span>REV {{ context.snapshot.value.revision }}</span>
        <span>GEN {{ context.snapshot.value.generation.status }}</span>
        <span>{{ availableCount }}/{{ ALL_NATIVE_ACTIONS.length }} ONLINE</span>
      </div>
      <div class="lab-header__actions">
        <button class="lab-icon-button" type="button" title="刷新 Bridge" aria-label="刷新 Bridge" @click="void context.refresh()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 7v5h-5"/><path d="M5 17v-5h5"/><path d="M7 8a7 7 0 0 1 11-1l1 1M17 16a7 7 0 0 1-11 1l-1-1"/></svg>
        </button>
        <button class="lab-button lab-button--quiet" type="button" @click="fullExportConfirm = true">完整导出</button>
        <button class="lab-icon-button" type="button" title="查看原生界面" aria-label="查看原生界面" @click="void hideLab()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>
        </button>
        <button class="lab-button" type="button" @click="exportLab(false)">脱敏导出</button>
        <button class="lab-icon-button lab-icon-button--danger" type="button" title="销毁实验室" aria-label="销毁实验室" @click="void context.destroyHud()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14"/></svg>
        </button>
      </div>
    </header>

    <div v-if="!booting" id="surface-panel" ref="surfaceRoot" class="lab-surface" role="tabpanel" :aria-labelledby="`surface-tab-${surfaceMode}`">
      <MessageStreamPanel
        v-if="surfaceMode === 'chat'"
        :messages="context.snapshot.value.messages"
        :character-name="context.snapshot.value.character.name"
        :revision="context.snapshot.value.revision"
        :generation-status="context.snapshot.value.generation.status"
        :connected="context.snapshot.value.connection.status === 'connected'"
        :can-send="context.snapshot.value.capabilities.sendMessage.available && !executor.pending.value"
        :send-disabled-reason="context.snapshot.value.capabilities.sendMessage.reason"
        :model-panel="context.snapshot.value.modelPanel"
        :model-configuration="context.snapshot.value.modelConfiguration"
        :model-capabilities="context.snapshot.value.capabilities"
        :model-pending="executor.pending.value"
        :model-pending-action="activeAction"
        :current-model-name="currentModelName"
        :send-message="sendChatMessage"
        :execute-model-action="executeModelAction"
        @model-selected="cacheModel"
      />

      <section v-else-if="surfaceMode === 'debug'" class="lab-grid">
      <aside class="action-catalog">
        <div class="catalog-tools">
          <input v-model="query" type="search" placeholder="搜索 action / 说明" aria-label="搜索动作" />
          <select v-model="group" aria-label="动作分组">
            <option v-for="item in groups" :key="item">{{ item }}</option>
          </select>
          <div class="filter-row">
            <button type="button" :class="{ active: supportFilter === 'all' }" @click="supportFilter = 'all'">全部</button>
            <button type="button" :class="{ active: supportFilter === 'registered' }" @click="supportFilter = 'registered'">{{ registeredCount }} 已实现</button>
            <button type="button" :class="{ active: supportFilter === 'contract-only' }" @click="supportFilter = 'contract-only'">{{ contractOnlyCount }} 占位</button>
          </div>
          <div class="filter-row">
            <button type="button" :class="{ active: availabilityFilter === 'all' }" @click="availabilityFilter = 'all'">所有状态</button>
            <button type="button" :class="{ active: availabilityFilter === 'available' }" @click="availabilityFilter = 'available'">可用</button>
            <button type="button" :class="{ active: availabilityFilter === 'unavailable' }" @click="availabilityFilter = 'unavailable'">不可用</button>
          </div>
        </div>

        <nav aria-label="Bridge 动作目录">
          <button
            v-for="action in filteredActions"
            :key="action"
            type="button"
            :class="['action-row', { 'action-row--selected': selectedAction === action }]"
            @click="selectedAction = action"
          >
            <span :class="['action-row__signal', { available: context.snapshot.value.capabilities[action].available }]" />
            <span class="action-row__copy">
              <strong>{{ ACTION_DEBUG_MANIFEST[action].label }}</strong>
              <small>{{ action }}</small>
            </span>
            <span v-if="supportOf(action) === 'contract-only'" class="badge badge--muted">NO HANDLER</span>
            <span v-else-if="ACTION_DEBUG_MANIFEST[action].effect === 'destructive'" class="badge badge--danger">DANGER</span>
          </button>
        </nav>
      </aside>

      <section class="action-workbench">
        <div class="workbench-heading">
          <div>
            <p class="eyebrow">{{ definition.group }} // {{ definition.support }}</p>
            <h2>{{ definition.label }}</h2>
            <code>{{ selectedAction }}</code>
          </div>
          <div class="capability-card" :class="{ 'capability-card--on': selectedCapability.available }">
            <strong>{{ selectedCapability.available ? 'AVAILABLE' : 'FAIL-CLOSED' }}</strong>
            <span>{{ selectedCapability.reason || '当前原生结构允许执行' }}</span>
          </div>
        </div>

        <p class="workbench-description">{{ definition.description }}</p>
        <div class="workbench-meta">
          <span>{{ definition.payloadKind }}</span>
          <span>{{ definition.effect }}</span>
          <span v-if="definition.workflow">FLOW: {{ definition.workflow }}</span>
          <span>REVISION: {{ context.snapshot.value.revision }}</span>
        </div>

        <PayloadForm
          :action="selectedAction"
          :snapshot="context.snapshot.value"
          :confirm-payload="executor.pendingConfirmation.value?.payload"
          @payload="payload = $event"
        />

        <details class="payload-preview" open>
          <summary>最终 payload（只读）</summary>
          <JsonTree :value="payload" empty="此动作不需要 payload" />
        </details>

        <div v-if="executor.pendingConfirmation.value" class="token-panel">
          <p class="eyebrow">BRIDGE TOKEN // 30 SECOND WINDOW</p>
          <h3>{{ executor.pendingConfirmation.value.prompt }}</h3>
          <p>目标：{{ executor.pendingConfirmation.value.targetLabel }}</p>
          <p>Token 仅保存在内存中，不能编辑或复制。目标或窗口失效后 Bridge 会拒绝提交。</p>
          <div>
            <button class="lab-button lab-button--danger" type="button" @click="requestTokenCommit">二次确认并提交</button>
            <button class="lab-button lab-button--quiet" type="button" @click="executor.clearConfirmation">放弃本地 token</button>
          </div>
        </div>

        <footer class="workbench-footer">
          <button class="lab-button lab-button--run" type="button" :disabled="!canExecute" @click="runRequested">
            {{ executor.pending.value ? '执行中…' : '执行 Bridge Action' }}
          </button>
          <small v-if="!canExecute">{{ canExecuteReason }}</small>
        </footer>
      </section>

      <aside class="observatory">
        <div class="observatory-tabs" role="tablist">
          <button v-for="tab in (['result', 'snapshot', 'diff', 'events', 'workflows'] as const)" :key="tab" type="button" :class="{ active: rightTab === tab }" @click="rightTab = tab">{{ tab }}</button>
        </div>

        <section v-if="rightTab === 'result'" class="observatory-panel">
          <header><h3>Action Results</h3><button type="button" @click="executor.clearActionRuns">清空</button></header>
          <p v-if="!latestRun" class="empty-state">尚未执行动作。</p>
          <article v-for="run in executor.actionRuns.value" v-else :key="run.id" :class="['result-record', { 'result-record--error': !run.result.ok }]">
            <div><strong>#{{ run.id }} {{ run.action }}</strong><span>{{ run.durationMs }}ms · rev {{ run.sourceRevision }}</span></div>
            <JsonTree :value="run" />
          </article>
        </section>

        <section v-else-if="rightTab === 'snapshot'" class="observatory-panel">
          <header><h3>Snapshot Explorer</h3><button type="button" @click="clearSnapshots">保留当前</button></header>
          <p>{{ snapshots.length }} revisions · dropped {{ droppedSnapshots }}</p>
          <JsonTree :value="context.snapshot.value" />
        </section>

        <section v-else-if="rightTab === 'diff'" class="observatory-panel">
          <header><h3>Revision Diff</h3></header>
          <div class="diff-selectors">
            <select v-model="baseRevision"><option :value="null">base</option><option v-for="item in snapshots" :key="item.revision" :value="item.revision">rev {{ item.revision }}</option></select>
            <span>→</span>
            <select v-model="targetRevision"><option :value="null">current</option><option v-for="item in snapshots" :key="item.revision" :value="item.revision">rev {{ item.revision }}</option></select>
          </div>
          <p>{{ snapshotDiff.length }} changes</p>
          <JsonTree :value="snapshotDiff" />
        </section>

        <section v-else-if="rightTab === 'events'" class="observatory-panel">
          <header><h3>BridgeEvent Timeline</h3><button type="button" @click="clearEvents">清空</button></header>
          <p>{{ events.length }} events · dropped {{ droppedEvents }}</p>
          <article v-for="row in eventRows" :key="row.id" class="event-record">
            <div><strong>{{ row.event.type }}</strong><span>#{{ row.id }} · rev {{ row.revision ?? '—' }}</span></div>
            <time>{{ row.receivedAt }}</time>
            <JsonTree :value="row.event" />
          </article>
        </section>

        <section v-else class="observatory-panel">
          <header><h3>Guided Workflows</h3></header>
          <article v-for="flow in DEBUG_WORKFLOWS" :key="flow.id" class="workflow-card">
            <p class="eyebrow">{{ flow.id }}</p>
            <h4>{{ flow.label }}</h4>
            <p>{{ flow.description }}</p>
            <button v-for="action in flow.actions" :key="action" type="button" @click="selectedAction = action; rightTab = 'result'">{{ ACTION_DEBUG_MANIFEST[action].label }}</button>
          </article>
        </section>
      </aside>
      </section>

      <EffectsSettingsPanel
        v-else
        :settings="effects.settings.value"
        :runtime-state="effectsRuntimeState"
        :running="hyperspeedEnabled"
        :fallback="hyperspeedFallback || effects.reducedMotion.value"
        @reset="effects.reset(); hyperspeedFallback = false"
        @retry="hyperspeedFallback = false"
        @error="hyperspeedFallback = true"
        @update:settings="effects.settings.value = $event; hyperspeedFallback = false"
      />
    </div>

    <SafetyConfirmDialog
      :open="confirmOpen"
      :action="selectedAction"
      :label="definition.label"
      :payload="confirmedRevision !== null ? confirmedPayload : (confirmationMode === 'commit-token' ? executor.pendingConfirmation.value?.payload : payload)"
      :target-revision="confirmedRevision ?? context.snapshot.value.revision"
      :destructive="definition.effect === 'destructive'"
      @confirm="confirmSafety"
      @cancel="confirmOpen = false; confirmedPayload = undefined; confirmedRevision = null"
    />

    <div v-if="fullExportConfirm" class="safety-backdrop" @click.self="fullExportConfirm = false">
      <section class="safety-dialog" role="alertdialog" aria-modal="true">
        <p class="eyebrow">PRIVACY INTERLOCK</p>
        <h2>导出完整调试记录？</h2>
        <p class="safety-dialog__danger">完整导出可能包含聊天正文、用户人设、设定补充和分享链接。不要公开上传。</p>
        <footer><button class="lab-button lab-button--quiet" @click="fullExportConfirm = false">取消</button><button class="lab-button lab-button--danger" @click="exportLab(true)">导出完整 JSON</button></footer>
      </section>
    </div>
  </main>
  </ClickSpark>
</template>
