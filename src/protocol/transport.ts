import type { ActionResult, BridgeEvent, ChatSnapshot, NativeAction } from '../contracts'

export interface HostTransport {
  readonly snapshot: ChatSnapshot
  connect(): Promise<void>
  subscribe(listener: (event: BridgeEvent) => void): () => void
  invoke<T = unknown>(action: NativeAction, payload?: unknown): Promise<ActionResult<T>>
  refresh(): Promise<void>
  hideHud(): Promise<void>
  destroyHud(): Promise<void>
  disconnect(): void
}
