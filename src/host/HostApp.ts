import type { ChatSnapshot, NativeBridge } from '../contracts'
import { MmdNativeBridge } from '../bridge/MmdNativeBridge'
import { isHudThemeId, type HudThemeId } from '../protocol'
import { FrameController } from './FrameController'
import { resolveProvidedBridge } from './nativeBridgeProvider'

export interface IframeHostConfig {
  frameScriptUrl?: string
  frameScriptSource?: string
  theme?: HudThemeId
}

export interface IframeHostApi {
  getSnapshot(): ChatSnapshot
  getThemeId(): HudThemeId
  getFrameScriptUrl(): string
  refresh(): void
  hide(): void
  show(): void
  reloadFrame(): void
  destroy(): void
  /** False once the page removed the host element; boot() replaces such an instance. */
  isMounted(): boolean
}

export class HostApp {
  private readonly bridge: NativeBridge
  private readonly frame: FrameController
  private destroyed = false

  constructor(
    private readonly frameScriptUrl: URL | undefined,
    private readonly frameScriptSource: string | undefined,
    private readonly theme: HudThemeId,
    private readonly buildId: string,
    private readonly onDestroy: () => void,
  ) {
    // A host page that already owns an application-level state model can hand
    // us a bridge built on it; DOM scraping is only the fallback for pages
    // that expose nothing.
    this.bridge = resolveProvidedBridge(window) ?? new MmdNativeBridge(document)
    this.frame = new FrameController({
      frameScriptUrl,
      frameScriptSource,
      theme,
      buildId,
      gateway: this.bridge,
      registeredActions: this.bridge.getRegisteredActions?.(),
      onDestroy: () => this.destroyFromFrame(),
    })
  }

  async start(): Promise<void> {
    await this.bridge.start()
    this.frame.mount()
    window.addEventListener('pagehide', this.handlePageHide, { once: true })
  }

  getApi(): IframeHostApi {
    return {
      getSnapshot: () => this.bridge.getSnapshot(),
      getThemeId: () => this.theme,
      getFrameScriptUrl: () => this.frame.getFrameScriptUrl(),
      refresh: () => this.bridge.refresh(),
      hide: this.frame.hide,
      show: this.frame.show,
      reloadFrame: this.frame.reloadFrame,
      destroy: this.destroy,
      isMounted: () => this.frame.isMounted(),
    }
  }

  destroy = (): void => {
    if (this.destroyed) return
    this.destroyed = true
    window.removeEventListener('pagehide', this.handlePageHide)
    this.frame.destroy()
    this.bridge.destroy()
    this.onDestroy()
  }

  private destroyFromFrame(): void {
    if (this.destroyed) return
    this.destroyed = true
    window.removeEventListener('pagehide', this.handlePageHide)
    this.bridge.destroy()
    this.onDestroy()
  }

  private handlePageHide = (): void => {
    this.destroy()
  }
}

export function resolveFrameScriptUrl(config: IframeHostConfig | undefined): URL | undefined {
  if (config?.frameScriptSource) return undefined
  if (config?.frameScriptUrl) return new URL(config.frameScriptUrl, window.location.href)
  const script = document.currentScript
  if (!(script instanceof HTMLScriptElement) || !script.src) {
    throw new Error('无法推导 Frame 脚本 URL；请设置 frameScriptUrl 或 frameScriptSource')
  }
  return new URL('../frame/mmd-hud-iframe-frame.js', script.src)
}

export function resolveTheme(config: IframeHostConfig | undefined): HudThemeId {
  return isHudThemeId(config?.theme) ? config.theme : 'game'
}

export function assertFrameScriptUrlAllowed(frameScriptUrl: URL): void {
  const localDevelopment = import.meta.env.DEV
    && frameScriptUrl.protocol === 'http:'
    && (frameScriptUrl.hostname === '127.0.0.1' || frameScriptUrl.hostname === 'localhost')
  if (frameScriptUrl.protocol === 'https:' || frameScriptUrl.protocol === 'blob:' || localDevelopment) return
  throw new Error('Frame 脚本必须使用 HTTPS；本地开发仅允许 loopback HTTP')
}
