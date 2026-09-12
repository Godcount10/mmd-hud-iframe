import { createApp, h, type App } from 'vue'
import { HUD_CONTEXT_KEY, type HudContext } from '../hud/context'
import { bridgeDebugTheme } from '../hud/themes/bridge-debug'
import { gameTheme } from '../hud/themes/game'
import type { HudThemeDefinition } from '../hud/themes/types'
import { decodeFrameBootstrap, type HudThemeId } from '../protocol'
import { HostClient } from './connection/HostClient'

const bootstrap = decodeFrameBootstrap(window.name)
const themeId: HudThemeId = bootstrap?.theme ?? 'game'

const mountPoint = document.querySelector<HTMLDivElement>('#app')
if (!mountPoint) throw new Error('缺少 iframe HUD 挂载节点')
const appRoot: HTMLDivElement = mountPoint

prepareDocument(themeId)

if (!bootstrap || bootstrap.buildId !== __MMD_HUD_BUILD_ID__) {
  renderConnectionError(bootstrap
    ? `Frame build (${__MMD_HUD_BUILD_ID__}) 与 Host build (${bootstrap.buildId}) 不匹配`
    : '缺少或无法解析 Frame bootstrap，拒绝接受 Host 连接')
} else {
  const client = new HostClient(bootstrap.parentOrigin, bootstrap.bootstrapId, themeId)
  let connected = false
  let app: App | null = null

  const mountTheme = async (host: HostClient): Promise<void> => {
    await host.connect()
    const themes: Record<HudThemeId, HudThemeDefinition> = {
      game: gameTheme,
      'bridge-debug': bridgeDebugTheme,
    }
    const theme = themes[themeId]
    if (theme.styles) {
      const style = document.createElement('style')
      style.dataset.mmdHudTheme = theme.id
      style.textContent = theme.styles
      document.head.appendChild(style)
    }

    const context: HudContext = {
      snapshot: host.snapshot,
      connection: host.connection,
      registeredActions: host.registeredActions,
      invoke: (action, payload) => host.invoke(action, payload),
      invokeDynamic: (action, payload) => host.invokeDynamic(action, payload),
      refresh: () => host.refresh(),
      subscribe: (listener) => host.subscribe(listener),
      hideHud: () => host.hide(),
      destroyHud: () => host.destroyHost(),
    }

    app = createApp(theme.component)
    theme.install?.(app)
    app.provide(HUD_CONTEXT_KEY, context)
    app.mount(appRoot)
  }

  const receiveHandshake = (event: MessageEvent<unknown>): void => {
    if (connected || !client.installHandshake(event)) return
    connected = true
    window.removeEventListener('message', receiveHandshake)
    void mountTheme(client).catch((error) => {
      renderConnectionError(error instanceof Error ? error.message : 'Frame 连接失败')
    })
  }

  window.addEventListener('message', receiveHandshake)
  window.addEventListener('pagehide', () => {
    window.removeEventListener('message', receiveHandshake)
    app?.unmount()
    client.destroy('Frame 页面已卸载')
  }, { once: true })
}

function prepareDocument(theme: HudThemeId): void {
  document.documentElement.dataset.mmdHudTheme = theme
  document.documentElement.style.cssText = 'width:100%;height:100%;background:#050a0f'
  document.body.style.cssText = 'width:100%;height:100%;margin:0;overflow:hidden;background:#050a0f'
}

function renderConnectionError(message: string): void {
  const ErrorView = {
    setup: () => () => h('main', {
      style: 'box-sizing:border-box;display:grid;place-items:center;width:100%;height:100%;padding:24px;background:#050a0f;color:#e2e8f0;font-family:system-ui,sans-serif',
    }, [
      h('section', { style: 'max-width:680px;padding:24px;border:1px solid #7f1d1d;border-radius:16px;background:#180b0f' }, [
        h('p', { style: 'margin:0 0 8px;color:#fb7185;font-size:12px;letter-spacing:.12em' }, 'MMD HUD CONNECTION ERROR'),
        h('h1', { style: 'margin:0 0 12px;font-size:22px' }, '无法连接父页面 Host'),
        h('p', { style: 'margin:0;line-height:1.6;color:#cbd5e1' }, message),
        h('p', { style: 'margin:16px 0 0;color:#94a3b8;font-size:12px' }, `Frame build: ${__MMD_HUD_BUILD_ID__}`),
      ]),
    ]),
  }
  createApp(ErrorView).mount(appRoot)
}
