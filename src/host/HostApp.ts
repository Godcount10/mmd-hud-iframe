import type { ChatSnapshot } from '../contracts'
import { MmdNativeBridge } from '../bridge/MmdNativeBridge'
import { isHudThemeId, type HudThemeId } from '../protocol'
import { FrameController } from './FrameController'

export interface IframeHostConfig {
  frameScriptUrl?: string
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
}

export class HostApp {
  private readonly bridge: MmdNativeBridge
  private readonly frame: FrameController
  private destroyed = false

  constructor(
    private readonly frameScriptUrl: URL,
    private readonly theme: HudThemeId,
    private readonly buildId: string,
    private readonly onDestroy: () => void,
  ) {
    this.bridge = new MmdNativeBridge(document)
    this.frame = new FrameController({
      frameScriptUrl,
      theme,
      buildId,
      gateway: this.bridge,
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

export function resolveFrameScriptUrl(config: IframeHostConfig | undefined): URL {
  if (config?.frameScriptUrl) return new URL(config.frameScriptUrl, window.location.href)
  const script = document.currentScript
  if (!(script instanceof HTMLScriptElement) || !script.src) {
    throw new Error('无法推导 Frame 脚本 URL；请设置 window.__MMD_HUD_IFRAME_CONFIG__.frameScriptUrl')
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
  if (frameScriptUrl.protocol === 'https:' || localDevelopment) return
  throw new Error('Frame 脚本必须使用 HTTPS；本地开发仅允许 loopback HTTP')
}
