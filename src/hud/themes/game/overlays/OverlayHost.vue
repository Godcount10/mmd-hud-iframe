<script setup lang="ts">
import type { ActionResult } from '../../../../contracts'
import { useHudContext } from '../../../context'
import type { GameOverlay } from '../composables/useGameNavigation'
import AppDialog from './AppDialog.vue'

const props = defineProps<{ overlay: GameOverlay; busy?: boolean }>()
const emit = defineEmits<{
  close: []
  confirmRollback: [messageId: string]
  confirmExit: []
  actionResult: [result: ActionResult]
}>()

const context = useHudContext()

const placeholders = {
  codex: {
    eyebrow: 'LOCAL FEATURE // CODEX',
    title: '图鉴',
    description: '收录角色、地点、物品与叙事条目的本地游戏系统。',
    label: '档案系统尚未接入',
    detail: '此功能不调用 MMD 原生面板。后续会使用独立数据模型和项目自己的 CUSTOM_ 存储。',
  },
  map: {
    eyebrow: 'LOCAL FEATURE // MAP',
    title: '地图',
    description: '探索地点、关系与事件节点的本地可视化界面。',
    label: '地图系统尚未接入',
    detail: '当前仅保留一级入口和弹层边界，后续可以升级为独立地图 Feature。',
  },
  'auto-injection': {
    eyebrow: 'LOCAL FEATURE // INJECTION',
    title: '自动注入',
    description: '管理本地提示词规则和上下文注入策略。',
    label: '自动注入系统尚未接入',
    detail: '规则只通过标准 Bridge 输入动作影响草稿或消息，不直接访问 MMD DOM。',
  },
} as const

async function hideHud(): Promise<void> {
  emit('close')
  void context.hideHud()
}
</script>

<template>
  <template v-if="overlay && overlay.type in placeholders">
    <AppDialog
      :open="true"
      :title="placeholders[overlay.type as keyof typeof placeholders].title"
      :eyebrow="placeholders[overlay.type as keyof typeof placeholders].eyebrow"
      :description="placeholders[overlay.type as keyof typeof placeholders].description"
      size="medium"
      @close="emit('close')"
    >
      <div class="feature-placeholder">
        <div class="feature-placeholder__sigil">◇</div>
        <strong>{{ placeholders[overlay.type as keyof typeof placeholders].label }}</strong>
        <p>{{ placeholders[overlay.type as keyof typeof placeholders].detail }}</p>
      </div>
    </AppDialog>
  </template>

  <AppDialog
    v-else-if="overlay?.type === 'rollback-confirm'"
    :open="true"
    title="确认回溯"
    eyebrow="NATIVE ACTION // ROLLBACK"
    description="回溯会让当前消息之后的对话从原生 MMD 会话中移除。"
    size="small"
    @close="emit('close')"
  >
    <div class="confirm-copy">
      <strong>确定返回到这个叙事节点吗？</strong>
      <p>此操作将调用 MMD 原生长按与回溯确认流程，不能由 HUD 撤销。</p>
    </div>
    <template #footer>
      <button type="button" class="game-button" @click="emit('close')">取消</button>
      <button type="button" class="game-button game-button--danger" :disabled="busy" @click="emit('confirmRollback', overlay.messageId)">
        {{ busy ? '回溯中' : '确认回溯' }}
      </button>
    </template>
  </AppDialog>

  <AppDialog
    v-else-if="overlay?.type === 'exit-confirm'"
    :open="true"
    title="退出角色卡"
    eyebrow="NATIVE ACTION // EXIT"
    description="退出将返回 MMD 的上一层角色界面。"
    size="small"
    @close="emit('close')"
  >
    <div class="confirm-copy">
      <strong>要结束当前角色会话吗？</strong>
      <p>HUD 不会删除会话，但当前未持久化的本地界面状态可能丢失。</p>
    </div>
    <template #footer>
      <button type="button" class="game-button" @click="hideHud">先查看原生界面</button>
      <button type="button" class="game-button game-button--danger" :disabled="busy" @click="emit('confirmExit')">
        {{ busy ? '退出中' : '确认退出' }}
      </button>
    </template>
  </AppDialog>
</template>
