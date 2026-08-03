import type { EditPanelSnapshot, EditTransformOption } from '../../contracts'
import { MMD_SELECTORS } from './selectors'

const EMPTY_EDIT_PANEL: EditPanelSnapshot = {
  open: false,
  messageId: null,
  text: '',
  transforms: [],
}

function visible(element: HTMLElement): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  return style?.display !== 'none' && style?.visibility !== 'hidden'
}

export function findEditPanels(document: Document): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.editPanel)].filter(visible)
}

export function findEditPanel(document: Document): HTMLElement | null {
  const panels = findEditPanels(document)
  return panels.length === 1 ? panels[0]! : null
}

export function findEditContent(panel: HTMLElement): HTMLElement | null {
  return panel.querySelector<HTMLElement>(MMD_SELECTORS.editContent)
    ?? panel.querySelector<HTMLElement>(MMD_SELECTORS.editContentFallback)
}

export function editTransformId(index: number): string {
  return `transform-${index}`
}

export function readEditPanel(document: Document, messageId: string | null): EditPanelSnapshot {
  const panel = findEditPanel(document)
  if (!panel) return { ...EMPTY_EDIT_PANEL }

  const editor = findEditContent(panel)
  const transforms: EditTransformOption[] = [
    ...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.editOptions),
  ].map((option, index) => ({
    id: editTransformId(index),
    label: option.innerText.trim() || `文本工具 ${index + 1}`,
  }))

  return {
    open: true,
    messageId,
    text: editor?.innerText ?? '',
    transforms,
  }
}

export function setNativeEditText(editor: HTMLElement, text: string): void {
  editor.focus()
  editor.innerText = text
  const view = editor.ownerDocument.defaultView
  const InputEventCtor = view?.InputEvent ?? InputEvent
  let event: Event
  try {
    event = new InputEventCtor('input', {
      bubbles: true,
      composed: true,
      inputType: 'insertText',
      data: text,
    })
  } catch {
    event = new Event('input', { bubbles: true, composed: true })
  }
  editor.dispatchEvent(event)
}

export function findEditTransform(
  panel: HTMLElement,
  transformId: string,
): HTMLElement | null {
  const match = /^transform-(\d+)$/.exec(transformId)
  if (!match) return null
  const index = Number(match[1])
  return [...panel.querySelectorAll<HTMLElement>(MMD_SELECTORS.editOptions)][index] ?? null
}
