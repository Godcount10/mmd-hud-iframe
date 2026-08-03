import { ALL_NATIVE_ACTIONS, type NativeAction } from '../../../contracts'
import type { ActionDebugDefinition, ActionEffect, ActionGroup, PayloadKind } from './types'

const CONTRACT_ONLY = new Set<NativeAction>([
  'stopGeneration',
  'continueGeneration',
  'editMessage',
  'previousBranch',
  'nextBranch',
  'newChat',
])

const DESTRUCTIVE = new Set<NativeAction>([
  'exit',
  'rollbackMessage',
  'startNewStoryFromMessage',
  'deleteMessage',
  'requestDeleteConversation',
  'deleteConversation',
])

const CONFIRM = new Set<NativeAction>([
  ...DESTRUCTIVE,
  'sendMessage',
  'regenerateMessage',
  'selectModel',
  'selectConversation',
  'renameConversation',
  'createConversation',
  'submitEditMessage',
  'submitModelConfiguration',
  'submitChatSettings',
  'submitPersona',
  'submitSupplement',
])

const GROUPS: Record<ActionGroup, NativeAction[]> = {
  '输入与生成': ['sendMessage', 'setInputText', 'stopGeneration', 'continueGeneration'],
  '消息': ['copyMessage', 'regenerateMessage', 'rollbackMessage', 'startNewStoryFromMessage', 'deleteMessage', 'editMessage', 'previousBranch', 'nextBranch'],
  '编辑': ['openEditMessage', 'setEditText', 'applyEditTransform', 'submitEditMessage', 'cancelEditMessage'],
  '顶部与分享': ['openComments', 'openSharePanel', 'copyShareLink', 'closeSharePanel', 'toggleFavorite', 'refreshConversation'],
  '模型': ['openModelSettings', 'closeModelSettings', 'selectModelFilter', 'selectModel', 'openModelConfiguration', 'setModelSetting', 'submitModelConfiguration', 'closeModelConfiguration'],
  '对话设置': ['openChatSettings', 'closeChatSettings', 'submitChatSettings'],
  '更多菜单': ['openMoreMenu', 'closeMoreMenu', 'activateMoreMenuItem', 'openTutorial', 'openBackgroundPanel', 'openCustomInstructions'],
  '会话': ['newChat', 'openConversationPanel', 'selectConversation', 'renameConversation', 'requestDeleteConversation', 'deleteConversation', 'createConversation', 'closeConversationPanel'],
  '用户人设': ['openPersona', 'setPersonaMode', 'setPersonaName', 'setPersonaGender', 'setPersonaIdentity', 'submitPersona', 'closePersona'],
  '设定补充': ['openSupplement', 'setSupplementText', 'openSupplementPositionPicker', 'setSupplementPosition', 'confirmSupplementPosition', 'cancelSupplementPosition', 'submitSupplement', 'closeSupplement'],
  '指令': ['openPromptSelector', 'closePromptSelector', 'applyInstruction'],
  '生命周期': ['exit'],
}

const PAYLOADS: Partial<Record<NativeAction, PayloadKind>> = {
  sendMessage: 'text',
  setInputText: 'text',
  copyMessage: 'message',
  regenerateMessage: 'message',
  openEditMessage: 'message',
  setEditText: 'text',
  applyEditTransform: 'edit-transform',
  submitEditMessage: 'edit-submit',
  rollbackMessage: 'message',
  startNewStoryFromMessage: 'message',
  deleteMessage: 'message',
  selectModelFilter: 'model-filter',
  selectModel: 'model',
  openModelConfiguration: 'model',
  setModelSetting: 'model-setting',
  activateMoreMenuItem: 'more-item',
  selectConversation: 'conversation',
  renameConversation: 'conversation-title',
  requestDeleteConversation: 'conversation',
  deleteConversation: 'conversation-delete',
  setPersonaMode: 'persona-mode',
  setPersonaName: 'persona-name',
  setPersonaGender: 'persona-gender',
  setPersonaIdentity: 'persona-identity',
  submitPersona: 'persona-submit',
  setSupplementText: 'supplement-text',
  setSupplementPosition: 'supplement-choice',
  submitSupplement: 'supplement-text',
  applyInstruction: 'instruction',
}

const LABELS: Partial<Record<NativeAction, string>> = {
  sendMessage: '发送消息', setInputText: '写入输入框', exit: '退出角色', copyMessage: '复制消息',
  stopGeneration: '停止生成', continueGeneration: '继续生成', regenerateMessage: '重新生成', openEditMessage: '打开消息编辑',
  setEditText: '设置编辑文本', applyEditTransform: '应用文本工具', submitEditMessage: '提交消息编辑', cancelEditMessage: '取消消息编辑',
  rollbackMessage: '回溯消息', startNewStoryFromMessage: '开启新的故事', openComments: '打开评论', openSharePanel: '打开分享面板',
  copyShareLink: '复制分享链接', closeSharePanel: '关闭分享面板', toggleFavorite: '切换收藏', refreshConversation: '刷新对话',
  deleteMessage: '删除消息', editMessage: '旧版编辑占位', previousBranch: '上一分支', nextBranch: '下一分支', newChat: '旧版新会话占位',
  openModelSettings: '打开模型选择', closeModelSettings: '关闭模型选择', selectModelFilter: '选择模型分类', selectModel: '切换模型',
  openModelConfiguration: '打开模型配置', setModelSetting: '设置模型选项', submitModelConfiguration: '提交模型配置', closeModelConfiguration: '关闭模型配置',
  openChatSettings: '打开对话设置', closeChatSettings: '关闭对话设置', submitChatSettings: '提交对话设置',
  openMoreMenu: '打开更多菜单', closeMoreMenu: '关闭更多菜单', activateMoreMenuItem: '激活菜单项', openTutorial: '打开教程',
  openBackgroundPanel: '打开背景面板', openCustomInstructions: '打开自定义指令', openConversationPanel: '打开会话列表', selectConversation: '切换会话',
  renameConversation: '重命名会话', requestDeleteConversation: '请求删除会话', deleteConversation: '确认删除会话', createConversation: '创建会话', closeConversationPanel: '关闭会话列表',
  openPersona: '打开用户人设', setPersonaMode: '切换人设模式', setPersonaName: '设置称呼', setPersonaGender: '设置性别',
  setPersonaIdentity: '设置身份', submitPersona: '提交用户人设', closePersona: '关闭用户人设', openSupplement: '打开设定补充',
  setSupplementText: '设置补充正文', openSupplementPositionPicker: '打开位置选择', setSupplementPosition: '选择补充位置',
  confirmSupplementPosition: '确认补充位置', cancelSupplementPosition: '取消位置选择', submitSupplement: '提交设定补充', closeSupplement: '关闭设定补充',
  openPromptSelector: '打开指令选择', closePromptSelector: '关闭指令选择', applyInstruction: '应用指令',
}

const WORKFLOWS: Partial<Record<NativeAction, ActionDebugDefinition['workflow']>> = {
  openEditMessage: 'edit', setEditText: 'edit', applyEditTransform: 'edit', submitEditMessage: 'edit', cancelEditMessage: 'edit',
  openModelSettings: 'model', selectModelFilter: 'model', selectModel: 'model', openModelConfiguration: 'model', setModelSetting: 'model', submitModelConfiguration: 'model', closeModelConfiguration: 'model', closeModelSettings: 'model',
  openPersona: 'persona', setPersonaMode: 'persona', setPersonaName: 'persona', setPersonaGender: 'persona', setPersonaIdentity: 'persona', submitPersona: 'persona', closePersona: 'persona',
  openSupplement: 'supplement', setSupplementText: 'supplement', openSupplementPositionPicker: 'supplement', setSupplementPosition: 'supplement', confirmSupplementPosition: 'supplement', cancelSupplementPosition: 'supplement', submitSupplement: 'supplement', closeSupplement: 'supplement',
  deleteMessage: 'message-delete', requestDeleteConversation: 'conversation-delete', deleteConversation: 'conversation-delete',
}

function findGroup(action: NativeAction): ActionGroup {
  for (const [group, actions] of Object.entries(GROUPS) as [ActionGroup, NativeAction[]][]) {
    if (actions.includes(action)) return group
  }
  return '生命周期'
}

function effectFor(action: NativeAction): ActionEffect {
  if (DESTRUCTIVE.has(action)) return 'destructive'
  if (/^(copy|open|close|refresh)/.test(action)) return 'read'
  return 'write'
}

function definitionFor(action: NativeAction): ActionDebugDefinition {
  const contractOnly = CONTRACT_ONLY.has(action)
  return {
    action,
    label: LABELS[action] ?? action,
    description: contractOnly ? '协议已声明，但当前没有原生 handler。' : `通过 NativeBridge.invoke('${action}') 执行并验证原生结果。`,
    group: findGroup(action),
    support: contractOnly ? 'contract-only' : 'registered',
    effect: effectFor(action),
    payloadKind: contractOnly ? 'contract-only' : (PAYLOADS[action] ?? 'none'),
    confirm: CONFIRM.has(action),
    workflow: WORKFLOWS[action],
  }
}

export const ACTION_DEBUG_MANIFEST = Object.fromEntries(
  ALL_NATIVE_ACTIONS.map((action) => [action, definitionFor(action)]),
) as Record<NativeAction, ActionDebugDefinition>

export const CONTRACT_ONLY_ACTIONS = Object.freeze([...CONTRACT_ONLY])
