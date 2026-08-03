import type { ChatMessage, GenerationSnapshot } from '../../contracts'
import { MMD_SELECTORS } from './selectors'

const WAITING_TEXT = '消息生成中'
const TYPING_TEXT = '对方正在输入中'

export function findNativeInput(document: Document): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(MMD_SELECTORS.input)
    ?? document.querySelector<HTMLTextAreaElement>(MMD_SELECTORS.inputFallback)
    ?? document.querySelector<HTMLTextAreaElement>(MMD_SELECTORS.inputState)
}

export function isNativeInputDisabled(input: HTMLTextAreaElement | null): boolean {
  return Boolean(
    input?.disabled
      || input?.readOnly
      || input?.getAttribute('aria-disabled')?.toLocaleLowerCase() === 'true',
  )
}

export function readInputGenerationStateSignature(document: Document): string {
  const input = findNativeInput(document)
  return input ? (isNativeInputDisabled(input) ? 'disabled' : 'enabled') : 'missing'
}

function hasTypingIndicator(document: Document): boolean {
  return document.querySelector(MMD_SELECTORS.input)?.closest('#chat-input-scope')
    ?.textContent?.includes(TYPING_TEXT)
    ?? document.querySelector(MMD_SELECTORS.inputFallback)?.closest('#chat-input-scope')
      ?.textContent?.includes(TYPING_TEXT)
    ?? false
}

export function readGenerationSnapshot(
  document: Document,
  messages: ChatMessage[],
): GenerationSnapshot {
  const aiItems = [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.aiItem)]
  const lastAi = aiItems.at(-1) ?? null
  const content = lastAi?.querySelector<HTMLElement>(MMD_SELECTORS.aiContent) ?? null
  const text = content?.innerText.trim() ?? ''
  const inputDisabled = isNativeInputDisabled(findNativeInput(document))
  const typing = hasTypingIndicator(document)
  const waiting = text.includes(WAITING_TEXT)

  if (!inputDisabled && !typing && !waiting) {
    return { status: 'idle', messageId: null }
  }

  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant') ?? null
  const hasStableMessage = Boolean(content && lastAssistant) && !waiting

  return {
    status: hasStableMessage ? 'streaming' : 'starting',
    messageId: hasStableMessage ? lastAssistant?.id ?? null : null,
  }
}
