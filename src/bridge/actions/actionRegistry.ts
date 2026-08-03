import type {
  ActionResult,
  BridgeErrorCode,
  ChatMessage,
  ConversationReferenceSnapshot,
  DeleteConversationPayload,
  DeleteConversationResult,
  DeleteMessagePayload,
  DeleteMessageResult,
  NativeAction,
} from '../../contracts'
import { findChatSettingsEntry, findChatSettingsPanel, readChatSettings } from '../mmd/chatSettings'
import {
  findEditContent,
  findEditPanel,
  findEditPanels,
  findEditTransform,
  readEditPanel,
  setNativeEditText,
} from '../mmd/editPanel'
import { resolveHeaderAction, type HeaderActionKind } from '../mmd/headerActions'
import {
  confirmDeleteCapability,
  findVisibleMessageOptionPanel,
  invalidateDeleteCapability,
  normalizeVisibleText,
  resolveAiMessageAction,
  resolveDeleteTarget,
  resolveMessageOptionMenu,
  resolveNativeMessage,
} from '../mmd/messageActions'
import {
  findInstructionBar,
  findInstructionEntry,
  findInstructionOption,
  readInstructionSelector,
} from '../mmd/instructionSelector'
import {
  findModelConfiguration,
  findModelEntry,
  findModelFilter,
  findModelItem,
  findModelPanel,
  findModelPanelClose,
  findModelSettingTarget,
  readModelConfiguration,
  readModelOptions,
  readModelPanel,
  waitForModelRows,
} from '../mmd/modelPanels'
import {
  findBackgroundPanel,
  findConversationDeleteConfirmation,
  findConversationDeleteConfirmations,
  findConversationItem,
  findConversationPanel,
  findCustomInstructionsPanel,
  findMoreEntryTarget,
  findMoreItem,
  findMoreItemById,
  findMoreMenuItemDefinitionByKind,
  findMorePanel,
  findPersonaGender,
  findPersonaMode,
  findPersonaPanel,
  findPickerTextButton,
  findSupplementPanel,
  findSupplementPicker,
  findSupplementPositionOption,
  isTutorialRoute,
  moreItemIconSource,
  readConversationPanel,
  readMoreMenu,
  readPersonaPanel,
  readSupplementPanel,
} from '../mmd/morePanels'
import { findNativeInput, isNativeInputDisabled } from '../mmd/generationReader'
import { findSharePanel, readSharePanel } from '../mmd/sharePanel'
import {
  MMD_CONVERSATION_RENAME_TITLE,
  MMD_DELETE_CONFIRM_TEXT,
  MMD_MESSAGE_OPTION_LABELS,
  MMD_ROLLBACK_CONFIRM_TEXT,
  MMD_SELECTORS,
} from '../mmd/selectors'

export interface ActionContext {
  document: Document
  messages: ChatMessage[]
  signal?: AbortSignal
}

type ActionHandler = (payload: unknown, context: ActionContext) => Promise<ActionResult>

function failure(action: NativeAction, code: BridgeErrorCode, message: string): ActionResult {
  return { ok: false, action, error: { code, message } }
}

function readComposerValues(document: Document): string[] {
  return [...document.querySelectorAll<HTMLTextAreaElement>(MMD_SELECTORS.inputFallback)]
    .map((input) => input.value)
}

function dispatchPointerClick(element: HTMLElement): void {
  const view = element.ownerDocument.defaultView ?? window
  const PointerEventConstructor = view.PointerEvent
  const MouseEventConstructor = view.MouseEvent
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const EventConstructor = type.startsWith('pointer') && PointerEventConstructor
      ? PointerEventConstructor
      : MouseEventConstructor
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
    }
    let event: MouseEvent
    try {
      event = new EventConstructor(type, { ...init, view })
    } catch {
      event = new EventConstructor(type, init)
    }
    element.dispatchEvent(event)
  }
}

function dispatchPickerOptionClick(element: HTMLElement): void {
  const view = element.ownerDocument.defaultView ?? window
  const rect = element.getBoundingClientRect()
  const clientX = rect.left + rect.width / 2
  const clientY = rect.top + rect.height / 2
  element.dispatchEvent(new view.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    composed: true,
    view,
    button: 0,
    clientX,
    clientY,
    screenX: clientX,
    screenY: clientY,
  }))
}

async function dispatchLongPress(
  element: HTMLElement,
  menuOpened: () => boolean,
  timeoutMs = 3_000,
  signal?: AbortSignal,
): Promise<boolean> {
  const document = element.ownerDocument
  const view = document.defaultView ?? window
  const rect = element.getBoundingClientRect()
  const clientX = rect.left + Math.min(Math.max(rect.width / 2, 8), Math.max(rect.width - 8, 8))
  const clientY = rect.top + Math.min(Math.max(rect.height / 2, 8), Math.max(rect.height - 8, 8))
  const pressed = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view,
    button: 0,
    buttons: 1,
    clientX,
    clientY,
    screenX: clientX,
    screenY: clientY,
  }

  if (view.PointerEvent) {
    element.dispatchEvent(new view.PointerEvent('pointerdown', {
      ...pressed,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      pressure: 0.5,
    }))
  }
  element.dispatchEvent(new view.MouseEvent('mousedown', pressed))

  const opened = await waitForCondition(menuOpened, timeoutMs, signal)
  const releaseTarget = typeof document.elementFromPoint === 'function'
    ? document.elementFromPoint(clientX, clientY) ?? element
    : element
  const released = { ...pressed, buttons: 0 }

  if (view.PointerEvent) {
    releaseTarget.dispatchEvent(new view.PointerEvent('pointerup', {
      ...released,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      pressure: 0,
    }))
  }
  releaseTarget.dispatchEvent(new view.MouseEvent('mouseup', released))

  if (!opened) return false
  if (!await nextFrame(signal)) return false
  return menuOpened()
}

function nextFrame(signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)
  return new Promise((resolve) => {
    let frame = 0
    const finish = (completed: boolean): void => {
      if (frame) cancelAnimationFrame(frame)
      signal?.removeEventListener('abort', onAbort)
      resolve(completed)
    }
    const onAbort = (): void => finish(false)
    signal?.addEventListener('abort', onAbort, { once: true })
    frame = requestAnimationFrame(() => finish(true))
  })
}

function waitForCondition(
  check: () => boolean,
  timeoutMs = 4_000,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)
  if (check()) return Promise.resolve(true)
  return new Promise((resolve) => {
    const startedAt = performance.now()
    let frame = 0
    let settled = false
    const finish = (matched: boolean): void => {
      if (settled) return
      settled = true
      if (frame) cancelAnimationFrame(frame)
      signal?.removeEventListener('abort', onAbort)
      resolve(matched)
    }
    const onAbort = (): void => finish(false)
    const tick = (): void => {
      if (signal?.aborted) return finish(false)
      if (check()) return finish(true)
      if (performance.now() - startedAt >= timeoutMs) return finish(false)
      frame = requestAnimationFrame(tick)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    frame = requestAnimationFrame(tick)
  })
}

function readMessageId(payload: unknown): string {
  return typeof payload === 'object' && payload !== null && 'messageId' in payload
    ? String((payload as { messageId: unknown }).messageId)
    : ''
}

function readDeletePayload(payload: unknown): DeleteMessagePayload {
  const messageId = readMessageId(payload)
  const confirmationToken = typeof payload === 'object' && payload !== null && 'confirmationToken' in payload
    ? String((payload as { confirmationToken: unknown }).confirmationToken)
    : undefined
  return { messageId, confirmationToken: confirmationToken || undefined }
}

function createConfirmationToken(targetId: string): string {
  const crypto = globalThis.crypto
  if (crypto && typeof crypto.randomUUID === 'function') return `${targetId}:${crypto.randomUUID()}`
  if (!crypto || typeof crypto.getRandomValues !== 'function') {
    throw new Error('当前环境缺少安全随机数生成器，无法创建删除确认令牌')
  }
  const randomPart = [...crypto.getRandomValues(new Uint32Array(4))]
    .map((value) => value.toString(36))
    .join('')
  return `${targetId}:${randomPart}:${Date.now().toString(36)}`
}

interface PendingDeleteConfirmation {
  messageId: string
  item: HTMLElement
  token: string
  expiresAt: number
}

const pendingDeleteConfirmations = new WeakMap<Document, PendingDeleteConfirmation>()

interface PendingConversationDeleteConfirmation {
  reference: ConversationReferenceSnapshot
  item: HTMLElement
  dialog: HTMLElement
  token: string
  expiresAt: number
  serial: number
}

const pendingConversationDeleteConfirmations = new WeakMap<Document, PendingConversationDeleteConfirmation>()
const conversationDeleteSerials = new WeakMap<Document, number>()

interface PendingEditSession {
  messageId: string
  item: HTMLElement
  panel: HTMLElement
  expiresAt: number
  serial: number
}

const pendingEditSessions = new WeakMap<Document, PendingEditSession>()
const editSessionSerials = new WeakMap<Document, number>()

interface PendingConversationRenameSession {
  reference: ConversationReferenceSnapshot
  item: HTMLElement
  dialog: HTMLElement
  expiresAt: number
  serial: number
}

const pendingConversationRenameSessions = new WeakMap<Document, PendingConversationRenameSession>()
const conversationRenameSerials = new WeakMap<Document, number>()
const INTERACTION_SESSION_TTL_MS = 30_000
const DELETE_CONFIRMATION_TTL_MS = 30_000
const DELETE_VERIFICATION_TIMEOUT_MS = 4_000

function normalizedText(element: Element): string {
  return normalizeVisibleText(element)
}

interface NativeMessageSignature {
  role: 'assistant' | 'user'
  text: string
  contentId: string | null
}

function readNativeMessageSignatures(document: Document): NativeMessageSignature[] {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.messageItems)]
    .map((item) => {
      const assistant = item.matches(MMD_SELECTORS.aiItem)
      const content = item.querySelector<HTMLElement>(
        assistant ? MMD_SELECTORS.aiContent : MMD_SELECTORS.userContent,
      )
      return {
        role: assistant ? 'assistant' as const : 'user' as const,
        text: normalizedText(content ?? item),
        contentId: content?.id || null,
      }
    })
}

function sameMessageContent(
  left: NativeMessageSignature,
  right: NativeMessageSignature,
): boolean {
  return left.role === right.role && left.text === right.text
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

function findVisibleElement(document: Document, selector: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(isVisible) ?? null
}

function findMessageOptionPanel(document: Document): HTMLElement | null {
  return findVisibleMessageOptionPanel(document)
}

async function closeMessageOptionPanel(document: Document, signal?: AbortSignal): Promise<boolean> {
  const panel = findMessageOptionPanel(document)
  if (!panel) return true
  panel.click()
  return waitForCondition(() => !findMessageOptionPanel(document), 1_000, signal)
}

function findMessageOption(document: Document, label: string): HTMLElement | null {
  const panel = findMessageOptionPanel(document)
  if (!panel) return null
  return [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.messageOptionItems)]
    .find((item) => isVisible(item) && normalizedText(item) === label) ?? null
}

function findRollbackConfirmation(document: Document): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.confirmPopup)]
    .find((panel) => {
      if (!isVisible(panel)) return false
      const title = panel.querySelector(MMD_SELECTORS.confirmTitle)
      const content = panel.querySelector(MMD_SELECTORS.confirmContent)
      return normalizedText(title ?? panel).includes(MMD_MESSAGE_OPTION_LABELS.rollback)
        && normalizedText(content ?? panel).includes(
          MMD_ROLLBACK_CONFIRM_TEXT.replace(/\s+/g, ''),
        )
    }) ?? null
}

function findDeleteConfirmation(document: Document): HTMLElement | null {
  const panels = [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.confirmPopup)]
    .filter((panel) => {
      if (!isVisible(panel)) return false
      const titleText = normalizeVisibleText(panel.querySelector(MMD_SELECTORS.confirmTitle))
      const contentText = normalizeVisibleText(panel.querySelector(MMD_SELECTORS.confirmContent))
      return titleText === normalizeVisibleText(MMD_MESSAGE_OPTION_LABELS.delete)
        && contentText.includes(normalizeVisibleText(MMD_DELETE_CONFIRM_TEXT))
    })
  return panels.length === 1 ? panels[0]! : null
}

function resolveSemanticConfirmationButton(
  panel: HTMLElement,
  selector: string,
  label: string,
): HTMLElement | null {
  const buttons = [...panel.querySelectorAll<HTMLElement>(selector)]
    .filter((button) => isVisible(button) && normalizeVisibleText(button) === normalizeVisibleText(label))
  return buttons.length === 1 ? buttons[0]! : null
}

async function handleDeleteConfirmation(
  document: Document,
  target: HTMLElement,
  signal?: AbortSignal,
): Promise<boolean | null> {
  const settled = await waitForCondition(
    () => Boolean(findDeleteConfirmation(document)) || !target.isConnected,
    1_500,
    signal,
  )
  if (!settled) return false
  const panel = findDeleteConfirmation(document)
  if (!panel) return target.isConnected ? false : null
  const cancel = resolveSemanticConfirmationButton(panel, MMD_SELECTORS.confirmCancelButton, '取消')
  const confirm = resolveSemanticConfirmationButton(panel, MMD_SELECTORS.confirmOkButton, '确定')
  if (!cancel || !confirm) return false
  dispatchPointerClick(confirm)
  return await waitForCondition(() => !findDeleteConfirmation(document), 6_000, signal) ? true : false
}

function isExactSingleDeletion(
  before: NativeMessageSignature[],
  after: NativeMessageSignature[],
  targetIndex: number,
  target: HTMLElement,
): boolean {
  if (targetIndex < 0 || after.length !== before.length - 1 || target.isConnected) return false
  return before.every((signature, beforeIndex) => {
    if (beforeIndex === targetIndex) return true
    const afterIndex = beforeIndex < targetIndex ? beforeIndex : beforeIndex - 1
    const current = after[afterIndex]
    return Boolean(current)
      && sameMessageContent(signature, current!)
      && signature.contentId === current!.contentId
  })
}

async function openAndResolveDeleteMenu(
  action: NativeAction,
  payload: unknown,
  context: ActionContext,
): Promise<{ item: HTMLElement; messageId: string; deleteOption: HTMLElement } | ActionResult> {
  const opened = await openMessageOptions(action, payload, context)
  if ('ok' in opened) return opened
  const target = resolveDeleteTarget(context.document, context.messages, opened.messageId)
  if (!target.item || !target.target || !target.role || target.item !== opened.item) {
    await closeMessageOptionPanel(context.document, context.signal)
    return failure(action, 'PLATFORM_CHANGED', target.reason || '长按后无法重新确认目标气泡')
  }
  const resolvedMenu = resolveMessageOptionMenu(context.document, target.role)
  if (!resolvedMenu.menu) {
    await closeMessageOptionPanel(context.document, context.signal)
    return failure(action, 'PLATFORM_CHANGED', resolvedMenu.reason || '消息操作菜单结构无法安全解析')
  }
  return { item: target.item, messageId: opened.messageId, deleteOption: resolvedMenu.menu.deleteOption }
}

async function confirmRollback(document: Document, signal?: AbortSignal): Promise<boolean> {
  const appeared = await waitForCondition(
    () => Boolean(findRollbackConfirmation(document)),
    4_000,
    signal,
  )
  if (!appeared) return false
  const panel = findRollbackConfirmation(document)
  const confirm = panel?.querySelector<HTMLElement>(MMD_SELECTORS.confirmOkButton) ?? null
  if (!confirm || !isVisible(confirm)) return false
  dispatchPointerClick(confirm)
  return waitForCondition(() => !findRollbackConfirmation(document), 6_000, signal)
}

async function openMessageOptions(
  action: NativeAction,
  payload: unknown,
  context: ActionContext,
): Promise<{ item: HTMLElement; messageId: string } | ActionResult> {
  const messageId = readMessageId(payload)
  if (!messageId) return failure(action, 'INVALID_ARGUMENT', '缺少 messageId')
  if (findMessageOptionPanel(context.document) && !await closeMessageOptionPanel(context.document, context.signal)) {
    return failure(action, 'PLATFORM_CHANGED', '已有消息操作菜单无法安全关闭')
  }
  const resolved = resolveNativeMessage(context.document, context.messages, messageId)
  if (!resolved.item) {
    return failure(action, 'PLATFORM_CHANGED', resolved.reason || '没有找到目标原生消息气泡')
  }

  const target = resolved.item.querySelector<HTMLElement>(
    `${MMD_SELECTORS.aiContent}, ${MMD_SELECTORS.userContent}`,
  ) ?? resolved.item.querySelector<HTMLElement>('.touch-scope') ?? resolved.item
  const opened = await dispatchLongPress(
    target,
    () => Boolean(findMessageOptionPanel(context.document)),
    3_000,
    context.signal,
  )
  if (!opened) {
    return failure(action, 'TIMEOUT', '已模拟长按，但 3 秒内消息选项菜单没有变为可见')
  }
  return { item: resolved.item, messageId }
}

async function invokeMessageOption(
  action: NativeAction,
  label: string,
  payload: unknown,
  context: ActionContext,
): Promise<ActionResult> {
  const opened = await openMessageOptions(action, payload, context)
  if ('ok' in opened) return opened
  const option = findMessageOption(context.document, label)
  if (!option) {
    return failure(action, 'PLATFORM_CHANGED', `消息选项菜单中没有“${label}”`)
  }
  option.click()
  return { ok: true, action, data: { messageId: opened.messageId, phase: 'selected' } }
}

function waitForRegeneration(
  document: Document,
  item: HTMLElement,
  trigger: () => void,
  signal?: AbortSignal,
): Promise<boolean> {
  const list = document.querySelector(MMD_SELECTORS.messageList)
  const content = item.querySelector<HTMLElement>(MMD_SELECTORS.aiContent)
  const initialHtml = content?.innerHTML ?? ''
  const Observer = document.defaultView?.MutationObserver ?? MutationObserver

  if (signal?.aborted) return Promise.resolve(false)
  if (!list) {
    trigger()
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (changed: boolean): void => {
      if (settled) return
      settled = true
      observer.disconnect()
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve(changed)
    }
    const onAbort = (): void => finish(false)
    const hasChanged = (): boolean => {
      if (!item.isConnected) return true
      const current = item.querySelector<HTMLElement>(MMD_SELECTORS.aiContent)
      return (current?.innerHTML ?? '') !== initialHtml
    }
    const observer = new Observer(() => {
      if (hasChanged()) finish(true)
    })
    const timer = window.setTimeout(() => finish(hasChanged()), 12_000)

    observer.observe(list, { subtree: true, childList: true, characterData: true })
    signal?.addEventListener('abort', onAbort, { once: true })
    trigger()
    if (hasChanged()) finish(true)
  })
}

function readStringPayload(payload: unknown, key: string): string {
  return typeof payload === 'object' && payload !== null && key in payload
    ? String((payload as Record<string, unknown>)[key])
    : ''
}

function readConversationReference(payload: unknown): ConversationReferenceSnapshot | null {
  if (typeof payload !== 'object' || payload === null) return null
  const candidate = payload as Record<string, unknown>
  const id = typeof candidate.conversationId === 'string' ? candidate.conversationId : ''
  const fingerprint = typeof candidate.fingerprint === 'string' ? candidate.fingerprint : ''
  const index = typeof candidate.index === 'number' ? candidate.index : Number.NaN
  if (!id || !fingerprint || !Number.isInteger(index) || index < 0) return null
  return { id, fingerprint, index }
}

function readDeleteConversationPayload(payload: unknown): DeleteConversationPayload | null {
  const reference = readConversationReference(payload)
  if (!reference) return null
  const confirmationToken = typeof payload === 'object' && payload !== null && 'confirmationToken' in payload
    ? String((payload as { confirmationToken: unknown }).confirmationToken)
    : undefined
  return {
    conversationId: reference.id,
    fingerprint: reference.fingerprint,
    index: reference.index,
    confirmationToken: confirmationToken || undefined,
  }
}

function closeConversationDeleteDialog(dialog: HTMLElement): boolean {
  const cancel = dialog.querySelector<HTMLElement>(MMD_SELECTORS.confirmCancelButton)
  if (!cancel || !isVisible(cancel)) return false
  dispatchPointerClick(cancel)
  return true
}

async function rejectPreExistingConversationDeleteDialogs(
  document: Document,
  signal?: AbortSignal,
): Promise<Set<HTMLElement> | null> {
  const before = new Set(findConversationDeleteConfirmations(document))
  if (!before.size) return before
  for (const dialog of before) {
    if (!closeConversationDeleteDialog(dialog)) return null
  }
  const closed = await waitForCondition(
    () => [...before].every((dialog) => !dialog.isConnected || !isVisible(dialog)),
    1_000,
    signal,
  )
  return closed ? before : null
}

function sameConversationReference(
  conversation: ConversationReferenceSnapshot,
  reference: ConversationReferenceSnapshot,
): boolean {
  return conversation.id === reference.id
    && conversation.fingerprint === reference.fingerprint
    && conversation.index === reference.index
}

function resolveConversationTarget(
  action: NativeAction,
  payload: unknown,
  document: Document,
): { panel: HTMLElement; item: HTMLElement; reference: ConversationReferenceSnapshot } | ActionResult {
  const reference = readConversationReference(payload)
  if (!reference) {
    return failure(action, 'INVALID_ARGUMENT', '缺少完整的会话快照引用（conversationId、fingerprint、index）')
  }
  const panel = findConversationPanel(document)
  const item = panel ? findConversationItem(panel, reference) : null
  if (!panel || !item) {
    return failure(action, 'PLATFORM_CHANGED', '会话列表已变化或目标引用不再唯一，已停止以避免误操作')
  }
  return { panel, item, reference }
}

function findValidConversationRenameDialogs(document: Document): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.conversationRenameDialog)]
    .filter((dialog) => {
      if (!isVisible(dialog)) return false
      const title = dialog.querySelector(MMD_SELECTORS.conversationRenameTitle)?.textContent
        ?.replace(/\s+/g, ' ').trim() ?? ''
      const input = dialog.querySelector<HTMLInputElement>(MMD_SELECTORS.conversationRenameInput)
      const cancel = dialog.querySelector<HTMLElement>(MMD_SELECTORS.conversationRenameCancel)
      const ok = dialog.querySelector<HTMLElement>(MMD_SELECTORS.conversationRenameOk)
      return title === MMD_CONVERSATION_RENAME_TITLE
        && input?.maxLength === 140
        && Boolean(cancel)
        && Boolean(ok)
    })
}

function findValidConversationRenameDialog(document: Document): HTMLElement | null {
  const dialogs = findValidConversationRenameDialogs(document)
  return dialogs.length === 1 ? dialogs[0]! : null
}

async function rejectPreExistingConversationRenameDialogs(
  document: Document,
  signal?: AbortSignal,
): Promise<Set<HTMLElement> | null> {
  const before = new Set(findValidConversationRenameDialogs(document))
  for (const dialog of before) {
    const cancel = dialog.querySelector<HTMLElement>(MMD_SELECTORS.conversationRenameCancel)
    if (!cancel || !isVisible(cancel)) return null
    dispatchPointerClick(cancel)
  }
  if (!before.size) return before
  const closed = await waitForCondition(
    () => [...before].every((dialog) => !dialog.isConnected || !isVisible(dialog)),
    1_000,
    signal,
  )
  return closed ? before : null
}

async function rejectPreExistingEditPanels(
  document: Document,
  signal?: AbortSignal,
): Promise<Set<HTMLElement> | null> {
  const before = new Set(findEditPanels(document))
  for (const panel of before) panel.click()
  if (!before.size) return before
  const closed = await waitForCondition(
    () => [...before].every((panel) => !panel.isConnected || !findEditPanels(document).includes(panel)),
    1_000,
    signal,
  )
  return closed ? before : null
}

function findPanelClose(panel: HTMLElement): HTMLElement | null {
  const popupContent = panel.closest<HTMLElement>('.u-popup__content') ?? panel.parentElement
  return popupContent?.querySelector<HTMLElement>(MMD_SELECTORS.shareCloseButton) ?? null
}

function clickHeaderAction(
  document: Document,
  action: NativeAction,
  headerAction: HeaderActionKind,
): ActionResult {
  const resolved = resolveHeaderAction(document, headerAction)
  if (!resolved.button) {
    return failure(action, 'PLATFORM_CHANGED', resolved.reason || '没有找到唯一匹配的原生顶部按钮')
  }
  dispatchPointerClick(resolved.button)
  return { ok: true, action }
}

function setNativeFormValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): boolean {
  const view = input.ownerDocument.defaultView ?? window
  const prototype = input instanceof view.HTMLTextAreaElement
    ? view.HTMLTextAreaElement.prototype
    : view.HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  if (!descriptor?.set) return false
  descriptor.set.call(input, value)
  input.focus()
  input.dispatchEvent(new view.Event('input', { bubbles: true, composed: true }))
  input.dispatchEvent(new view.Event('change', { bubbles: true, composed: true }))
  return true
}

async function ensureMorePanel(
  action: NativeAction,
  document: Document,
  signal?: AbortSignal,
): Promise<HTMLElement | ActionResult> {
  const current = findMorePanel(document)
  if (current) return current
  const target = findMoreEntryTarget(document)
  if (!target) return failure(action, 'NOT_FOUND', '没有找到原生底部更多按钮的内部点击目标')
  dispatchPointerClick(target)
  const opened = await waitForCondition(() => Boolean(findMorePanel(document)), 4_000, signal)
  return opened
    ? findMorePanel(document)!
    : failure(action, 'TIMEOUT', '已点击底部更多按钮，但 4 秒内没有检测到更多菜单')
}

interface MoreFeatureVerification {
  opened: (document: Document) => boolean
}

const MORE_FEATURE_VERIFICATIONS = {
  newChat: { opened: (document: Document) => Boolean(findConversationPanel(document)) },
  background: { opened: (document: Document) => Boolean(findBackgroundPanel(document)) },
  customInstructions: { opened: (document: Document) => Boolean(findCustomInstructionsPanel(document)) },
  persona: { opened: (document: Document) => Boolean(findPersonaPanel(document)) },
  supplement: { opened: (document: Document) => Boolean(findSupplementPanel(document)) },
  chatSettings: { opened: (document: Document) => Boolean(findChatSettingsPanel(document)) },
  tutorial: { opened: isTutorialRoute },
} as const satisfies Partial<Record<string, MoreFeatureVerification>>

type SafeMoreFeatureKind = keyof typeof MORE_FEATURE_VERIFICATIONS

function safeMoreFeature(kind: string): MoreFeatureVerification | null {
  return kind in MORE_FEATURE_VERIFICATIONS
    ? MORE_FEATURE_VERIFICATIONS[kind as SafeMoreFeatureKind]
    : null
}

async function activateSafeMoreItem(
  action: NativeAction,
  document: Document,
  itemId: string,
  expectedKind?: SafeMoreFeatureKind,
  signal?: AbortSignal,
): Promise<ActionResult> {
  if (!itemId) return failure(action, 'INVALID_ARGUMENT', '缺少 itemId')
  const panel = findMorePanel(document)
  if (!panel) return failure(action, 'NOT_AVAILABLE', '请先打开原生更多菜单并使用最新快照中的 itemId')
  const resolved = findMoreItemById(panel, itemId)
  if (!resolved) return failure(action, 'PLATFORM_CHANGED', '更多菜单已变化，无法唯一定位最新快照中的菜单项')
  const { element: item, snapshot: snapshotItem } = resolved
  const definition = snapshotItem.kind === 'unknown'
    ? null
    : findMoreMenuItemDefinitionByKind(snapshotItem.kind)
  if (!definition
    || definition.label !== snapshotItem.label
    || definition.icon !== snapshotItem.icon) {
    return failure(action, 'PLATFORM_CHANGED', '菜单项的文案与图标组合不属于已验证结构，已停止以避免误点')
  }
  if (snapshotItem.destructive || definition.destructive) {
    return failure(action, 'NOT_AVAILABLE', `“${definition.label}”具有破坏性，禁止通用激活`)
  }
  const verification = safeMoreFeature(definition.kind)
  if (!definition.genericActivation || !verification) {
    return failure(action, 'NOT_AVAILABLE', `“${definition.label}”没有安全的通用激活验证`)
  }
  if (expectedKind && definition.kind !== expectedKind) {
    const expected = findMoreMenuItemDefinitionByKind(expectedKind)
    return failure(action, 'INVALID_ARGUMENT', `itemId 不是“${expected?.label ?? expectedKind}”`)
  }
  dispatchPointerClick(item)
  const opened = await waitForCondition(() => verification.opened(document), 4_000, signal)
  return opened
    ? { ok: true, action, data: { itemId, kind: definition.kind, phase: 'opened' } }
    : failure(action, 'TIMEOUT', `已点击“${definition.label}”，但 4 秒内没有检测到对应路由或面板变化`)
}

function moreItemIdForKind(document: Document, kind: SafeMoreFeatureKind): string {
  return readMoreMenu(document).items.find(
    (item) => item.kind === kind && item.available && !item.destructive,
  )?.id ?? ''
}

async function openSafeMoreFeature(
  action: NativeAction,
  document: Document,
  kind: SafeMoreFeatureKind,
  signal?: AbortSignal,
): Promise<ActionResult> {
  const panel = await ensureMorePanel(action, document, signal)
  if ('ok' in panel) return panel
  const definition = findMoreMenuItemDefinitionByKind(kind)
  if (!definition) return failure(action, 'NOT_AVAILABLE', '该更多菜单项尚未注册')
  const rendered = await waitForCondition(() => {
    const currentPanel = findMorePanel(document)
    const item = currentPanel ? findMoreItem(currentPanel, definition.label) : null
    return Boolean(item && moreItemIconSource(item).includes(definition.icon))
  }, 1_000, signal)
  if (!rendered) {
    return failure(action, 'NOT_AVAILABLE', `原生更多菜单中没有已验证的“${definition.label}”`)
  }
  const itemId = moreItemIdForKind(document, kind)
  return activateSafeMoreItem(action, document, itemId, kind, signal)
}

async function closeMorePanel(document: Document, signal?: AbortSignal): Promise<boolean> {
  const panel = findMorePanel(document)
  if (!panel) return true
  const target = findMoreEntryTarget(document)
  if (!target) return false
  dispatchPointerClick(target)
  return waitForCondition(() => !findMorePanel(document), 4_000, signal)
}

async function closeFeaturePanel(
  action: NativeAction,
  panel: HTMLElement | null,
  selector: string,
  stillOpen: () => boolean,
  signal?: AbortSignal,
): Promise<ActionResult> {
  const cancel = panel?.querySelector<HTMLElement>(selector) ?? null
  if (!panel || !cancel) return failure(action, 'NOT_FOUND', '没有找到已打开界面的取消按钮')
  dispatchPointerClick(cancel)
  const closed = await waitForCondition(() => !stillOpen(), 4_000, signal)
  if (!closed) return failure(action, 'TIMEOUT', '已点击取消，但原生界面没有关闭')
  await closeMorePanel(panel.ownerDocument, signal)
  return { ok: true, action }
}

const handlers: Partial<Record<NativeAction, ActionHandler>> = {
  async setInputText(payload, context) {
    const action: NativeAction = 'setInputText'
    const text = readStringPayload(payload, 'text')
    const input = findNativeInput(context.document)
    if (!input) return failure(action, 'NOT_FOUND', '没有找到 MMD 原生输入框')

    const view = context.document.defaultView
    const TextAreaConstructor = view?.HTMLTextAreaElement ?? HTMLTextAreaElement
    const descriptor = Object.getOwnPropertyDescriptor(TextAreaConstructor.prototype, 'value')
    if (!descriptor?.set) {
      return failure(action, 'PLATFORM_CHANGED', '无法调用原生 textarea value setter')
    }

    descriptor.set.call(input, text)
    input.focus()
    input.setSelectionRange(text.length, text.length)
    let inputEvent: Event
    try {
      inputEvent = new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertText',
        data: text,
      })
    } catch {
      inputEvent = new Event('input', { bubbles: true, composed: true })
    }
    input.dispatchEvent(inputEvent)
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    return { ok: true, action }
  },

  async sendMessage(payload, context) {
    const action: NativeAction = 'sendMessage'
    const text = typeof payload === 'object' && payload !== null && 'text' in payload
      ? String((payload as { text: unknown }).text)
      : ''

    if (!text.trim()) return failure(action, 'INVALID_ARGUMENT', '发送内容不能为空')

    const input = findNativeInput(context.document)
    const sendProxy = context.document.querySelector<HTMLElement>(MMD_SELECTORS.sendProxy)
    if (!input || !sendProxy) {
      return failure(action, 'NOT_FOUND', '没有找到 MMD 原生输入框或发送代理')
    }

    const view = context.document.defaultView
    const TextAreaConstructor = view?.HTMLTextAreaElement ?? HTMLTextAreaElement
    const descriptor = Object.getOwnPropertyDescriptor(TextAreaConstructor.prototype, 'value')
    if (!descriptor?.set) {
      return failure(action, 'PLATFORM_CHANGED', '无法调用原生 textarea value setter')
    }

    descriptor.set.call(input, text)
    input.focus()
    input.setSelectionRange(text.length, text.length)
    let inputEvent: Event
    try {
      inputEvent = new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertText',
        data: text,
      })
    } catch {
      inputEvent = new Event('input', { bubbles: true, composed: true })
    }
    input.dispatchEvent(inputEvent)
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    await Promise.resolve()
    if (!await nextFrame(context.signal)) {
      return failure(action, 'NOT_AVAILABLE', '发送动作已取消')
    }
    dispatchPointerClick(sendProxy)
    return { ok: true, action }
  },

  async exit(_payload, context) {
    const action: NativeAction = 'exit'
    const button = context.document.querySelector<HTMLElement>(MMD_SELECTORS.exitButton)
    if (!button) return failure(action, 'NOT_FOUND', '没有找到 MMD 原生退出按钮')
    button.click()
    return { ok: true, action }
  },

  async openComments(_payload, context) {
    return clickHeaderAction(context.document, 'openComments', 'comments')
  },

  async openSharePanel(_payload, context) {
    const action: NativeAction = 'openSharePanel'
    const clicked = clickHeaderAction(context.document, action, 'share')
    if (!clicked.ok) return clicked
    const visible = await waitForCondition(() => Boolean(findSharePanel(context.document)), 4_000, context.signal)
    return visible
      ? { ok: true, action, data: readSharePanel(context.document) }
      : failure(action, 'TIMEOUT', '已点击原生分享按钮，但 4 秒内未检测到分享界面')
  },

  async copyShareLink(_payload, context) {
    const action: NativeAction = 'copyShareLink'
    const panel = findSharePanel(context.document)
    const button = panel?.querySelector<HTMLElement>(MMD_SELECTORS.shareCopyButton) ?? null
    if (!panel || !button || !isVisible(button)) {
      return failure(action, 'NOT_FOUND', '没有找到已打开分享界面的复制链接按钮')
    }
    const link = readSharePanel(context.document).link
    dispatchPointerClick(button)
    return { ok: true, action, data: { link } }
  },

  async closeSharePanel(_payload, context) {
    const action: NativeAction = 'closeSharePanel'
    const panel = findSharePanel(context.document)
    const popupContent = panel?.closest<HTMLElement>('.u-popup__content') ?? panel?.parentElement ?? null
    const button = popupContent?.querySelector<HTMLElement>(MMD_SELECTORS.shareCloseButton)
      ?? context.document.querySelector<HTMLElement>(MMD_SELECTORS.shareCloseButton)
    if (!panel || !button || !isVisible(button)) {
      return failure(action, 'NOT_FOUND', '没有找到已打开分享界面的关闭按钮')
    }
    dispatchPointerClick(button)
    const closed = await waitForCondition(() => !findSharePanel(context.document), 4_000, context.signal)
    return closed
      ? { ok: true, action }
      : failure(action, 'TIMEOUT', '已点击关闭按钮，但分享界面没有关闭')
  },

  async toggleFavorite(_payload, context) {
    return clickHeaderAction(context.document, 'toggleFavorite', 'favorite')
  },

  async refreshConversation(_payload, context) {
    return clickHeaderAction(context.document, 'refreshConversation', 'refresh')
  },

  async openModelSettings(_payload, context) {
    const action: NativeAction = 'openModelSettings'
    const existingPanel = findModelPanel(context.document)
    if (existingPanel) {
      const snapshot = await waitForModelRows(existingPanel, 4_000, context.signal)
      return snapshot.open
        ? { ok: true, action, data: snapshot }
        : failure(action, 'NOT_AVAILABLE', '模型选择界面在模型列表加载前已关闭')
    }

    const startedAt = performance.now()
    const entry = findModelEntry(context.document)
    if (!entry) return failure(action, 'NOT_FOUND', '没有找到带切换图标的原生模型入口')
    dispatchPointerClick(entry)
    const opened = await waitForCondition(() => Boolean(findModelPanel(context.document)), 4_000, context.signal)
    if (!opened) {
      return failure(action, 'TIMEOUT', '已点击模型入口，但 4 秒内未检测到模型选择界面')
    }
    const panel = findModelPanel(context.document)!
    const remainingMs = Math.max(0, 4_000 - (performance.now() - startedAt))
    const snapshot = await waitForModelRows(panel, remainingMs, context.signal)
    if (context.signal?.aborted) {
      return failure(action, 'NOT_AVAILABLE', '模型选择动作已取消')
    }
    return snapshot.open
      ? { ok: true, action, data: snapshot }
      : failure(action, 'NOT_AVAILABLE', '模型选择界面在模型列表加载前已关闭')
  },

  async closeModelSettings(_payload, context) {
    const action: NativeAction = 'closeModelSettings'
    const panel = findModelPanel(context.document)
    if (!panel) return { ok: true, action, data: { alreadyClosed: true } }
    const close = findModelPanelClose(panel)
    if (!close || !isVisible(close)) {
      return failure(action, 'NOT_FOUND', '没有找到模型选择界面的关闭按钮')
    }
    dispatchPointerClick(close)
    const closed = await waitForCondition(() => !findModelPanel(context.document), 4_000, context.signal)
    return closed ? { ok: true, action } : failure(action, 'TIMEOUT', '模型选择界面没有关闭')
  },

  async selectModelFilter(payload, context) {
    const action: NativeAction = 'selectModelFilter'
    const filterId = readStringPayload(payload, 'filterId')
    if (!filterId) return failure(action, 'INVALID_ARGUMENT', '缺少 filterId')
    const panel = findModelPanel(context.document)
    const filter = panel ? findModelFilter(panel, filterId) : null
    if (!panel || !filter) return failure(action, 'NOT_FOUND', '没有找到唯一匹配的模型分类')
    dispatchPointerClick(filter)
    const selected = await waitForCondition(() => {
      const current = findModelPanel(context.document)
      return Boolean(current && findModelFilter(current, filterId)?.classList.contains('active'))
    }, 4_000, context.signal)
    return selected
      ? { ok: true, action, data: readModelPanel(context.document) }
      : failure(action, 'TIMEOUT', '已点击模型分类，但 4 秒内未检测到分类切换')
  },

  async selectModel(payload, context) {
    const action: NativeAction = 'selectModel'
    const modelId = readStringPayload(payload, 'modelId')
    if (!modelId) return failure(action, 'INVALID_ARGUMENT', '缺少 modelId')
    const panel = findModelPanel(context.document)
    const item = panel ? findModelItem(panel, modelId) : null
    if (!panel || !item) return failure(action, 'NOT_FOUND', '没有找到唯一匹配的模型')
    const model = readModelOptions(panel).find((candidate) => candidate.id === modelId)
    dispatchPointerClick(item)
    const closed = await waitForCondition(() => !findModelPanel(context.document), 8_000, context.signal)
    return closed
      ? { ok: true, action, data: { modelId, name: model?.name ?? '', phase: 'selected' } }
      : failure(action, 'TIMEOUT', '已点击模型，但 8 秒内模型选择界面没有关闭')
  },

  async openModelConfiguration(payload, context) {
    const action: NativeAction = 'openModelConfiguration'
    const modelId = readStringPayload(payload, 'modelId')
    if (!modelId) return failure(action, 'INVALID_ARGUMENT', '缺少 modelId')
    const panel = findModelPanel(context.document)
    const item = panel ? findModelItem(panel, modelId) : null
    const iconImage = item?.querySelector<HTMLImageElement>(MMD_SELECTORS.modelSettingIcon) ?? null
    const target = iconImage?.closest<HTMLElement>('uni-image') ?? iconImage
    if (!panel || !item || !target) {
      return failure(action, 'NOT_FOUND', '没有找到指定模型的原生设置图标')
    }
    const expectedName = item.querySelector(MMD_SELECTORS.modelTitle)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    dispatchPointerClick(target)
    const opened = await waitForCondition(() => {
      const configuration = readModelConfiguration(context.document)
      return configuration.open && configuration.modelName === expectedName
    }, 4_000, context.signal)
    return opened
      ? { ok: true, action, data: readModelConfiguration(context.document) }
      : failure(action, 'TIMEOUT', '已点击模型设置图标，但 4 秒内未检测到匹配的设置界面')
  },

  async setModelSetting(payload, context) {
    const action: NativeAction = 'setModelSetting'
    const controlId = readStringPayload(payload, 'controlId')
    const choiceId = readStringPayload(payload, 'choiceId') || null
    if (!controlId) return failure(action, 'INVALID_ARGUMENT', '缺少 controlId')
    const panel = findModelConfiguration(context.document)
    const before = readModelConfiguration(context.document).controls.find((control) => control.id === controlId)
    const target = panel ? findModelSettingTarget(panel, controlId, choiceId) : null
    if (!panel || !before || !target) return failure(action, 'NOT_FOUND', '没有找到对应的原生模型设置控件')
    dispatchPointerClick(target)
    const changed = await waitForCondition(() => {
      const current = readModelConfiguration(context.document).controls.find((control) => control.id === controlId)
      if (!current) return false
      if (current.type === 'toggle') return current.value !== before.value
      return current.choices.some((choice) => choice.id === choiceId && choice.selected)
    }, 4_000, context.signal)
    return changed
      ? { ok: true, action, data: readModelConfiguration(context.document) }
      : failure(action, 'TIMEOUT', '已点击模型设置控件，但 4 秒内未检测到值变化')
  },

  async submitModelConfiguration(_payload, context) {
    const action: NativeAction = 'submitModelConfiguration'
    const panel = findModelConfiguration(context.document)
    const submit = panel?.querySelector<HTMLElement>(MMD_SELECTORS.modelConfigurationSubmit) ?? null
    if (!panel || !submit) return failure(action, 'NOT_FOUND', '没有找到模型设置确认按钮')
    dispatchPointerClick(submit)
    const closed = await waitForCondition(() => !findModelConfiguration(context.document), 4_000, context.signal)
    return closed ? { ok: true, action } : failure(action, 'TIMEOUT', '模型设置界面没有关闭')
  },

  async closeModelConfiguration(_payload, context) {
    const action: NativeAction = 'closeModelConfiguration'
    const panel = findModelConfiguration(context.document)
    const close = panel?.querySelector<HTMLElement>(MMD_SELECTORS.modelConfigurationClose) ?? null
    if (!panel || !close) return failure(action, 'NOT_FOUND', '没有找到模型设置关闭按钮')
    dispatchPointerClick(close)
    const closed = await waitForCondition(() => !findModelConfiguration(context.document), 4_000, context.signal)
    return closed ? { ok: true, action } : failure(action, 'TIMEOUT', '模型设置界面没有关闭')
  },

  async openChatSettings(_payload, context) {
    const action: NativeAction = 'openChatSettings'
    const entry = findChatSettingsEntry(context.document)
    if (!entry) return failure(action, 'PLATFORM_CHANGED', '原生快捷栏不是已验证的 5 项结构，已停止以避免误点')
    dispatchPointerClick(entry)
    const opened = await waitForCondition(() => Boolean(findChatSettingsPanel(context.document)), 4_000, context.signal)
    return opened
      ? { ok: true, action, data: readChatSettings(context.document) }
      : failure(action, 'TIMEOUT', '已点击对话设置入口，但 4 秒内未检测到结构匹配的设置界面')
  },

  async closeChatSettings(_payload, context) {
    const action: NativeAction = 'closeChatSettings'
    const panel = findChatSettingsPanel(context.document)
    const close = panel?.querySelector<HTMLElement>(MMD_SELECTORS.chatSettingsClose) ?? null
    if (!panel || !close) return failure(action, 'PLATFORM_CHANGED', '原生对话设置界面结构不完整')
    dispatchPointerClick(close)
    const closed = await waitForCondition(() => !findChatSettingsPanel(context.document), 4_000, context.signal)
    return closed ? { ok: true, action } : failure(action, 'TIMEOUT', '对话设置界面没有关闭')
  },

  async submitChatSettings(_payload, context) {
    const action: NativeAction = 'submitChatSettings'
    const panel = findChatSettingsPanel(context.document)
    const submit = panel?.querySelector<HTMLElement>(MMD_SELECTORS.chatSettingsSubmit) ?? null
    if (!panel || !submit) return failure(action, 'PLATFORM_CHANGED', '原生对话设置界面结构不完整')
    dispatchPointerClick(submit)
    const closed = await waitForCondition(() => !findChatSettingsPanel(context.document), 4_000, context.signal)
    return closed ? { ok: true, action } : failure(action, 'TIMEOUT', '对话设置界面没有关闭')
  },

  async openMoreMenu(_payload, context) {
    const action: NativeAction = 'openMoreMenu'
    const panel = await ensureMorePanel(action, context.document, context.signal)
    return 'ok' in panel ? panel : { ok: true, action, data: readMoreMenu(context.document) }
  },

  async closeMoreMenu(_payload, context) {
    const action: NativeAction = 'closeMoreMenu'
    return await closeMorePanel(context.document, context.signal)
      ? { ok: true, action }
      : failure(action, 'TIMEOUT', '原生更多菜单没有关闭')
  },

  async activateMoreMenuItem(payload, context) {
    return activateSafeMoreItem(
      'activateMoreMenuItem',
      context.document,
      readStringPayload(payload, 'itemId'),
      undefined,
      context.signal,
    )
  },

  async openTutorial(_payload, context) {
    return openSafeMoreFeature('openTutorial', context.document, 'tutorial', context.signal)
  },

  async openBackgroundPanel(_payload, context) {
    return openSafeMoreFeature('openBackgroundPanel', context.document, 'background', context.signal)
  },

  async openCustomInstructions(_payload, context) {
    return openSafeMoreFeature('openCustomInstructions', context.document, 'customInstructions', context.signal)
  },

  async openConversationPanel(_payload, context) {
    const action: NativeAction = 'openConversationPanel'
    const result = await openSafeMoreFeature(action, context.document, 'newChat', context.signal)
    return result.ok
      ? { ...result, data: readConversationPanel(context.document) }
      : result
  },

  async selectConversation(payload, context) {
    const action: NativeAction = 'selectConversation'
    const resolved = resolveConversationTarget(action, payload, context.document)
    if ('ok' in resolved) return resolved
    const before = readNativeMessageSignatures(context.document)
    dispatchPointerClick(resolved.item)
    const switched = await waitForCondition(() => {
      const current = readConversationPanel(context.document)
      if (current.open) {
        const selected = current.conversations.find((conversation) => conversation.current)
        if (selected && sameConversationReference(selected, resolved.reference)) return true
      }
      const messages = readNativeMessageSignatures(context.document)
      return JSON.stringify(messages) !== JSON.stringify(before)
    }, 12_000, context.signal)
    return switched
      ? { ok: true, action, data: { conversationId: resolved.reference.id, phase: 'selected' } }
      : failure(action, 'TIMEOUT', '已点击会话，但 12 秒内没有检测到会话切换')
  },

  async renameConversation(payload, context) {
    const action: NativeAction = 'renameConversation'
    const previous = pendingConversationRenameSessions.get(context.document)
    pendingConversationRenameSessions.delete(context.document)
    if (previous?.dialog.isConnected) {
      previous.dialog.querySelector<HTMLElement>(MMD_SELECTORS.conversationRenameCancel)?.click()
    }
    const title = readStringPayload(payload, 'title').trim()
    if (!title) return failure(action, 'INVALID_ARGUMENT', '会话备注不能为空')
    if (title.length > 140) return failure(action, 'INVALID_ARGUMENT', '会话备注不能超过 140 个字符')
    const resolved = resolveConversationTarget(action, payload, context.document)
    if ('ok' in resolved) return resolved
    const snapshot = readConversationPanel(context.document).conversations[resolved.reference.index]
    if (!snapshot?.capabilities.rename) {
      return failure(action, 'NOT_AVAILABLE', '目标会话缺少已确认的原生编辑结构')
    }
    const edit = resolved.item.querySelector<HTMLElement>(MMD_SELECTORS.conversationEdit)
    if (!edit) return failure(action, 'PLATFORM_CHANGED', '目标会话的编辑按钮结构已变化')
    const preClickDialogs = await rejectPreExistingConversationRenameDialogs(context.document, context.signal)
    if (!preClickDialogs) {
      return failure(action, 'NOT_AVAILABLE', '检测到无法安全关闭的既有会话备注弹窗，请先取消后重试')
    }
    const serial = (conversationRenameSerials.get(context.document) ?? 0) + 1
    conversationRenameSerials.set(context.document, serial)
    dispatchPointerClick(edit)
    const opened = await waitForCondition(
      () => {
        const current = findValidConversationRenameDialogs(context.document)
        return current.length === 1 && !preClickDialogs.has(current[0]!)
      },
      4_000,
      context.signal,
    )
    const dialogs = findValidConversationRenameDialogs(context.document)
    const dialog = dialogs.length === 1 && !preClickDialogs.has(dialogs[0]!) ? dialogs[0]! : null
    if (!opened || !dialog || conversationRenameSerials.get(context.document) !== serial) {
      return failure(action, 'PLATFORM_CHANGED', '编辑按钮未打开唯一且新出现的会话备注弹窗')
    }
    pendingConversationRenameSessions.set(context.document, {
      reference: resolved.reference,
      item: resolved.item,
      dialog,
      expiresAt: Date.now() + INTERACTION_SESSION_TTL_MS,
      serial,
    })
    const pending = pendingConversationRenameSessions.get(context.document)
    const input = dialog.querySelector<HTMLInputElement>(MMD_SELECTORS.conversationRenameInput)
    const ok = dialog.querySelector<HTMLElement>(MMD_SELECTORS.conversationRenameOk)
    const currentPanel = findConversationPanel(context.document)
    if (!pending
      || pending.expiresAt < Date.now()
      || !dialog.isConnected
      || findValidConversationRenameDialog(context.document) !== dialog
      || !currentPanel
      || findConversationItem(currentPanel, resolved.reference) !== resolved.item
      || !input
      || !ok) {
      pendingConversationRenameSessions.delete(context.document)
      dialog.querySelector<HTMLElement>(MMD_SELECTORS.conversationRenameCancel)?.click()
      return failure(action, 'PLATFORM_CHANGED', '会话或备注弹窗已变化，已取消以避免误改')
    }
    if (!setNativeFormValue(input, title)) {
      pendingConversationRenameSessions.delete(context.document)
      dialog.querySelector<HTMLElement>(MMD_SELECTORS.conversationRenameCancel)?.click()
      return failure(action, 'PLATFORM_CHANGED', '无法调用原生会话备注 input value setter')
    }
    if (findValidConversationRenameDialog(context.document) !== dialog || !ok.isConnected) {
      pendingConversationRenameSessions.delete(context.document)
      return failure(action, 'PLATFORM_CHANGED', '会话备注弹窗在提交前已被替换')
    }
    dispatchPointerClick(ok)
    const renamed = await waitForCondition(() => {
      if (dialog.isConnected && isVisible(dialog)) return false
      const panel = readConversationPanel(context.document)
      if (!panel.open || panel.conversations.length <= resolved.reference.index) return false
      const target = panel.conversations[resolved.reference.index]
      return target?.title === title && target.fingerprint !== resolved.reference.fingerprint
    }, 8_000, context.signal)
    pendingConversationRenameSessions.delete(context.document)
    return renamed
      ? { ok: true, action, data: { title, phase: 'renamed' } }
      : failure(action, 'TIMEOUT', '已确认会话备注，但未检测到同一列表位置的标题更新')
  },

  async requestDeleteConversation(payload, context) {
    const action: NativeAction = 'requestDeleteConversation'
    pendingConversationDeleteConfirmations.delete(context.document)
    const resolved = resolveConversationTarget(action, payload, context.document)
    if ('ok' in resolved) return resolved
    const snapshot = readConversationPanel(context.document).conversations[resolved.reference.index]
    if (!snapshot || snapshot.current || !snapshot.capabilities.delete) {
      return failure(action, 'NOT_AVAILABLE', '仅允许删除结构已确认的非当前会话')
    }
    const remove = resolved.item.querySelector<HTMLElement>(MMD_SELECTORS.conversationDelete)
    if (!remove) return failure(action, 'PLATFORM_CHANGED', '目标会话的删除按钮结构已变化')
    const preClickDialogs = await rejectPreExistingConversationDeleteDialogs(context.document, context.signal)
    if (!preClickDialogs) {
      return failure(action, 'NOT_AVAILABLE', '检测到无法安全关闭的既有会话删除确认弹窗，请先取消后重试')
    }
    const serial = (conversationDeleteSerials.get(context.document) ?? 0) + 1
    conversationDeleteSerials.set(context.document, serial)
    dispatchPointerClick(remove)
    const appeared = await waitForCondition(
      () => {
        const current = findConversationDeleteConfirmations(context.document)
        return current.length === 1 && !preClickDialogs.has(current[0]!)
      },
      4_000,
      context.signal,
    )
    const currentDialogs = findConversationDeleteConfirmations(context.document)
    const dialog = currentDialogs.length === 1 && !preClickDialogs.has(currentDialogs[0]!)
      ? currentDialogs[0]!
      : null
    if (!appeared || !dialog || conversationDeleteSerials.get(context.document) !== serial) {
      return failure(action, 'PLATFORM_CHANGED', '删除按钮未打开唯一且语义匹配的会话删除确认弹窗')
    }
    const panel = findConversationPanel(context.document)
    if (!panel || findConversationItem(panel, resolved.reference) !== resolved.item) {
      dialog.querySelector<HTMLElement>(MMD_SELECTORS.confirmCancelButton)?.click()
      return failure(action, 'PLATFORM_CHANGED', '会话列表在确认请求期间已变化，已取消删除')
    }
    const token = createConfirmationToken(resolved.reference.id)
    pendingConversationDeleteConfirmations.set(context.document, {
      reference: resolved.reference,
      item: resolved.item,
      dialog,
      token,
      expiresAt: Date.now() + DELETE_CONFIRMATION_TTL_MS,
      serial,
    })
    const data: DeleteConversationResult = {
      phase: 'confirmation-required',
      conversationId: resolved.reference.id,
      confirmation: {
        conversationId: resolved.reference.id,
        fingerprint: resolved.reference.fingerprint,
        index: resolved.reference.index,
        confirmationToken: token,
        prompt: '确认删除这条会话？此操作将调用原生删除，且无法撤销。',
      },
    }
    return { ok: true, action, data }
  },

  async deleteConversation(payload, context) {
    const action: NativeAction = 'deleteConversation'
    const request = readDeleteConversationPayload(payload)
    const pending = pendingConversationDeleteConfirmations.get(context.document)
    pendingConversationDeleteConfirmations.delete(context.document)
    if (!request?.confirmationToken
      || !pending
      || pending.token !== request.confirmationToken
      || pending.expiresAt < Date.now()
      || conversationDeleteSerials.get(context.document) !== pending.serial
      || pending.reference.id !== request.conversationId
      || pending.reference.fingerprint !== request.fingerprint
      || pending.reference.index !== request.index
      || !pending.item.isConnected
      || !pending.dialog.isConnected
      || findConversationDeleteConfirmation(context.document) !== pending.dialog) {
      return failure(action, 'NOT_AVAILABLE', '会话删除确认已失效，请重新请求并确认')
    }
    const resolved = resolveConversationTarget(action, request, context.document)
    if ('ok' in resolved) return resolved
    if (resolved.item !== pending.item || !sameConversationReference(resolved.reference, pending.reference)) {
      return failure(action, 'PLATFORM_CHANGED', '执行前重新确认的目标会话与请求时不一致')
    }
    const snapshot = readConversationPanel(context.document).conversations[resolved.reference.index]
    if (!snapshot || snapshot.current || !snapshot.capabilities.delete) {
      return failure(action, 'NOT_AVAILABLE', '仅允许删除结构已确认的非当前会话')
    }
    const confirm = pending.dialog.querySelector<HTMLElement>(MMD_SELECTORS.confirmOkButton)
    if (!confirm || !isVisible(confirm)) {
      return failure(action, 'PLATFORM_CHANGED', '原生会话删除确认按钮结构已变化')
    }
    const before = readConversationPanel(context.document).conversations
    if (!before[resolved.reference.index] || !sameConversationReference(before[resolved.reference.index], resolved.reference)) {
      return failure(action, 'PLATFORM_CHANGED', '确认删除前目标会话已变化，已停止')
    }
    dispatchPointerClick(confirm)
    const deleted = await waitForCondition(() => {
      const current = readConversationPanel(context.document)
      return current.open
        && current.conversations.length === before.length - 1
        && before.every((conversation, beforeIndex) => {
          if (beforeIndex === resolved.reference.index) return true
          const currentIndex = beforeIndex < resolved.reference.index ? beforeIndex : beforeIndex - 1
          const candidate = current.conversations[currentIndex]
          return Boolean(candidate)
            && candidate!.fingerprint === conversation.fingerprint
        })
        && !current.conversations.some((conversation) =>
          conversation.fingerprint === resolved.reference.fingerprint)
    }, 8_000, context.signal)
    if (!deleted) return failure(action, 'TIMEOUT', '已确认删除，但未检测到仅目标会话被精确移除')
    const data: DeleteConversationResult = {
      phase: 'deleted',
      conversationId: resolved.reference.id,
    }
    return { ok: true, action, data }
  },

  async createConversation(_payload, context) {
    const action: NativeAction = 'createConversation'
    const panel = findConversationPanel(context.document)
    const create = panel?.querySelector<HTMLElement>(MMD_SELECTORS.conversationCreate) ?? null
    if (!panel || !create) return failure(action, 'NOT_FOUND', '没有找到创建新聊天按钮')
    const before = readNativeMessageSignatures(context.document)
    dispatchPointerClick(create)
    const created = await waitForCondition(() => {
      const messages = readNativeMessageSignatures(context.document)
      return !findConversationPanel(context.document)
        || JSON.stringify(messages) !== JSON.stringify(before)
    }, 12_000, context.signal)
    return created
      ? { ok: true, action, data: { phase: 'created' } }
      : failure(action, 'TIMEOUT', '已点击创建新的聊天，但 12 秒内没有检测到会话变化')
  },

  async closeConversationPanel(_payload, context) {
    const action: NativeAction = 'closeConversationPanel'
    const panel = findConversationPanel(context.document)
    const close = panel ? findPanelClose(panel) : null
    if (!panel || !close) return failure(action, 'NOT_FOUND', '没有找到会话面板关闭按钮')
    dispatchPointerClick(close)
    const closed = await waitForCondition(() => !findConversationPanel(context.document), 4_000, context.signal)
    if (!closed) return failure(action, 'TIMEOUT', '会话面板没有关闭')
    await closeMorePanel(context.document, context.signal)
    return { ok: true, action }
  },

  async openPersona(_payload, context) {
    const action: NativeAction = 'openPersona'
    const result = await openSafeMoreFeature(action, context.document, 'persona', context.signal)
    return result.ok ? { ...result, data: readPersonaPanel(context.document) } : result
  },

  async setPersonaMode(payload, context) {
    const action: NativeAction = 'setPersonaMode'
    const modeId = readStringPayload(payload, 'modeId')
    if (!modeId) return failure(action, 'INVALID_ARGUMENT', '缺少 modeId')
    const panel = findPersonaPanel(context.document)
    const mode = panel ? findPersonaMode(panel, modeId) : null
    if (!panel || !mode) return failure(action, 'NOT_FOUND', '没有找到唯一匹配的人设模式')
    const before = readPersonaPanel(context.document)
    if (before.currentModeId === modeId) return { ok: true, action, data: before }
    const radio = mode.querySelector<HTMLElement>(MMD_SELECTORS.personaModeRadio)
    if (radio?.hasAttribute('disabled')) return failure(action, 'NOT_AVAILABLE', '该人设模式已被原生页面禁用')
    mode.click()
    const selected = await waitForCondition(
      () => readPersonaPanel(context.document).currentModeId === modeId,
      4_000,
      context.signal,
    )
    return selected
      ? { ok: true, action, data: readPersonaPanel(context.document) }
      : failure(action, 'TIMEOUT', '已点击人设模式，但 4 秒内没有检测到切换')
  },

  async setPersonaName(payload, context) {
    const action: NativeAction = 'setPersonaName'
    const name = readStringPayload(payload, 'name')
    const panel = findPersonaPanel(context.document)
    const input = panel?.querySelector<HTMLInputElement>(MMD_SELECTORS.personaNameInput) ?? null
    if (!panel || !input) return failure(action, 'NOT_FOUND', '没有找到用户人设称呼输入框')
    if (input.disabled) return failure(action, 'NOT_AVAILABLE', '当前人设模式的称呼为只读')
    if (!setNativeFormValue(input, name)) {
      return failure(action, 'PLATFORM_CHANGED', '无法调用原生 input value setter')
    }
    return { ok: true, action, data: { name } }
  },

  async setPersonaGender(payload, context) {
    const action: NativeAction = 'setPersonaGender'
    const genderId = readStringPayload(payload, 'genderId')
    if (!genderId) return failure(action, 'INVALID_ARGUMENT', '缺少 genderId')
    const panel = findPersonaPanel(context.document)
    const choice = panel ? findPersonaGender(panel, genderId) : null
    if (!panel || !choice) return failure(action, 'NOT_FOUND', '没有找到唯一匹配的性别选项')
    if (choice.classList.contains(MMD_SELECTORS.personaGenderDisabledClass)) {
      return failure(action, 'NOT_AVAILABLE', '当前人设模式的性别为只读')
    }
    const before = readPersonaPanel(context.document)
    if (before.selectedGenderId === genderId) return { ok: true, action, data: before }
    choice.click()
    const selected = await waitForCondition(
      () => readPersonaPanel(context.document).selectedGenderId === genderId,
      4_000,
      context.signal,
    )
    return selected
      ? { ok: true, action, data: readPersonaPanel(context.document) }
      : failure(action, 'TIMEOUT', '已点击性别选项，但 4 秒内没有检测到切换')
  },

  async setPersonaIdentity(payload, context) {
    const action: NativeAction = 'setPersonaIdentity'
    const identity = readStringPayload(payload, 'identity')
    const panel = findPersonaPanel(context.document)
    const textarea = panel?.querySelector<HTMLTextAreaElement>(MMD_SELECTORS.personaIdentityInput) ?? null
    if (!panel || !textarea) return failure(action, 'NOT_FOUND', '当前人设模式没有身份描述输入框')
    if (textarea.disabled) return failure(action, 'NOT_AVAILABLE', '当前人设模式的身份描述为只读')
    if (!setNativeFormValue(textarea, identity)) {
      return failure(action, 'PLATFORM_CHANGED', '无法调用原生 textarea value setter')
    }
    return { ok: true, action, data: { identity } }
  },

  async submitPersona(payload, context) {
    const action: NativeAction = 'submitPersona'
    const name = readStringPayload(payload, 'name')
    const identity = readStringPayload(payload, 'identity')
    const panel = findPersonaPanel(context.document)
    const input = panel?.querySelector<HTMLInputElement>(MMD_SELECTORS.personaNameInput) ?? null
    const textarea = panel?.querySelector<HTMLTextAreaElement>(MMD_SELECTORS.personaIdentityInput) ?? null
    const submit = panel?.querySelector<HTMLElement>(MMD_SELECTORS.personaSubmit) ?? null
    if (!panel || !submit) return failure(action, 'NOT_FOUND', '原生用户人设界面结构不完整')
    if (input && !input.disabled && !setNativeFormValue(input, name)) {
      return failure(action, 'PLATFORM_CHANGED', '无法同步原生称呼输入框')
    }
    if (textarea && !textarea.disabled && !setNativeFormValue(textarea, identity)) {
      return failure(action, 'PLATFORM_CHANGED', '无法同步原生身份描述输入框')
    }
    dispatchPointerClick(submit)
    const closed = await waitForCondition(() => !findPersonaPanel(context.document), 8_000, context.signal)
    if (!closed) return failure(action, 'TIMEOUT', '已点击保存，但用户人设界面没有关闭')
    await closeMorePanel(context.document, context.signal)
    return { ok: true, action, data: { name, identity, phase: 'submitted' } }
  },

  async closePersona(_payload, context) {
    return closeFeaturePanel(
      'closePersona',
      findPersonaPanel(context.document),
      MMD_SELECTORS.personaCancel,
      () => Boolean(findPersonaPanel(context.document)),
      context.signal,
    )
  },

  async openSupplement(_payload, context) {
    const action: NativeAction = 'openSupplement'
    const result = await openSafeMoreFeature(action, context.document, 'supplement', context.signal)
    return result.ok ? { ...result, data: readSupplementPanel(context.document) } : result
  },

  async setSupplementText(payload, context) {
    const action: NativeAction = 'setSupplementText'
    const text = readStringPayload(payload, 'text')
    const panel = findSupplementPanel(context.document)
    const textarea = panel?.querySelector<HTMLTextAreaElement>(MMD_SELECTORS.supplementTextarea) ?? null
    if (!panel || !textarea) return failure(action, 'NOT_FOUND', '没有找到设定补充正文输入框')
    if (!setNativeFormValue(textarea, text)) {
      return failure(action, 'PLATFORM_CHANGED', '无法调用原生 textarea value setter')
    }
    return { ok: true, action, data: { text } }
  },

  async openSupplementPositionPicker(_payload, context) {
    const action: NativeAction = 'openSupplementPositionPicker'
    const panel = findSupplementPanel(context.document)
    const field = panel?.querySelector<HTMLElement>(MMD_SELECTORS.supplementPositionField) ?? null
    if (!panel || !field) return failure(action, 'NOT_FOUND', '没有找到设定补充位置控件')
    dispatchPointerClick(field)
    const opened = await waitForCondition(() => Boolean(findSupplementPicker(context.document)), 4_000, context.signal)
    return opened
      ? { ok: true, action, data: readSupplementPanel(context.document).picker }
      : failure(action, 'TIMEOUT', '已点击位置控件，但 4 秒内没有检测到选择器')
  },

  async setSupplementPosition(payload, context) {
    const action: NativeAction = 'setSupplementPosition'
    const choiceId = readStringPayload(payload, 'choiceId')
    if (!choiceId) return failure(action, 'INVALID_ARGUMENT', '缺少 choiceId')
    const picker = findSupplementPicker(context.document)
    if (!picker) return failure(action, 'NOT_FOUND', '原生位置选择器尚未打开')
    let choices = readSupplementPanel(context.document).picker.choices
    let currentIndex = choices.findIndex((choice) => choice.selected)
    const targetIndex = choices.findIndex((choice) => choice.id === choiceId)
    if (currentIndex < 0 || targetIndex < 0) {
      return failure(action, 'PLATFORM_CHANGED', '位置选择器缺少唯一当前项或目标项')
    }
    for (let step = 0; currentIndex !== targetIndex && step <= choices.length; step += 1) {
      const nextIndex = currentIndex + Math.sign(targetIndex - currentIndex)
      const nextChoiceId = choices[nextIndex]!.id
      const selectedOption = findSupplementPositionOption(
        context.document,
        choices[currentIndex]!.id,
      )
      const target = findSupplementPositionOption(context.document, nextChoiceId)
      if (!selectedOption || !target) {
        return failure(action, 'PLATFORM_CHANGED', '无法定位当前或相邻位置选项')
      }
      const selectedCenterY = (() => {
        const rect = selectedOption.getBoundingClientRect()
        return rect.top + rect.height / 2
      })()
      dispatchPickerOptionClick(target)
      const moved = await waitForCondition(() => {
        const current = readSupplementPanel(context.document).picker
        if (current.pendingChoiceId !== nextChoiceId) return false
        const currentOption = findSupplementPositionOption(context.document, nextChoiceId)
        if (!currentOption) return false
        const rect = currentOption.getBoundingClientRect()
        return Math.abs(rect.top + rect.height / 2 - selectedCenterY) < 2
      }, 2_000, context.signal)
      if (!moved) return failure(action, 'TIMEOUT', '相邻位置选项没有完成选中移动')
      choices = readSupplementPanel(context.document).picker.choices
      currentIndex = choices.findIndex((choice) => choice.selected)
      if (currentIndex < 0) {
        return failure(action, 'PLATFORM_CHANGED', '位置选择器移动后缺少唯一当前项')
      }
    }
    return currentIndex === targetIndex
      ? { ok: true, action, data: readSupplementPanel(context.document).picker }
      : failure(action, 'TIMEOUT', '位置选择器没有移动到目标选项')
  },

  async confirmSupplementPosition(_payload, context) {
    const action: NativeAction = 'confirmSupplementPosition'
    const picker = findSupplementPicker(context.document)
    const selected = readSupplementPanel(context.document).picker.choices.find((choice) => choice.selected)
    const confirm = picker ? findPickerTextButton(picker, '确定') : null
    if (!picker || !selected || !confirm) return failure(action, 'NOT_FOUND', '没有找到位置选择器确定按钮或当前选项')
    dispatchPointerClick(confirm)
    const closed = await waitForCondition(() => !findSupplementPicker(context.document), 4_000, context.signal)
    const panel = readSupplementPanel(context.document)
    return closed && panel.positionLabel === selected.label
      ? { ok: true, action, data: panel }
      : failure(action, 'TIMEOUT', '位置选择器未关闭或外层位置没有更新')
  },

  async cancelSupplementPosition(_payload, context) {
    const action: NativeAction = 'cancelSupplementPosition'
    const picker = findSupplementPicker(context.document)
    const cancel = picker ? findPickerTextButton(picker, '取消') : null
    if (!picker || !cancel) return failure(action, 'NOT_FOUND', '没有找到位置选择器取消按钮')
    dispatchPointerClick(cancel)
    const closed = await waitForCondition(() => !findSupplementPicker(context.document), 4_000, context.signal)
    return closed ? { ok: true, action } : failure(action, 'TIMEOUT', '位置选择器没有关闭')
  },

  async submitSupplement(payload, context) {
    const action: NativeAction = 'submitSupplement'
    if (findSupplementPicker(context.document)) {
      return failure(action, 'NOT_AVAILABLE', '请先确认或取消位置选择器')
    }
    const text = readStringPayload(payload, 'text')
    const panel = findSupplementPanel(context.document)
    const textarea = panel?.querySelector<HTMLTextAreaElement>(MMD_SELECTORS.supplementTextarea) ?? null
    const submit = panel?.querySelector<HTMLElement>(MMD_SELECTORS.supplementSubmit) ?? null
    if (!panel || !textarea || !submit) return failure(action, 'NOT_FOUND', '原生设定补充界面结构不完整')
    if (!setNativeFormValue(textarea, text)) {
      return failure(action, 'PLATFORM_CHANGED', '无法调用原生 textarea value setter')
    }
    dispatchPointerClick(submit)
    const closed = await waitForCondition(() => !findSupplementPanel(context.document), 8_000, context.signal)
    if (!closed) return failure(action, 'TIMEOUT', '已点击保存，但设定补充界面没有关闭')
    await closeMorePanel(context.document, context.signal)
    return { ok: true, action, data: { text, phase: 'submitted' } }
  },

  async closeSupplement(_payload, context) {
    if (findSupplementPicker(context.document)) {
      return failure('closeSupplement', 'NOT_AVAILABLE', '请先确认或取消位置选择器')
    }
    return closeFeaturePanel(
      'closeSupplement',
      findSupplementPanel(context.document),
      MMD_SELECTORS.supplementCancel,
      () => Boolean(findSupplementPanel(context.document)),
      context.signal,
    )
  },

  async openPromptSelector(_payload, context) {
    const action: NativeAction = 'openPromptSelector'
    const entry = findInstructionEntry(context.document)
    if (!entry) return failure(action, 'PLATFORM_CHANGED', '原生快捷栏不是已验证的 5 项结构，已停止以避免误点')
    dispatchPointerClick(entry)
    const opened = await waitForCondition(() => Boolean(findInstructionBar(context.document)), 4_000, context.signal)
    return opened
      ? { ok: true, action, data: readInstructionSelector(context.document) }
      : failure(action, 'TIMEOUT', '已点击选择指令入口，但 4 秒内未检测到结构匹配的指令栏')
  },

  async closePromptSelector(_payload, context) {
    const action: NativeAction = 'closePromptSelector'
    const bar = findInstructionBar(context.document)
    const back = bar?.querySelector<HTMLElement>(MMD_SELECTORS.instructionBack) ?? null
    if (!bar || !back) return failure(action, 'PLATFORM_CHANGED', '原生指令栏结构不完整')
    dispatchPointerClick(back)
    const closed = await waitForCondition(() => !findInstructionBar(context.document), 4_000, context.signal)
    return closed ? { ok: true, action } : failure(action, 'TIMEOUT', '原生指令栏没有关闭')
  },

  async applyInstruction(payload, context) {
    const action: NativeAction = 'applyInstruction'
    const instructionId = readStringPayload(payload, 'instructionId')
    const revision = readStringPayload(payload, 'revision')
    const fingerprint = readStringPayload(payload, 'fingerprint')
    const label = readStringPayload(payload, 'label')
    const indexValue = typeof payload === 'object' && payload !== null && 'index' in payload
      ? Number((payload as Record<string, unknown>).index)
      : Number.NaN
    if (!instructionId || !revision || !fingerprint || !label || !Number.isInteger(indexValue) || indexValue < 0) {
      return failure(action, 'INVALID_ARGUMENT', '缺少完整的指令快照引用（instructionId、revision、fingerprint、label、index）')
    }
    const reference = { id: instructionId, fingerprint, label, index: indexValue }
    const bar = findInstructionBar(context.document)
    const input = findNativeInput(context.document)
    if (isNativeInputDisabled(input)) {
      return failure(action, 'NOT_AVAILABLE', '原生输入框已禁用，无法安全应用指令')
    }
    const resolved = bar ? findInstructionOption(bar, reference, revision) : null
    if (!bar || !input || !resolved) {
      return failure(action, 'PLATFORM_CHANGED', '原生指令列表已变化或目标指令不再匹配，已停止以避免误应用')
    }
    const { element: option, snapshot: instruction } = resolved
    const before = readComposerValues(context.document)
    dispatchPointerClick(option)
    const applied = await waitForCondition(() => {
      const current = readComposerValues(context.document)
      if (!current.some((value) => value.trim())) return false
      return current.some((value, index) => value !== before[index])
    }, 4_000, context.signal)
    if (!applied) {
      return failure(action, 'TIMEOUT', '已点击指令，但 4 秒内没有检测到输入框写入非空文本')
    }
    const values = readComposerValues(context.document)
    const changed = values.filter((value, index) => value !== before[index])
    if (changed.length === 0 || changed.some((value) => !value.trim())) {
      return failure(action, 'PLATFORM_CHANGED', '原生输入框变化无法通过非空文本校验')
    }
    const text = changed[0] ?? ''
    if (!changed.every((value) => value === text)) {
      return failure(action, 'PLATFORM_CHANGED', '原生主输入框与折叠预览内容不一致')
    }
    return { ok: true, action, data: { instructionId, label: instruction.label, text } }
  },

  async regenerateMessage(payload, context) {
    const action: NativeAction = 'regenerateMessage'
    const messageId = readMessageId(payload)
    if (!messageId) return failure(action, 'INVALID_ARGUMENT', '缺少 messageId')

    const resolved = resolveAiMessageAction(
      context.document,
      context.messages,
      messageId,
      'regenerate',
    )
    if (!resolved.button || !resolved.item) {
      return failure(action, 'PLATFORM_CHANGED', resolved.reason || '没有找到原生重新生成按钮')
    }

    const changed = await waitForRegeneration(
      context.document,
      resolved.item,
      () => resolved.button?.click(),
      context.signal,
    )
    return changed
      ? { ok: true, action, data: { messageId, phase: 'regenerating' } }
      : failure(action, 'TIMEOUT', '已点击重新生成，但 12 秒内未检测到目标消息变化')
  },

  async openEditMessage(payload, context) {
    const action: NativeAction = 'openEditMessage'
    const previous = pendingEditSessions.get(context.document)
    pendingEditSessions.delete(context.document)
    if (previous?.panel.isConnected) previous.panel.click()
    const messageId = readMessageId(payload)
    if (!messageId) return failure(action, 'INVALID_ARGUMENT', '缺少 messageId')
    const resolved = resolveAiMessageAction(context.document, context.messages, messageId, 'edit')
    if (!resolved.button || !resolved.item) {
      return failure(action, 'PLATFORM_CHANGED', resolved.reason || '没有找到原生编辑按钮')
    }
    const preClickPanels = await rejectPreExistingEditPanels(context.document, context.signal)
    if (!preClickPanels) {
      return failure(action, 'NOT_AVAILABLE', '检测到无法安全关闭的既有消息编辑界面，请先取消后重试')
    }
    const serial = (editSessionSerials.get(context.document) ?? 0) + 1
    editSessionSerials.set(context.document, serial)
    resolved.button.click()
    const visible = await waitForCondition(() => {
      const panels = findEditPanels(context.document)
      return panels.length === 1 && !preClickPanels.has(panels[0]!)
    }, 4_000, context.signal)
    const panels = findEditPanels(context.document)
    const panel = panels.length === 1 && !preClickPanels.has(panels[0]!) ? panels[0]! : null
    const confirmed = resolveAiMessageAction(context.document, context.messages, messageId, 'edit')
    if (!visible || !panel || confirmed.item !== resolved.item || editSessionSerials.get(context.document) !== serial) {
      panel?.click()
      return failure(action, 'PLATFORM_CHANGED', '编辑按钮未打开唯一且属于目标消息的新编辑界面')
    }
    pendingEditSessions.set(context.document, {
      messageId,
      item: resolved.item,
      panel,
      expiresAt: Date.now() + INTERACTION_SESSION_TTL_MS,
      serial,
    })
    return { ok: true, action, data: readEditPanel(context.document, messageId) }
  },

  async setEditText(payload, context) {
    const action: NativeAction = 'setEditText'
    const text = typeof payload === 'object' && payload !== null && 'text' in payload
      ? String((payload as { text: unknown }).text)
      : null
    if (text === null) return failure(action, 'INVALID_ARGUMENT', '缺少编辑文本')
    const pending = pendingEditSessions.get(context.document)
    const panel = pending?.panel ?? null
    const editor = panel ? findEditContent(panel) : null
    if (!pending
      || pending.expiresAt < Date.now()
      || !pending.item.isConnected
      || findEditPanel(context.document) !== panel
      || !editor) {
      pendingEditSessions.delete(context.document)
      return failure(action, 'NOT_AVAILABLE', '消息编辑会话已失效，请重新打开目标消息')
    }
    setNativeEditText(editor, text)
    return { ok: true, action, data: { text } }
  },

  async applyEditTransform(payload, context) {
    const action: NativeAction = 'applyEditTransform'
    const transformId = typeof payload === 'object' && payload !== null && 'transformId' in payload
      ? String((payload as { transformId: unknown }).transformId)
      : ''
    if (!transformId) return failure(action, 'INVALID_ARGUMENT', '缺少 transformId')
    const pending = pendingEditSessions.get(context.document)
    const panel = pending?.panel ?? null
    const option = panel ? findEditTransform(panel, transformId) : null
    if (!pending
      || pending.expiresAt < Date.now()
      || findEditPanel(context.document) !== panel
      || !option) {
      pendingEditSessions.delete(context.document)
      return failure(action, 'NOT_AVAILABLE', '消息编辑会话已失效，请重新打开目标消息')
    }
    option.click()
    await Promise.resolve()
    if (!await nextFrame(context.signal)) {
      return failure(action, 'NOT_AVAILABLE', '消息编辑转换动作已取消')
    }
    if (findEditPanel(context.document) !== panel) {
      pendingEditSessions.delete(context.document)
      return failure(action, 'PLATFORM_CHANGED', '消息编辑界面在文本工具执行期间被替换')
    }
    return { ok: true, action, data: readEditPanel(context.document, pending.messageId) }
  },

  async submitEditMessage(payload, context) {
    const action: NativeAction = 'submitEditMessage'
    const messageId = readMessageId(payload)
    const text = typeof payload === 'object' && payload !== null && 'text' in payload
      ? String((payload as { text: unknown }).text)
      : null
    if (!messageId) return failure(action, 'INVALID_ARGUMENT', '缺少 messageId')
    if (text === null) return failure(action, 'INVALID_ARGUMENT', '缺少编辑文本')

    const pending = pendingEditSessions.get(context.document)
    pendingEditSessions.delete(context.document)
    const resolved = resolveAiMessageAction(context.document, context.messages, messageId, 'edit')
    const panel = pending?.panel ?? null
    const editor = panel ? findEditContent(panel) : null
    const save = panel?.querySelector<HTMLElement>(MMD_SELECTORS.editSaveButton) ?? null
    if (!pending
      || pending.messageId !== messageId
      || pending.expiresAt < Date.now()
      || pending.serial !== editSessionSerials.get(context.document)
      || resolved.item !== pending.item
      || findEditPanel(context.document) !== panel
      || !editor
      || !save) {
      return failure(action, 'NOT_AVAILABLE', '消息编辑会话已失效或与提交目标不一致，请重新打开目标消息')
    }

    const boundPanel = pending.panel
    setNativeEditText(editor, text)
    if (findEditPanel(context.document) !== boundPanel || !save.isConnected) {
      return failure(action, 'PLATFORM_CHANGED', '消息编辑界面在保存前已被替换')
    }
    const initialHtml = pending.item.querySelector<HTMLElement>(MMD_SELECTORS.aiContent)?.innerHTML ?? ''
    save.click()
    const saved = await waitForCondition(() => {
      const currentContent = pending.item.querySelector<HTMLElement>(MMD_SELECTORS.aiContent)
      const currentHtml = currentContent?.innerHTML ?? ''
      const currentText = currentContent?.innerText.trim() ?? ''
      return (!boundPanel.isConnected || !findEditPanels(context.document).includes(boundPanel))
        && (currentHtml !== initialHtml || currentText === text.trim())
    }, 8_000, context.signal)
    return saved
      ? { ok: true, action, data: { messageId, text } }
      : failure(action, 'TIMEOUT', '已点击保存，但 8 秒内未同时检测到气泡更新和绑定编辑界面关闭')
  },

  async cancelEditMessage(_payload, context) {
    const action: NativeAction = 'cancelEditMessage'
    const pending = pendingEditSessions.get(context.document)
    pendingEditSessions.delete(context.document)
    const panel = pending?.panel ?? null
    if (!pending || findEditPanel(context.document) !== panel) {
      return failure(action, 'NOT_AVAILABLE', '消息编辑会话已失效，请重新打开目标消息')
    }
    const boundPanel = pending.panel
    boundPanel.click()
    const closed = await waitForCondition(
      () => !boundPanel.isConnected || !findEditPanels(context.document).includes(boundPanel),
      4_000,
      context.signal,
    )
    return closed
      ? { ok: true, action }
      : failure(action, 'TIMEOUT', '已触发遮罩点击，但绑定编辑界面没有关闭')
  },

  async deleteMessage(payload, context) {
    const action: NativeAction = 'deleteMessage'
    const request = readDeletePayload(payload)
    if (!request.messageId) return failure(action, 'INVALID_ARGUMENT', '缺少 messageId')

    const pending = pendingDeleteConfirmations.get(context.document)
    if (!request.confirmationToken) {
      pendingDeleteConfirmations.delete(context.document)
      if (pending) invalidateDeleteCapability(pending.item, pending.token)
      const resolved = await openAndResolveDeleteMenu(action, payload, context)
      if ('ok' in resolved) return resolved
      if (!findMessageOptionPanel(context.document)) {
        return failure(action, 'PLATFORM_CHANGED', '删除探测后消息操作菜单意外消失')
      }
      if (!await closeMessageOptionPanel(context.document, context.signal)) {
        return failure(action, 'PLATFORM_CHANGED', '删除探测完成，但消息操作菜单无法安全关闭')
      }
      const token = createConfirmationToken(request.messageId)
      const expiresAt = Date.now() + DELETE_CONFIRMATION_TTL_MS
      pendingDeleteConfirmations.set(context.document, {
        messageId: request.messageId,
        item: resolved.item,
        token,
        expiresAt,
      })
      confirmDeleteCapability(resolved.item, token, expiresAt)
      const data: DeleteMessageResult = {
        phase: 'confirmation-required',
        messageId: request.messageId,
        confirmation: {
          messageId: request.messageId,
          confirmationToken: token,
          prompt: '确认删除这条消息？此操作将调用原生删除，且无法撤销。',
          nativeConfirmation: 'handled-if-present',
        },
      }
      return { ok: true, action, data }
    }

    pendingDeleteConfirmations.delete(context.document)
    if (pending) invalidateDeleteCapability(pending.item, pending.token)
    if (!pending
      || pending.messageId !== request.messageId
      || pending.token !== request.confirmationToken
      || pending.expiresAt < Date.now()
      || !pending.item.isConnected) {
      return failure(action, 'NOT_AVAILABLE', '删除确认已失效，请重新请求并确认')
    }

    const beforeItems = [...context.document.querySelectorAll<HTMLElement>(MMD_SELECTORS.messageItems)]
    const before = readNativeMessageSignatures(context.document)
    const targetIndex = beforeItems.indexOf(pending.item)
    if (targetIndex < 0) return failure(action, 'PLATFORM_CHANGED', '确认后的目标消息已无法唯一定位')

    const resolved = await openAndResolveDeleteMenu(action, payload, context)
    if ('ok' in resolved) return resolved
    if (resolved.item !== pending.item) {
      await closeMessageOptionPanel(context.document, context.signal)
      return failure(action, 'PLATFORM_CHANGED', '执行前重新确认的目标消息与请求时不一致')
    }

    dispatchPointerClick(resolved.deleteOption)
    const nativeConfirmation = await handleDeleteConfirmation(context.document, pending.item, context.signal)
    if (nativeConfirmation === false) {
      return failure(action, 'PLATFORM_CHANGED', '原生删除确认结构不匹配或确认按钮未生效')
    }
    const deleted = await waitForCondition(
      () => isExactSingleDeletion(
        before,
        readNativeMessageSignatures(context.document),
        targetIndex,
        pending.item,
      ),
      DELETE_VERIFICATION_TIMEOUT_MS,
      context.signal,
    )
    if (!deleted) {
      return failure(action, 'TIMEOUT', `已触发原生删除，但 ${DELETE_VERIFICATION_TIMEOUT_MS / 1_000} 秒内未检测到仅目标消息被精确移除`)
    }
    const data: DeleteMessageResult = {
      phase: 'deleted',
      messageId: request.messageId,
      nativeConfirmationHandled: nativeConfirmation === true,
    }
    return { ok: true, action, data }
  },

  async rollbackMessage(payload, context) {
    const action: NativeAction = 'rollbackMessage'
    const messageId = readMessageId(payload)
    const resolved = resolveNativeMessage(context.document, context.messages, messageId)
    const initialMessages = readNativeMessageSignatures(context.document)
    const targetIndex = resolved.item
      ? [...context.document.querySelectorAll<HTMLElement>(MMD_SELECTORS.messageItems)]
        .indexOf(resolved.item)
      : -1
    const hadMessagesBelow = targetIndex >= 0 && targetIndex < initialMessages.length - 1
    const result = await invokeMessageOption(
      action,
      MMD_MESSAGE_OPTION_LABELS.rollback,
      payload,
      context,
    )
    if (!result.ok) return result
    const confirmed = await confirmRollback(context.document, context.signal)
    if (!confirmed) {
      return failure(action, 'TIMEOUT', '已选择回溯，但没有找到匹配的确认弹窗或确认按钮未生效')
    }
    if (!hadMessagesBelow) {
      return { ...result, data: { ...(result.data as object), phase: 'confirmed' } }
    }
    const changed = await waitForCondition(
      () => readNativeMessageSignatures(context.document).length < initialMessages.length,
      8_000,
      context.signal,
    )
    return changed
      ? { ...result, data: { ...(result.data as object), phase: 'confirmed' } }
      : failure(action, 'TIMEOUT', '已确认回溯，但 8 秒内未检测到下方消息被删除')
  },

  async startNewStoryFromMessage(payload, context) {
    const action: NativeAction = 'startNewStoryFromMessage'
    const messageId = readMessageId(payload)
    const initialItems = [...context.document.querySelectorAll<HTMLElement>(MMD_SELECTORS.messageItems)]
    const resolved = resolveNativeMessage(context.document, context.messages, messageId)
    const targetIndex = resolved.item ? initialItems.indexOf(resolved.item) : -1
    if (targetIndex < 0) {
      return failure(action, 'PLATFORM_CHANGED', resolved.reason || '无法确定新故事的目标消息边界')
    }
    const targetMessage = context.messages.find((message) => message.id === messageId)
    if (targetMessage?.role !== 'assistant') {
      return failure(action, 'NOT_AVAILABLE', '原生玩家消息没有“开启新的故事”选项')
    }
    const expected = readNativeMessageSignatures(context.document).slice(0, targetIndex + 1)
    const result = await invokeMessageOption(
      action,
      MMD_MESSAGE_OPTION_LABELS.startNewStory,
      payload,
      context,
    )
    if (!result.ok) return result
    const advanced = await waitForCondition(() => {
      const current = readNativeMessageSignatures(context.document)
      if (current.length !== expected.length) return false
      if (!expected.every((message, index) => sameMessageContent(message, current[index]))) {
        return false
      }
      return expected.some((message, index) =>
        Boolean(message.contentId)
        && Boolean(current[index]?.contentId)
        && message.contentId !== current[index]?.contentId)
    }, 12_000, context.signal)
    return advanced
      ? { ...result, data: { ...(result.data as object), phase: 'created' } }
      : failure(action, 'TIMEOUT', '已点击开启新的故事，但 12 秒内未检测到保留至目标消息的新对话')
  },

  async copyMessage(payload, context) {
    const action: NativeAction = 'copyMessage'
    const messageId = typeof payload === 'object' && payload !== null && 'messageId' in payload
      ? String((payload as { messageId: unknown }).messageId)
      : ''
    const message = context.messages.find((candidate) => candidate.id === messageId)
    if (!message) return failure(action, 'INVALID_ARGUMENT', '没有找到要复制的消息')

    try {
      await navigator.clipboard.writeText(message.text)
      return { ok: true, action }
    } catch {
      const textarea = context.document.createElement('textarea')
      textarea.value = message.text
      textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
      context.document.body.appendChild(textarea)
      textarea.select()
      const copied = context.document.execCommand('copy')
      textarea.remove()
      return copied
        ? { ok: true, action }
        : failure(action, 'UNKNOWN', '浏览器拒绝访问剪贴板')
    }
  },
}

export const REGISTERED_NATIVE_ACTIONS = Object.freeze(
  Object.keys(handlers) as NativeAction[],
)

export async function invokeRegisteredAction(
  action: NativeAction,
  payload: unknown,
  context: ActionContext,
): Promise<ActionResult> {
  const handler = handlers[action]
  if (!handler) return failure(action, 'NOT_AVAILABLE', `“${action}”尚未注册原生桥`)

  try {
    return await handler(payload, context)
  } catch (error) {
    return failure(action, 'UNKNOWN', error instanceof Error ? error.message : '原生动作执行失败')
  }
}
