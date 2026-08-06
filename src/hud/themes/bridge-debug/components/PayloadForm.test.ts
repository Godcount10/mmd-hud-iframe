import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createTestSnapshot } from '../../../../../tests/helpers/snapshot'
import PayloadForm from './PayloadForm.vue'

const MODEL_ID = 'model-stable'
const DELETE_PAYLOAD = {
  conversationId: 'conversation-2',
  fingerprint: 'fingerprint-2',
  index: 2,
  confirmationToken: 'token-2',
}

function modelSnapshot(revision: number, includeModel = true) {
  const snapshot = createTestSnapshot(revision)
  snapshot.modelPanel = {
    open: true,
    title: '模型',
    filters: [],
    models: includeModel
      ? [{ id: MODEL_ID, name: '稳定模型', description: '', batteryCost: 1, batteryLabel: '1', permission: '', successRate: '', selected: false }]
      : [],
    activeFilterId: null,
    selectedModelId: null,
  }
  return snapshot
}

describe('PayloadForm snapshot updates', () => {
  it('keeps a selected target while it remains valid across revisions', async () => {
    const snapshot = modelSnapshot(1)
    const wrapper = mount(PayloadForm, { props: { action: 'selectModel', snapshot } })
    await wrapper.get('select').setValue(MODEL_ID)
    expect(wrapper.emitted('payload')?.at(-1)?.[0]).toEqual({ modelId: MODEL_ID })

    await wrapper.setProps({ snapshot: modelSnapshot(2) })
    await nextTick()

    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe(MODEL_ID)
    expect(wrapper.emitted('payload')?.at(-1)?.[0]).toEqual({ modelId: MODEL_ID })
  })

  it('clears a selected target after a revision removes it', async () => {
    const wrapper = mount(PayloadForm, { props: { action: 'selectModel', snapshot: modelSnapshot(1) } })
    await wrapper.get('select').setValue(MODEL_ID)

    await wrapper.setProps({ snapshot: modelSnapshot(2, false) })
    await nextTick()

    expect(wrapper.emitted('payload')?.at(-1)?.[0]).toBeUndefined()
  })

  it('does not render a target selector for deleteConversation without a token', () => {
    const wrapper = mount(PayloadForm, {
      props: { action: 'deleteConversation', snapshot: createTestSnapshot() },
    })

    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.text()).toContain('请先执行“请求删除会话”')
    expect(wrapper.emitted('payload')?.at(-1)?.[0]).toBeUndefined()
  })

  it('uses only the pending token payload for deleteConversation', async () => {
    const wrapper = mount(PayloadForm, {
      props: {
        action: 'deleteConversation',
        snapshot: createTestSnapshot(),
        confirmPayload: DELETE_PAYLOAD,
      },
    })

    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.text()).toContain('不允许重新选择目标')
    expect(wrapper.text()).toContain('conversation-2')
    expect(wrapper.emitted('payload')?.at(-1)?.[0]).toEqual(DELETE_PAYLOAD)
  })
})
