import { isProxy, ref } from 'vue'
import { cloneDebugValue } from './cloneDebugValue'

describe('cloneDebugValue', () => {
  it('clones a reactive action payload into structured-cloneable data', () => {
    const payload = ref({ messageId: 'message-1' })
    expect(isProxy(payload.value)).toBe(true)

    const cloned = cloneDebugValue(payload.value)

    expect(cloned).toEqual({ messageId: 'message-1' })
    expect(isProxy(cloned)).toBe(false)
    expect(() => structuredClone(cloned)).not.toThrow()
  })

  it('clones a reactive pending-confirmation payload', () => {
    const pending = ref({
      action: 'deleteMessage',
      payload: {
        messageId: 'message-1',
        confirmationToken: 'token-1',
      },
    })
    expect(isProxy(pending.value.payload)).toBe(true)

    const cloned = cloneDebugValue(pending.value.payload)

    expect(cloned).toEqual({
      messageId: 'message-1',
      confirmationToken: 'token-1',
    })
    expect(isProxy(cloned)).toBe(false)
    expect(() => structuredClone(cloned)).not.toThrow()
  })
})
