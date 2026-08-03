import type { ChatMessage, MessageRole } from '../../contracts'
import { MMD_SELECTORS } from './selectors'

export type NativeMessageRole = 'user' | 'assistant'

export interface NativeMessageIdentity {
  item: HTMLElement
  content: HTMLElement
  role: NativeMessageRole
  nativeIndex: number
  fingerprint: string
}

export interface NativeMessageAlignment {
  identities: NativeMessageIdentity[] | null
  reason?: string
}

function stableFingerprint(prefix: string, value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function normalizeHtml(value: string): string {
  return value.normalize('NFKC').replace(/\r\n?/g, '\n').trim()
}

export function messageTargetFingerprint(
  role: MessageRole,
  text: string,
  html: string,
): string {
  return stableFingerprint('message-target', `${role}\u0000${normalizeText(text)}\u0000${normalizeHtml(html)}`)
}

function readIdentity(item: HTMLElement, nativeIndex: number): NativeMessageIdentity | null {
  const assistant = item.matches(MMD_SELECTORS.aiItem)
  const user = item.matches(MMD_SELECTORS.userItem)
  if (assistant === user) return null
  const role: NativeMessageRole = assistant ? 'assistant' : 'user'
  const content = item.querySelector<HTMLElement>(
    assistant ? MMD_SELECTORS.aiContent : MMD_SELECTORS.userContent,
  )
  if (!content) return null
  const text = content.innerText || content.textContent || ''
  return {
    item,
    content,
    role,
    nativeIndex,
    fingerprint: messageTargetFingerprint(role, text, content.innerHTML),
  }
}

export function readNativeMessageIdentities(document: Document): NativeMessageIdentity[] | null {
  const items = [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.messageItems)]
  const identities = items.map(readIdentity)
  return identities.every((identity): identity is NativeMessageIdentity => Boolean(identity))
    ? identities
    : null
}

export function isCompatibilityTitle(
  item: HTMLElement | undefined,
  characterName: string,
  hasNativeName: boolean,
): boolean {
  if (!hasNativeName || !item?.matches(MMD_SELECTORS.aiItem)) return false
  const content = item.querySelector<HTMLElement>(MMD_SELECTORS.aiContent)
  const title = normalizeText(content?.innerText || content?.textContent || '')
  return !item.querySelector(MMD_SELECTORS.messageActionScope)
    && Boolean(title)
    && title === normalizeText(characterName)
}

export function filterCompatibilityTitle(
  identities: NativeMessageIdentity[],
  characterName: string,
  hasNativeName: boolean,
): NativeMessageIdentity[] {
  const firstAiIndex = identities.findIndex((identity) => identity.role === 'assistant')
  return isCompatibilityTitle(identities[firstAiIndex]?.item, characterName, hasNativeName)
    ? identities.filter((_identity, index) => index !== firstAiIndex)
    : identities
}

export function expectedMessageFingerprint(message: ChatMessage): string {
  return message.targetFingerprint
    ?? messageTargetFingerprint(message.role, message.text, message.html)
}

function sequenceMatches(
  identities: NativeMessageIdentity[],
  messages: ChatMessage[],
): boolean {
  return identities.length === messages.length && messages.every((message, index) => {
    const identity = identities[index]
    return Boolean(identity)
      && identity!.role === message.role
      && identity!.fingerprint === expectedMessageFingerprint(message)
  })
}

/**
 * Aligns the live native list with the exact list represented by a snapshot.
 * New snapshots carry nativeIndex, so any insertion/removal fails closed. Older
 * serialized ChatMessage objects remain compatible when the unfiltered native
 * list matches their complete ordered role/content sequence exactly.
 */
export function alignNativeMessages(
  document: Document,
  messages: ChatMessage[],
): NativeMessageAlignment {
  const raw = readNativeMessageIdentities(document)
  if (!raw) return { identities: null, reason: '原生消息角色或内容结构不完整' }

  const hasNativePositions = messages.every(
    (message) => Number.isInteger(message.nativeIndex) && message.nativeIndex! >= 0,
  )
  if (hasNativePositions) {
    const nativeIndices = messages.map((message) => message.nativeIndex!)
    const uniqueIndices = new Set(nativeIndices)
    const maxNativeIndex = nativeIndices.reduce((largest, index) => Math.max(largest, index), -1)
    if (uniqueIndices.size !== messages.length || raw.length !== maxNativeIndex + 1) {
      return { identities: null, reason: '原生消息列表数量或快照位置与会话不一致' }
    }
    const aligned = messages.map((message) => raw[message.nativeIndex!])
    if (aligned.some((identity) => !identity) || !sequenceMatches(aligned as NativeMessageIdentity[], messages)) {
      return { identities: null, reason: '原生消息位置、角色或内容指纹与快照不一致' }
    }
    return { identities: aligned as NativeMessageIdentity[] }
  }

  const candidates: NativeMessageIdentity[][] = []
  if (sequenceMatches(raw, messages)) candidates.push(raw)
  return candidates.length === 1
    ? { identities: candidates[0]! }
    : {
        identities: null,
        reason: '原生消息顺序、角色或内容指纹与快照不一致',
      }
}
