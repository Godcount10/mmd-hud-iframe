import type {
  CapabilityMap,
  CharacterSnapshot,
  ChatMessage,
  ChatSnapshot,
  ConnectionStatus,
} from '../../contracts'
import { createEmptyCapabilities } from '../actions/capabilities'
import { findChatSettingsEntry, findChatSettingsPanel, readChatSettings } from './chatSettings'
import { findEditContent, findEditPanel, readEditPanel } from './editPanel'
import {
  findNativeInput,
  isNativeInputDisabled,
  readGenerationSnapshot,
} from './generationReader'
import { inspectHeaderActions } from './headerActions'
import {
  findInstructionBar,
  findInstructionEntry,
  readInstructionOptions,
  readInstructionSelector,
} from './instructionSelector'
import { inspectAiMessageActions, inspectDeleteCapability } from './messageActions'
import {
  filterCompatibilityTitle,
  readNativeMessageIdentities,
} from './messageIdentity'
import {
  findModelConfiguration,
  findModelEntry,
  findModelPanel,
  readModelConfiguration,
  readModelPanel,
} from './modelPanels'
import {
  findConversationDeleteConfirmation,
  findConversationPanel,
  findMoreEntry,
  findMorePanel,
  findPersonaPanel,
  findSupplementPanel,
  findSupplementPicker,
  readConversationPanel,
  readMoreMenu,
  readPersonaPanel,
  readSupplementPanel,
} from './morePanels'
import { MMD_SELECTORS } from './selectors'
import { findSharePanel, readSharePanel } from './sharePanel'
import { createSnapshotQueryDocument } from './snapshotQueryCache'

export interface SnapshotReadOptions {
  revision: number
  connectionStatus: ConnectionStatus
  connectionError?: string | null
  resolveMessageIdentity?: MessageIdentityResolver
}

export type MessageIdentityResolver = (element: Element) => string

export function createMessageIdentityResolver(document: Document): MessageIdentityResolver {
  const identities = new WeakMap<Element, string>()
  let nextIdentity = 1
  return (element: Element): string => {
    if (element.ownerDocument !== document) {
      throw new Error('消息元素不属于当前 MMD 文档')
    }
    let identity = identities.get(element)
    if (!identity) {
      identity = `local-${nextIdentity++}`
      identities.set(element, identity)
    }
    return identity
  }
}

interface CharacterReadResult {
  character: CharacterSnapshot
  hasNativeName: boolean
}

function normalizedText(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

function routeRoleId(document: Document): string | null {
  const candidates = [document.defaultView?.location.href, document.location?.href, document.baseURI]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const url = new URL(candidate, document.baseURI)
      const hashQuery = url.hash.includes('?') ? url.hash.slice(url.hash.indexOf('?') + 1) : ''
      const roleId = url.searchParams.get('roleId') ?? new URLSearchParams(hashQuery).get('roleId')
      if (roleId?.trim()) return roleId.trim()
    }
    catch {
      // Ignore malformed host URLs and continue with the remaining identity sources.
    }
  }
  return null
}

function imageSource(element: Element | null): string | null {
  const image = element?.matches('img') ? element as HTMLImageElement : element?.querySelector<HTMLImageElement>('img')
  const source = image?.getAttribute('src')?.trim() ?? ''
  if (!source) return null
  try {
    return new URL(source, element?.ownerDocument.baseURI).href
  }
  catch {
    return source
  }
}

function readProfileMetadata(document: Document): { id: string | null; name: string; author: string | null } {
  const card = document.querySelector(MMD_SELECTORS.characterProfile)
  if (!card) return { id: null, name: '', author: null }
  const text = normalizedText(card)
  const value = (label: string, followingLabels: string[]): string => {
    const labelElement = [...card.querySelectorAll('*')]
      .find((element) => new RegExp(`^${label}\\s*[：:]?$`).test(normalizedText(element)))
    const siblingValue = normalizedText(labelElement?.nextElementSibling ?? null)
    if (siblingValue) return siblingValue
    const boundary = followingLabels.length > 0
      ? `(?=\\s*(?:(?:${followingLabels.join('|')})\\s*[：:]?|$))`
      : '$'
    return text.match(new RegExp(`${label}\\s*[：:]?\\s*(.+?)${boundary}`))?.[1]?.trim() ?? ''
  }
  return {
    author: value('作者', ['角色昵称', '角色ID']) || null,
    name: value('角色昵称', ['角色ID', '作者']),
    id: value('角色ID', ['作者', '角色昵称']) || null,
  }
}

function readCharacter(document: Document): CharacterReadResult {
  const profile = readProfileMetadata(document)
  const headerName = normalizedText(document.querySelector(MMD_SELECTORS.characterName))
  const legacyName = normalizedText(
    document.querySelector(MMD_SELECTORS.aiItem)?.querySelector(MMD_SELECTORS.aiContent) ?? null,
  )
  const nativeName = headerName || profile.name
  return {
    character: {
      id: routeRoleId(document) ?? profile.id,
      name: nativeName || legacyName || '未识别角色',
      avatar: imageSource(document.querySelector(MMD_SELECTORS.characterAvatar)),
      ...(profile.author ? { author: profile.author } : {}),
    },
    hasNativeName: Boolean(nativeName),
  }
}

function messageId(
  item: Element,
  content: Element | null,
  role: 'user' | 'assistant',
  index: number,
  resolveIdentity?: MessageIdentityResolver,
): string {
  const nativeId = content?.id || item.querySelector('.touch-scope')?.id
  if (nativeId) return nativeId
  if (resolveIdentity) return `${role}-${resolveIdentity(item)}`
  const text = content?.textContent?.trim() ?? ''
  let hash = 2166136261
  for (let offset = 0; offset < text.length; offset += 1) {
    hash ^= text.charCodeAt(offset)
    hash = Math.imul(hash, 16777619)
  }
  return `${role}-${index}-${(hash >>> 0).toString(36)}`
}

function deriveCapabilities(
  document: Document,
  messages?: ChatMessage[],
  moreMenu = readMoreMenu(document),
): CapabilityMap {
  const capabilities = createEmptyCapabilities()
  const editPanel = findEditPanel(document)
  const editEditor = editPanel ? findEditContent(editPanel) : null
  const input = findNativeInput(document)
  const hasInput = Boolean(input)
  const inputDisabled = isNativeInputDisabled(input)
  const hasSend = Boolean(document.querySelector(MMD_SELECTORS.sendProxy))
  const hasExit = Boolean(document.querySelector(MMD_SELECTORS.exitButton))
  const headerActions = inspectHeaderActions(document)
  const sharePanel = findSharePanel(document)
  const modelEntry = findModelEntry(document)
  const modelPanel = findModelPanel(document)
  const modelConfiguration = findModelConfiguration(document)
  const moreEntry = findMoreEntry(document)
  const morePanel = findMorePanel(document)
  const conversationPanel = findConversationPanel(document)
  const personaPanel = findPersonaPanel(document)
  const supplementPanel = findSupplementPanel(document)
  const supplementPicker = findSupplementPicker(document)
  const instructionEntry = findInstructionEntry(document)
  const instructionBar = findInstructionBar(document)
  const chatSettingsEntry = findChatSettingsEntry(document)
  const chatSettingsPanel = findChatSettingsPanel(document)

  capabilities.sendMessage = hasInput && hasSend && !inputDisabled
    ? { available: true }
    : { available: false, reason: hasInput && inputDisabled
        ? '原生输入框当前不可用'
        : '原生输入框或发送代理尚未加载' }
  capabilities.setInputText = hasInput && !inputDisabled
    ? { available: true }
    : { available: false, reason: hasInput
        ? '原生输入框当前不可用'
        : '原生输入框尚未加载' }
  capabilities.exit = hasExit
    ? { available: true }
    : { available: false, reason: '原生退出按钮尚未加载' }
  const headerActionReason = headerActions.reason ?? '原生顶部四按钮签名不完整'
  capabilities.openComments = headerActions.comments
    ? { available: true }
    : { available: false, reason: headerActionReason }
  capabilities.openSharePanel = headerActions.share
    ? { available: true }
    : { available: false, reason: headerActionReason }
  capabilities.copyShareLink = sharePanel?.querySelector(MMD_SELECTORS.shareCopyButton)
    ? { available: true }
    : { available: false, reason: '原生分享界面尚未打开' }
  capabilities.closeSharePanel = sharePanel
    ? { available: true }
    : { available: false, reason: '原生分享界面尚未打开' }
  capabilities.toggleFavorite = headerActions.favorite
    ? { available: true }
    : { available: false, reason: headerActionReason }
  capabilities.refreshConversation = headerActions.refresh
    ? { available: true }
    : { available: false, reason: headerActionReason }
  capabilities.openModelSettings = modelEntry
    ? { available: true }
    : { available: false, reason: '没有找到带切换图标的原生模型入口' }
  capabilities.closeModelSettings = modelPanel?.querySelector(MMD_SELECTORS.shareCloseButton)
    ? { available: true }
    : { available: false, reason: modelPanel ? '原生模型选择界面关闭按钮尚未加载' : '原生模型选择界面尚未打开' }
  capabilities.selectModelFilter = modelPanel?.querySelector(MMD_SELECTORS.modelFilters)
    ? { available: true }
    : { available: false, reason: '原生模型选择界面没有分类标签' }
  capabilities.selectModel = modelPanel?.querySelector(MMD_SELECTORS.modelItems)
    ? { available: true }
    : { available: false, reason: '原生模型选择界面没有可用模型' }
  capabilities.openModelConfiguration = modelPanel?.querySelector(MMD_SELECTORS.modelItems)
    ? { available: true }
    : { available: false, reason: '原生模型选择界面没有可配置模型' }
  capabilities.setModelSetting = modelConfiguration
    ? { available: true }
    : { available: false, reason: '原生模型设置界面尚未打开' }
  capabilities.submitModelConfiguration = modelConfiguration?.querySelector(MMD_SELECTORS.modelConfigurationSubmit)
    ? { available: true }
    : { available: false, reason: '原生模型设置确认按钮尚未加载' }
  capabilities.closeModelConfiguration = modelConfiguration?.querySelector(MMD_SELECTORS.modelConfigurationClose)
    ? { available: true }
    : { available: false, reason: '原生模型设置关闭按钮尚未加载' }
  capabilities.openChatSettings = chatSettingsEntry
    ? { available: true }
    : { available: false, reason: '没有找到结构匹配的原生对话设置入口' }
  capabilities.closeChatSettings = chatSettingsPanel?.querySelector(MMD_SELECTORS.chatSettingsClose)
    ? { available: true }
    : { available: false, reason: '原生对话设置界面尚未打开或结构不完整' }
  capabilities.submitChatSettings = chatSettingsPanel?.querySelector(MMD_SELECTORS.chatSettingsSubmit)
    ? { available: true }
    : { available: false, reason: '原生对话设置界面尚未打开或确认按钮不可用' }
  capabilities.openMoreMenu = moreEntry
    ? { available: true }
    : { available: false, reason: '原生底部更多按钮尚未加载' }
  capabilities.closeMoreMenu = morePanel
    ? { available: true }
    : { available: false, reason: '原生更多菜单尚未打开' }
  capabilities.activateMoreMenuItem = moreMenu.items.some(
    (item) => item.available && !item.destructive,
  )
    ? { available: true }
    : { available: false, reason: '原生更多菜单尚未打开或没有已验证的安全菜单项' }
  capabilities.openTutorial = moreEntry
    ? { available: true }
    : { available: false, reason: '原生底部更多按钮尚未加载，无法验证“游玩教程”' }
  capabilities.openBackgroundPanel = moreEntry
    ? { available: true }
    : { available: false, reason: '原生底部更多按钮尚未加载，无法验证“更换背景”' }
  capabilities.openCustomInstructions = moreEntry
    ? { available: true }
    : { available: false, reason: '原生底部更多按钮尚未加载，无法验证“自定义指令”' }
  capabilities.openConversationPanel = moreEntry
    ? { available: true }
    : { available: false, reason: '原生底部更多按钮尚未加载' }
  capabilities.selectConversation = conversationPanel?.querySelector(MMD_SELECTORS.conversationItems)
    ? { available: true }
    : { available: false, reason: '原生会话面板尚未打开或没有会话' }
  const conversationSnapshot = readConversationPanel(document)
  capabilities.renameConversation = conversationSnapshot.conversations.some(
    (conversation) => conversation.capabilities.rename,
  )
    ? { available: true }
    : { available: false, reason: '原生会话面板没有结构已确认的可重命名会话' }
  capabilities.requestDeleteConversation = conversationSnapshot.conversations.some(
    (conversation) => conversation.capabilities.delete,
  )
    ? { available: true }
    : { available: false, reason: '原生会话面板没有结构已确认的非当前会话' }
  capabilities.deleteConversation = findConversationDeleteConfirmation(document)
    ? { available: true }
    : { available: false, reason: '原生会话删除确认弹窗尚未打开' }
  capabilities.createConversation = conversationPanel?.querySelector(MMD_SELECTORS.conversationCreate)
    ? { available: true }
    : { available: false, reason: '原生会话面板尚未打开' }
  capabilities.closeConversationPanel = conversationPanel
    ? { available: true }
    : { available: false, reason: '原生会话面板尚未打开' }
  capabilities.openPersona = moreEntry
    ? { available: true }
    : { available: false, reason: '原生底部更多按钮尚未加载' }
  capabilities.setPersonaMode = personaPanel?.querySelector(MMD_SELECTORS.personaModes)
    ? { available: true }
    : { available: false, reason: '原生用户人设尚未打开或没有模式选项' }
  const personaNameInput = personaPanel?.querySelector<HTMLInputElement>(MMD_SELECTORS.personaNameInput) ?? null
  capabilities.setPersonaName = personaNameInput && !personaNameInput.disabled
    ? { available: true }
    : { available: false, reason: personaNameInput ? '当前人设模式的称呼为只读' : '原生用户人设尚未打开或称呼输入框不可用' }
  const personaGenderChoices = personaPanel
    ? [...personaPanel.querySelectorAll<HTMLElement>(MMD_SELECTORS.personaGenderItems)]
    : []
  capabilities.setPersonaGender = personaGenderChoices.some(
    (choice) => !choice.classList.contains(MMD_SELECTORS.personaGenderDisabledClass),
  )
    ? { available: true }
    : { available: false, reason: '当前人设模式没有可编辑的性别选项' }
  const personaIdentityInput = personaPanel?.querySelector<HTMLTextAreaElement>(MMD_SELECTORS.personaIdentityInput) ?? null
  capabilities.setPersonaIdentity = personaIdentityInput && !personaIdentityInput.disabled
    ? { available: true }
    : { available: false, reason: personaIdentityInput ? '当前人设模式的身份描述为只读' : '当前人设模式没有身份描述字段' }
  capabilities.submitPersona = personaPanel?.querySelector(MMD_SELECTORS.personaSubmit)
    ? { available: true }
    : { available: false, reason: '原生用户人设保存按钮尚未加载' }
  capabilities.closePersona = personaPanel?.querySelector(MMD_SELECTORS.personaCancel)
    ? { available: true }
    : { available: false, reason: '原生用户人设尚未打开' }
  capabilities.openSupplement = moreEntry
    ? { available: true }
    : { available: false, reason: '原生底部更多按钮尚未加载' }
  capabilities.setSupplementText = supplementPanel?.querySelector(MMD_SELECTORS.supplementTextarea)
    ? { available: true }
    : { available: false, reason: '原生设定补充尚未打开或正文输入框不可用' }
  capabilities.openSupplementPositionPicker = supplementPanel?.querySelector(MMD_SELECTORS.supplementPositionField)
    ? { available: true }
    : { available: false, reason: '原生设定补充尚未打开或位置控件不可用' }
  capabilities.setSupplementPosition = supplementPicker
    ? { available: true }
    : { available: false, reason: '原生位置选择器尚未打开' }
  capabilities.confirmSupplementPosition = supplementPicker
    ? { available: true }
    : { available: false, reason: '原生位置选择器尚未打开' }
  capabilities.cancelSupplementPosition = supplementPicker
    ? { available: true }
    : { available: false, reason: '原生位置选择器尚未打开' }
  capabilities.submitSupplement = supplementPanel?.querySelector(MMD_SELECTORS.supplementSubmit)
    ? { available: true }
    : { available: false, reason: '原生设定补充保存按钮尚未加载' }
  capabilities.closeSupplement = supplementPanel?.querySelector(MMD_SELECTORS.supplementCancel)
    ? { available: true }
    : { available: false, reason: '原生设定补充尚未打开' }
  capabilities.openPromptSelector = instructionEntry
    ? { available: true }
    : { available: false, reason: '没有找到结构匹配的原生选择指令入口' }
  capabilities.closePromptSelector = instructionBar?.querySelector(MMD_SELECTORS.instructionBack)
    ? { available: true }
    : { available: false, reason: '原生指令栏尚未打开或返回按钮不可用' }
  capabilities.applyInstruction = instructionBar
    && readInstructionOptions(instructionBar).length > 0
    && hasInput
    && !inputDisabled
    ? { available: true }
    : {
        available: false,
        reason: instructionBar
          ? inputDisabled
            ? '原生输入框已禁用，无法安全应用指令'
            : '原生指令栏没有可用指令或输入框不可验证'
          : '原生指令栏尚未打开',
      }
  capabilities.copyMessage = { available: true }
  const hasMessages = (messages?.length ?? document.querySelectorAll(MMD_SELECTORS.messageItems).length) > 0
  capabilities.deleteMessage = hasMessages
    ? { available: true }
    : { available: false, reason: '当前没有可请求删除的消息' }
  capabilities.rollbackMessage = hasMessages
    ? { available: true }
    : { available: false, reason: '当前没有可回溯的消息' }
  capabilities.startNewStoryFromMessage = hasMessages
    ? { available: true }
    : { available: false, reason: '当前没有可作为新故事起点的消息' }

  let hasRegenerateAction = false
  let hasEditAction = false
  if (messages) {
    for (const message of messages) {
      if (message.role !== 'assistant') continue
      hasRegenerateAction ||= message.capabilities.regenerate
      hasEditAction ||= message.capabilities.edit
    }
  } else {
    const aiItems = [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.aiItem)]
    for (const item of aiItems.slice(1)) {
      const actionState = inspectAiMessageActions(item)
      hasRegenerateAction ||= actionState.regenerate
      hasEditAction ||= actionState.edit
    }
  }
  capabilities.regenerateMessage = hasRegenerateAction
    ? { available: true }
    : { available: false, reason: '当前没有带重新生成按钮的末条 AI 消息' }
  capabilities.openEditMessage = hasEditAction
    ? { available: true }
    : { available: false, reason: '当前没有带编辑按钮的 AI 消息' }

  const editCapability = editPanel && editEditor
    ? { available: true }
    : { available: false, reason: '原生编辑界面尚未打开或编辑器结构不完整' }
  capabilities.setEditText = editCapability
  capabilities.applyEditTransform = editPanel?.querySelector(MMD_SELECTORS.editOptions)
    ? { available: true }
    : { available: false, reason: '原生编辑界面没有可用文本工具' }
  capabilities.submitEditMessage = editPanel?.querySelector(MMD_SELECTORS.editSaveButton)
    ? { available: true }
    : { available: false, reason: '原生编辑保存按钮尚未加载' }
  capabilities.cancelEditMessage = editPanel
    ? { available: true }
    : { available: false, reason: '原生编辑界面尚未打开' }
  return capabilities
}

export function readCapabilities(document: Document): CapabilityMap {
  return deriveCapabilities(document)
}

function readMessages(
  document: Document,
  character: CharacterSnapshot,
  hasNativeName: boolean,
  resolveMessageIdentity?: MessageIdentityResolver,
): ChatMessage[] {
  const identities = readNativeMessageIdentities(document) ?? []
  const messageIdentities = filterCompatibilityTitle(
    identities,
    character.name,
    hasNativeName,
  )

  return messageIdentities.map((identity, index): ChatMessage => {
      const { item, content, role, nativeIndex } = identity
      const text = content.innerText.trim() || ''
      const html = content.innerHTML || ''
      const actionState = role === 'assistant'
        ? inspectAiMessageActions(item)
        : { edit: false, regenerate: false, count: 0 }
      return {
        id: messageId(item, content, role, index, resolveMessageIdentity),
        role,
        index,
        text,
        html,
        targetFingerprint: identity.fingerprint,
        nativeIndex,
        streaming: false,
        capabilities: {
          copy: true,
          edit: actionState.edit,
          delete: inspectDeleteCapability(item),
          regenerate: actionState.regenerate,
          rollback: true,
          startNewStory: role === 'assistant',
          previousBranch: false,
          nextBranch: false,
        },
      }
    })
}

export function readMmdSnapshot(
  document: Document,
  options: SnapshotReadOptions,
  editingMessageId: string | null = null,
): ChatSnapshot {
  const queryDocument = createSnapshotQueryDocument(document)
  const { character, hasNativeName } = readCharacter(queryDocument)
  const messages = readMessages(queryDocument, character, hasNativeName, options.resolveMessageIdentity)
  const moreMenu = readMoreMenu(queryDocument)
  const capabilities = deriveCapabilities(queryDocument, messages, moreMenu)
  const generation = readGenerationSnapshot(queryDocument, messages)
  const isGenerating = generation.status !== 'idle'
  if (isGenerating) {
    capabilities.sendMessage = { available: false, reason: 'AI 正在生成回复' }
    capabilities.deleteMessage = { available: false, reason: 'AI 正在生成回复' }
    capabilities.regenerateMessage = { available: false, reason: 'AI 正在生成回复' }
    capabilities.rollbackMessage = { available: false, reason: 'AI 正在生成回复' }
    capabilities.startNewStoryFromMessage = { available: false, reason: 'AI 正在生成回复' }
    capabilities.openModelSettings = { available: false, reason: 'AI 正在生成回复' }
    capabilities.selectModelFilter = { available: false, reason: 'AI 正在生成回复' }
    capabilities.selectModel = { available: false, reason: 'AI 正在生成回复' }
    capabilities.openModelConfiguration = { available: false, reason: 'AI 正在生成回复' }
    capabilities.setModelSetting = { available: false, reason: 'AI 正在生成回复' }
    capabilities.submitModelConfiguration = { available: false, reason: 'AI 正在生成回复' }
    capabilities.openMoreMenu = { available: false, reason: 'AI 正在生成回复' }
    capabilities.activateMoreMenuItem = { available: false, reason: 'AI 正在生成回复' }
    capabilities.openTutorial = { available: false, reason: 'AI 正在生成回复' }
    capabilities.openBackgroundPanel = { available: false, reason: 'AI 正在生成回复' }
    capabilities.openCustomInstructions = { available: false, reason: 'AI 正在生成回复' }
    capabilities.openConversationPanel = { available: false, reason: 'AI 正在生成回复' }
    capabilities.openPersona = { available: false, reason: 'AI 正在生成回复' }
    capabilities.openSupplement = { available: false, reason: 'AI 正在生成回复' }
    capabilities.openChatSettings = { available: false, reason: 'AI 正在生成回复' }
    capabilities.openPromptSelector = { available: false, reason: 'AI 正在生成回复' }
    capabilities.applyInstruction = { available: false, reason: 'AI 正在生成回复' }
  }
  for (const message of messages) {
    message.streaming = generation.status === 'streaming' && message.id === generation.messageId
  }
  return {
    revision: options.revision,
    character,
    messages,
    generation,
    connection: {
      status: options.connectionStatus,
      error: options.connectionError ?? null,
    },
    editPanel: readEditPanel(queryDocument, editingMessageId),
    sharePanel: readSharePanel(queryDocument),
    modelPanel: readModelPanel(queryDocument),
    modelConfiguration: readModelConfiguration(queryDocument),
    moreMenu,
    conversationPanel: readConversationPanel(queryDocument),
    personaPanel: readPersonaPanel(queryDocument),
    supplementPanel: readSupplementPanel(queryDocument),
    instructionSelector: readInstructionSelector(queryDocument),
    chatSettings: readChatSettings(queryDocument),
    capabilities,
  }
}
