<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { gsap } from 'gsap'
import type { ActionResult, ChatMessage, NativeAction } from '../../../../../contracts'
import { useHudContext } from '../../../../context'
import { createSanitizedHtmlCache } from '../../../../shared/sanitizeHtml'

const context = useHudContext()
const snapshot = context.snapshot
const props = withDefaults(defineProps<{ initialDraft?: string }>(), { initialDraft: '' })
const emit = defineEmits<{
  openModels: []
  requestRollback: [messageId: string]
  actionResult: [result: ActionResult]
  draftConsumed: []
}>()
const draft = ref('')
const sending = ref(false)
const messageList = ref<HTMLElement | null>(null)
const pendingMessageAction = ref<string | null>(null)
const animatedMessageIds = new Set<string>()
const sanitizedHtml = createSanitizedHtmlCache()
let animationContext: gsap.Context | null = null
let completionTween: gsap.core.Tween | null = null
let previousGenerationStatus = snapshot.value.generation.status

function renderedMessageHtml(message: ChatMessage): string {
  return sanitizedHtml.get(message.id, message.html || message.text)
}

function messageNode(messageId: string): HTMLElement | null {
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(messageId) : messageId.replace(/["\\]/g, '\\$&')
  return messageList.value?.querySelector<HTMLElement>(`[data-message-id="${escaped}"]`) ?? null
}

function animateMessageEntrance(message: ChatMessage): void {
  if (animatedMessageIds.has(message.id)) return
  animatedMessageIds.add(message.id)
  const node = messageNode(message.id)
  if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const meta = node.querySelector<HTMLElement>('.dialogue-message__meta')
  const body = node.querySelector<HTMLElement>('.dialogue-message__body')
  const actions = node.querySelector<HTMLElement>('.dialogue-message__actions')
  const scan = node.querySelector<HTMLElement>('.dialogue-message__scan')
  const direction = message.role === 'user' ? 18 : -18
  gsap.timeline({ defaults: { ease: 'power3.out', overwrite: 'auto' } })
    .fromTo(node, { autoAlpha: 0, y: 14, x: direction, scaleY: 0.965 }, { autoAlpha: 1, y: 0, x: 0, scaleY: 1, duration: 0.44 }, 0)
    .fromTo(scan, { xPercent: -110, autoAlpha: 0 }, { xPercent: 150, autoAlpha: 0.72, duration: 0.54, ease: 'power2.inOut' }, 0.04)
    .fromTo(meta, { autoAlpha: 0, y: -5 }, { autoAlpha: 1, y: 0, duration: 0.25 }, 0.13)
    .fromTo(body, { autoAlpha: 0, y: 7 }, { autoAlpha: 1, y: 0, duration: 0.3 }, 0.17)
    .fromTo(actions, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, 0.26)
}

function animateGenerationComplete(messageId: string | null): void {
  if (!messageId || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const node = messageNode(messageId)
  if (!node) return
  completionTween?.kill()
  completionTween = gsap.fromTo(node,
    { '--message-complete': 1 },
    { '--message-complete': 0, duration: 0.8, ease: 'power2.out', clearProps: '--message-complete' },
  )
}

const currentModel = computed(() =>
  snapshot.value.modelPanel.models.find((model) => model.selected)?.name || '切换模型',
)

function canEdit(message: ChatMessage): boolean {
  return message.capabilities.edit
    && snapshot.value.capabilities.openEditMessage.available
    && pendingMessageAction.value === null
}

function canRollback(message: ChatMessage): boolean {
  return message.capabilities.rollback
    && snapshot.value.capabilities.rollbackMessage.available
    && pendingMessageAction.value === null
}

function capabilityReason(action: NativeAction, supported: boolean): string {
  if (!supported) return '该消息不支持此操作'
  return snapshot.value.capabilities[action].reason || ''
}

async function send(): Promise<void> {
  const text = draft.value.trim()
  if (!text || sending.value || !snapshot.value.capabilities.sendMessage.available) return
  sending.value = true
  try {
    const result = await context.invoke('sendMessage', { text })
    emit('actionResult', result)
    if (result.ok) draft.value = ''
  } finally {
    sending.value = false
  }
}

async function edit(messageId: string): Promise<void> {
  if (pendingMessageAction.value) return
  pendingMessageAction.value = `openEditMessage:${messageId}`
  try {
    emit('actionResult', await context.invoke('openEditMessage', { messageId }))
  } finally {
    pendingMessageAction.value = null
  }
}

function rollback(messageId: string): void {
  if (pendingMessageAction.value) return
  emit('requestRollback', messageId)
}

watch(
  () => props.initialDraft,
  (value) => {
    if (!value) return
    draft.value = value
    emit('draftConsumed')
  },
  { immediate: true },
)

watch(
  () => {
    const messages = snapshot.value.messages
    const last = messages.at(-1)
    return {
      count: messages.length,
      lastId: last?.id || '',
      lastLength: last?.text.length || 0,
      streaming: Boolean(last?.streaming),
    }
  },
  async (current, previous) => {
    const list = messageList.value
    const wasNearBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 96
    const appended = previous !== undefined && current.count > previous.count
    const firstRender = !previous
    await nextTick()
    if (firstRender) {
      snapshot.value.messages.forEach((message) => animatedMessageIds.add(message.id))
    } else if (appended) {
      const appendedMessages = snapshot.value.messages.slice(previous.count)
      appendedMessages.forEach(animateMessageEntrance)
    }
    if (!firstRender && !appended && !wasNearBottom) return
    messageList.value?.scrollTo({
      top: messageList.value.scrollHeight,
      behavior: firstRender ? 'auto' : 'smooth',
    })
  },
  { immediate: true },
)

watch(
  () => snapshot.value.messages,
  (messages, previous) => {
    if (previous && messages.length === previous.length
      && messages.every((message, index) => message.id === previous[index]?.id)) return
    sanitizedHtml.prune(messages.map((message) => message.id))
  },
  { immediate: true },
)

watch(
  () => snapshot.value.generation.status,
  (status) => {
    if (status === 'idle' && previousGenerationStatus !== 'idle') {
      void nextTick(() => animateGenerationComplete(snapshot.value.generation.messageId || snapshot.value.messages.at(-1)?.id || null))
    }
    previousGenerationStatus = status
  },
)

onMounted(() => {
  if (messageList.value) animationContext = gsap.context(() => {}, messageList.value)
})

onBeforeUnmount(() => {
  completionTween?.kill()
  animationContext?.revert()
})
</script>

<template>
  <section class="dialogue-page" aria-label="角色对话">
    <header class="dialogue-page__head">
      <div>
        <span>STORY CHANNEL</span>
        <h1>{{ snapshot.character.name }}</h1>
      </div>
      <div class="dialogue-page__signal" :class="snapshot.connection.status">
        <i />
        {{ snapshot.generation.status === 'idle' ? '频道稳定' : '叙事生成中' }}
      </div>
    </header>

    <div ref="messageList" class="dialogue-messages" aria-live="polite">
      <div v-if="!snapshot.messages.length" class="dialogue-empty">
        <span>NO SIGNAL</span>
        <p>等待角色传来第一条消息……</p>
      </div>
      <article
        v-for="message in snapshot.messages"
        :key="message.id"
        :data-message-id="message.id"
        class="dialogue-message"
        :class="[`dialogue-message--${message.role}`, { 'dialogue-message--streaming': message.streaming }]"
      >
        <i class="dialogue-message__scan" aria-hidden="true" />
        <header class="dialogue-message__meta">
          <span>{{ message.role === 'assistant' ? snapshot.character.name : message.role === 'user' ? '你' : '系统' }}</span>
          <small>{{ String(message.index + 1).padStart(3, '0') }}</small>
        </header>
        <div class="dialogue-message__body" v-html="renderedMessageHtml(message)" />
        <footer class="dialogue-message__actions">
          <button
            v-if="message.capabilities.edit"
            type="button"
            :disabled="!canEdit(message)"
            :title="capabilityReason('openEditMessage', message.capabilities.edit)"
            @click="edit(message.id)"
          >
            <span aria-hidden="true">◇</span> 编辑
          </button>
          <button
            v-if="message.capabilities.rollback"
            type="button"
            :disabled="!canRollback(message)"
            :title="capabilityReason('rollbackMessage', message.capabilities.rollback)"
            @click="rollback(message.id)"
          >
            <span aria-hidden="true">↶</span> 回溯
          </button>
        </footer>
      </article>
    </div>

    <form class="dialogue-composer" @submit.prevent="send">
      <button
        type="button"
        class="dialogue-composer__model"
        :disabled="!snapshot.capabilities.openModelSettings.available"
        :title="snapshot.capabilities.openModelSettings.reason"
        @click="emit('openModels')"
      >
        <small>MODEL</small>
        <strong>{{ currentModel }}</strong>
      </button>
      <label class="dialogue-composer__field">
        <span class="sr-only">输入行动或回复</span>
        <textarea
          v-model="draft"
          maxlength="2000"
          rows="1"
          placeholder="输入你的行动……"
          @keydown.ctrl.enter.prevent="send"
        />
      </label>
      <button
        class="dialogue-composer__send"
        type="submit"
        :disabled="sending || !draft.trim() || !snapshot.capabilities.sendMessage.available"
        :title="snapshot.capabilities.sendMessage.reason"
      >
        <span>{{ sending ? '同步中' : '发送' }}</span>
        <i aria-hidden="true">↗</i>
      </button>
    </form>
  </section>
</template>
