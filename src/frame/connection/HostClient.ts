import { shallowReadonly, shallowRef, type Ref } from 'vue'
import type {
  ActionResult,
  BridgeEvent,
  ChatSnapshot,
  NativeAction,
  NativeActionPayload,
} from '../../contracts'
import {
  CONNECT_TIMEOUT_MS,
  DEFAULT_RPC_TIMEOUT_MS,
  IFRAME_PROTOCOL_VERSION,
  createRequestId,
  decodeHostHandshake,
  decodeHostToFrameMessage,
  type FrameToHostMessage,
  type HostHandshake,
  type HostToFrameMessage,
  type HudControlCommand,
  type InvokeRequest,
  type InvokeRequestFor,
  type ResponseType,
  toWireValue,
} from '../../protocol'
import { createDisconnectedSnapshot } from '../state/createDisconnectedSnapshot'

export type HostConnectionStatus = 'waiting-handshake' | 'waiting-snapshot' | 'ready' | 'closing' | 'disconnected' | 'error'

export interface HostConnectionState {
  status: HostConnectionStatus
  error: string | null
}

interface PendingRequest {
  expectedType: ResponseType
  action?: NativeAction
  command?: HudControlCommand
  resolve(value: unknown): void
  reject(error: Error): void
  timer: number
}

export class HostClient {
  private readonly snapshotRef = shallowRef<ChatSnapshot>(createDisconnectedSnapshot())
  private readonly connectionRef = shallowRef<HostConnectionState>({ status: 'waiting-handshake', error: null })
  private readonly registeredActionsRef = shallowRef<readonly NativeAction[]>([])
  private readonly listeners = new Set<(event: BridgeEvent) => void>()
  private readonly pending = new Map<string, PendingRequest>()
  private port: MessagePort | null = null
  private handshake: HostHandshake | null = null
  private connectTimer = 0
  private readyPromise: Promise<void>
  private resolveReady!: () => void
  private rejectReady!: (error: Error) => void
  private destroyed = false

  readonly snapshot: Readonly<Ref<ChatSnapshot>> = shallowReadonly(this.snapshotRef)
  readonly connection: Readonly<Ref<HostConnectionState>> = shallowReadonly(this.connectionRef)
  // The actions the connected Host actually has a handler for, taken from the
  // handshake. A host-provided bridge reports its own set here, so debug tooling
  // reflects that bridge instead of the built-in DOM adapter's static registry.
  readonly registeredActions: Readonly<Ref<readonly NativeAction[]>> = shallowReadonly(this.registeredActionsRef)

  constructor(
    private readonly expectedParentOrigin: string,
    private readonly expectedBootstrapId: string,
    private readonly expectedTheme: HostHandshake['theme'],
  ) {
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.connectTimer = window.setTimeout(() => {
      this.failConnection('等待 Host 握手超时')
    }, CONNECT_TIMEOUT_MS)
  }

  installHandshake(event: MessageEvent<unknown>): boolean {
    if (this.destroyed || this.port || event.source !== window.parent) return false
    if (event.origin !== this.expectedParentOrigin && event.origin !== 'null') return false
    const decoded = decodeHostHandshake(event.data)
    if (!decoded.ok) return false
    const handshake = decoded.value
    if (handshake.buildId !== __MMD_HUD_BUILD_ID__
      || handshake.bootstrapId !== this.expectedBootstrapId
      || handshake.theme !== this.expectedTheme
      || event.ports.length !== 1) return false
    const nextPort = event.ports[0]
    if (!nextPort) return false

    window.clearTimeout(this.connectTimer)
    this.handshake = handshake
    this.registeredActionsRef.value = handshake.registeredActions
    this.port = nextPort
    this.connectionRef.value = { status: 'waiting-snapshot', error: null }
    this.port.onmessage = (portEvent: MessageEvent<unknown>) => this.handleHostMessage(portEvent.data)
    this.port.onmessageerror = () => this.failConnection('Host MessagePort 数据错误')
    this.port.start()
    this.post({
      type: 'frame-ready',
      ...this.channelFields(),
      bootstrapId: this.expectedBootstrapId,
    })
    this.connectTimer = window.setTimeout(() => this.failConnection('等待 Host 初始快照超时'), CONNECT_TIMEOUT_MS)
    return true
  }

  connect(): Promise<void> {
    return this.readyPromise
  }

  subscribe(listener: (event: BridgeEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  refresh(): Promise<ChatSnapshot> {
    const requestId = createRequestId('refresh')
    return this.request<ChatSnapshot>({ type: 'refresh', ...this.channelFields(), requestId }, {
      expectedType: 'refresh-result',
    })
  }

  invoke<A extends NativeAction, T = unknown>(action: A, payload?: NativeActionPayload<A>): Promise<ActionResult<T>> {
    return this.sendInvoke<A, T>(action, payload)
  }

  invokeDynamic<T = unknown>(action: NativeAction, payload?: unknown): Promise<ActionResult<T>> {
    return this.sendInvoke(action, payload as NativeActionPayload<NativeAction>)
  }

  hide(): Promise<void> {
    return this.control('hide')
  }

  destroyHost(): Promise<void> {
    return this.control('destroy')
  }

  reloadFrame(): Promise<void> {
    return this.control('reload-frame')
  }

  destroy(reason = 'Frame client 已销毁'): void {
    if (this.destroyed) return
    this.destroyed = true
    window.clearTimeout(this.connectTimer)
    this.port?.close()
    this.port = null
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer)
      pending.reject(new Error(reason))
    }
    this.pending.clear()
    this.listeners.clear()
    if (this.connectionRef.value.status !== 'error') {
      this.connectionRef.value = { status: 'disconnected', error: reason }
      this.rejectReady(new Error(reason))
    }
  }

  private sendInvoke<A extends NativeAction, T>(action: A, payload?: NativeActionPayload<A>): Promise<ActionResult<T>> {
    const requestId = createRequestId('invoke')
    const request = {
      type: 'invoke',
      ...this.channelFields(),
      requestId,
      action,
      ...(payload === undefined ? {} : { payload }),
    } as InvokeRequestFor<A>
    return this.request<ActionResult<T>>(request as InvokeRequest, { expectedType: 'invoke-result', action })
  }

  private control(command: HudControlCommand): Promise<void> {
    const requestId = createRequestId(command)
    return this.request<void>({ type: 'hud-control', ...this.channelFields(), requestId, command }, {
      expectedType: 'hud-control-result',
      command,
    })
  }

  private handleHostMessage(value: unknown): void {
    const decoded = decodeHostToFrameMessage(value)
    if (!decoded.ok) {
      this.failConnection(decoded.error)
      return
    }
    const message = decoded.value
    if (!this.handshake
      || message.buildId !== this.handshake.buildId
      || message.channelId !== this.handshake.channelId) return

    if (message.type === 'snapshot') {
      this.snapshotRef.value = message.snapshot
      if (this.connectionRef.value.status === 'waiting-snapshot') {
        window.clearTimeout(this.connectTimer)
        this.connectionRef.value = { status: 'ready', error: null }
        this.resolveReady()
      }
      return
    }
    if (message.type === 'bridge-event') {
      if ('snapshot' in message.event) this.snapshotRef.value = message.event.snapshot
      for (const listener of this.listeners) listener(message.event)
      return
    }
    if (message.type === 'host-closing') {
      this.connectionRef.value = { status: 'closing', error: null }
      this.destroy(`Host 正在关闭：${message.reason}`)
      return
    }
    if (message.type === 'connection-error') {
      this.failConnection(message.message)
      return
    }
    this.resolvePending(message)
  }

  private resolvePending(message: Extract<HostToFrameMessage, { requestId: string }>): void {
    const pending = this.pending.get(message.requestId)
    if (!pending) return
    if (message.type === 'request-failure') {
      this.finishPending(message.requestId)
      pending.reject(new Error(`[${message.code}] ${message.message}`))
      return
    }
    if (message.type !== pending.expectedType) return
    if (message.type === 'invoke-result') {
      if (pending.action !== message.action) return
      this.finishPending(message.requestId)
      pending.resolve(message.result)
    } else if (message.type === 'refresh-result') {
      this.snapshotRef.value = message.snapshot
      this.finishPending(message.requestId)
      pending.resolve(message.snapshot)
    } else if (message.type === 'hud-control-result' && pending.command === message.command) {
      this.finishPending(message.requestId)
      pending.resolve(undefined)
    }
  }

  private async request<T>(message: Exclude<FrameToHostMessage, { type: 'frame-ready' | 'cancel-request' }>, metadata: Pick<PendingRequest, 'expectedType' | 'action' | 'command'>): Promise<T> {
    await this.connect()
    if (!this.port || !this.handshake || this.destroyed) throw new Error('Host client 未连接')
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(message.requestId)
        this.post({ type: 'cancel-request', ...this.channelFields(), targetRequestId: message.requestId })
        reject(new Error(`Host 请求超时：${message.type}`))
      }, DEFAULT_RPC_TIMEOUT_MS)
      this.pending.set(message.requestId, {
        ...metadata,
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      })
      this.post(message)
    })
  }

  private finishPending(requestId: string): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    window.clearTimeout(pending.timer)
    this.pending.delete(requestId)
  }

  private channelFields(): {
    protocolVersion: typeof IFRAME_PROTOCOL_VERSION
    buildId: string
    channelId: string
  } {
    return {
      protocolVersion: IFRAME_PROTOCOL_VERSION,
      buildId: this.handshake?.buildId ?? __MMD_HUD_BUILD_ID__,
      channelId: this.handshake?.channelId ?? 'unconnected',
    }
  }

  private post(message: FrameToHostMessage): void {
    if (!this.port || this.destroyed) return
    this.port.postMessage(toWireValue(message))
  }

  private failConnection(message: string): void {
    if (this.destroyed) return
    window.clearTimeout(this.connectTimer)
    this.connectionRef.value = { status: 'error', error: message }
    this.rejectReady(new Error(message))
    this.destroyed = true
    this.port?.close()
    this.port = null
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer)
      pending.reject(new Error(message))
    }
    this.pending.clear()
  }
}
