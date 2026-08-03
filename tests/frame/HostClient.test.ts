import { HostClient } from '../../src/frame/connection/HostClient'
import {
  ALL_NATIVE_ACTIONS,
  type NativeAction,
} from '../../src/contracts'
import {
  IFRAME_PROTOCOL_NAME,
  IFRAME_PROTOCOL_VERSION,
  type HostHandshake,
} from '../../src/protocol'
import { createTestSnapshot } from '../helpers/snapshot'

const identity = {
  buildId: 'test-build',
  bootstrapId: 'bootstrap-test',
  channelId: 'channel-test',
}

function handshake(): HostHandshake {
  return {
    type: 'host-handshake',
    protocol: IFRAME_PROTOCOL_NAME,
    protocolVersion: IFRAME_PROTOCOL_VERSION,
    ...identity,
    theme: 'game',
    knownActions: ALL_NATIVE_ACTIONS,
    registeredActions: ALL_NATIVE_ACTIONS.filter((action: NativeAction) => action !== 'newChat'),
  }
}

function install(client: HostClient, port: MessagePort, origin = 'https://host.example'): boolean {
  return client.installHandshake({
    origin,
    source: window.parent,
    data: handshake(),
    ports: [port],
  } as unknown as MessageEvent<unknown>)
}

describe('HostClient', () => {
  beforeEach(() => {
    vi.stubGlobal('__MMD_HUD_BUILD_ID__', identity.buildId)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts an opaque srcdoc origin after source and bootstrap validation', async () => {
    const channel = new MessageChannel()
    const client = new HostClient('https://host.example', identity.bootstrapId, 'game')
    const connection = client.connect()
    expect(install(client, channel.port2, 'null')).toBe(true)
    client.destroy()
    await expect(connection).rejects.toThrow('Frame client 已销毁')
  })

  it('does not become ready until the first snapshot arrives', async () => {
    const channel = new MessageChannel()
    const client = new HostClient('https://host.example', identity.bootstrapId, 'game')
    channel.port1.start()
    expect(install(client, channel.port2)).toBe(true)
    expect(client.connection.value.status).toBe('waiting-snapshot')

    let connected = false
    void client.connect().then(() => { connected = true })
    await Promise.resolve()
    expect(connected).toBe(false)

    channel.port1.postMessage({
      type: 'snapshot',
      protocolVersion: IFRAME_PROTOCOL_VERSION,
      buildId: identity.buildId,
      channelId: identity.channelId,
      snapshot: createTestSnapshot(2),
    })
    await client.connect()
    expect(client.connection.value.status).toBe('ready')
    expect(client.snapshot.value.revision).toBe(2)
    client.destroy()
  })

  it('associates invoke responses with request id and action', async () => {
    const channel = new MessageChannel()
    const client = new HostClient('https://host.example', identity.bootstrapId, 'game')
    channel.port1.start()
    expect(install(client, channel.port2)).toBe(true)
    channel.port1.postMessage({
      type: 'snapshot',
      protocolVersion: IFRAME_PROTOCOL_VERSION,
      buildId: identity.buildId,
      channelId: identity.channelId,
      snapshot: createTestSnapshot(),
    })
    await client.connect()

    const request = new Promise<any>((resolve) => channel.port1.addEventListener('message', (event) => {
      if (event.data.type === 'invoke') resolve(event.data)
    }, { once: true }))
    const resultPromise = client.invoke('sendMessage', { text: 'hello' })
    const invoke = await request
    channel.port1.postMessage({
      type: 'invoke-result',
      protocolVersion: IFRAME_PROTOCOL_VERSION,
      buildId: identity.buildId,
      channelId: identity.channelId,
      requestId: invoke.requestId,
      action: 'sendMessage',
      result: { ok: true, action: 'sendMessage' },
    })
    await expect(resultPromise).resolves.toEqual({ ok: true, action: 'sendMessage' })
    client.destroy()
  })

  it('ignores stale responses from another channel', async () => {
    const channel = new MessageChannel()
    const client = new HostClient('https://host.example', identity.bootstrapId, 'game')
    channel.port1.start()
    expect(install(client, channel.port2)).toBe(true)
    channel.port1.postMessage({
      type: 'snapshot',
      protocolVersion: IFRAME_PROTOCOL_VERSION,
      buildId: identity.buildId,
      channelId: identity.channelId,
      snapshot: createTestSnapshot(),
    })
    await client.connect()

    const request = new Promise<any>((resolve) => channel.port1.addEventListener('message', (event) => {
      if (event.data.type === 'refresh') resolve(event.data)
    }, { once: true }))
    const refreshPromise = client.refresh()
    const refresh = await request
    channel.port1.postMessage({
      type: 'refresh-result',
      protocolVersion: IFRAME_PROTOCOL_VERSION,
      buildId: identity.buildId,
      channelId: 'stale-channel',
      requestId: refresh.requestId,
      snapshot: createTestSnapshot(99),
    })
    await Promise.resolve()
    expect(client.snapshot.value.revision).toBe(1)

    channel.port1.postMessage({
      type: 'refresh-result',
      protocolVersion: IFRAME_PROTOCOL_VERSION,
      buildId: identity.buildId,
      channelId: identity.channelId,
      requestId: refresh.requestId,
      snapshot: createTestSnapshot(3),
    })
    await expect(refreshPromise).resolves.toMatchObject({ revision: 3 })
    client.destroy()
  })
})
