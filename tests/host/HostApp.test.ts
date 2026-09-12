import type { ActionResult, BridgeEvent, ChatSnapshot, NativeAction, NativeBridge } from '../../src/contracts'
import { HostApp } from '../../src/host/HostApp'
import { bootHost, HOST_INSTANCE_KEY, NATIVE_BRIDGE_KEY } from '../../src/host/boot'
import { createTestSnapshot } from '../helpers/snapshot'

function createFakeBridge(): NativeBridge & { calls: string[] } {
  const calls: string[] = []
  const snapshot = createTestSnapshot(7)
  return {
    calls,
    async start() { calls.push('start') },
    destroy() { calls.push('destroy') },
    refresh() { calls.push('refresh') },
    getSnapshot: () => snapshot,
    getCapabilities: () => snapshot.capabilities,
    subscribe: (_listener: (event: BridgeEvent) => void) => () => {},
    async invoke<T>(action: NativeAction): Promise<ActionResult<T>> { return { ok: true, action } },
    async sendMessage(): Promise<ActionResult> { return { ok: true, action: 'sendMessage' } },
    getRegisteredActions: () => ['sendMessage', 'stopGeneration'] as const,
  }
}

function createApp(onDestroy = () => {}) {
  return new HostApp(undefined, 'console.log("frame")', 'game', 'test-build', onDestroy)
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('HostApp with a host-provided bridge', () => {
  afterEach(() => {
    delete (window as any)[NATIVE_BRIDGE_KEY]
    delete (window as any)[HOST_INSTANCE_KEY]
    document.body.innerHTML = ''
  })

  it('uses the bridge object the page provides instead of scraping the DOM', async () => {
    const fake = createFakeBridge()
    ;(window as any)[NATIVE_BRIDGE_KEY] = fake
    const app = createApp()
    await app.start()
    expect(fake.calls).toContain('start')
    expect(app.getApi().getSnapshot().revision).toBe(7)
    app.destroy()
    expect(fake.calls).toContain('destroy')
  })

  it('accepts a factory and hands it the host document', async () => {
    const fake = createFakeBridge()
    const factory = vi.fn((doc: Document) => { expect(doc).toBe(document); return fake })
    ;(window as any)[NATIVE_BRIDGE_KEY] = factory
    const app = createApp()
    await app.start()
    expect(factory).toHaveBeenCalledTimes(1)
    expect(app.getApi().getSnapshot().revision).toBe(7)
    app.destroy()
  })

  it('fails closed on a malformed provider instead of silently scraping the DOM', () => {
    ;(window as any)[NATIVE_BRIDGE_KEY] = { getSnapshot: () => createTestSnapshot() }
    expect(() => createApp()).toThrow()
  })

  it('reports whether its element is still in the document', async () => {
    ;(window as any)[NATIVE_BRIDGE_KEY] = createFakeBridge()
    const app = createApp()
    await app.start()
    expect(app.getApi().isMounted()).toBe(true)
    document.getElementById('mmd-hud-iframe-host')!.remove()
    expect(app.getApi().isMounted()).toBe(false)
    app.destroy()
  })

  it('destroys itself once when the host page removes its element', async () => {
    const fake = createFakeBridge()
    ;(window as any)[NATIVE_BRIDGE_KEY] = fake
    const onDestroy = vi.fn()
    const app = createApp(onDestroy)
    await app.start()
    document.getElementById('mmd-hud-iframe-host')!.remove()
    await flush()
    expect(onDestroy).toHaveBeenCalledTimes(1)
    expect(fake.calls.filter((call) => call === 'destroy')).toHaveLength(1)
    // a second explicit destroy is a no-op
    app.destroy()
    expect(onDestroy).toHaveBeenCalledTimes(1)
  })
})

describe('bootHost', () => {
  afterEach(() => {
    delete (window as any)[NATIVE_BRIDGE_KEY]
    delete (window as any)[HOST_INSTANCE_KEY]
    delete (window as any).__MMD_HUD_IFRAME_CONFIG__
    document.body.innerHTML = ''
  })

  it('creates one instance and only refreshes it while it is still mounted', async () => {
    ;(window as any)[NATIVE_BRIDGE_KEY] = createFakeBridge()
    ;(window as any).__MMD_HUD_IFRAME_CONFIG__ = { frameScriptSource: 'x', theme: 'game' }
    const first = await bootHost('test-build')
    const second = await bootHost('test-build')
    expect(second).toBe(first)
    expect(document.querySelectorAll('#mmd-hud-iframe-host')).toHaveLength(1)
    first!.destroy()
  })

  it('replaces a stale instance whose element was removed by the page', async () => {
    const fake = createFakeBridge()
    ;(window as any)[NATIVE_BRIDGE_KEY] = fake
    ;(window as any).__MMD_HUD_IFRAME_CONFIG__ = { frameScriptSource: 'x', theme: 'game' }
    const first = await bootHost('test-build')
    document.getElementById('mmd-hud-iframe-host')!.remove()
    const second = await bootHost('test-build')
    expect(second).not.toBe(first)
    expect(document.querySelectorAll('#mmd-hud-iframe-host')).toHaveLength(1)
    expect((window as any)[HOST_INSTANCE_KEY]).toBe(second)
    second!.destroy()
  })
})
