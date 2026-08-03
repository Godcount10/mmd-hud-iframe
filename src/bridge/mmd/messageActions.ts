import type { ChatMessage } from '../../contracts'
import { alignNativeMessages, expectedMessageFingerprint } from './messageIdentity'
import {
  MMD_AI_HISTORY_ACTION_COUNT,
  MMD_AI_LATEST_ACTION_COUNT,
  MMD_AI_MESSAGE_ACTION_ICON_HINTS,
  MMD_AI_MESSAGE_ACTION_ICON_SIZES,
  MMD_AI_MESSAGE_ACTION_LABELS,
  MMD_MESSAGE_OPTION_LABELS,
  MMD_MESSAGE_OPTION_STRUCTURES,
  MMD_SELECTORS,
} from './selectors'

export type AiMessageAction = 'regenerate' | 'edit'
type AiMessageButtonKind = keyof typeof MMD_AI_MESSAGE_ACTION_LABELS

export interface ResolveMessageResult {
  item: HTMLElement | null
  reason?: string
}

export interface ResolveActionResult extends ResolveMessageResult {
  button: HTMLElement | null
}

export interface AiMessageActionState {
  count: number
  edit: boolean
  regenerate: boolean
}

export type MessageOptionRole = 'user' | 'assistant'

export interface ResolvedMessageOptionMenu {
  panel: HTMLElement
  role: MessageOptionRole
  labels: string[]
  deleteOption: HTMLElement
}

export interface ResolveMessageOptionMenuResult {
  menu: ResolvedMessageOptionMenu | null
  reason?: string
}

export function normalizeVisibleText(value: Element | string | null | undefined): string {
  let text = ''
  if (typeof value === 'string') text = value
  else if (value) {
    const HTMLElementConstructor = value.ownerDocument.defaultView?.HTMLElement
    text = HTMLElementConstructor && value instanceof HTMLElementConstructor
      ? (value as HTMLElement).innerText || value.textContent || ''
      : value.textContent ?? ''
  }
  return text.normalize('NFKC').replace(/[\s​-‍﻿]+/g, '')
}

function isVisible(element: HTMLElement): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  return element.isConnected
    && style?.display !== 'none'
    && style?.visibility !== 'hidden'
    && style?.opacity !== '0'
    && rect.width > 0
    && rect.height > 0
}

export function findVisibleMessageOptionPanel(document: Document): HTMLElement | null {
  const panels = [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.messageOptionPanel)]
    .filter(isVisible)
  return panels.length === 1 ? panels[0]! : null
}

export function resolveMessageOptionMenu(
  document: Document,
  role: MessageOptionRole,
): ResolveMessageOptionMenuResult {
  const visiblePanels = [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.messageOptionPanel)]
    .filter(isVisible)
  if (visiblePanels.length !== 1) {
    return {
      menu: null,
      reason: visiblePanels.length
        ? `检测到 ${visiblePanels.length} 个可见消息操作菜单`
        : '没有唯一可见的消息操作菜单',
    }
  }

  const panel = visiblePanels[0]!
  const boxes = [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.messageOptionBox)]
    .filter(isVisible)
  if (boxes.length !== 1) {
    return { menu: null, reason: `消息操作菜单应有 1 个可见选项容器，实际为 ${boxes.length} 个` }
  }

  const box = boxes[0]!
  const options = [...box.querySelectorAll<HTMLElement>(MMD_SELECTORS.messageOptionItems)]
    .filter(isVisible)
  const HTMLElementConstructor = box.ownerDocument.defaultView?.HTMLElement ?? HTMLElement
  const directChildren = [...box.children].filter((child): child is HTMLElement =>
    child instanceof HTMLElementConstructor && isVisible(child as HTMLElement))
  if (options.length !== directChildren.length || options.some((option, index) => option !== directChildren[index])) {
    return { menu: null, reason: '消息操作菜单包含未识别的可见直属结构' }
  }

  const labels = options.map(normalizeVisibleText)
  const expected = [...MMD_MESSAGE_OPTION_STRUCTURES[role]].map(normalizeVisibleText)
  if (labels.length !== expected.length || labels.some((label, index) => label !== expected[index])) {
    return {
      menu: null,
      reason: `消息操作菜单结构不匹配：期望 ${expected.join(' / ')}，实际 ${labels.join(' / ') || '空'}`,
    }
  }
  if (new Set(labels).size !== labels.length) {
    return { menu: null, reason: '消息操作菜单包含重复语义选项' }
  }

  const deleteIndex = labels.indexOf(normalizeVisibleText(MMD_MESSAGE_OPTION_LABELS.delete))
  const deleteOption = options[deleteIndex] ?? null
  if (!deleteOption) return { menu: null, reason: '消息操作菜单没有唯一“删除”选项' }
  return { menu: { panel, role, labels, deleteOption } }
}

interface DeleteCapabilityMarker {
  expiresAt: number
  signature: string
  token: string
}

const deleteCapabilityItems = new WeakMap<HTMLElement, DeleteCapabilityMarker>()

function deleteCapabilitySignature(item: HTMLElement): string | null {
  const assistant = item.matches(MMD_SELECTORS.aiItem)
  const user = item.matches(MMD_SELECTORS.userItem)
  if (assistant === user) return null
  const role: MessageOptionRole = assistant ? 'assistant' : 'user'
  const content = item.querySelector<HTMLElement>(
    assistant ? MMD_SELECTORS.aiContent : MMD_SELECTORS.userContent,
  )
  if (!content) return null
  return `${role}\u0000${content.id}\u0000${content.innerHTML}`
}

export function confirmDeleteCapability(
  item: HTMLElement,
  token: string,
  expiresAt: number,
): void {
  const signature = deleteCapabilitySignature(item)
  if (!signature || !item.isConnected) return
  deleteCapabilityItems.set(item, { expiresAt, signature, token })
}

export function invalidateDeleteCapability(item: HTMLElement, token?: string): void {
  const marker = deleteCapabilityItems.get(item)
  if (!marker || (token && marker.token !== token)) return
  deleteCapabilityItems.delete(item)
}

export function inspectDeleteCapability(item: HTMLElement): boolean {
  const marker = deleteCapabilityItems.get(item)
  if (!marker) return false
  const valid = item.isConnected
    && marker.expiresAt >= Date.now()
    && marker.signature === deleteCapabilitySignature(item)
  if (!valid) deleteCapabilityItems.delete(item)
  return valid
}

interface ResolvedActionGroup {
  buttons: HTMLElement[]
  actions: Partial<Record<AiMessageButtonKind, HTMLElement>>
}

interface ActionGroupResult {
  group: ResolvedActionGroup | null
  count: number
  reason?: string
}

const MESSAGE_ACTION_KINDS = Object.keys(MMD_AI_MESSAGE_ACTION_LABELS) as AiMessageButtonKind[]

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s_-]+/g, '')
}

function readActionGroups(item: HTMLElement): HTMLElement[][] {
  return [...item.querySelectorAll<HTMLElement>(MMD_SELECTORS.messageActionScope)]
    .map((scope) => [...scope.querySelectorAll<HTMLElement>(MMD_SELECTORS.messageActionButton)])
}

function actionLabels(button: HTMLElement): string[] {
  const values = [
    button.textContent ?? '',
    button.getAttribute('aria-label') ?? '',
    button.getAttribute('title') ?? '',
    button.getAttribute('data-action') ?? '',
    button.getAttribute('data-title') ?? '',
  ]
  button.querySelectorAll<HTMLElement>('[aria-label], [title], [data-action], [data-title]').forEach((element) => {
    values.push(
      element.getAttribute('aria-label') ?? '',
      element.getAttribute('title') ?? '',
      element.getAttribute('data-action') ?? '',
      element.getAttribute('data-title') ?? '',
    )
  })
  button.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    values.push(image.alt, image.title)
  })
  return values.map(normalize).filter(Boolean)
}

function actionIconSources(button: HTMLElement): string[] {
  const values: string[] = []
  button.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => values.push(image.src))
  button.querySelectorAll<HTMLElement>('[style*="background-image"]').forEach((element) => {
    values.push(element.style.backgroundImage)
  })
  return values.map(normalize).filter(Boolean)
}

function semanticMatches(button: HTMLElement): AiMessageButtonKind[] {
  const labels = actionLabels(button)
  const sources = actionIconSources(button)
  return MESSAGE_ACTION_KINDS.filter((action) => {
    const labelMatch = MMD_AI_MESSAGE_ACTION_LABELS[action].some((hint) => {
      const normalizedHint = normalize(hint)
      return labels.some((label) => label.includes(normalizedHint))
    })
    const iconMatch = MMD_AI_MESSAGE_ACTION_ICON_HINTS[action].some((hint) => {
      const normalizedHint = normalize(hint)
      return sources.some((source) => source.includes(normalizedHint))
    })
    return labelMatch || iconMatch
  })
}

function readIconSize(button: HTMLElement): string | null {
  const images = [...button.querySelectorAll<HTMLImageElement>('img')]
  if (images.length !== 1) return null
  const image = images[0]
  const width = image.naturalWidth || Number(image.getAttribute('width'))
  const height = image.naturalHeight || Number(image.getAttribute('height'))
  return width > 0 && height > 0 ? `${width}x${height}` : null
}

function structuralMatches(button: HTMLElement): AiMessageButtonKind[] {
  const size = readIconSize(button)
  if (!size) return []
  return MESSAGE_ACTION_KINDS.filter((action) =>
    MMD_AI_MESSAGE_ACTION_ICON_SIZES[action].some((expected) => expected === size))
}

function resolveGroup(buttons: HTMLElement[]): ResolvedActionGroup | null {
  if (
    buttons.length !== MMD_AI_HISTORY_ACTION_COUNT
    && buttons.length !== MMD_AI_LATEST_ACTION_COUNT
  ) return null

  const actions: Partial<Record<AiMessageButtonKind, HTMLElement>> = {}
  let usedStructuralFallback = false
  for (const button of buttons) {
    let matches = semanticMatches(button)
    if (matches.length === 0) {
      matches = structuralMatches(button)
      usedStructuralFallback = true
    }
    if (matches.length !== 1 || actions[matches[0]]) return null
    actions[matches[0]] = button
  }

  const expected = buttons.length === MMD_AI_LATEST_ACTION_COUNT
    ? MESSAGE_ACTION_KINDS
    : (['edit', 'copy'] satisfies AiMessageButtonKind[])
  if (expected.some((action) => !actions[action])) return null
  if (Object.keys(actions).length !== expected.length) return null

  // Unlabeled data-URL icons are accepted only as a complete, unique legacy
  // signature. This prevents one familiar-looking icon from authorizing a click.
  if (usedStructuralFallback && expected.some((action) => {
    const button = actions[action]
    const matches = button ? structuralMatches(button) : []
    return matches.length !== 1 || matches[0] !== action
  })) return null
  return { buttons, actions }
}

function findSupportedActionGroup(item: HTMLElement): ActionGroupResult {
  const groups = readActionGroups(item)
  const count = groups.reduce((largest, buttons) => Math.max(largest, buttons.length), 0)
  const supported = groups
    .map(resolveGroup)
    .filter((group): group is ResolvedActionGroup => Boolean(group))

  if (supported.length === 1) return { group: supported[0], count }
  if (supported.length > 1) {
    return { group: null, count, reason: 'AI 气泡存在多个可验证的操作区，已停止以避免误点' }
  }
  if (!count) return { group: null, count, reason: 'AI 气泡缺少操作区' }
  if (groups.every((buttons) =>
    buttons.length !== MMD_AI_HISTORY_ACTION_COUNT
    && buttons.length !== MMD_AI_LATEST_ACTION_COUNT)) {
    return {
      group: null,
      count,
      reason: `AI 操作按钮数量应为 ${MMD_AI_HISTORY_ACTION_COUNT} 或 ${MMD_AI_LATEST_ACTION_COUNT}，实际最多为 ${count}`,
    }
  }
  return {
    group: null,
    count,
    reason: 'AI 操作按钮缺少唯一的文字、图标或完整结构签名，已停止以避免误点',
  }
}

export interface ResolveDeleteTargetResult extends ResolveMessageResult {
  target: HTMLElement | null
  role: MessageOptionRole | null
}

export function resolveDeleteTarget(
  document: Document,
  messages: ChatMessage[],
  messageId: string,
): ResolveDeleteTargetResult {
  const resolved = resolveNativeMessage(document, messages, messageId)
  if (!resolved.item) return { ...resolved, target: null, role: null }
  const assistant = resolved.item.matches(MMD_SELECTORS.aiItem)
  const user = resolved.item.matches(MMD_SELECTORS.userItem)
  if (assistant === user) {
    return { ...resolved, target: null, role: null, reason: '目标气泡角色结构不唯一' }
  }
  const role: MessageOptionRole = assistant ? 'assistant' : 'user'
  const target = resolved.item.querySelector<HTMLElement>(
    assistant ? MMD_SELECTORS.aiContent : MMD_SELECTORS.userContent,
  )
  if (!target) {
    return { ...resolved, target: null, role, reason: '目标气泡缺少对应角色的内容节点' }
  }
  return { ...resolved, target, role }
}

export function resolveNativeMessage(
  document: Document,
  messages: ChatMessage[],
  messageId: string,
): ResolveMessageResult {
  const snapshotMatches = messages.filter((candidate) => candidate.id === messageId)
  if (snapshotMatches.length !== 1) {
    return {
      item: null,
      reason: snapshotMatches.length
        ? '快照中消息 ID 不唯一，已停止以避免误操作'
        : '快照中没有对应消息',
    }
  }
  const message = snapshotMatches[0]!
  if (!Number.isInteger(message.index) || message.index < 0) {
    return { item: null, reason: '快照消息位置无效' }
  }

  const aligned = alignNativeMessages(document, messages)
  if (!aligned.identities) return { item: null, reason: aligned.reason }
  const identity = aligned.identities[message.index]
  if (!identity
    || identity.role !== message.role
    || identity.fingerprint !== expectedMessageFingerprint(message)) {
    return { item: null, reason: '目标消息位置、角色或内容指纹与快照不一致' }
  }

  const escapedId = typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(messageId)
    : messageId.replace(/([ #;.:[\],>+~*'"=()])/g, '\\$1')
  const contents = [...document.querySelectorAll<HTMLElement>(`#${escapedId}`)]
  if (contents.length > 1) {
    return { item: null, reason: '原生消息 ID 不唯一，已停止以避免误操作' }
  }
  if (contents.length === 1) {
    const matched = contents[0]!
    const byId = matched.closest<HTMLElement>(MMD_SELECTORS.messageItems)
    const wrapper = identity.item.querySelector<HTMLElement>('.touch-scope')
    const isExpectedContent = matched === identity.content
    const isExpectedWrapper = matched === wrapper
      && wrapper.contains(identity.content)
      && wrapper.closest<HTMLElement>(MMD_SELECTORS.messageItems) === identity.item
      && identity.item.querySelectorAll('.touch-scope').length === 1
    if (byId !== identity.item || (!isExpectedContent && !isExpectedWrapper)) {
      return { item: null, reason: '原生消息 ID 的角色、内容、包装层或位置与快照不一致' }
    }
  }

  return { item: identity.item }
}

export function resolveAiMessageAction(
  document: Document,
  messages: ChatMessage[],
  messageId: string,
  action: AiMessageAction,
): ResolveActionResult {
  const resolved = resolveNativeMessage(document, messages, messageId)
  if (!resolved.item) return { ...resolved, button: null }
  if (!resolved.item.matches(MMD_SELECTORS.aiItem)) {
    return { item: resolved.item, button: null, reason: '该动作只适用于 AI 消息' }
  }

  const actionGroup = findSupportedActionGroup(resolved.item)
  if (!actionGroup.group) {
    return { item: resolved.item, button: null, reason: actionGroup.reason }
  }
  const button = actionGroup.group.actions[action] ?? null
  if (!button) {
    return {
      item: resolved.item,
      button: null,
      reason: action === 'regenerate'
        ? '历史 AI 气泡没有原生重新生成按钮'
        : '当前 AI 气泡没有原生编辑按钮',
    }
  }
  return { item: resolved.item, button }
}

export function inspectAiMessageActions(item: HTMLElement): AiMessageActionState {
  const resolved = findSupportedActionGroup(item)
  return {
    count: resolved.count,
    edit: Boolean(resolved.group?.actions.edit),
    regenerate: Boolean(resolved.group?.actions.regenerate),
  }
}
