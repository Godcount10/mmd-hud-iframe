<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { gsap } from 'gsap'
import type { ActionResult } from '../../../../../contracts'
import { useHudContext } from '../../../../context'
import AppDialog from '../../overlays/AppDialog.vue'

const emit = defineEmits<{ actionResult: [result: ActionResult] }>()
const context = useHudContext()
const snapshot = context.snapshot
const editDraft = ref('')
const submitting = ref(false)
const toolPending = ref(false)
const editorRoot = ref<HTMLElement | null>(null)
let editorTimeline: gsap.core.Timeline | null = null

function playEditorEntrance(): void {
  const root = editorRoot.value
  if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  editorTimeline?.kill()
  const target = root.querySelector<HTMLElement>('code')
  const textarea = root.querySelector<HTMLElement>('textarea')
  const tools = root.querySelectorAll<HTMLElement>('.edit-message-dialog__tools button')
  const scan = root.querySelector<HTMLElement>('.edit-message-dialog__scan')
  editorTimeline = gsap.timeline({ defaults: { ease: 'power3.out', overwrite: 'auto' } })
    .fromTo(scan, { scaleX: 0, transformOrigin: 'left center', autoAlpha: 0 }, { scaleX: 1, autoAlpha: 0.7, duration: 0.42 }, 0)
    .fromTo(target, { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.3 }, 0.08)
    .fromTo(textarea, { autoAlpha: 0, y: 15, clipPath: 'inset(0 100% 0 0)' }, { autoAlpha: 1, y: 0, clipPath: 'inset(0 0% 0 0)', duration: 0.46, ease: 'power2.out' }, 0.12)
    .fromTo(tools, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.045 }, 0.28)
}

watch(
  () => snapshot.value.editPanel,
  (panel, previous) => {
    if (panel.open && (!previous?.open || panel.messageId !== previous.messageId)) {
      editDraft.value = panel.text
      void nextTick(playEditorEntrance)
    }
    else if (panel.open && !submitting.value && !toolPending.value && panel.text !== previous?.text) editDraft.value = panel.text
  },
  { immediate: true },
)

async function cancel(): Promise<void> {
  if (submitting.value) return
  emit('actionResult', await context.invoke('cancelEditMessage'))
}

async function submit(): Promise<void> {
  const messageId = snapshot.value.editPanel.messageId
  if (!messageId || submitting.value) return
  submitting.value = true
  const root = editorRoot.value
  if (root && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gsap.to(root, { '--edit-signal': 1, duration: 0.22, ease: 'power2.out', yoyo: true, repeat: 1 })
  }
  try {
    emit('actionResult', await context.invoke('submitEditMessage', { messageId, text: editDraft.value }))
  } finally {
    submitting.value = false
  }
}

async function applyTransform(transformId: string): Promise<void> {
  if (toolPending.value) return
  toolPending.value = true
  try {
    const synced = await context.invoke('setEditText', { text: editDraft.value })
    if (!synced.ok) {
      emit('actionResult', synced)
      return
    }
    const result = await context.invoke<'applyEditTransform', { text?: string }>('applyEditTransform', { transformId })
    emit('actionResult', result)
    if (result.ok && typeof result.data?.text === 'string') editDraft.value = result.data.text
  } finally {
    toolPending.value = false
  }
}

onBeforeUnmount(() => editorTimeline?.kill())
</script>

<template>
  <AppDialog
    :open="snapshot.editPanel.open"
    title="编辑消息"
    eyebrow="NATIVE MIRROR // EDIT"
    description="修改将由 MMD 原生编辑流程保存。"
    size="large"
    @close="cancel"
  >
    <div ref="editorRoot" class="edit-message-dialog">
      <i class="edit-message-dialog__scan" aria-hidden="true" />
      <code>{{ snapshot.editPanel.messageId }}</code>
      <textarea v-model="editDraft" autofocus spellcheck="false" @keydown.ctrl.enter.prevent="submit" />
      <div v-if="snapshot.editPanel.transforms.length" class="edit-message-dialog__tools">
        <button
          v-for="tool in snapshot.editPanel.transforms"
          :key="tool.id"
          type="button"
          :disabled="toolPending || submitting"
          @click="applyTransform(tool.id)"
        >{{ tool.label }}</button>
      </div>
    </div>
    <template #footer>
      <small>Ctrl + Enter 保存；关闭不会修改原消息。</small>
      <button type="button" class="game-button game-button--primary" :disabled="submitting" @click="submit">
        {{ submitting ? '保存中' : '保存修改' }}
      </button>
    </template>
  </AppDialog>
</template>
