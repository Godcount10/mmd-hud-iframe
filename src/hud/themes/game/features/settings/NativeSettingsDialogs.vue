<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ActionResult, NativeAction, PersonaPanelSnapshot } from '../../../../../contracts'
import { useHudContext } from '../../../../context'
import AppDialog from '../../overlays/AppDialog.vue'

const emit = defineEmits<{ actionResult: [result: ActionResult] }>()
const context = useHudContext()
const snapshot = context.snapshot
const pending = ref<NativeAction | null>(null)
const personaName = ref('')
const personaIdentity = ref('')
const supplementText = ref('')

watch(
  () => snapshot.value.personaPanel,
  (panel, previous) => {
    if (!panel.open) return
    if (!previous?.open || panel.currentModeId !== previous.currentModeId) {
      personaName.value = panel.name
      personaIdentity.value = panel.identity
    }
  },
  { immediate: true },
)

watch(
  () => snapshot.value.supplementPanel,
  (panel, previous) => {
    if (panel.open && !previous?.open) supplementText.value = panel.text
  },
  { immediate: true },
)

async function invoke(action: NativeAction, payload?: unknown): Promise<ActionResult> {
  if (pending.value) return { ok: false, action, error: { code: 'NOT_AVAILABLE', message: '另一项原生设置仍在执行' } }
  pending.value = action
  try {
    const result = await context.invokeDynamic(action, payload)
    emit('actionResult', result)
    return result
  } finally {
    pending.value = null
  }
}

async function setPersonaMode(modeId: string): Promise<void> {
  const result = await invoke('setPersonaMode', { modeId })
  if (result.ok) {
    const panel = result.data as PersonaPanelSnapshot
    personaName.value = panel.name
    personaIdentity.value = panel.identity
  }
}

async function setSupplementPosition(choiceId: string): Promise<void> {
  if (!snapshot.value.supplementPanel.picker.open) {
    const opened = await invoke('openSupplementPositionPicker')
    if (!opened.ok) return
  }
  await invoke('setSupplementPosition', { choiceId })
}

function closePersona(): void {
  void invoke('closePersona')
}

function closeSupplement(): void {
  if (!snapshot.value.supplementPanel.picker.open) void invoke('closeSupplement')
}
</script>

<template>
  <AppDialog
    :open="snapshot.personaPanel.open"
    :title="snapshot.personaPanel.title || '用户人设'"
    eyebrow="NATIVE MIRROR // PERSONA"
    description="人设模式和字段权限均由 MMD 原生页面提供。"
    size="large"
    @close="closePersona"
  >
    <div class="native-settings-form">
      <nav class="native-settings-pills" aria-label="用户人设模式">
        <button
          v-for="mode in snapshot.personaPanel.modes"
          :key="mode.id"
          type="button"
          :class="{ active: mode.selected }"
          :disabled="pending !== null || mode.disabled"
          @click="setPersonaMode(mode.id)"
        >{{ mode.label }}</button>
      </nav>
      <label>
        <span>称呼</span>
        <input v-model="personaName" type="text" :maxlength="snapshot.personaPanel.maxLength || 20" :disabled="snapshot.personaPanel.nameDisabled || pending !== null">
      </label>
      <section v-if="snapshot.personaPanel.genderChoices.length" class="native-settings-field">
        <span>性别</span>
        <div class="native-settings-pills">
          <button
            v-for="gender in snapshot.personaPanel.genderChoices"
            :key="gender.id"
            type="button"
            :class="{ active: gender.selected }"
            :disabled="pending !== null || gender.disabled"
            @click="invoke('setPersonaGender', { genderId: gender.id })"
          >{{ gender.label }}</button>
        </div>
      </section>
      <label v-if="snapshot.personaPanel.identityMaxLength || snapshot.personaPanel.identity">
        <span>我是谁</span>
        <textarea v-model="personaIdentity" :maxlength="snapshot.personaPanel.identityMaxLength || 500" :disabled="snapshot.personaPanel.identityDisabled || pending !== null" />
      </label>
      <p v-if="snapshot.personaPanel.restriction" class="native-settings-warning">{{ snapshot.personaPanel.restriction }}</p>
    </div>
    <template #footer>
      <small>保存会通过 MMD 原生流程提交到平台。</small>
      <button type="button" class="game-button game-button--primary" :disabled="pending !== null" @click="invoke('submitPersona', { name: personaName, identity: personaIdentity })">保存用户人设</button>
    </template>
  </AppDialog>

  <AppDialog
    :open="snapshot.supplementPanel.open"
    :title="snapshot.supplementPanel.title || '补充设定'"
    eyebrow="NATIVE MIRROR // SUPPLEMENT"
    description="补充内容及注入位置由 MMD 原生面板管理。"
    size="large"
    @close="closeSupplement"
  >
    <div class="native-settings-form">
      <section class="native-settings-position">
        <span>当前注入位置</span>
        <strong>{{ snapshot.supplementPanel.positionLabel }}</strong>
      </section>
      <nav class="native-settings-pills" aria-label="补充设定位置">
        <button
          v-for="choice in snapshot.supplementPanel.picker.choices"
          :key="choice.id"
          type="button"
          :class="{ active: choice.selected }"
          :disabled="pending !== null"
          @click="setSupplementPosition(choice.id)"
        >{{ choice.label }}</button>
        <button v-if="!snapshot.supplementPanel.picker.open" type="button" :disabled="pending !== null" @click="invoke('openSupplementPositionPicker')">修改位置</button>
      </nav>
      <label>
        <span>补充正文</span>
        <textarea v-model="supplementText" :maxlength="snapshot.supplementPanel.maxLength || 1000" />
      </label>
      <div v-if="snapshot.supplementPanel.picker.open" class="native-settings-picker-actions">
        <button type="button" class="game-button" :disabled="pending !== null" @click="invoke('cancelSupplementPosition')">取消位置修改</button>
        <button type="button" class="game-button game-button--primary" :disabled="pending !== null" @click="invoke('confirmSupplementPosition')">确定位置</button>
      </div>
    </div>
    <template #footer>
      <small>位置选择未确认时不能保存正文。</small>
      <button type="button" class="game-button game-button--primary" :disabled="pending !== null || snapshot.supplementPanel.picker.open" @click="invoke('submitSupplement', { text: supplementText })">保存补充设定</button>
    </template>
  </AppDialog>
</template>
