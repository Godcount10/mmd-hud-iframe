import { reactive } from 'vue'
import { toWireValue } from '../../src/protocol'

describe('toWireValue', () => {
  it('removes Vue proxy identity before MessagePort transport', () => {
    const source = reactive({
      action: 'sendMessage',
      payload: { text: 'hello' },
    })
    const wire = toWireValue(source)
    expect(wire).toEqual(source)
    expect(() => structuredClone(wire)).not.toThrow()
  })

  it('rejects functions and circular references', () => {
    expect(() => toWireValue({ callback: () => undefined })).toThrow(/不接受 function/)
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => toWireValue(circular)).toThrow(/循环引用/)
  })
})
