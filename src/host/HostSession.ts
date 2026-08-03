import type { BridgeEvent, NativeAction } from '../contracts'
import {
  HOST_REQUEST_TIMEOUT_MS,
  IFRAME_PROTOCOL_VERSION,
  decodeFrameToHostMessage,
  type FrameToHostMessage,
  type HostClosingReason,
  type HostToFrameMessage,
  type HudControlCommand,
  type ProtocolErrorCode,
  toWireValue,
} from '../protocol'
import type { NativeGateway } from './NativeGateway'

interface HostSessionIdentity {
  buildId: string
  bootstrapId: string
  channelId: string
}

interface HostSessionControls {
  hide(): void
  destroy(): void
  reloadFrame(): void
}

interface InFlightRequest {
  controller: AbortController
  timer: number
}

export class HostSession {
  private readonly inFlight = new Map<string, InFlightRequest>()
  private readonly completed = new Set<string>()
  private unsubscribe: (() => void) | null = null
  private onReadyListener: (() => void) | null = null
  private ready = false
  private closed = false

  constructor(
    private readonly port: MessagePort,
    private readonly identity: HostSessionIdentity,
    private readonly gateway: NativeGateway,
    private readonly controls: HostSessionControls,
  ) {}

  start(): void {
    this.port.onmessage = (event: MessageEvent<unknown>) => this.receive(event.data)
    this.port.onmessageerror = () => this.close('reload')
    this.port.start()
  }

  onReady(listener: () => void): void {
    this.onReadyListener = listener
  }

  close(reason: HostClosingReason): void {
    if (this.closed) return
    this.send({ type: 'host-closing', ...this.channelFields(), reason })
    this.closed = true
    this.unsubscribe?.()
    this.unsubscribe = null
    this.onReadyListener = null
    for (const request of this.inFlight.values()) {
      window.clearTimeout(request.timer)
      request.controller.abort()
    }
    this.inFlight.clear()
    this.completed.clear()
    this.port.onmessage = null
    this.port.onmessageerror = null
    this.port.close()
  }

  private receive(value: unknown): void {
    if (this.closed) return
    const decoded = decodeFrameToHostMessage(value)
    if (!decoded.ok) {
      if (decoded.requestId) this.fail(decoded.requestId, 'INVALID_MESSAGE', decoded.error)
      return
    }
    const message = decoded.value
    if (message.buildId !== this.identity.buildId) {
      this.rejectForIdentity(message, 'BUILD_MISMATCH', 'Host 与 Frame build ID 不匹配')
      return
    }
    if (message.channelId !== this.identity.channelId) {
      this.rejectForIdentity(message, 'CHANNEL_MISMATCH', '请求不属于当前 iframe channel')
      return
    }

    if (message.type === 'frame-ready') {
      this.acceptReady(message)
      return
    }
    if (!this.ready) {
      if ('requestId' in message) this.fail(message.requestId, 'INVALID_MESSAGE', 'Frame 尚未完成握手')
      return
    }
    if (message.type === 'cancel-request') {
      this.cancel(message.targetRequestId)
      return
    }
    void this.handleRequest(message)
  }

  private acceptReady(message: Extract<FrameToHostMessage, { type: 'frame-ready' }>): void {
    if (this.ready || message.bootstrapId !== this.identity.bootstrapId) {
      this.send({
        type: 'connection-error',
        ...this.channelFields(),
        code: 'CHANNEL_MISMATCH',
        message: 'Frame bootstrap ID 无效或握手重复',
      })
      this.close('reload')
      return
    }
    this.ready = true
    this.onReadyListener?.()
    this.onReadyListener = null
    this.unsubscribe = this.gateway.subscribe((event: BridgeEvent) => {
      if (!this.closed) this.send({ type: 'bridge-event', ...this.channelFields(), event })
    })
    this.send({ type: 'snapshot', ...this.channelFields(), snapshot: this.gateway.getSnapshot() })
  }

  private async handleRequest(message: Exclude<FrameToHostMessage, { type: 'frame-ready' | 'cancel-request' }>): Promise<void> {
    if (this.inFlight.has(message.requestId) || this.completed.has(message.requestId)) {
      this.fail(message.requestId, 'DUPLICATE_REQUEST_ID', 'requestId 已被当前 channel 使用')
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      controller.abort()
      this.inFlight.delete(message.requestId)
      this.rememberCompleted(message.requestId)
      this.fail(message.requestId, 'TIMEOUT', `Host 请求超时：${message.type}`)
    }, HOST_REQUEST_TIMEOUT_MS)
    this.inFlight.set(message.requestId, { controller, timer })

    try {
      if (message.type === 'invoke') {
        const result = await this.gateway.invoke(message.action as NativeAction, message.payload)
        if (!this.canReply(message.requestId, controller)) return
        this.send({
          type: 'invoke-result',
          ...this.channelFields(),
          requestId: message.requestId,
          action: message.action,
          result,
        })
      } else if (message.type === 'refresh') {
        this.gateway.refresh()
        if (!this.canReply(message.requestId, controller)) return
        this.send({
          type: 'refresh-result',
          ...this.channelFields(),
          requestId: message.requestId,
          snapshot: this.gateway.getSnapshot(),
        })
      } else {
        await this.handleControl(message.requestId, message.command, controller)
      }
    } catch (error) {
      if (this.canReply(message.requestId, controller)) {
        this.fail(message.requestId, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Host 请求执行失败')
      }
    } finally {
      const current = this.inFlight.get(message.requestId)
      if (current?.controller === controller) {
        window.clearTimeout(current.timer)
        this.inFlight.delete(message.requestId)
        this.rememberCompleted(message.requestId)
      }
    }
  }

  private async handleControl(requestId: string, command: HudControlCommand, controller: AbortController): Promise<void> {
    if (!this.canReply(requestId, controller)) return
    this.send({ type: 'hud-control-result', ...this.channelFields(), requestId, command })
    await Promise.resolve()
    if (this.closed || controller.signal.aborted) return
    if (command === 'hide') this.controls.hide()
    else if (command === 'destroy') this.controls.destroy()
    else this.controls.reloadFrame()
  }

  private cancel(requestId: string): void {
    const request = this.inFlight.get(requestId)
    if (!request) return
    window.clearTimeout(request.timer)
    request.controller.abort()
    this.inFlight.delete(requestId)
    this.rememberCompleted(requestId)
    this.fail(requestId, 'REQUEST_CANCELLED', 'Frame 已取消该请求')
  }

  private canReply(requestId: string, controller: AbortController): boolean {
    return !this.closed
      && !controller.signal.aborted
      && this.inFlight.get(requestId)?.controller === controller
  }

  private rejectForIdentity(message: FrameToHostMessage, code: 'BUILD_MISMATCH' | 'CHANNEL_MISMATCH', text: string): void {
    if ('requestId' in message) this.fail(message.requestId, code, text)
    else this.send({ type: 'connection-error', ...this.channelFields(), code, message: text })
  }

  private fail(requestId: string, code: ProtocolErrorCode, message: string): void {
    this.send({ type: 'request-failure', ...this.channelFields(), requestId, code, message })
  }

  private rememberCompleted(requestId: string): void {
    this.completed.add(requestId)
    if (this.completed.size <= 256) return
    const oldest = this.completed.values().next().value
    if (oldest) this.completed.delete(oldest)
  }

  private channelFields(): {
    protocolVersion: typeof IFRAME_PROTOCOL_VERSION
    buildId: string
    channelId: string
  } {
    return {
      protocolVersion: IFRAME_PROTOCOL_VERSION,
      buildId: this.identity.buildId,
      channelId: this.identity.channelId,
    }
  }

  private send(message: HostToFrameMessage): void {
    if (!this.closed) this.port.postMessage(toWireValue(message))
  }
}
