import type { SharePanelSnapshot } from '../../contracts'
import { MMD_SELECTORS } from './selectors'

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

export function findSharePanel(document: Document): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.sharePopup)]
    .find(isVisible) ?? null
}

export function readSharePanel(document: Document): SharePanelSnapshot {
  const panel = findSharePanel(document)
  return {
    open: Boolean(panel),
    title: panel?.querySelector(MMD_SELECTORS.shareTitle)?.textContent?.trim() ?? '',
    subtitle: '',
    link: panel?.querySelector(MMD_SELECTORS.shareLink)?.textContent?.trim() ?? '',
  }
}
