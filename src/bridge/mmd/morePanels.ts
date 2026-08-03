import type {
  ConversationOptionSnapshot,
  ConversationPanelSnapshot,
  ConversationReferenceSnapshot,
  MoreMenuItemKind,
  MoreMenuItemSnapshot,
  MoreMenuSnapshot,
  PersonaGenderChoiceSnapshot,
  PersonaModeSnapshot,
  PersonaPanelSnapshot,
  SupplementPanelSnapshot,
  SupplementPositionChoiceSnapshot,
} from '../../contracts'
import {
  MMD_MORE_ITEM_ICONS,
  MMD_MORE_ITEM_LABELS,
  MMD_SELECTORS,
  MMD_TUTORIAL_ROUTE,
} from './selectors'

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

function maxLength(element: HTMLInputElement | HTMLTextAreaElement | null): number {
  return element?.maxLength && element.maxLength > 0 ? element.maxLength : 0
}

type KnownMoreMenuKind = Exclude<MoreMenuItemKind, 'unknown'>

export interface MoreMenuItemDefinition {
  kind: KnownMoreMenuKind
  label: string
  icon: string
  destructive: boolean
  genericActivation: boolean
}

export const MMD_MORE_MENU_ITEMS: readonly MoreMenuItemDefinition[] = [
  { kind: 'resetChat', label: MMD_MORE_ITEM_LABELS.resetChat, icon: MMD_MORE_ITEM_ICONS.resetChat, destructive: true, genericActivation: false },
  { kind: 'exportChat', label: MMD_MORE_ITEM_LABELS.exportChat, icon: MMD_MORE_ITEM_ICONS.exportChat, destructive: false, genericActivation: false },
  { kind: 'newChat', label: MMD_MORE_ITEM_LABELS.conversations, icon: MMD_MORE_ITEM_ICONS.conversations, destructive: false, genericActivation: true },
  { kind: 'editRole', label: MMD_MORE_ITEM_LABELS.editRole, icon: MMD_MORE_ITEM_ICONS.editRole, destructive: false, genericActivation: false },
  { kind: 'background', label: MMD_MORE_ITEM_LABELS.background, icon: MMD_MORE_ITEM_ICONS.background, destructive: false, genericActivation: true },
  { kind: 'customInstructions', label: MMD_MORE_ITEM_LABELS.customInstructions, icon: MMD_MORE_ITEM_ICONS.customInstructions, destructive: false, genericActivation: true },
  { kind: 'persona', label: MMD_MORE_ITEM_LABELS.persona, icon: MMD_MORE_ITEM_ICONS.persona, destructive: false, genericActivation: true },
  { kind: 'supplement', label: MMD_MORE_ITEM_LABELS.supplement, icon: MMD_MORE_ITEM_ICONS.supplement, destructive: false, genericActivation: true },
  { kind: 'chatSettings', label: MMD_MORE_ITEM_LABELS.chatSettings, icon: MMD_MORE_ITEM_ICONS.chatSettings, destructive: false, genericActivation: true },
  { kind: 'tutorial', label: MMD_MORE_ITEM_LABELS.tutorial, icon: MMD_MORE_ITEM_ICONS.tutorial, destructive: false, genericActivation: true },
]

function iconFingerprint(source: string): string {
  const path = source.split(/[?#]/, 1)[0] ?? ''
  return path.slice(path.lastIndexOf('/') + 1)
}

function moreMenuItemId(kind: MoreMenuItemKind, label: string, icon: string): string {
  return stableId('more-item', `${kind}\u0000${label}\u0000${icon}`)
}

export function findMoreMenuItemDefinition(label: string, icon: string): MoreMenuItemDefinition | null {
  return MMD_MORE_MENU_ITEMS.find(
    (definition) => definition.label === label && definition.icon === icon,
  ) ?? null
}

export function findMoreMenuItemDefinitionByKind(
  kind: KnownMoreMenuKind,
): MoreMenuItemDefinition | null {
  return MMD_MORE_MENU_ITEMS.find((definition) => definition.kind === kind) ?? null
}

export function readMoreMenuItem(item: HTMLElement): MoreMenuItemSnapshot {
  const label = normalizedText(item.querySelector(MMD_SELECTORS.moreItemTitle))
  const icon = iconFingerprint(moreItemIconSource(item))
  const definition = findMoreMenuItemDefinition(label, icon)
  const kind = definition?.kind ?? 'unknown'
  return {
    id: moreMenuItemId(kind, label, icon),
    label,
    icon,
    kind,
    available: Boolean(definition?.genericActivation),
    destructive: definition?.destructive ?? false,
  }
}

export function readMoreMenu(document: Document): MoreMenuSnapshot {
  const panel = findMorePanel(document)
  if (!panel) return { open: false, items: [] }
  return {
    open: true,
    items: [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.moreItems)]
      .filter(isVisible)
      .map(readMoreMenuItem),
  }
}

export function findMoreItemById(
  panel: HTMLElement,
  itemId: string,
): { element: HTMLElement; snapshot: MoreMenuItemSnapshot } | null {
  const matches = [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.moreItems)]
    .filter(isVisible)
    .map((element) => ({ element, snapshot: readMoreMenuItem(element) }))
    .filter(({ snapshot }) => snapshot.id === itemId)
  return matches.length === 1 ? matches[0] : null
}

export function findMoreEntry(document: Document): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.moreEntry)]
    .find(isVisible) ?? null
}

export function findMoreEntryTarget(document: Document): HTMLElement | null {
  const entry = findMoreEntry(document)
  const target = entry?.querySelector<HTMLElement>(MMD_SELECTORS.moreEntryTarget) ?? null
  return target && isVisible(target) ? target : null
}

export function findMorePanel(document: Document): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.morePanel)]
    .find(isVisible) ?? null
}

export function findMoreItem(panel: HTMLElement, label: string): HTMLElement | null {
  const matches = [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.moreItems)]
    .filter((item) => normalizedText(item.querySelector(MMD_SELECTORS.moreItemTitle)) === label)
  return matches.length === 1 ? matches[0] : null
}

export function moreItemIconSource(item: HTMLElement): string {
  return item.querySelector<HTMLImageElement>(MMD_SELECTORS.moreItemIcon)?.getAttribute('src') ?? ''
}

export function findBackgroundPanel(document: Document): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.backgroundPanel)]
    .find((panel) => isVisible(panel)
      && normalizedText(panel.querySelector(MMD_SELECTORS.backgroundPanelTitle)) === MMD_MORE_ITEM_LABELS.background
      && panel.querySelector(MMD_SELECTORS.backgroundPanelItems)) ?? null
}

export function findCustomInstructionsPanel(document: Document): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.customInstructionsPanel)]
    .find((panel) => isVisible(panel)
      && normalizedText(panel.querySelector(MMD_SELECTORS.customInstructionsTitle)) === MMD_MORE_ITEM_LABELS.customInstructions) ?? null
}

export function isTutorialRoute(document: Document): boolean {
  return (document.defaultView?.location.hash ?? '').split('?', 1)[0] === `#${MMD_TUTORIAL_ROUTE}`
}

export function findConversationPanel(document: Document): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.conversationPanel)]
    .find((panel) => isVisible(panel) && readVisibleTitle(panel) === '开启新的聊天') ?? null
}

function readVisibleTitle(panel: HTMLElement): string {
  return [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.conversationTitles)]
    .find(isVisible)?.textContent?.trim() ?? ''
}

function conversationFingerprint(title: string, preview: string, avatar: string): string {
  return stableId('conversation-fingerprint', `${title}\u0000${preview}\u0000${avatar}`)
}

function conversationOptionId(fingerprint: string, index: number): string {
  return stableId('conversation', `${fingerprint}\u0000${index}`)
}

function hasConfirmedConversationActions(item: HTMLElement): boolean {
  return Boolean(
    item.querySelector(MMD_SELECTORS.conversationEdit)
    && item.querySelector(MMD_SELECTORS.conversationDelete),
  )
}

function readConversationOption(item: HTMLElement, index: number): ConversationOptionSnapshot {
  const title = normalizedText(item.querySelector(MMD_SELECTORS.conversationItemTitle))
  const preview = normalizedText(item.querySelector(MMD_SELECTORS.conversationItemPreview))
  const avatar = item.querySelector<HTMLImageElement>(MMD_SELECTORS.conversationItemAvatar)?.src ?? ''
  const fingerprint = conversationFingerprint(title, preview, avatar)
  const current = Boolean(item.querySelector(MMD_SELECTORS.conversationCurrent))
  const actionsConfirmed = hasConfirmedConversationActions(item)
  return {
    id: conversationOptionId(fingerprint, index),
    fingerprint,
    index,
    title,
    preview,
    avatar: avatar || null,
    current,
    capabilities: {
      rename: actionsConfirmed,
      delete: actionsConfirmed && !current,
    },
  }
}

function readConversationOptions(panel: HTMLElement): ConversationOptionSnapshot[] {
  return [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.conversationItems)]
    .map(readConversationOption)
}

export function readConversationPanel(document: Document): ConversationPanelSnapshot {
  const panel = findConversationPanel(document)
  if (!panel) return { open: false, title: '', conversations: [], currentConversationId: null }
  const conversations = readConversationOptions(panel)
  return {
    open: true,
    title: readVisibleTitle(panel),
    conversations,
    currentConversationId: conversations.find((conversation) => conversation.current)?.id ?? null,
  }
}

export function findConversationItem(
  panel: HTMLElement,
  reference: ConversationReferenceSnapshot,
): HTMLElement | null {
  const items = [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.conversationItems)]
  const snapshots = items.map(readConversationOption)
  const indexed = snapshots[reference.index]
  if (
    !indexed
    || indexed.id !== reference.id
    || indexed.fingerprint !== reference.fingerprint
  ) return null
  const duplicateMatches = snapshots.filter((conversation) =>
    conversation.fingerprint === reference.fingerprint)
  if (duplicateMatches.length !== 1) return null
  return items[reference.index] ?? null
}

export function findConversationRenameDialog(document: Document): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.conversationRenameDialog)]
    .find(isVisible) ?? null
}

export function findConversationDeleteConfirmations(document: Document): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.confirmPopup)]
    .filter((panel) => {
      if (!isVisible(panel)) return false
      const title = normalizedText(panel.querySelector(MMD_SELECTORS.confirmTitle) ?? panel)
      const content = normalizedText(panel.querySelector(MMD_SELECTORS.confirmContent) ?? panel)
      return /删除/.test(title) && /聊天|会话|记录/.test(`${title}${content}`)
    })
}

export function findConversationDeleteConfirmation(document: Document): HTMLElement | null {
  const panels = findConversationDeleteConfirmations(document)
  return panels.length === 1 ? panels[0]! : null
}

export function findPersonaPanel(document: Document): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.personaPanel)]
    .find(isVisible) ?? null
}

export function personaModeId(label: string): string {
  return stableId('persona-mode', label)
}

export function personaGenderId(label: string): string {
  return stableId('persona-gender', label)
}

function readPersonaMode(mode: HTMLElement): PersonaModeSnapshot {
  const radio = mode.querySelector<HTMLElement>(MMD_SELECTORS.personaModeRadio)
  const label = normalizedText(mode.querySelector('uni-text'))
  return {
    id: personaModeId(label),
    label,
    selected: Boolean(radio?.querySelector('svg')),
    disabled: radio?.getAttribute('disabled') === 'true' || radio?.hasAttribute('disabled') === true,
  }
}

function readPersonaGender(choice: HTMLElement): PersonaGenderChoiceSnapshot {
  const label = normalizedText(choice)
  return {
    id: personaGenderId(label),
    label,
    selected: choice.classList.contains(MMD_SELECTORS.personaGenderSelectedClass),
    disabled: choice.classList.contains(MMD_SELECTORS.personaGenderDisabledClass),
  }
}

function emptyPersonaPanel(): PersonaPanelSnapshot {
  return {
    open: false,
    title: '',
    modes: [],
    currentModeId: null,
    name: '',
    maxLength: 0,
    nameDisabled: false,
    genderChoices: [],
    selectedGenderId: null,
    identity: '',
    identityMaxLength: 0,
    identityDisabled: false,
    restriction: '',
  }
}

export function readPersonaPanel(document: Document): PersonaPanelSnapshot {
  const panel = findPersonaPanel(document)
  if (!panel) return emptyPersonaPanel()
  const modes = [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.personaModes)]
    .map(readPersonaMode)
  const input = panel.querySelector<HTMLInputElement>(MMD_SELECTORS.personaNameInput)
  const genderChoices = [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.personaGenderItems)]
    .map(readPersonaGender)
  const identity = panel.querySelector<HTMLTextAreaElement>(MMD_SELECTORS.personaIdentityInput)
  return {
    open: true,
    title: normalizedText(panel.querySelector(MMD_SELECTORS.personaTitle)),
    modes,
    currentModeId: modes.find((mode) => mode.selected)?.id ?? null,
    name: input?.value ?? '',
    maxLength: maxLength(input),
    nameDisabled: input?.disabled ?? false,
    genderChoices,
    selectedGenderId: genderChoices.find((choice) => choice.selected)?.id ?? null,
    identity: identity?.value ?? '',
    identityMaxLength: maxLength(identity),
    identityDisabled: identity?.disabled ?? false,
    restriction: normalizedText(panel.querySelector(MMD_SELECTORS.personaRestriction)),
  }
}

export function findPersonaMode(panel: HTMLElement, modeId: string): HTMLElement | null {
  const matches = [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.personaModes)]
    .filter((mode) => personaModeId(normalizedText(mode.querySelector('uni-text'))) === modeId)
  return matches.length === 1 ? matches[0] : null
}

export function findPersonaGender(panel: HTMLElement, genderId: string): HTMLElement | null {
  const matches = [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.personaGenderItems)]
    .filter((choice) => personaGenderId(normalizedText(choice)) === genderId)
  return matches.length === 1 ? matches[0] : null
}

export function findSupplementPanel(document: Document): HTMLElement | null {
  const body = [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.supplementPanel)]
    .find(isVisible)
  if (!body) return null
  return body.closest<HTMLElement>('.u-popup__content') ?? body.parentElement ?? body
}

export function supplementPositionId(label: string): string {
  return stableId('supplement-position', label)
}

export function findSupplementPicker(document: Document): HTMLElement | null {
  const content = [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.supplementPickerContent)]
    .find(isVisible)
  if (!content) return null
  return content.closest<HTMLElement>('.u-transition')
    ?? content.closest<HTMLElement>('.u-popup__content')
    ?? content.parentElement
}

export function readSupplementPositionChoices(document: Document): SupplementPositionChoiceSnapshot[] {
  const picker = findSupplementPicker(document)
  if (!picker) return []
  return [...picker.querySelectorAll<HTMLElement>(MMD_SELECTORS.supplementPickerOptions)].map((option) => {
    const label = normalizedText(option)
    return {
      id: supplementPositionId(label),
      label,
      selected: option.classList.contains(MMD_SELECTORS.supplementPickerSelectedClass),
    }
  })
}

export function readSupplementPanel(document: Document): SupplementPanelSnapshot {
  const panel = findSupplementPanel(document)
  const body = panel?.querySelector<HTMLElement>(MMD_SELECTORS.supplementPanel) ?? null
  if (!panel || !body) {
    return {
      open: false,
      title: '',
      text: '',
      maxLength: 0,
      positionId: null,
      positionLabel: '',
      picker: { open: false, choices: [], pendingChoiceId: null },
    }
  }
  const textarea = body.querySelector<HTMLTextAreaElement>(MMD_SELECTORS.supplementTextarea)
  const positionLabel = normalizedText(body.querySelector(MMD_SELECTORS.supplementPositionValue))
  const choices = readSupplementPositionChoices(document)
  return {
    open: true,
    title: normalizedText(panel.querySelector(MMD_SELECTORS.supplementTitle)),
    text: textarea?.value ?? '',
    maxLength: maxLength(textarea),
    positionId: positionLabel ? supplementPositionId(positionLabel) : null,
    positionLabel,
    picker: {
      open: Boolean(findSupplementPicker(document)),
      choices,
      pendingChoiceId: choices.find((choice) => choice.selected)?.id ?? null,
    },
  }
}

export function findSupplementPositionOption(
  document: Document,
  choiceId: string,
): HTMLElement | null {
  const picker = findSupplementPicker(document)
  if (!picker) return null
  const matches = [...picker.querySelectorAll<HTMLElement>(MMD_SELECTORS.supplementPickerOptions)]
    .filter((option) => supplementPositionId(normalizedText(option)) === choiceId)
  return matches.length === 1 ? matches[0] : null
}

export function findPickerTextButton(picker: HTMLElement, text: string): HTMLElement | null {
  const matches = [...picker.querySelectorAll<HTMLElement>('*')]
    .filter((element) => isVisible(element) && element.children.length === 0 && normalizedText(element) === text)
  return matches.length === 1 ? matches[0] : null
}
