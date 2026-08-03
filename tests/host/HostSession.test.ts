import type { ActionResult, BridgeEvent, NativeAction } from '../../src/contracts'
import { HostSession } from '../../src/host/HostSession'
import type { NativeGateway } from '../../src/host/NativeGateway'
import { IFRAME_PROTOCOL_VERSION } from '../../src/protocol'
import { createTestSnapshot } from '../helpers/snapshot'

const identity = {
  buildId: 'test-build',
  bootstrapId: 'bootstrap-test',
  channelId: 'channel-test',
}

function readyMessage() {
  return {
    type: 'frame-ready' as const,
    protocolVersion: IFRAME_PROTOCOL_VERSION,
    buildId: identity.buildId,
    bootstrapId: identity.bootstrapId,
    channelId: identity.channelId,
  }
}

async function waitForMessage(port: MessagePort): Promise<unknown> {
  return new Promise((resolve) => port.addEventListener('message', (event) => resolve(event.data), { once: true }))
}

describe('HostSession', () => {
  it('sends the initial snapshot only after a valid ready message', async () => {
    const channel = new MessageChannel()
    const gateway = createGateway()
    const session = new HostSession(channel.port1, identity, gateway, controls())
    session.start()
    channel.port2.start()

    const initial = waitForMessage(channel.port2)
    channel.port2.postMessage(readyMessage())
    await expect(initial).resolves.toMatchObject({
      type: 'snapshot',
      channelId: identity.channelId,
      snapshot: { revision: 1 },
    })
    session.close('destroy')
  })

  it('returns invoke results with the originating action and request id', async () => {
    const channel = new MessageChannel()
    const gateway = createGateway()
    const session = new HostSession(channel.port1, identity, gateway, controls())
    session.start()
    channel.port2.start()
    channel.port2.postMessage(readyMessage())
    await waitForMessage(channel.port2)

    const result = waitForMessage(channel.port2)
    channel.port2.postMessage({
      type: 'invoke',
      protocolVersion: IFRAME_PROTOCOL_VERSION,
      buildId: identity.buildId,
      channelId: identity.channelId,
      requestId: 'invoke-1',
      action: 'sendMessage',
      payload: { text: 'hello' },
    })
    await expect(result).resolves.toMatchObject({
      type: 'invoke-result',
      requestId: 'invoke-1',
      action: 'sendMessage',
      result: { ok: true, action: 'sendMessage' },
    })
    session.close('destroy')
  })

  it('fails duplicate request ids deterministically', async () => {
    let resolveInvoke!: (value: ActionResult) => void
    const gateway = createGateway()
    gateway.invoke = <T = unknown>() => new Promise<ActionResult<T>>((resolve) => {
      resolveInvoke = resolve as (value: ActionResult) => void
    })
    const channel = new MessageChannel()
    const session = new HostSession(channel.port1, identity, gateway, controls())
    session.start()
    channel.port2.start()
    channel.port2.postMessage(readyMessage())
    await waitForMessage(channel.port2)

    const request = {
      type: 'invoke',
      protocolVersion: IFRAME_PROTOCOL_VERSION,
      buildId: identity.buildId,
      channelId: identity.channelId,
      requestId: 'same-id',
      action: 'sendMessage',
      payload: { text: 'hello' },
    }
    channel.port2.postMessage(request)
    const duplicate = waitForMessage(channel.port2)
    channel.port2.postMessage(request)
    await expect(duplicate).resolves.toMatchObject({
      type: 'request-failure',
      requestId: 'same-id',
      code: 'DUPLICATE_REQUEST_ID',
    })
    resolveInvoke({ ok: true, action: 'sendMessage' })
    session.close('destroy')
  })
})

function createGateway(): NativeGateway {
  const listeners = new Set<(event: BridgeEvent) => void>()
  return {
    getSnapshot: () => createTestSnapshot(),
    refresh: () => undefined,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    invoke: async <T = unknown>(action: NativeAction): Promise<ActionResult<T>> => ({
      ok: true,
      action,
    }),
  }
}

function controls() {
  return {
    hide: vi.fn(),
    destroy: vi.fn(),
    reloadFrame: vi.fn(),
  }
}
