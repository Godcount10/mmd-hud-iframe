import { ALL_NATIVE_ACTIONS } from '../../src/contracts'
import {
  IFRAME_PROTOCOL_NAME,
  IFRAME_PROTOCOL_VERSION,
  decodeFrameToHostMessage,
  decodeHostHandshake,
  decodeHostToFrameMessage,
  validateActionPayload,
} from '../../src/protocol'
import { createTestSnapshot } from '../helpers/snapshot'

const channel = {
  protocolVersion: IFRAME_PROTOCOL_VERSION,
  buildId: 'test-build',
  channelId: 'channel-test',
}

describe('iframe protocol decoders', () => {
  it('accepts a complete handshake', () => {
    const decoded = decodeHostHandshake({
      type: 'host-handshake',
      protocol: IFRAME_PROTOCOL_NAME,
      protocolVersion: IFRAME_PROTOCOL_VERSION,
      buildId: 'test-build',
      bootstrapId: 'bootstrap-test',
      channelId: 'channel-test',
      theme: 'game',
      knownActions: ALL_NATIVE_ACTIONS,
      registeredActions: ALL_NATIVE_ACTIONS.filter((action) => action !== 'newChat'),
    })
    expect(decoded.ok).toBe(true)
  })

  it('rejects incomplete or duplicated handshake action sets', () => {
    const decoded = decodeHostHandshake({
      type: 'host-handshake',
      protocol: IFRAME_PROTOCOL_NAME,
      protocolVersion: IFRAME_PROTOCOL_VERSION,
      buildId: 'test-build',
      bootstrapId: 'bootstrap-test',
      channelId: 'channel-test',
      theme: 'game',
      knownActions: [...ALL_NATIVE_ACTIONS.slice(1), ALL_NATIVE_ACTIONS[1]],
      registeredActions: [],
    })
    expect(decoded.ok).toBe(false)
  })

  it('validates action payloads without weakening the contract', () => {
    expect(validateActionPayload('sendMessage', { text: '' })).toBe(true)
    expect(validateActionPayload('sendMessage', { text: 'hello' })).toBe(true)
    expect(validateActionPayload('sendMessage', { message: 'hello' })).toBe(false)
    expect(validateActionPayload('selectConversation', {
      conversationId: 'conversation-1',
      fingerprint: 'fingerprint-1',
      index: 0,
    })).toBe(true)
    expect(validateActionPayload('selectConversation', {
      conversationId: 'conversation-1',
      fingerprint: 'fingerprint-1',
    })).toBe(false)
    expect(validateActionPayload('stopGeneration', undefined)).toBe(true)
    expect(validateActionPayload('stopGeneration', {})).toBe(false)
  })

  it('fails closed for malformed controls and invoke payloads', () => {
    const invalidControl = decodeFrameToHostMessage({
      type: 'hud-control',
      ...channel,
      requestId: 'request-1',
      command: 'reload-whatever',
    })
    const invalidInvoke = decodeFrameToHostMessage({
      type: 'invoke',
      ...channel,
      requestId: 'request-2',
      action: 'sendMessage',
      payload: { message: 'wrong' },
    })
    expect(invalidControl.ok).toBe(false)
    expect(invalidInvoke.ok).toBe(false)
  })

  it('accepts complete snapshots and rejects incomplete capability maps', () => {
    const valid = decodeHostToFrameMessage({
      type: 'snapshot',
      ...channel,
      snapshot: createTestSnapshot(),
    })
    const invalidSnapshot = createTestSnapshot()
    delete (invalidSnapshot.capabilities as Partial<typeof invalidSnapshot.capabilities>).sendMessage
    const invalid = decodeHostToFrameMessage({
      type: 'snapshot',
      ...channel,
      snapshot: invalidSnapshot,
    })
    expect(valid.ok).toBe(true)
    expect(invalid.ok).toBe(false)
  })
})
