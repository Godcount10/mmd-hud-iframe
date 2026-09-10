import { ALL_NATIVE_ACTIONS, type NativeAction } from '../contracts'
import { REGISTERED_NATIVE_ACTIONS } from '../bridge/actions/actionRegistry'
import {
  CONNECT_TIMEOUT_MS,
  IFRAME_PROTOCOL_NAME,
  IFRAME_PROTOCOL_VERSION,
  createBootstrapId,
  createChannelId,
  createEmbeddedFrameSrcdoc,
  createFrameSrcdoc,
  encodeFrameBootstrap,
  type HostHandshake,
  type HostClosingReason,
  type HudThemeId,
} from '../protocol'
import { HostSession } from './HostSession'
import type { NativeGateway } from './NativeGateway'

interface FrameControllerOptions {
  frameScriptUrl?: URL
  frameScriptSource?: string
  theme: HudThemeId
  buildId: string
  gateway: NativeGateway
  /** Handler list advertised to the Frame; defaults to the DOM adapter's registry. */
  registeredActions?: readonly NativeAction[]
  onDestroy(): void
}

export class FrameController {
  readonly element: HTMLDivElement
  private readonly iframe: HTMLIFrameElement
  private readonly restoreButton: HTMLButtonElement
  private session: HostSession | null = null
  private detachObserver: MutationObserver | null = null
  private connectTimer = 0
  private bootstrapId = ''
  private destroyed = false

  constructor(private readonly options: FrameControllerOptions) {
    if (!options.frameScriptSource && !options.frameScriptUrl) {
      throw new Error('缺少 Frame 脚本 URL 或内嵌源码')
    }
    this.element = document.createElement('div')
    this.element.id = 'mmd-hud-iframe-host'
    this.element.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none'

    this.iframe = document.createElement('iframe')
    this.iframe.title = 'MMD HUD'
    // setAttribute rather than sandbox.add(): same result, and jsdom (used by the
    // host tests) does not implement the sandbox DOMTokenList.
    this.iframe.setAttribute('sandbox', 'allow-scripts allow-downloads')
    this.iframe.allow = 'clipboard-write'
    this.iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#050a0f;pointer-events:auto'
    this.iframe.addEventListener('load', this.handleLoad)

    this.restoreButton = document.createElement('button')
    this.restoreButton.type = 'button'
    this.restoreButton.textContent = '打开 HUD'
    this.restoreButton.style.cssText = 'display:none;position:absolute;right:12px;bottom:12px;pointer-events:auto;padding:10px 15px;border:1px solid #64748b;border-radius:999px;color:#e2e8f0;background:#0f172a;cursor:pointer'
    this.restoreButton.addEventListener('click', this.show)

    this.element.append(this.iframe, this.restoreButton)
  }

  mount(): void {
    if (this.destroyed) throw new Error('FrameController 已销毁')
    this.navigate()
    document.body.appendChild(this.element)
    this.watchDetach()
  }

  /** True while the host element is still part of the document. */
  isMounted(): boolean {
    return !this.destroyed && this.element.isConnected
  }

  getFrameScriptUrl(): string {
    return this.options.frameScriptUrl?.href ?? 'inline:embedded-frame'
  }

  hide = (): void => {
    if (this.destroyed) return
    this.iframe.style.display = 'none'
    this.restoreButton.style.display = 'block'
  }

  show = (): void => {
    if (this.destroyed) return
    this.iframe.style.display = 'block'
    this.restoreButton.style.display = 'none'
    this.options.gateway.refresh()
  }

  reloadFrame = (): void => {
    if (this.destroyed) return
    this.closeSession('reload')
    this.navigate()
  }

  destroy = (): void => {
    if (this.destroyed) return
    this.destroyed = true
    this.detachObserver?.disconnect()
    this.detachObserver = null
    this.closeSession('destroy')
    this.iframe.removeEventListener('load', this.handleLoad)
    this.restoreButton.removeEventListener('click', this.show)
    this.element.remove()
    this.options.onDestroy()
  }

  close(reason: HostClosingReason): void {
    if (reason === 'destroy') this.destroy()
    else this.closeSession(reason)
  }

  /**
   * Single-page hosts tear the chat view down without a pagehide: the element
   * we appended to body gets removed by the page's own cleanup while the
   * bridge observers, timers and the global instance would otherwise stay
   * alive. Watching our own element lets the host page use plain DOM removal
   * as the teardown signal, no cooperation required.
   */
  private watchDetach(): void {
    if (this.detachObserver || typeof MutationObserver === 'undefined') return
    this.detachObserver = new MutationObserver(() => {
      if (!this.destroyed && !this.element.isConnected) this.destroy()
    })
    this.detachObserver.observe(document.body, { childList: true })
  }

  private navigate(): void {
    this.bootstrapId = createBootstrapId()
    this.iframe.name = encodeFrameBootstrap({
      protocol: 'mmd-hud-iframe-bootstrap',
      buildId: this.options.buildId,
      bootstrapId: this.bootstrapId,
      parentOrigin: window.location.origin,
      theme: this.options.theme,
    })
    this.iframe.srcdoc = this.options.frameScriptSource
      ? createEmbeddedFrameSrcdoc(this.options.frameScriptSource)
      : createFrameSrcdoc(this.options.frameScriptUrl!)
  }

  private handleLoad = (): void => {
    if (this.destroyed) return
    this.closeSession('reload')
    const channelId = createChannelId()
    const channel = new MessageChannel()
    const session = new HostSession(channel.port1, {
      buildId: this.options.buildId,
      bootstrapId: this.bootstrapId,
      channelId,
    }, this.options.gateway, {
      hide: this.hide,
      destroy: this.destroy,
      reloadFrame: this.reloadFrame,
    })
    this.session = session
    session.onReady(() => {
      if (this.session !== session) return
      window.clearTimeout(this.connectTimer)
      this.connectTimer = 0
    })
    session.start()

    const handshake: HostHandshake = {
      type: 'host-handshake',
      protocol: IFRAME_PROTOCOL_NAME,
      protocolVersion: IFRAME_PROTOCOL_VERSION,
      buildId: this.options.buildId,
      bootstrapId: this.bootstrapId,
      channelId,
      theme: this.options.theme,
      knownActions: ALL_NATIVE_ACTIONS,
      registeredActions: this.options.registeredActions ?? REGISTERED_NATIVE_ACTIONS,
    }
    this.iframe.contentWindow?.postMessage(handshake, '*', [channel.port2])
    this.connectTimer = window.setTimeout(() => {
      if (this.session === session) this.closeSession('reload')
    }, CONNECT_TIMEOUT_MS)
  }

  private closeSession(reason: HostClosingReason): void {
    window.clearTimeout(this.connectTimer)
    this.connectTimer = 0
    this.session?.close(reason)
    this.session = null
  }
}
