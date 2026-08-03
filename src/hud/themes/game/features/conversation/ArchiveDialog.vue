<script setup lang="ts">
import { ref } from 'vue'
import type { ActionResult, ConversationOptionSnapshot, NativeAction } from '../../../../../contracts'
import { useHudContext } from '../../../../context'
import AppDialog from '../../overlays/AppDialog.vue'

const emit = defineEmits<{ actionResult: [result: ActionResult] }>()
const context = useHudContext()
const snapshot = context.snapshot
const pending = ref<NativeAction | null>(null)

async function invoke(action: NativeAction, payload?: unknown): Promise<ActionResult> {
  if (pending.value) return { ok: false, action, error: { code: 'NOT_AVAILABLE', message: '另一项存档操作仍在执行' } }
  pending.value = action
  try {
    const result = await context.invokeDynamic(action, payload)
    emit('actionResult', result)
    return result
  } finally {
    pending.value = null
  }
}

function selectConversation(conversation: ConversationOptionSnapshot): Promise<ActionResult> {
  return invoke('selectConversation', {
    conversationId: conversation.id,
    fingerprint: conversation.fingerprint,
    index: conversation.index,
  })
}

function close(): void {
  void invoke('closeConversationPanel')
}
</script>

<template>
  <AppDialog
    :open="snapshot.conversationPanel.open"
    :title="snapshot.conversationPanel.title || '管理存档'"
    eyebrow="NATIVE MIRROR // ARCHIVES"
    description="这里镜像 MMD 原生聊天列表；会话内容和持久化仍由平台管理。"
    size="large"
    @close="close"
  >
    <div class="archive-list">
      <button
        v-for="conversation in snapshot.conversationPanel.conversations"
        :key="conversation.id"
        type="button"
        class="archive-card"
        :class="{ 'archive-card--active': conversation.current }"
        :disabled="pending !== null"
        @click="selectConversation(conversation)"
      >
        <span v-if="conversation.avatar" class="archive-card__avatar" :style="{ backgroundImage: `url(${conversation.avatar})` }" />
        <span v-else class="archive-card__avatar archive-card__avatar--empty">◇</span>
        <span class="archive-card__copy">
          <strong>{{ conversation.title }}</strong>
          <small>{{ conversation.preview || '暂无会话预览' }}</small>
        </span>
        <em>{{ conversation.current ? '当前存档' : '载入' }}</em>
      </button>
      <div v-if="!snapshot.conversationPanel.conversations.length" class="archive-list__empty">原生聊天列表尚未返回可用存档。</div>
    </div>
    <template #footer>
      <small>切换或创建存档会调用 MMD 原生会话流程。</small>
      <button type="button" class="game-button game-button--primary" :disabled="pending !== null" @click="invoke('createConversation')">
        {{ pending === 'createConversation' ? '创建中' : '创建新的存档' }}
      </button>
    </template>
  </AppDialog>
</template>
