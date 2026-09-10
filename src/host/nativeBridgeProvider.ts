import type { NativeBridge } from '../contracts'

/**
 * Global a host page may set before the Host IIFE runs. Either a ready
 * NativeBridge, or a factory that receives the host document and returns one.
 * Lives outside __MMD_HUD_IFRAME_CONFIG__ on purpose: the inline loader
 * overwrites that object with theme/frameScriptSource only.
 */
export const NATIVE_BRIDGE_KEY = '__MMD_HUD_NATIVE_BRIDGE__' as const

export type NativeBridgeProvider = NativeBridge | ((document: Document) => NativeBridge)

const REQUIRED_METHODS = [
  'start',
  'destroy',
  'refresh',
  'getSnapshot',
  'getCapabilities',
  'subscribe',
  'invoke',
  'sendMessage',
] as const

declare global {
  interface Window {
    __MMD_HUD_NATIVE_BRIDGE__?: NativeBridgeProvider
  }
}

function describeMissing(candidate: unknown): string[] {
  if (!candidate || typeof candidate !== 'object') return [...REQUIRED_METHODS]
  const record = candidate as Record<string, unknown>
  return REQUIRED_METHODS.filter((name) => typeof record[name] !== 'function')
}

/**
 * Returns the page-provided bridge, or null when the page provides nothing.
 * A provider that is present but malformed throws: silently falling back to
 * DOM scraping would hide an integration bug behind a HUD that "mostly works".
 */
export function resolveProvidedBridge(target: Window): NativeBridge | null {
  const provider = target[NATIVE_BRIDGE_KEY]
  if (provider === undefined || provider === null) return null
  const candidate = typeof provider === 'function' ? provider(target.document) : provider
  const missing = describeMissing(candidate)
  if (missing.length) {
    throw new Error(`${NATIVE_BRIDGE_KEY} 不是有效的 NativeBridge，缺少：${missing.join(', ')}`)
  }
  return candidate as NativeBridge
}
