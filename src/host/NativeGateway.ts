import type { ActionResult, BridgeEvent, ChatSnapshot, NativeAction } from '../contracts'

export interface NativeGateway {
  getSnapshot(): ChatSnapshot
  refresh(): void
  subscribe(listener: (event: BridgeEvent) => void): () => void
  invoke<T = unknown>(action: NativeAction, payload?: unknown): Promise<ActionResult<T>>
}
