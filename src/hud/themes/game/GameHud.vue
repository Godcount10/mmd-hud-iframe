<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { animate } from 'motion'
import type { ActionResult } from '../../../contracts'
import { useHudContext } from '../../context'
import BridgeConsole from './components/BridgeConsole.vue'
import DebugPanel from './components/DebugPanel.vue'
import OpeningPanel from './components/OpeningPanel.vue'
import { useGameFeed, type ParseSource } from './composables/useGameFeed'
import { useGameNavigation } from './composables/useGameNavigation'
import ConversationPage from './features/conversation/ConversationPage.vue'
import ArchiveDialog from './features/conversation/ArchiveDialog.vue'
import EditMessageDialog from './features/edit-message/EditMessageDialog.vue'
import ModelDialogs from './features/models/ModelDialogs.vue'
import NativeSettingsDialogs from './features/settings/NativeSettingsDialogs.vue'
import SettingsPage from './features/settings/SettingsPage.vue'
import OverlayHost from './overlays/OverlayHost.vue'
import GameBackground from './shell/GameBackground.vue'
import GameShell from './shell/GameShell.vue'
import StaggeredMenu, { type StaggeredMenuAction } from './shell/StaggeredMenu.vue'
import { createGameStore } from './stores/gameStore'
import { STAT_PATTERN_SOURCE } from './systems/parseMessage'
import { DEFAULT_STAT_DISPLAY } from './systems/stateBar'

const { snapshot, invoke } = useHudContext()
const store = createGameStore()
const navigation = useGameNavigation()
const parseSource: ParseSource = 'text'
const { diagnostics } = useGameFeed(store, DEFAULT_STAT_DISPLAY, parseSource)
const statBar = computed(() => store.state.value.statBar)
const characterName = computed(() => snapshot.value.character.name)

const debugOpen = ref(false)
type DebugTab = 'bridge' | 'parse'
const debugTab = ref<DebugTab>('bridge')
const openingOpen = ref(false)
const openingTriggered = ref(false)
const openingRoot = ref<HTMLElement | null>(null)
const actionFeedback = ref<{ ok: boolean; message: string } | null>(null)
const destructiveBusy = ref(false)
const refreshPending = ref(false)
const openingDraft = ref('')
let feedbackTimer = 0
let openingAnimation: ReturnType<typeof animate> | null = null

const menuItems = computed<StaggeredMenuAction[]>(() => [
  { id: 'back', label: '返回', description: '返回角色对话界面' },
  {
    id: 'archives',
    label: '管理存档',
    description: '打开 MMD 原生聊天列表',
    disabled: !snapshot.value.capabilities.openConversationPanel.available,
    disabledReason: snapshot.value.capabilities.openConversationPanel.reason,
  },
  {
    id: 'comments',
    label: '评论区',
    description: '转移到角色评论区',
    disabled: !snapshot.value.capabilities.openComments.available,
    disabledReason: snapshot.value.capabilities.openComments.reason,
  },
  { id: 'settings', label: '设置', description: '进入 HUD 与原生设置' },
  { id: 'exit', label: '退出', description: '退出当前角色卡', tone: 'danger' },
])

watch(
  () => snapshot.value.messages,
  (messages) => {
    if (openingTriggered.value || messages.length === 0) return
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.text.includes('【开局面板】')) {
      openingTriggered.value = true
      openingOpen.value = true
    }
  },
  { immediate: true },
)

watch(openingOpen, async (open) => {
  if (!open) return
  await nextTick()
  if (!openingRoot.value) return
  openingAnimation?.stop()
  openingAnimation = animate(openingRoot.value, {
    opacity: [0, 1],
    transform: ['scale(1.035)', 'scale(1)'],
  }, { duration: 1.2, ease: [0.16, 1, 0.3, 1] })
})

function showFeedback(result: ActionResult): void {
  actionFeedback.value = {
    ok: result.ok,
    message: result.ok ? '操作已同步到 MMD' : result.error?.message || '操作执行失败',
  }
  window.clearTimeout(feedbackTimer)
  feedbackTimer = window.setTimeout(() => { actionFeedback.value = null }, 3200)
}

function confirmOpening(text: string): void {
  openingDraft.value = text
  navigation.showDialogue()
  openingOpen.value = false
  actionFeedback.value = { ok: true, message: '开局选择已写入对话输入框' }
  window.clearTimeout(feedbackTimer)
  feedbackTimer = window.setTimeout(() => { actionFeedback.value = null }, 3200)
}

async function openModels(): Promise<void> {
  const result = await invoke('openModelSettings')
  showFeedback(result)
}

async function openArchives(): Promise<void> {
  const result = await invoke('openConversationPanel')
  showFeedback(result)
}

async function openComments(): Promise<void> {
  const result = await invoke('openComments')
  showFeedback(result)
}

async function openPersona(): Promise<void> {
  const result = await invoke('openPersona')
  showFeedback(result)
}

async function openSupplement(): Promise<void> {
  const result = await invoke('openSupplement')
  showFeedback(result)
}

async function refreshConversation(): Promise<void> {
  if (refreshPending.value) return
  refreshPending.value = true
  try {
    showFeedback(await invoke('refreshConversation'))
  } finally {
    refreshPending.value = false
  }
}

function handleMenu(item: StaggeredMenuAction): void {
  if (item.id === 'back') navigation.showDialogue()
  else if (item.id === 'archives') {
    navigation.closeMenu()
    void openArchives()
  } else if (item.id === 'comments') {
    navigation.closeMenu()
    void openComments()
  } else if (item.id === 'settings') navigation.showSettings()
  else navigation.openOverlay({ type: 'exit-confirm' })
}

async function confirmRollback(messageId: string): Promise<void> {
  if (destructiveBusy.value) return
  destructiveBusy.value = true
  try {
    const result = await invoke('rollbackMessage', { messageId })
    showFeedback(result)
    if (result.ok) navigation.closeOverlay()
  } finally {
    destructiveBusy.value = false
  }
}

async function confirmExit(): Promise<void> {
  if (destructiveBusy.value) return
  destructiveBusy.value = true
  try {
    const result = await invoke('exit')
    showFeedback(result)
    if (result.ok) navigation.closeOverlay()
  } finally {
    destructiveBusy.value = false
  }
}

onBeforeUnmount(() => {
  openingAnimation?.stop()
  window.clearTimeout(feedbackTimer)
})
</script>

<template>
  <main class="game-hud">
    <GameBackground />

    <GameShell
      :character-name="characterName"
      :stat-bar="statBar"
      :refresh-disabled="!snapshot.capabilities.refreshConversation.available"
      :refresh-reason="snapshot.capabilities.refreshConversation.reason"
      :refreshing="refreshPending"
      @codex="navigation.openOverlay({ type: 'codex' })"
      @map="navigation.openOverlay({ type: 'map' })"
      @auto-injection="navigation.openOverlay({ type: 'auto-injection' })"
      @refresh="refreshConversation"
      @menu="navigation.openMenu"
    >
      <ConversationPage
        v-if="navigation.view.value === 'dialogue'"
        :initial-draft="openingDraft"
        @draft-consumed="openingDraft = ''"
        @open-models="openModels"
        @request-rollback="(messageId) => navigation.openOverlay({ type: 'rollback-confirm', messageId })"
        @action-result="showFeedback"
      />
      <SettingsPage
        v-else
        @back="navigation.showDialogue"
        @open-persona="openPersona"
        @open-supplement="openSupplement"
      />
    </GameShell>

    <StaggeredMenu
      :open="navigation.menuOpen.value"
      :items="menuItems"
      :colors="['#c76c6a', '#d80e0e']"
      accent-color="#d5b091"
      @close="navigation.closeMenu"
      @select="handleMenu"
    />

    <OverlayHost
      :overlay="navigation.overlay.value"
      :busy="destructiveBusy"
      @close="navigation.closeOverlay"
      @confirm-rollback="confirmRollback"
      @confirm-exit="confirmExit"
      @action-result="showFeedback"
    />
    <ModelDialogs @action-result="showFeedback" />
    <EditMessageDialog @action-result="showFeedback" />
    <ArchiveDialog @action-result="showFeedback" />
    <NativeSettingsDialogs @action-result="showFeedback" />

    <button type="button" class="game-hud__debug-trigger" @click="debugOpen = true">DEV</button>
    <div v-if="actionFeedback" class="game-toast" :class="{ 'game-toast--error': !actionFeedback.ok }" role="status">
      <i />{{ actionFeedback.message }}
    </div>

    <div v-if="openingOpen" ref="openingRoot" class="opening-panel-host">
      <OpeningPanel :character-name="characterName" @confirm="confirmOpening" @close="openingOpen = false" />
    </div>

    <div v-if="debugOpen" class="game-hud__debug-layer">
      <nav class="debug-tabs">
        <button type="button" :class="{ active: debugTab === 'bridge' }" @click="debugTab = 'bridge'">Bridge 调试台</button>
        <button type="button" :class="{ active: debugTab === 'parse' }" @click="debugTab = 'parse'">解析层</button>
        <button type="button" class="debug-tabs__close" @click="debugOpen = false">✕ 关闭调试</button>
      </nav>
      <div class="debug-tab-body">
        <BridgeConsole v-show="debugTab === 'bridge'" @close="debugOpen = false" />
        <div v-show="debugTab === 'parse'" class="debug-parse-wrap">
          <DebugPanel :pattern="STAT_PATTERN_SOURCE" :source="parseSource" :display-config="DEFAULT_STAT_DISPLAY" :diagnostics="diagnostics" @close="debugOpen = false" />
        </div>
      </div>
    </div>
  </main>
</template>
