<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type {
  ActionResult,
  ConversationOptionSnapshot,
  InstructionOptionSnapshot,
  NativeAction,
  PersonaPanelSnapshot,
} from '../../../../contracts'
import { useHudContext } from '../../../context'
import { sanitizeHtml } from '../../../shared/sanitizeHtml'

const emit = defineEmits<{ close: [] }>()

const context = useHudContext()
const draft = ref('')
const sending = ref(false)
const actionResult = ref<ActionResult | null>(null)
const log = ref<Array<{ time: string; action: string; ok: boolean; message: string }>>([])
const messageList = ref<HTMLElement | null>(null)
const pendingMessageAction = ref<string | null>(null)
const editDraft = ref('')
const editSubmitting = ref(false)
const editToolPending = ref(false)
const pendingTopAction = ref<NativeAction | null>(null)
const pendingModelAction = ref<string | null>(null)
const pendingMoreAction = ref<NativeAction | null>(null)
const pendingInstructionId = ref<string | null>(null)
const personaDraft = ref('')
const personaIdentityDraft = ref('')
const supplementDraft = ref('')

const messageScopedActions = new Set<NativeAction>([
  'copyMessage',
  'regenerateMessage',
  'openEditMessage',
  'rollbackMessage',
  'startNewStoryFromMessage',
  'deleteMessage',
  'editMessage',
  'previousBranch',
  'nextBranch',
  'selectModelFilter',
  'selectModel',
  'openModelConfiguration',
  'setModelSetting',
  'applyInstruction',
])

const snapshot = context.snapshot
const availableCount = computed(() =>
  Object.values(snapshot.value.capabilities).filter((capability) => capability.available).length,
)
const actionEntries = computed(() =>
  Object.entries(snapshot.value.capabilities) as Array<[
    NativeAction,
    { available: boolean; reason?: string },
  ]>,
)

watch(
  () => {
    const messages = snapshot.value.messages
    const last = messages.at(-1)
    return {
      count: messages.length,
      lastId: last?.id ?? '',
      lastLength: last?.text.length ?? 0,
      streaming: last?.streaming ?? false,
    }
  },
  async (_current, previous) => {
    const list = messageList.value
    const wasNearBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 80
    const appended = previous !== undefined && _current.count > previous.count
    const firstRender = !previous
    if (!firstRender && !appended && !wasNearBottom) return
    await nextTick()
    messageList.value?.scrollTo({ top: messageList.value.scrollHeight, behavior: firstRender ? 'auto' : 'smooth' })
  },
  { immediate: true },
)

watch(
  () => snapshot.value.editPanel,
  (panel, previous) => {
    if (panel.open && (!previous?.open || panel.messageId !== previous.messageId)) {
      editDraft.value = panel.text
      return
    }
    if (panel.open && !editSubmitting.value && !editToolPending.value && panel.text !== previous?.text) {
      editDraft.value = panel.text
    }
  },
  { immediate: true },
)

watch(
  () => snapshot.value.personaPanel,
  (panel, previous) => {
    if (!panel.open) return
    if (!previous?.open || panel.currentModeId !== previous.currentModeId) {
      personaDraft.value = panel.name
      personaIdentityDraft.value = panel.identity
    }
  },
  { immediate: true },
)

watch(
  () => snapshot.value.supplementPanel,
  (panel, previous) => {
    if (panel.open && !previous?.open) supplementDraft.value = panel.text
  },
  { immediate: true },
)

function record(result: ActionResult): void {
  actionResult.value = result
  log.value.unshift({
    time: new Date().toLocaleTimeString(),
    action: result.action,
    ok: result.ok,
    message: result.ok ? '执行成功' : result.error?.message || '执行失败',
  })
  log.value = log.value.slice(0, 8)
}

async function send(): Promise<void> {
  if (sending.value || !draft.value.trim()) return
  sending.value = true
  try {
    const result = await context.invoke('sendMessage', { text: draft.value })
    record(result)
    if (result.ok) draft.value = ''
  } finally {
    sending.value = false
  }
}

async function invoke(action: NativeAction, payload?: unknown): Promise<void> {
  record(await context.invokeDynamic(action, payload))
}

async function invokeTopAction(action: NativeAction): Promise<void> {
  if (pendingTopAction.value) return
  pendingTopAction.value = action
  try {
    record(await context.invokeDynamic(action))
  } finally {
    pendingTopAction.value = null
  }
}

async function closeShare(): Promise<void> {
  await invokeTopAction('closeSharePanel')
}

async function copyShareLink(): Promise<void> {
  await invokeTopAction('copyShareLink')
}

async function invokeModelAction(action: NativeAction, payload?: unknown): Promise<void> {
  if (pendingModelAction.value) return
  pendingModelAction.value = action
  try {
    record(await context.invokeDynamic(action, payload))
  } finally {
    pendingModelAction.value = null
  }
}

async function selectModelFilter(filterId: string): Promise<void> {
  await invokeModelAction('selectModelFilter', { filterId })
}

async function selectModel(modelId: string): Promise<void> {
  await invokeModelAction('selectModel', { modelId })
}

async function openModelConfiguration(modelId: string): Promise<void> {
  await invokeModelAction('openModelConfiguration', { modelId })
}

async function setModelSetting(controlId: string, choiceId?: string): Promise<void> {
  await invokeModelAction('setModelSetting', { controlId, choiceId })
}

async function invokeMoreAction(action: NativeAction, payload?: unknown): Promise<ActionResult> {
  if (pendingMoreAction.value) {
    return { ok: false, action, error: { code: 'NOT_AVAILABLE', message: '另一项底部面板操作仍在执行' } }
  }
  pendingMoreAction.value = action
  try {
    const result = await context.invokeDynamic(action, payload)
    record(result)
    return result
  } finally {
    pendingMoreAction.value = null
  }
}

function selectConversation(conversation: ConversationOptionSnapshot): Promise<ActionResult> {
  return invokeMoreAction('selectConversation', {
    conversationId: conversation.id,
    fingerprint: conversation.fingerprint,
    index: conversation.index,
  })
}

async function applyInstruction(instruction: InstructionOptionSnapshot): Promise<void> {
  if (pendingInstructionId.value) return
  pendingInstructionId.value = instruction.id
  try {
    record(await context.invoke('applyInstruction', {
      instructionId: instruction.id,
      revision: snapshot.value.instructionSelector.revision,
      fingerprint: instruction.fingerprint,
      label: instruction.label,
      index: instruction.index,
    }))
  } finally {
    pendingInstructionId.value = null
  }
}

async function openPersona(): Promise<void> {
  const result = await invokeMoreAction('openPersona')
  if (result.ok) {
    personaDraft.value = snapshot.value.personaPanel.name
    personaIdentityDraft.value = snapshot.value.personaPanel.identity
  }
}

async function setPersonaMode(modeId: string): Promise<void> {
  const result = await invokeMoreAction('setPersonaMode', { modeId })
  if (result.ok) {
    const panel = result.data as PersonaPanelSnapshot
    personaDraft.value = panel.name
    personaIdentityDraft.value = panel.identity
  }
}

async function openSupplement(): Promise<void> {
  const result = await invokeMoreAction('openSupplement')
  if (result.ok) supplementDraft.value = snapshot.value.supplementPanel.text
}

async function setSupplementPosition(choiceId: string): Promise<void> {
  const opened = snapshot.value.supplementPanel.picker.open
    ? { ok: true } as const
    : await invokeMoreAction('openSupplementPositionPicker')
  if (!opened.ok) return
  await invokeMoreAction('setSupplementPosition', { choiceId })
}

async function copy(messageId: string): Promise<void> {
  await invoke('copyMessage', { messageId })
}

async function invokeMessageAction(action: NativeAction, messageId: string): Promise<void> {
  const pendingKey = `${action}:${messageId}`
  if (pendingMessageAction.value) return
  pendingMessageAction.value = pendingKey
  try {
    const result = await context.invokeDynamic(action, { messageId })
    record(result)
    if (action === 'openEditMessage' && result.ok) {
      const panel = result.data as { text?: unknown } | undefined
      editDraft.value = typeof panel?.text === 'string' ? panel.text : ''
    }
  } finally {
    pendingMessageAction.value = null
  }
}

async function submitEdit(): Promise<void> {
  const messageId = snapshot.value.editPanel.messageId
  if (!messageId || editSubmitting.value) return
  editSubmitting.value = true
  try {
    record(await context.invoke('submitEditMessage', { messageId, text: editDraft.value }))
  } finally {
    editSubmitting.value = false
  }
}

async function cancelEdit(): Promise<void> {
  if (editSubmitting.value) return
  record(await context.invoke('cancelEditMessage'))
}

async function applyEditTransform(transformId: string): Promise<void> {
  if (editToolPending.value) return
  editToolPending.value = true
  try {
    const synced = await context.invoke('setEditText', { text: editDraft.value })
    if (!synced.ok) {
      record(synced)
      return
    }
    const result = await context.invoke<'applyEditTransform', { text?: string }>('applyEditTransform', { transformId })
    record(result)
    if (result.ok && typeof result.data?.text === 'string') editDraft.value = result.data.text
  } finally {
    editToolPending.value = false
  }
}
</script>

<template>
  <div class="prototype-shell">
    <header class="topbar">
      <div class="identity">
        <span class="eyebrow">MMD HUD PROTOTYPE</span>
        <strong>{{ snapshot.character.name }}</strong>
      </div>
      <div class="status" :class="snapshot.connection.status">
        <span />{{ snapshot.connection.status }} · {{ snapshot.generation.status }} · rev {{ snapshot.revision }}
      </div>
      <div class="top-actions">
        <button type="button" @click="emit('close')">返回游戏</button>
        <button type="button" @click="void context.hideHud()">原生界面</button>
        <button
          type="button"
          :disabled="!snapshot.capabilities.openModelSettings.available || pendingModelAction !== null"
          @click="invokeModelAction('openModelSettings')"
        >切换模型</button>
        <button
          type="button"
          :disabled="!snapshot.capabilities.openComments.available || pendingTopAction !== null"
          @click="invokeTopAction('openComments')"
        >评论区</button>
        <button
          type="button"
          :disabled="!snapshot.capabilities.openSharePanel.available || pendingTopAction !== null"
          @click="invokeTopAction('openSharePanel')"
        >分享</button>
        <button
          type="button"
          :disabled="!snapshot.capabilities.toggleFavorite.available || pendingTopAction !== null"
          @click="invokeTopAction('toggleFavorite')"
        >收藏</button>
        <button
          type="button"
          :disabled="!snapshot.capabilities.refreshConversation.available || pendingTopAction !== null"
          @click="invokeTopAction('refreshConversation')"
        >刷新对话</button>
        <button
          type="button"
          :disabled="!snapshot.capabilities.openConversationPanel.available || pendingMoreAction !== null"
          @click="invokeMoreAction('openConversationPanel')"
        >聊天列表</button>
        <button
          type="button"
          :disabled="!snapshot.capabilities.openPersona.available || pendingMoreAction !== null"
          @click="openPersona"
        >用户人设</button>
        <button
          type="button"
          :disabled="!snapshot.capabilities.openSupplement.available || pendingMoreAction !== null"
          @click="openSupplement"
        >设定补充</button>
        <button type="button" class="danger" :disabled="!snapshot.capabilities.exit.available" @click="invoke('exit')">退出</button>
      </div>
    </header>

    <main class="workspace">
      <section class="panel chat-panel">
        <div class="panel-head">
          <div>
            <span class="kicker">SNAPSHOT</span>
            <h1>标准消息流</h1>
          </div>
          <span class="count">{{ snapshot.messages.length }} messages</span>
        </div>

        <div ref="messageList" class="messages">
          <div v-if="!snapshot.messages.length" class="empty">等待 MMD 聊天气泡……</div>
          <article v-for="message in snapshot.messages" :key="message.id" class="message" :class="message.role">
            <header>
              <span>{{ message.role }}{{ message.streaming ? ' · STREAMING' : '' }}</span>
              <code>{{ message.id }}</code>
              <div class="message-actions">
                <button type="button" @click="copy(message.id)">复制</button>
                <template v-if="message.role === 'assistant'">
                  <button
                    type="button"
                    :disabled="!message.capabilities.regenerate || pendingMessageAction !== null"
                    @click="invokeMessageAction('regenerateMessage', message.id)"
                  >{{ pendingMessageAction === `regenerateMessage:${message.id}` ? '生成中' : '重新生成' }}</button>
                  <button
                    type="button"
                    :disabled="!message.capabilities.edit || pendingMessageAction !== null"
                    @click="invokeMessageAction('openEditMessage', message.id)"
                  >编辑</button>
                </template>
                <button
                  type="button"
                  :disabled="!message.capabilities.rollback || pendingMessageAction !== null"
                  @click="invokeMessageAction('rollbackMessage', message.id)"
                >回溯</button>
                <button
                  v-if="message.capabilities.startNewStory"
                  type="button"
                  :disabled="pendingMessageAction !== null"
                  @click="invokeMessageAction('startNewStoryFromMessage', message.id)"
                >新故事</button>
              </div>
            </header>
            <div class="message-body" v-html="sanitizeHtml(message.html || message.text)" />
          </article>
        </div>

        <div class="composer">
          <textarea v-model="draft" maxlength="2000" placeholder="通过标准 sendMessage 动作写入原生 MMD……" @keydown.ctrl.enter.prevent="send" />
          <button type="button" :disabled="sending || !draft.trim() || !snapshot.capabilities.sendMessage.available" @click="send">
            {{ sending ? '发送中' : '发送' }}
          </button>
        </div>
      </section>

      <aside class="side-column">
        <section class="panel capabilities-panel">
          <div class="panel-head compact">
            <div>
              <span class="kicker">BRIDGE</span>
              <h2>能力注册表</h2>
            </div>
            <span class="count">{{ availableCount }} ready</span>
          </div>
          <div class="capability-list">
            <button
              v-for="([action, capability]) in actionEntries"
              :key="action"
              type="button"
              :class="{ available: capability.available }"
              :disabled="!capability.available || action === 'sendMessage' || messageScopedActions.has(action)"
              :title="capability.reason"
              @click="invoke(action)"
            >
              <span class="dot" />
              <code>{{ action }}</code>
              <small>{{ capability.available ? '可用' : capability.reason }}</small>
            </button>
          </div>
        </section>

        <section class="panel result-panel">
          <div class="panel-head compact">
            <div>
              <span class="kicker">ACTION RESULT</span>
              <h2>最近动作</h2>
            </div>
          </div>
          <div v-if="actionResult" class="result" :class="{ failed: !actionResult.ok }">
            <strong>{{ actionResult.action }}</strong>
            <span>{{ actionResult.ok ? 'OK' : actionResult.error?.code }}</span>
            <p>{{ actionResult.ok ? '原生动作执行成功。' : actionResult.error?.message }}</p>
          </div>
          <div v-else class="empty small">尚未调用动作</div>
          <ol class="action-log">
            <li v-for="entry in log" :key="`${entry.time}-${entry.action}`">
              <time>{{ entry.time }}</time>
              <code>{{ entry.action }}</code>
              <span :class="{ ok: entry.ok }">{{ entry.message }}</span>
            </li>
          </ol>
        </section>

        <button type="button" class="destroy" @click="void context.destroyHud()">销毁 HUD 实例</button>
      </aside>
    </main>

    <div v-if="snapshot.instructionSelector.open" class="more-overlay">
      <section class="more-dialog instruction-dialog" role="dialog" aria-modal="true" aria-labelledby="instruction-title">
        <header>
          <div><span class="kicker">NATIVE INSTRUCTIONS</span><h2 id="instruction-title">选择指令</h2></div>
          <button type="button" :disabled="pendingInstructionId !== null" @click="invoke('closePromptSelector')">关闭</button>
        </header>
        <div v-if="snapshot.instructionSelector.instructions.length" class="position-choices instruction-choices">
          <button
            v-for="instruction in snapshot.instructionSelector.instructions"
            :key="instruction.id"
            type="button"
            :disabled="pendingInstructionId !== null"
            @click="applyInstruction(instruction)"
          >{{ pendingInstructionId === instruction.id ? '应用中…' : instruction.label }}</button>
        </div>
        <div v-else class="empty small">暂无可用指令</div>
      </section>
    </div>

    <div v-if="snapshot.conversationPanel.open" class="more-overlay">
      <section class="more-dialog conversation-dialog" role="dialog" aria-modal="true">
        <header><div><span class="kicker">NATIVE CONVERSATIONS</span><h2>{{ snapshot.conversationPanel.title }}</h2></div><button type="button" @click="invokeMoreAction('closeConversationPanel')">关闭</button></header>
        <div class="conversation-list">
          <button v-for="conversation in snapshot.conversationPanel.conversations" :key="conversation.id" type="button" :class="{ active: conversation.current }" :disabled="pendingMoreAction !== null" @click="selectConversation(conversation)">
            <strong>{{ conversation.title }}</strong><small>{{ conversation.preview }}</small><span v-if="conversation.current">当前会话</span>
          </button>
        </div>
        <footer><button class="save-edit" type="button" :disabled="pendingMoreAction !== null" @click="invokeMoreAction('createConversation')">创建新的聊天</button></footer>
      </section>
    </div>

    <div v-if="snapshot.personaPanel.open" class="more-overlay">
      <section class="more-dialog persona-dialog" role="dialog" aria-modal="true">
        <header><div><span class="kicker">NATIVE PERSONA</span><h2>{{ snapshot.personaPanel.title }}</h2></div><button type="button" @click="invokeMoreAction('closePersona')">取消</button></header>
        <div class="persona-modes">
          <button
            v-for="mode in snapshot.personaPanel.modes"
            :key="mode.id"
            type="button"
            :class="{ active: mode.selected }"
            :disabled="pendingMoreAction !== null || mode.disabled"
            @click="setPersonaMode(mode.id)"
          >{{ mode.label }}{{ mode.disabled ? ' · 已禁用' : '' }}</button>
        </div>
        <label>
          称呼
          <input
            v-model="personaDraft"
            type="text"
            :maxlength="snapshot.personaPanel.maxLength || 20"
            :disabled="snapshot.personaPanel.nameDisabled || pendingMoreAction !== null"
          >
        </label>
        <section v-if="snapshot.personaPanel.genderChoices.length" class="persona-field">
          <span>性别</span>
          <div class="persona-genders">
            <button
              v-for="gender in snapshot.personaPanel.genderChoices"
              :key="gender.id"
              type="button"
              :class="{ active: gender.selected }"
              :disabled="pendingMoreAction !== null || gender.disabled"
              @click="invokeMoreAction('setPersonaGender', { genderId: gender.id })"
            >{{ gender.label }}</button>
          </div>
        </section>
        <label v-if="snapshot.personaPanel.identityMaxLength || snapshot.personaPanel.identity">
          我是谁
          <textarea
            v-model="personaIdentityDraft"
            :maxlength="snapshot.personaPanel.identityMaxLength || 500"
            :disabled="snapshot.personaPanel.identityDisabled || pendingMoreAction !== null"
            placeholder="描述你所扮演角色的性格特征和事实设定"
          />
        </label>
        <p v-if="snapshot.personaPanel.restriction" class="restriction">{{ snapshot.personaPanel.restriction }}</p>
        <footer><small>保存由原生 MMD 提交到服务器。</small><button class="save-edit" type="button" :disabled="pendingMoreAction !== null" @click="invokeMoreAction('submitPersona', { name: personaDraft, identity: personaIdentityDraft })">保存</button></footer>
      </section>
    </div>

    <div v-if="snapshot.supplementPanel.open" class="more-overlay">
      <section class="more-dialog supplement-dialog" role="dialog" aria-modal="true">
        <header><div><span class="kicker">NATIVE SUPPLEMENT</span><h2>{{ snapshot.supplementPanel.title }}</h2></div><button type="button" :disabled="snapshot.supplementPanel.picker.open" @click="invokeMoreAction('closeSupplement')">取消</button></header>
        <div class="supplement-position"><span>角色 &amp; 位置</span><strong>{{ snapshot.supplementPanel.positionLabel }}</strong></div>
        <div class="position-choices">
          <button v-for="choice in snapshot.supplementPanel.picker.choices" :key="choice.id" type="button" :class="{ active: choice.selected }" :disabled="pendingMoreAction !== null" @click="setSupplementPosition(choice.id)">{{ choice.label }}</button>
          <button v-if="!snapshot.supplementPanel.picker.open" type="button" @click="invokeMoreAction('openSupplementPositionPicker')">修改位置</button>
        </div>
        <textarea v-model="supplementDraft" :maxlength="snapshot.supplementPanel.maxLength || 1000" placeholder="请输入补充设定" />
        <div v-if="snapshot.supplementPanel.picker.open" class="picker-actions"><button type="button" @click="invokeMoreAction('cancelSupplementPosition')">取消位置修改</button><button class="save-edit" type="button" @click="invokeMoreAction('confirmSupplementPosition')">确定位置</button></div>
        <footer><small>设置由原生 MMD 提交，可能在 1 分钟内生效。</small><button class="save-edit" type="button" :disabled="pendingMoreAction !== null || snapshot.supplementPanel.picker.open" @click="invokeMoreAction('submitSupplement', { text: supplementDraft })">保存</button></footer>
      </section>
    </div>

    <div v-if="snapshot.modelPanel.open" class="model-overlay">
      <section class="model-dialog" role="dialog" aria-modal="true" aria-labelledby="model-title">
        <header>
          <div>
            <span class="kicker">NATIVE MODEL MIRROR</span>
            <h2 id="model-title">{{ snapshot.modelPanel.title || '对话模型选择' }}</h2>
          </div>
          <button type="button" :disabled="pendingModelAction !== null" @click="invokeModelAction('closeModelSettings')">关闭</button>
        </header>
        <nav class="model-filters" aria-label="模型分类">
          <button
            v-for="filter in snapshot.modelPanel.filters"
            :key="filter.id"
            type="button"
            :class="{ active: filter.active }"
            :disabled="pendingModelAction !== null"
            @click="selectModelFilter(filter.id)"
          >{{ filter.label }}</button>
        </nav>
        <div class="model-list">
          <article
            v-for="model in snapshot.modelPanel.models"
            :key="model.id"
            class="model-card"
            :class="{ selected: model.selected }"
          >
            <button class="model-main" type="button" :disabled="pendingModelAction !== null" @click="selectModel(model.id)">
              <strong>{{ model.name }}</strong>
              <span>{{ model.description || '暂无模型说明' }}</span>
              <small>
                {{ model.batteryLabel }}
                <template v-if="model.permission"> · {{ model.permission }}</template>
                <template v-if="model.successRate"> · {{ model.successRate }}</template>
              </small>
            </button>
            <button class="model-configure" type="button" :disabled="pendingModelAction !== null" @click="openModelConfiguration(model.id)">设置</button>
          </article>
        </div>
      </section>
    </div>

    <div v-if="snapshot.modelConfiguration.open" class="model-config-overlay">
      <section class="model-config-dialog" role="dialog" aria-modal="true" aria-labelledby="model-config-title">
        <header>
          <div>
            <span class="kicker">NATIVE MODEL CONFIGURATION</span>
            <h2 id="model-config-title">{{ snapshot.modelConfiguration.title || '模型设置' }}</h2>
          </div>
          <button type="button" :disabled="pendingModelAction !== null" @click="invokeModelAction('closeModelConfiguration')">关闭</button>
        </header>
        <div class="model-config-info">
          <strong>{{ snapshot.modelConfiguration.modelName }}</strong>
          <span>{{ snapshot.modelConfiguration.energyLabel }}</span>
        </div>
        <div class="model-controls">
          <section v-for="control in snapshot.modelConfiguration.controls" :key="control.id" class="model-control">
            <header>
              <div><strong>{{ control.label }}</strong><small>{{ control.description }}</small></div>
              <button
                v-if="control.type === 'toggle'"
                type="button"
                :class="{ active: control.value === true }"
                :disabled="pendingModelAction !== null"
                @click="setModelSetting(control.id)"
              >{{ control.value === true ? '已开启' : '已关闭' }}</button>
            </header>
            <div v-if="control.type === 'choice'" class="model-choices">
              <button
                v-for="choice in control.choices"
                :key="choice.id"
                type="button"
                :class="{ active: choice.selected }"
                :disabled="pendingModelAction !== null || control.choices.length < 2"
                @click="setModelSetting(control.id, choice.id)"
              >{{ choice.label }}</button>
            </div>
          </section>
        </div>
        <footer>
          <small>设置项由当前模型的原生面板动态提供。</small>
          <button class="save-edit" type="button" :disabled="pendingModelAction !== null" @click="invokeModelAction('submitModelConfiguration')">确定</button>
        </footer>
      </section>
    </div>

    <div v-if="snapshot.sharePanel.open" class="share-overlay" @click.self="closeShare">
      <section class="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <header>
          <div>
            <span class="kicker">NATIVE SHARE MIRROR</span>
            <h2 id="share-title">{{ snapshot.sharePanel.title || '分享角色' }}</h2>
          </div>
          <button
            type="button"
            :disabled="pendingTopAction !== null"
            @click="closeShare"
          >关闭</button>
        </header>
        <p v-if="snapshot.sharePanel.subtitle" class="share-subtitle">{{ snapshot.sharePanel.subtitle }}</p>
        <div class="share-link" :title="snapshot.sharePanel.link">
          {{ snapshot.sharePanel.link || '原生分享链接尚未生成' }}
        </div>
        <footer>
          <small>链接与复制行为均来自原生 MMD 分享界面。</small>
          <button
            type="button"
            class="copy-share"
            :disabled="!snapshot.capabilities.copyShareLink.available || pendingTopAction !== null"
            @click="copyShareLink"
          >{{ pendingTopAction === 'copyShareLink' ? '复制中' : '复制链接' }}</button>
        </footer>
      </section>
    </div>

    <div v-if="snapshot.editPanel.open" class="edit-overlay" @click.self="cancelEdit">
      <section class="edit-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <header>
          <div>
            <span class="kicker">NATIVE EDIT MIRROR</span>
            <h2 id="edit-title">编辑 AI 消息</h2>
          </div>
          <button type="button" :disabled="editSubmitting" @click="cancelEdit">取消</button>
        </header>
        <code class="edit-target">{{ snapshot.editPanel.messageId }}</code>
        <textarea
          v-model="editDraft"
          autofocus
          spellcheck="false"
          placeholder="编辑消息正文……"
          @keydown.ctrl.enter.prevent="submitEdit"
        />
        <div v-if="snapshot.editPanel.transforms.length" class="edit-tools">
          <button
            v-for="tool in snapshot.editPanel.transforms"
            :key="tool.id"
            type="button"
            :disabled="editToolPending || editSubmitting"
            @click="applyEditTransform(tool.id)"
          >{{ tool.label }}</button>
        </div>
        <footer>
          <small>Ctrl + Enter 保存；取消不会修改原气泡。</small>
          <button
            type="button"
            class="save-edit"
            :disabled="editSubmitting || !snapshot.editPanel.messageId"
            @click="submitEdit"
          >{{ editSubmitting ? '保存中' : '保存修改' }}</button>
        </footer>
      </section>
    </div>
  </div>
</template>

