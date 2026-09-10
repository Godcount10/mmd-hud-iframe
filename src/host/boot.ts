import { HostApp, assertFrameScriptUrlAllowed, resolveFrameScriptUrl, resolveTheme, type IframeHostApi, type IframeHostConfig } from './HostApp'

export { NATIVE_BRIDGE_KEY } from './nativeBridgeProvider'

export const HOST_INSTANCE_KEY = '__MMD_HUD_IFRAME__' as const

declare global {
  interface Window {
    __MMD_HUD_IFRAME__?: IframeHostApi
    __MMD_HUD_IFRAME_CONFIG__?: IframeHostConfig
  }
}

/**
 * Idempotent entry point. Re-running the loader while an instance is alive
 * only refreshes it. An instance whose element the page already removed is
 * stale (single-page navigation without pagehide); it is destroyed and a
 * fresh one is booted so the HUD comes back when the chat view is re-entered.
 */
export async function bootHost(buildId: string): Promise<IframeHostApi | undefined> {
  const existing = window[HOST_INSTANCE_KEY]
  if (existing) {
    if (existing.isMounted()) {
      existing.refresh()
      return existing
    }
    existing.destroy()
  }

  const config = window.__MMD_HUD_IFRAME_CONFIG__
  const frameScriptUrl = resolveFrameScriptUrl(config)
  const theme = resolveTheme(config)
  if (frameScriptUrl) assertFrameScriptUrlAllowed(frameScriptUrl)

  const app = new HostApp(frameScriptUrl, config?.frameScriptSource, theme, buildId, () => {
    if (window[HOST_INSTANCE_KEY] === api) delete window[HOST_INSTANCE_KEY]
  })
  const api = app.getApi()
  window[HOST_INSTANCE_KEY] = api
  try {
    await app.start()
  } catch (error) {
    app.destroy()
    throw error
  }
  return api
}
