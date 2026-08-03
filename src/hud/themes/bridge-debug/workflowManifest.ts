import type { NativeAction } from '../../../contracts'

export interface DebugWorkflow {
  id: string
  label: string
  description: string
  actions: NativeAction[]
}

export const DEBUG_WORKFLOWS: DebugWorkflow[] = [
  {
    id: 'edit',
    label: '消息编辑会话',
    description: '先绑定消息，再设置文本或应用转换，最后提交或取消。面板或目标变化后重新开始。',
    actions: ['openEditMessage', 'setEditText', 'applyEditTransform', 'submitEditMessage', 'cancelEditMessage'],
  },
  {
    id: 'model',
    label: '模型与配置',
    description: '打开模型面板后使用最新 filter/model/control 快照逐步操作。',
    actions: ['openModelSettings', 'selectModelFilter', 'selectModel', 'openModelConfiguration', 'setModelSetting', 'submitModelConfiguration', 'closeModelConfiguration', 'closeModelSettings'],
  },
  {
    id: 'persona',
    label: '用户人设',
    description: '打开后按 mode、name、gender、identity 顺序调试，并尊重只读字段。',
    actions: ['openPersona', 'setPersonaMode', 'setPersonaName', 'setPersonaGender', 'setPersonaIdentity', 'submitPersona', 'closePersona'],
  },
  {
    id: 'supplement',
    label: '设定补充',
    description: '位置 Picker 是独立阶段，确认或取消后才能提交正文。',
    actions: ['openSupplement', 'setSupplementText', 'openSupplementPositionPicker', 'setSupplementPosition', 'confirmSupplementPosition', 'cancelSupplementPosition', 'submitSupplement', 'closeSupplement'],
  },
  {
    id: 'deletion',
    label: '两阶段删除',
    description: '第一阶段只请求 Bridge token；第二阶段在 30 秒内再次确认后提交。',
    actions: ['deleteMessage', 'requestDeleteConversation', 'deleteConversation'],
  },
]
