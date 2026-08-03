<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ChatSnapshot, NativeAction } from '../../../../contracts'
import { ACTION_DEBUG_MANIFEST } from '../actionDebugManifest'
import type { ActionDebugDefinition } from '../types'

const props = defineProps<{
  action: NativeAction
  snapshot: ChatSnapshot
  confirmPayload?: unknown
}>()

const emit = defineEmits<{
  payload: [payload: unknown]
}>()

const definition = computed(() => ACTION_DEBUG_MANIFEST[props.action])
const text = ref('')
const secondaryText = ref('')
const selected = ref('')
const childSelected = ref('')

watch(() => [props.action, props.snapshot.revision], () => {
  text.value = ''
  secondaryText.value = ''
  selected.value = ''
  childSelected.value = ''
  emitPayload()
}, { immediate: true })

const selectedMessage = computed(() => props.snapshot.messages.find((item) => item.id === selected.value) ?? null)
const selectedConversation = computed(() => props.snapshot.conversationPanel.conversations.find((item) => item.id === selected.value) ?? null)
const selectedModelControl = computed(() => props.snapshot.modelConfiguration.controls.find((item) => item.id === selected.value) ?? null)

const options = computed(() => {
  switch (definition.value.payloadKind) {
    case 'message': return props.snapshot.messages.map((item) => ({ value: item.id, label: `${item.index} · ${item.role} · ${item.text.slice(0, 54)}` }))
    case 'edit-transform': return props.snapshot.editPanel.transforms.map((item) => ({ value: item.id, label: item.label }))
    case 'model-filter': return props.snapshot.modelPanel.filters.map((item) => ({ value: item.id, label: item.label }))
    case 'model': return props.snapshot.modelPanel.models.map((item) => ({ value: item.id, label: item.name }))
    case 'model-setting': return props.snapshot.modelConfiguration.controls.map((item) => ({ value: item.id, label: `${item.label} · ${item.type}` }))
    case 'more-item': return props.snapshot.moreMenu.items
      .filter((item) => item.available && !item.destructive)
      .map((item) => ({ value: item.id, label: `${item.label} · ${item.kind}` }))
    case 'conversation':
    case 'conversation-title':
    case 'conversation-delete': return props.snapshot.conversationPanel.conversations.map((item) => ({ value: item.id, label: `${item.index} · ${item.title}${item.current ? ' · CURRENT' : ''}` }))
    case 'persona-mode': return props.snapshot.personaPanel.modes.map((item) => ({ value: item.id, label: item.label, disabled: item.disabled }))
    case 'persona-gender': return props.snapshot.personaPanel.genderChoices.map((item) => ({ value: item.id, label: item.label, disabled: item.disabled }))
    case 'supplement-choice': return props.snapshot.supplementPanel.picker.choices.map((item) => ({ value: item.id, label: item.label }))
    case 'instruction': return props.snapshot.instructionSelector.instructions.map((item) => ({ value: item.id, label: `${item.index} · ${item.label}` }))
    default: return []
  }
})

const childOptions = computed(() => selectedModelControl.value?.choices.map((item) => ({ value: item.id, label: item.label })) ?? [])

function buildPayload(): unknown {
  switch (definition.value.payloadKind) {
    case 'none': return undefined
    case 'text': return { text: text.value }
    case 'message': return selected.value ? { messageId: selected.value } : undefined
    case 'edit-transform': return selected.value ? { transformId: selected.value } : undefined
    case 'edit-submit': return props.snapshot.editPanel.messageId ? { messageId: props.snapshot.editPanel.messageId, text: text.value } : undefined
    case 'model-filter': return selected.value ? { filterId: selected.value } : undefined
    case 'model': return selected.value ? { modelId: selected.value } : undefined
    case 'model-setting': return selected.value ? { controlId: selected.value, ...(childSelected.value ? { choiceId: childSelected.value } : {}) } : undefined
    case 'more-item': return selected.value ? { itemId: selected.value } : undefined
    case 'conversation': return selectedConversation.value ? { conversationId: selectedConversation.value.id, fingerprint: selectedConversation.value.fingerprint, index: selectedConversation.value.index } : undefined
    case 'conversation-title': return selectedConversation.value ? { conversationId: selectedConversation.value.id, fingerprint: selectedConversation.value.fingerprint, index: selectedConversation.value.index, title: text.value } : undefined
    case 'conversation-delete': return props.confirmPayload
    case 'persona-mode': return selected.value ? { modeId: selected.value } : undefined
    case 'persona-name': return { name: text.value }
    case 'persona-gender': return selected.value ? { genderId: selected.value } : undefined
    case 'persona-identity': return { identity: text.value }
    case 'persona-submit': return { name: text.value, identity: secondaryText.value }
    case 'supplement-text': return { text: text.value }
    case 'supplement-choice': return selected.value ? { choiceId: selected.value } : undefined
    case 'instruction': {
      const instruction = props.snapshot.instructionSelector.instructions.find((item) => item.id === selected.value)
      return instruction ? { instructionId: instruction.id, revision: props.snapshot.instructionSelector.revision, fingerprint: instruction.fingerprint, label: instruction.label, index: instruction.index } : undefined
    }
    default: return undefined
  }
}

function emitPayload(): void {
  emit('payload', buildPayload())
}
</script>

<template>
  <div class="payload-form" @input="emitPayload" @change="emitPayload">
    <div v-if="definition.payloadKind === 'contract-only'" class="payload-form__notice">
      此动作没有正式 payload contract，也没有 handler。调试台不会猜测或强制执行。
    </div>

    <label v-else-if="options.length" class="lab-field">
      <span>快照目标</span>
      <select v-model="selected">
        <option value="">选择当前 revision 的目标…</option>
        <option v-for="option in options" :key="option.value" :value="option.value" :disabled="Boolean('disabled' in option && option.disabled)">
          {{ option.label }}
        </option>
      </select>
    </label>

    <label v-if="childOptions.length" class="lab-field">
      <span>选项</span>
      <select v-model="childSelected">
        <option value="">切换 toggle / 选择 choice…</option>
        <option v-for="option in childOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </label>

    <label v-if="['text', 'edit-submit', 'conversation-title', 'persona-name', 'persona-identity', 'persona-submit', 'supplement-text'].includes(definition.payloadKind)" class="lab-field">
      <span>{{ definition.payloadKind === 'conversation-title' ? '新标题' : '文本参数' }}</span>
      <textarea v-model="text" rows="4" placeholder="输入要传给 Bridge 的文本" />
    </label>

    <label v-if="definition.payloadKind === 'persona-submit'" class="lab-field">
      <span>身份文本</span>
      <textarea v-model="secondaryText" rows="4" placeholder="identity" />
    </label>

    <dl v-if="selectedMessage" class="reference-card">
      <dt>消息引用</dt><dd>revision {{ snapshot.revision }}</dd>
      <dt>role / index</dt><dd>{{ selectedMessage.role }} / {{ selectedMessage.index }}</dd>
      <dt>fingerprint</dt><dd>{{ selectedMessage.targetFingerprint || 'none' }}</dd>
    </dl>

    <dl v-if="selectedConversation" class="reference-card">
      <dt>会话引用</dt><dd>revision {{ snapshot.revision }}</dd>
      <dt>index</dt><dd>{{ selectedConversation.index }}</dd>
      <dt>fingerprint</dt><dd>{{ selectedConversation.fingerprint }}</dd>
    </dl>
  </div>
</template>
