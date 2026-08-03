import type {
  ChatSettingControlSnapshot,
  ChatSettingOptionSnapshot,
  ChatSettingsSnapshot,
} from '../../contracts'
import { findShortcutEntry } from './instructionSelector'
import { MMD_SELECTORS } from './selectors'

const CHAT_SETTINGS_LABEL = '对话设置'
const CHAT_SETTINGS_TITLE = '对话设置'

function normalizedText(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
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

function stableId(prefix: string, value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

function readOptions(group: HTMLElement, controlId: string): ChatSettingOptionSnapshot[] {
  const occurrences = new Map<string, number>()
  return [...group.querySelectorAll<HTMLElement>(MMD_SELECTORS.chatSettingsOptions)].flatMap((option) => {
    if (!isVisible(option)) return []
    const label = normalizedText(option.querySelector(MMD_SELECTORS.chatSettingsOptionLabel))
    if (!label) return []
    const occurrence = occurrences.get(label) ?? 0
    occurrences.set(label, occurrence + 1)
    return [{
      id: stableId(`${controlId}-option`, `${label}\u0000${occurrence}`),
      label,
      selected: option.classList.contains(MMD_SELECTORS.chatSettingsOptionActiveClass),
    }]
  })
}

function readControls(panel: HTMLElement): ChatSettingControlSnapshot[] {
  return [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.chatSettingsGroups)].flatMap((group, index) => {
    const label = normalizedText(group.querySelector(MMD_SELECTORS.chatSettingsGroupTitle))
    if (!label) return []
    const controlId = stableId('chat-setting', `${label}\u0000${index}`)
    const options = readOptions(group, controlId)
    return [{
      id: controlId,
      label,
      description: normalizedText(group.querySelector(MMD_SELECTORS.chatSettingsGroupDescription)),
      options,
      selectedOptionId: options.find((option) => option.selected)?.id ?? null,
      collapsed: group.classList.contains(MMD_SELECTORS.chatSettingsGroupCollapsedClass),
    }]
  })
}

export function findChatSettingsEntry(document: Document): HTMLElement | null {
  return findShortcutEntry(document, CHAT_SETTINGS_LABEL, MMD_SELECTORS.chatSettingsEntryIcon)
}

export function findChatSettingsPanel(document: Document): HTMLElement | null {
  const matches = [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.chatSettingsPanel)].filter((panel) => {
    if (!isVisible(panel)) return false
    const header = panel.querySelector<HTMLElement>(MMD_SELECTORS.chatSettingsHeader)
    const content = panel.querySelector<HTMLElement>(MMD_SELECTORS.chatSettingsContent)
    const title = normalizedText(panel.querySelector(MMD_SELECTORS.chatSettingsTitle))
    const close = panel.querySelector<HTMLElement>(MMD_SELECTORS.chatSettingsClose)
    const submit = panel.querySelector<HTMLElement>(MMD_SELECTORS.chatSettingsSubmit)
    return Boolean(header && content && close && submit && title === CHAT_SETTINGS_TITLE)
  })
  return matches.length === 1 ? matches[0]! : null
}

export function readChatSettings(document: Document): ChatSettingsSnapshot {
  const panel = findChatSettingsPanel(document)
  if (!panel) return { open: false, title: '', empty: false, controls: [] }
  const controls = readControls(panel)
  return {
    open: true,
    title: normalizedText(panel.querySelector(MMD_SELECTORS.chatSettingsTitle)),
    empty: controls.length === 0 && Boolean(panel.querySelector(MMD_SELECTORS.chatSettingsEmpty)),
    controls,
  }
}
