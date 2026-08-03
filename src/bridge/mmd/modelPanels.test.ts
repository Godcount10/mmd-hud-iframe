import { invokeRegisteredAction } from '../actions/actionRegistry'
import { findModelPanel, findModelPanelClose, readModelPanel } from './modelPanels'
import { readCapabilities } from './snapshotReader'

function installGeometry(element: HTMLElement, width = 320, height = 180): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    }),
  })
}

function createModelDocument(): { document: Document; entry: HTMLElement; close: HTMLElement } {
  document.body.innerHTML = `
    <div class="mind-type"><span class="icon-change">切换模型</span></div>
    <div class="u-popup__content">
      <div class="model-switch-scope">
        <div class="title">对话模型选择</div>
        <div class="model-list">
          <div class="model-item model-item-active">
            <div class="model-title">测试模型</div>
            <div class="model-intro">模型说明</div>
            <div class="model-battery">15 /每条消息</div>
          </div>
        </div>
      </div>
      <div class="u-popup__content__close">关闭</div>
    </div>
  `
  const entry = document.querySelector<HTMLElement>('.mind-type')!
  const panel = document.querySelector<HTMLElement>('.model-switch-scope')!
  const close = document.querySelector<HTMLElement>('.u-popup__content__close')!
  ;[entry, panel, close].forEach(element => installGeometry(element))
  return { document, entry, close }
}

describe('model panel bridge semantics', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('finds a model close button beside the panel and exposes close capability', () => {
    const { document } = createModelDocument()
    const panel = findModelPanel(document)
    expect(panel).not.toBeNull()
    expect(findModelPanelClose(panel!)).toBe(document.querySelector('.u-popup__content__close'))

    const capabilities = readCapabilities(document)
    expect(capabilities.openModelSettings.available).toBe(false)
    expect(capabilities.closeModelSettings.available).toBe(true)
  })

  it('treats repeated open as idempotent instead of clicking the toggle entry', async () => {
    const { document, entry } = createModelDocument()
    let clickCount = 0
    entry.addEventListener('click', () => { clickCount += 1 })

    const result = await invokeRegisteredAction('openModelSettings', undefined, {
      document,
      messages: [],
    })

    expect(result.ok).toBe(true)
    expect(clickCount).toBe(0)
    expect((result.data as ReturnType<typeof readModelPanel>).open).toBe(true)
  })

  it('closes through the shared resolver and succeeds when already closed', async () => {
    const { document, close } = createModelDocument()
    close.addEventListener('click', () => close.closest('.u-popup__content')?.remove())

    const first = await invokeRegisteredAction('closeModelSettings', undefined, {
      document,
      messages: [],
    })
    const second = await invokeRegisteredAction('closeModelSettings', undefined, {
      document,
      messages: [],
    })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(findModelPanel(document)).toBeNull()
  })
})
