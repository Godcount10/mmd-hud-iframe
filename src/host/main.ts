import { HostApp, assertFrameScriptUrlAllowed, resolveFrameScriptUrl, resolveTheme, type IframeHostApi, type IframeHostConfig } from './HostApp'

const INSTANCE_KEY = '__MMD_HUD_IFRAME__' as const

declare global {
  interface Window {
    __MMD_HUD_IFRAME__?: IframeHostApi
    __MMD_HUD_IFRAME_CONFIG__?: IframeHostConfig
  }
}

async function boot(): Promise<void> {
  const existing = window[INSTANCE_KEY]
  if (existing) {
    existing.refresh()
    return
  }

  const config = window.__MMD_HUD_IFRAME_CONFIG__
  const frameScriptUrl = resolveFrameScriptUrl(config)
  const theme = resolveTheme(config)
  assertFrameScriptUrlAllowed(frameScriptUrl)

  const app = new HostApp(frameScriptUrl, theme, __MMD_HUD_BUILD_ID__, () => {
    if (window[INSTANCE_KEY] === api) delete window[INSTANCE_KEY]
  })
  const api = app.getApi()
  window[INSTANCE_KEY] = api
  try {
    await app.start()
  } catch (error) {
    app.destroy()
    throw error
  }
}

if (document.body) void boot()
else document.addEventListener('DOMContentLoaded', () => void boot(), { once: true })
