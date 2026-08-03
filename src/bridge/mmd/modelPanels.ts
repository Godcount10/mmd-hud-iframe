import type {
  ModelConfigurationSnapshot,
  ModelFilterSnapshot,
  ModelOptionSnapshot,
  ModelPanelSnapshot,
  ModelSettingChoiceSnapshot,
  ModelSettingControlSnapshot,
} from '../../contracts'
import { MMD_SELECTORS } from './selectors'

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

function numberFromText(text: string): number | null {
  const match = text.match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

export function findModelEntry(document: Document): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.modelEntry)]
    .find((entry) => isVisible(entry) && Boolean(entry.querySelector(MMD_SELECTORS.modelEntryIcon))) ?? null
}

export function findModelPanel(document: Document): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.modelPanel)]
    .find(isVisible) ?? null
}

export function findModelPanelClose(panel: HTMLElement): HTMLElement | null {
  const popupContent = panel.closest<HTMLElement>('.u-popup__content') ?? panel.parentElement
  return popupContent?.querySelector<HTMLElement>(MMD_SELECTORS.shareCloseButton) ?? null
}

export function findModelConfiguration(document: Document): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.modelConfiguration)]
    .find(isVisible) ?? null
}

export function modelFilterId(label: string): string {
  return stableId('filter', label)
}

export function modelOptionId(name: string, description: string, batteryLabel: string): string {
  return stableId('model', `${name}\u0000${description}\u0000${batteryLabel}`)
}

export function readModelFilters(panel: HTMLElement): ModelFilterSnapshot[] {
  return [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.modelFilters)].map((filter) => {
    const label = normalizedText(filter)
    return { id: modelFilterId(label), label, active: filter.classList.contains('active') }
  })
}

export function readModelOptions(panel: HTMLElement): ModelOptionSnapshot[] {
  return [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.modelItems)].map((item) => {
    const name = normalizedText(item.querySelector(MMD_SELECTORS.modelTitle))
    const description = normalizedText(item.querySelector(MMD_SELECTORS.modelDescription))
    const batteryLabel = normalizedText(item.querySelector(MMD_SELECTORS.modelBattery))
    return {
      id: modelOptionId(name, description, batteryLabel),
      name,
      description,
      batteryCost: numberFromText(batteryLabel),
      batteryLabel,
      permission: normalizedText(item.querySelector(MMD_SELECTORS.modelPermission)),
      successRate: normalizedText(item.querySelector(MMD_SELECTORS.modelSuccessRate)),
      selected: item.classList.contains('model-item-active'),
    }
  })
}

export function readModelPanel(document: Document): ModelPanelSnapshot {
  const panel = findModelPanel(document)
  if (!panel) {
    return {
      open: false,
      title: '',
      filters: [],
      models: [],
      activeFilterId: null,
      selectedModelId: null,
    }
  }
  const filters = readModelFilters(panel)
  const models = readModelOptions(panel)
  return {
    open: true,
    title: normalizedText(panel.querySelector(MMD_SELECTORS.modelPanelTitle)),
    filters,
    models,
    activeFilterId: filters.find((filter) => filter.active)?.id ?? null,
    selectedModelId: models.find((model) => model.selected)?.id ?? null,
  }
}

/**
 * MMD mounts the model-panel shell before its asynchronously loaded model rows.
 * Wait on that panel only so action completion can synchronize the bridge as soon
 * as rows exist, without relying on the bridge's periodic document rescan.
 */
export function waitForModelRows(
  panel: HTMLElement,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ModelPanelSnapshot> {
  const document = panel.ownerDocument
  const modelList = panel.querySelector<HTMLElement>(MMD_SELECTORS.modelList)
  const initial = readModelPanel(document)
  if (
    signal?.aborted
    || !initial.open
    || initial.models.length > 0
    || !modelList
    || timeoutMs <= 0
  ) {
    return Promise.resolve(initial)
  }

  const view = document.defaultView ?? window
  const Observer = view.MutationObserver ?? MutationObserver

  return new Promise((resolve) => {
    let frame = 0
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      rowObserver.disconnect()
      removalObserver.disconnect()
      view.clearTimeout(timer)
      if (frame) view.cancelAnimationFrame(frame)
      signal?.removeEventListener('abort', finish)
      resolve(readModelPanel(document))
    }
    const settleIfReady = (): void => {
      frame = 0
      if (!panel.isConnected || modelList.querySelector(MMD_SELECTORS.modelItems)) finish()
    }
    const scheduleRowSettle = (): void => {
      if (frame) view.cancelAnimationFrame(frame)
      frame = view.requestAnimationFrame(settleIfReady)
    }
    const rowObserver = new Observer(scheduleRowSettle)
    const removalObserver = new Observer(() => {
      if (!panel.isConnected) finish()
    })
    const timer = view.setTimeout(finish, timeoutMs)

    rowObserver.observe(modelList, { subtree: true, childList: true })
    removalObserver.observe(document.documentElement, { subtree: true, childList: true })
    signal?.addEventListener('abort', finish, { once: true })
    if (signal?.aborted || !panel.isConnected) finish()
  })
}

export function findModelFilter(panel: HTMLElement, filterId: string): HTMLElement | null {
  const matches = [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.modelFilters)]
    .filter((filter) => modelFilterId(normalizedText(filter)) === filterId)
  return matches.length === 1 ? matches[0] : null
}

export function findModelItem(panel: HTMLElement, modelId: string): HTMLElement | null {
  const matches = [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.modelItems)].filter((item) => {
    const name = normalizedText(item.querySelector(MMD_SELECTORS.modelTitle))
    const description = normalizedText(item.querySelector(MMD_SELECTORS.modelDescription))
    const batteryLabel = normalizedText(item.querySelector(MMD_SELECTORS.modelBattery))
    return modelOptionId(name, description, batteryLabel) === modelId
  })
  return matches.length === 1 ? matches[0] : null
}

function choiceId(controlId: string, label: string): string {
  return stableId(`${controlId}-choice`, label)
}

function readChoices(
  scope: Element,
  selector: string,
  controlId: string,
): ModelSettingChoiceSnapshot[] {
  return [...scope.querySelectorAll<HTMLElement>(selector)].map((option) => {
    const label = normalizedText(option)
    return { id: choiceId(controlId, label), label, selected: option.classList.contains('selected') }
  })
}

function readChoiceControl(
  scope: HTMLElement,
  id: string,
  optionSelector: string,
): ModelSettingControlSnapshot {
  const choices = readChoices(scope, optionSelector, id)
  return {
    id,
    type: 'choice',
    label: normalizedText(scope.querySelector('.mp-card-title')),
    description: normalizedText(scope.querySelector('.mp-card-hint')),
    value: choices.find((choice) => choice.selected)?.label ?? null,
    choices,
  }
}

export function readModelConfiguration(document: Document): ModelConfigurationSnapshot {
  const panel = findModelConfiguration(document)
  if (!panel) {
    return { open: false, title: '', modelName: '', energyCost: null, energyLabel: '', controls: [] }
  }
  const controls: ModelSettingControlSnapshot[] = []
  panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.modelConfigurationTokenCard).forEach((card, index) => {
    if (!card.querySelector(MMD_SELECTORS.modelConfigurationTokenOptions)) return
    controls.push(readChoiceControl(card, index === 0 ? 'output-tokens' : `token-choice-${index}`, MMD_SELECTORS.modelConfigurationTokenOptions))
  })
  panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.modelConfigurationSwitchRows).forEach((row, index) => {
    const label = normalizedText(row.querySelector('.mp-sw-title'))
    controls.push({
      id: stableId('toggle', label || String(index)),
      type: 'toggle',
      label,
      description: normalizedText(row.querySelector('.mp-sw-desc')),
      value: Boolean(row.querySelector(MMD_SELECTORS.modelConfigurationSwitchOn)),
      choices: [],
    })
  })
  panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.modelConfigurationPresetCards).forEach((card, index) => {
    controls.push(readChoiceControl(card, index === 0 ? 'preset' : `preset-${index}`, MMD_SELECTORS.modelConfigurationPresetOptions))
  })
  const energyLabel = normalizedText(panel.querySelector(MMD_SELECTORS.modelConfigurationEnergy))
  return {
    open: true,
    title: normalizedText(panel.querySelector(MMD_SELECTORS.modelConfigurationTitle)),
    modelName: normalizedText(panel.querySelector(MMD_SELECTORS.modelConfigurationName)),
    energyCost: numberFromText(energyLabel),
    energyLabel,
    controls,
  }
}

export function findModelSettingTarget(
  panel: HTMLElement,
  controlId: string,
  choice: string | null,
): HTMLElement | null {
  const configuration = readModelConfiguration(panel.ownerDocument)
  const control = configuration.controls.find((candidate) => candidate.id === controlId)
  if (!control) return null
  if (control.type === 'toggle') {
    const rows = [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.modelConfigurationSwitchRows)]
    return rows.find((row, index) => {
      const label = normalizedText(row.querySelector('.mp-sw-title'))
      return stableId('toggle', label || String(index)) === controlId
    })?.querySelector<HTMLElement>(MMD_SELECTORS.modelConfigurationSwitch) ?? null
  }
  const tokenCards = [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.modelConfigurationTokenCard)]
  const presetCards = [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.modelConfigurationPresetCards)]
  const scopes = [...tokenCards, ...presetCards]
  for (const scope of scopes) {
    const preset = scope.matches(MMD_SELECTORS.modelConfigurationPresetCards)
    const selectors = preset
      ? MMD_SELECTORS.modelConfigurationPresetOptions
      : MMD_SELECTORS.modelConfigurationTokenOptions
    const options = [...scope.querySelectorAll<HTMLElement>(selectors)]
    const index = preset ? presetCards.indexOf(scope) : tokenCards.indexOf(scope)
    const candidateId = preset
      ? (index === 0 ? 'preset' : `preset-${index}`)
      : (index === 0 ? 'output-tokens' : `token-choice-${index}`)
    if (candidateId !== controlId) continue
    return options.find((option) => choiceId(controlId, normalizedText(option)) === choice || normalizedText(option) === choice) ?? null
  }
  return null
}
