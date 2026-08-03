<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { gsap } from 'gsap'
import type {
  ActionResult,
  CapabilityMap,
  ChatMessage,
  ModelConfigurationSnapshot,
  ModelOptionSnapshot,
  ModelPanelSnapshot,
  NativeAction,
} from '../../../../contracts'
import JsonTree from './JsonTree.vue'
import ModelQuickSwitcher, { type ModelBridgeAction } from './ModelQuickSwitcher.vue'

const props = defineProps<{
  messages: ChatMessage[]
  characterName: string
  revision: number
  generationStatus: string
  connected: boolean
  canSend: boolean
  sendDisabledReason?: string | null
  modelPanel: ModelPanelSnapshot
  modelConfiguration: ModelConfigurationSnapshot
  modelCapabilities: Pick<CapabilityMap, ModelBridgeAction>
  modelPending: boolean
  modelPendingAction: NativeAction | null
  currentModelName: string
  sendMessage: (text: string) => Promise<ActionResult>
  executeModelAction: (action: ModelBridgeAction, payload?: unknown) => Promise<ActionResult>
}>()

const emit = defineEmits<{
  modelSelected: [model: ModelOptionSnapshot]
}>()

const draft = ref('')
const sending = ref(false)
const sendError = ref('')
const modelOpen = ref(false)
const modelLoading = ref(false)
const modelError = ref('')
const modelButton = ref<HTMLButtonElement | null>(null)
const root = ref<HTMLElement | null>(null)
const messageList = ref<HTMLElement | null>(null)
const animatedIds = new Set<string>()
let animationContext: gsap.Context | null = null
let modelLoadTimer: ReturnType<typeof setTimeout> | null = null

function labelFor(message: ChatMessage): string {
  if (message.role === 'assistant') return props.characterName || '角色'
  if (message.role === 'user') return '你'
  if (message.role === 'system') return '系统'
  return '未知信号'
}

function messageNode(messageId: string): HTMLElement | null {
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(messageId) : messageId.replace(/["\\]/g, '\\$&')
  return messageList.value?.querySelector<HTMLElement>(`[data-message-id="${escaped}"]`) ?? null
}

function animateMessage(message: ChatMessage): void {
  if (animatedIds.has(message.id)) return
  animatedIds.add(message.id)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const node = messageNode(message.id)
  if (!node) return
  const direction = message.role === 'user' ? 20 : -20
  gsap.timeline({ defaults: { ease: 'power3.out', overwrite: 'auto' } })
    .fromTo(node, { autoAlpha: 0, x: direction, y: 12, clipPath: 'inset(0 0 100% 0)' }, { autoAlpha: 1, x: 0, y: 0, clipPath: 'inset(0 0 0% 0)', duration: .46 }, 0)
    .fromTo(node.querySelector('.stream-message__beam'), { xPercent: -120, autoAlpha: 0 }, { xPercent: 180, autoAlpha: .8, duration: .58, ease: 'power2.inOut' }, .02)
}

watch(() => ({ count: props.messages.length, lastId: props.messages.at(-1)?.id || '', lastLength: props.messages.at(-1)?.text.length || 0 }), async (current, previous) => {
  const list = messageList.value
  const nearBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 90
  await nextTick()
  if (!previous) props.messages.forEach(message => animatedIds.add(message.id))
  else if (current.count > previous.count) props.messages.slice(previous.count).forEach(animateMessage)
  if (nearBottom) messageList.value?.scrollTo({ top: messageList.value.scrollHeight, behavior: previous ? 'smooth' : 'auto' })
}, { immediate: true })

async function send(): Promise<void> {
  const text = draft.value.trim()
  if (!text || sending.value || !props.canSend) return
  sending.value = true
  sendError.value = ''
  try {
    const result = await props.sendMessage(text)
    if (result.ok) draft.value = ''
    else sendError.value = result.error?.message || 'Bridge 拒绝发送。'
  } catch (error) {
    sendError.value = error instanceof Error ? error.message : 'Bridge 发送链路异常。'
  } finally {
    sending.value = false
  }
}

function handleComposerKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void send()
}

async function openModelSwitcher(): Promise<ActionResult> {
  modelOpen.value = true
  modelLoading.value = true
  modelError.value = ''
  try {
    const result = await props.executeModelAction('openModelSettings')
    if (!result.ok) {
      modelLoading.value = false
      modelError.value = result.error?.message || '无法打开 MMD 原生模型面板。'
      return result
    }
    const panel = result.data as ModelPanelSnapshot | undefined
    if (panel?.open && panel.models.length) modelLoading.value = false
    else if (props.modelPanel.models.length) modelLoading.value = false
    else {
      if (modelLoadTimer) clearTimeout(modelLoadTimer)
      modelLoadTimer = setTimeout(() => {
        modelLoading.value = false
        if (!props.modelPanel.models.length) modelError.value = 'MMD 原生面板未在预期时间内返回模型。'
      }, 2400)
    }
    return result
  } catch (error) {
    modelLoading.value = false
    modelError.value = error instanceof Error ? error.message : '模型链路发生异常。'
    return { ok: false, action: 'openModelSettings', error: { code: 'UNKNOWN', message: modelError.value } }
  }
}

async function executeModel(action: ModelBridgeAction, payload?: unknown): Promise<ActionResult> {
  modelError.value = ''
  const result = await props.executeModelAction(action, payload)
  if (!result.ok) modelError.value = result.error?.message || `${action} 执行失败。`
  return result
}

watch(() => props.modelPanel.models.length, length => {
  if (modelOpen.value && length) {
    modelLoading.value = false
    if (modelLoadTimer) clearTimeout(modelLoadTimer)
  }
})

watch(root, node => {
  animationContext?.revert()
  if (node) animationContext = gsap.context(() => {}, node)
}, { immediate: true })

onBeforeUnmount(() => {
  animationContext?.revert()
  if (modelLoadTimer) clearTimeout(modelLoadTimer)
})
</script>

<template>
  <section ref="root" class="stream-console" aria-label="消息流与简单对话">
    <header class="stream-console__header">
      <div>
        <span class="micro-label">LIVE NARRATIVE CHANNEL</span>
        <h2>{{ characterName || '未识别角色' }}</h2>
      </div>
      <div class="stream-console__telemetry" aria-label="消息通道状态">
        <span :class="['channel-signal', { 'channel-signal--online': connected }]" />
        <strong>{{ connected ? 'LINKED' : 'OFFLINE' }}</strong><span>REV {{ revision }}</span><span>{{ generationStatus.toUpperCase() }}</span>
      </div>
    </header>

    <div ref="messageList" class="stream-console__messages" role="log" aria-live="polite" aria-relevant="additions text">
      <div v-if="!messages.length" class="stream-empty"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 12h30v22H22l-8 6v-6H9z"/><path d="M16 20h16M16 26h11"/></svg><strong>等待第一束叙事信号</strong><p>这里直接镜像 MMD 原生消息；发送仍由 MMD 处理与持久化。</p></div>
      <article v-for="message in messages" :key="message.id" :data-message-id="message.id" :class="['stream-message', `stream-message--${message.role}`, { 'stream-message--streaming': message.streaming }]">
        <i class="stream-message__beam" aria-hidden="true"/><header><span>{{ labelFor(message) }}</span><small>#{{ String(message.index + 1).padStart(3, '0') }}</small></header><p>{{ message.text }}</p>
        <details class="stream-message__raw"><summary>RAW FRAME</summary><JsonTree :value="message"/></details>
      </article>
    </div>

    <div class="composer-region">
      <p v-if="sendError" class="composer-error" role="alert">{{ sendError }}</p>
      <p v-else-if="generationStatus !== 'idle'" class="composer-status" role="status">MMD 原生生成状态：{{ generationStatus }}</p>
      <form class="stream-composer" @submit.prevent="send">
        <button ref="modelButton" type="button" class="model-trigger" :disabled="!modelCapabilities.openModelSettings.available || sending || modelPending" :title="modelCapabilities.openModelSettings.reason || '打开完整 MMD 模型控制台'" @click="openModelSwitcher">
          <span><small>CURRENT MODEL</small>{{ currentModelName || '选择模型' }}</span><b>⌄</b>
        </button>
        <label><span class="sr-only">输入消息</span><textarea v-model="draft" rows="1" maxlength="2000" placeholder="输入消息，Enter 发送，Shift+Enter 换行…" :disabled="sending || !canSend" :title="sendDisabledReason || ''" @keydown="handleComposerKeydown"/></label>
        <button type="button" class="stream-send" :disabled="sending || !draft.trim() || !canSend" @click="send"><span>{{ sending ? 'UPLINK' : 'SEND' }}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 14-7-4 14-3-6-7-1Z"/><path d="m12 13 7-8"/></svg></button>
      </form>
    </div>

    <ModelQuickSwitcher
      :open="modelOpen"
      :panel="modelPanel"
      :configuration="modelConfiguration"
      :capabilities="modelCapabilities"
      :pending="modelPending"
      :loading="modelLoading"
      :pending-action="modelPendingAction"
      :error="modelError"
      :anchor="modelButton"
      :execute="executeModel"
      @close="modelOpen = false"
      @selected="emit('modelSelected', $event)"
    />
  </section>
</template>
