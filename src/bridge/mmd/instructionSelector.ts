import type { InstructionOptionSnapshot, InstructionSelectorSnapshot } from '../../contracts'
import { MMD_SELECTORS } from './selectors'

const EXPECTED_SHORTCUT_COUNT = 5
const INSTRUCTION_LABEL = '选择指令'

function normalizedText(element: Element | null): string {
  return element?.textContent?.normalize('NFKC').replace(/\s+/g, ' ').trim() ?? ''
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

function instructionFingerprint(chip: HTMLElement, label: string): string {
  const attributes = [...chip.attributes]
    .filter(({ name }) => name !== 'class' && name !== 'style')
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(({ name, value }) => `${name}=${value.normalize('NFKC').trim()}`)
  return stableId('instruction-fingerprint', [label, ...attributes].join('\u0000'))
}

function instructionListRevision(fingerprints: string[]): string {
  return stableId('instruction-list', fingerprints.join('\u0000'))
}

function hasMatchingIcon(entry: HTMLElement, fragment: string): boolean {
  const image = entry.querySelector<HTMLImageElement>(MMD_SELECTORS.shortcutButtonIcon)
  return Boolean(image?.src.includes(fragment))
}

export function findShortcutEntry(
  document: Document,
  label: string,
  iconFragment: string,
): HTMLElement | null {
  const bars = [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.shortcutBar)].filter(isVisible)
  if (bars.length !== 1) return null
  const buttons = [...bars[0]!.querySelectorAll<HTMLElement>(MMD_SELECTORS.shortcutButtons)]
  if (buttons.length !== EXPECTED_SHORTCUT_COUNT) return null
  const matches = buttons.filter((button) =>
    normalizedText(button.querySelector(MMD_SELECTORS.shortcutButtonLabel)) === label
      && hasMatchingIcon(button, iconFragment),
  )
  return matches.length === 1 ? matches[0]! : null
}

export function findInstructionEntry(document: Document): HTMLElement | null {
  return findShortcutEntry(document, INSTRUCTION_LABEL, MMD_SELECTORS.instructionEntryIcon)
}

export function findInstructionBar(document: Document): HTMLElement | null {
  const matches = [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.instructionBar)].filter((bar) =>
    isVisible(bar)
      && !bar.classList.contains('hidden')
      && Boolean(bar.querySelector(MMD_SELECTORS.instructionBack))
      && Boolean(bar.querySelector(MMD_SELECTORS.instructionScroll)),
  )
  return matches.length === 1 ? matches[0]! : null
}

interface InstructionEntry {
  element: HTMLElement
  snapshot: InstructionOptionSnapshot
}

interface InstructionInventory {
  revision: string
  entries: InstructionEntry[]
}

function readInstructionInventory(bar: HTMLElement): InstructionInventory {
  const chips = [...bar.querySelectorAll<HTMLElement>(MMD_SELECTORS.instructionChips)]
    .filter((chip) => Boolean(normalizedText(chip)) && isVisible(chip))
  const labels = chips.map((chip) => normalizedText(chip))
  const fingerprints = chips.map((chip, index) => instructionFingerprint(chip, labels[index]!))
  const revision = instructionListRevision(fingerprints)
  return {
    revision,
    entries: chips.map((element, index) => {
      const label = labels[index]!
      const fingerprint = fingerprints[index]!
      return {
        element,
        snapshot: {
          id: stableId('instruction', `${revision}\u0000${index}\u0000${fingerprint}`),
          label,
          fingerprint,
          index,
        },
      }
    }),
  }
}

export function readInstructionOptions(bar: HTMLElement): InstructionOptionSnapshot[] {
  return readInstructionInventory(bar).entries.map(({ snapshot }) => snapshot)
}

export interface ResolvedInstructionOption {
  element: HTMLElement
  snapshot: InstructionOptionSnapshot
}

export function findInstructionOption(
  bar: HTMLElement,
  reference: InstructionOptionSnapshot,
  revision: string,
): ResolvedInstructionOption | null {
  const inventory = readInstructionInventory(bar)
  if (inventory.revision !== revision) return null
  const indexed = inventory.entries[reference.index]
  if (!indexed
    || indexed.snapshot.id !== reference.id
    || indexed.snapshot.label !== reference.label
    || indexed.snapshot.fingerprint !== reference.fingerprint
    || inventory.entries.filter(({ snapshot }) => snapshot.id === reference.id).length !== 1) return null
  return indexed
}

export function readInstructionSelector(document: Document): InstructionSelectorSnapshot {
  const bar = findInstructionBar(document)
  if (!bar) return { open: false, empty: false, revision: '', instructions: [] }
  const inventory = readInstructionInventory(bar)
  const instructions = inventory.entries.map(({ snapshot }) => snapshot)
  return {
    open: true,
    empty: instructions.length === 0 && Boolean(bar.querySelector(MMD_SELECTORS.instructionEmpty)),
    revision: inventory.revision,
    instructions,
  }
}
