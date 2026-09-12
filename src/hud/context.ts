import { inject, type InjectionKey, type Ref } from 'vue'
import type {
  ActionResult,
  BridgeEvent,
  ChatSnapshot,
  NativeAction,
  NativeActionPayload,
} from '../contracts'

export interface HudConnectionState {
  status: 'waiting-handshake' | 'waiting-snapshot' | 'ready' | 'closing' | 'disconnected' | 'error'
  error: string | null
}

export interface HudContext {
  snapshot: Readonly<Ref<ChatSnapshot>>
  connection: Readonly<Ref<HudConnectionState>>
  /** Actions the connected Host reported a handler for (from the handshake). */
  registeredActions: Readonly<Ref<readonly NativeAction[]>>
  invoke<A extends NativeAction, T = unknown>(action: A, payload?: NativeActionPayload<A>): Promise<ActionResult<T>>
  invokeDynamic<T = unknown>(action: NativeAction, payload?: unknown): Promise<ActionResult<T>>
  refresh(): Promise<ChatSnapshot>
  subscribe(listener: (event: BridgeEvent) => void): () => void
  hideHud(): Promise<void>
  destroyHud(): Promise<void>
}

export const HUD_CONTEXT_KEY: InjectionKey<HudContext> = Symbol('mmd-hud-context')

export function useHudContext(): HudContext {
  const context = inject(HUD_CONTEXT_KEY)
  if (!context) throw new Error('HUD context 尚未提供')
  return context
}
