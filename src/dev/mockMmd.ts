import { MMD_MORE_MENU_ITEMS } from '../bridge/mmd/morePanels'
import { MMD_TUTORIAL_ROUTE } from '../bridge/mmd/selectors'

const MOCK_ROOT_ID = 'mmd-dev-mock'

export function installMockMmd(): void {
  if (document.getElementById('msglistview')) return

  const root = document.createElement('div')
  root.id = MOCK_ROOT_ID
  root.innerHTML = `
    <style>
      #${MOCK_ROOT_ID} { min-height:100vh; padding:18px; color:#d1d5db; background:#111827; font-family:system-ui,sans-serif; }
      #${MOCK_ROOT_ID} .native-card { max-width:760px; margin:auto; padding:16px; border:1px solid #374151; border-radius:12px; background:#1f2937; }
      #${MOCK_ROOT_ID} .topTabbar { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      #${MOCK_ROOT_ID} .header-box { display:flex; align-items:center; }
      #${MOCK_ROOT_ID} .header-icon-meun { display:flex; gap:6px; }
      #${MOCK_ROOT_ID} .header-meun, #${MOCK_ROOT_ID} .icon-back { padding:7px 10px; border:1px solid #4b5563; border-radius:6px; color:#d1d5db; background:#263244; cursor:pointer; }
      #${MOCK_ROOT_ID} .header-meun.active { border-color:#f59e0b; color:#fde68a; }
      #${MOCK_ROOT_ID} .share-popup { width:min(520px,90vw); padding:18px; border-radius:12px; background:#1f2937; }
      #${MOCK_ROOT_ID} .share-title { font-size:20px; font-weight:700; }
      #${MOCK_ROOT_ID} .share-sub-title { margin:7px 0; padding:10px; overflow-wrap:anywhere; border-radius:7px; color:#d1fae5; background:#111827; }
      #${MOCK_ROOT_ID} .gen-link-btn, #${MOCK_ROOT_ID} .u-popup__content__close { margin-top:12px; padding:8px 12px; border-radius:6px; color:white; background:#ec5f91; cursor:pointer; }
      #${MOCK_ROOT_ID} .item { margin:10px 0; }
      #${MOCK_ROOT_ID} .content { max-width:70%; padding:10px 13px; border-radius:10px; background:#374151; }
      #${MOCK_ROOT_ID} .item.self .content { margin-left:auto; background:#164e63; }
      #${MOCK_ROOT_ID} .modify-btn-scope { margin:5px 0 0; display:flex; gap:5px; }
      #${MOCK_ROOT_ID} .modify-btn { padding:3px 7px; border:1px solid #4b5563; border-radius:5px; color:#d1d5db; background:#263244; }
      #${MOCK_ROOT_ID} .native-panel { position:fixed; inset:0; z-index:20; padding:12vh 20px 20px; background:rgba(0,0,0,.7); }
      #${MOCK_ROOT_ID} .msg-option-scope { position:fixed; inset:0; z-index:19; display:grid; place-items:center; background:rgba(0,0,0,.7); }
      #${MOCK_ROOT_ID} .msg-options-box { min-width:220px; padding:8px; border-radius:10px; background:#1f2937; }
      #${MOCK_ROOT_ID} .msg-options-box .option-item { padding:10px; border-bottom:1px solid #374151; cursor:pointer; }
      #${MOCK_ROOT_ID} .u-popup__content { position:fixed; inset:0; z-index:21; display:grid; place-items:center; background:rgba(0,0,0,.5); }
      #${MOCK_ROOT_ID} .confirm-scope { width:300px; padding:16px; border-radius:10px; background:#1f2937; }
      #${MOCK_ROOT_ID} .confirm-bottom { display:flex; justify-content:space-between; margin-top:12px; }
      #${MOCK_ROOT_ID} .modify-input-box, #${MOCK_ROOT_ID} .option-box, #${MOCK_ROOT_ID} .modify-btn-box { width:min(720px,92vw); margin:auto; padding:10px; background:#1f2937; }
      #${MOCK_ROOT_ID} .vditor-ir > pre { min-height:260px; max-height:48vh; margin:0; overflow:auto; white-space:pre-wrap; background:#fff; color:#111827; }
      #${MOCK_ROOT_ID} .option-box { display:flex; gap:6px; }
      #${MOCK_ROOT_ID} .option-item, #${MOCK_ROOT_ID} .modify-btn { padding:7px 10px; border-radius:5px; background:#374151; cursor:pointer; }
      #${MOCK_ROOT_ID} .modify-btn-box .modify-btn { text-align:center; color:white; background:#ec5f91; }
      #${MOCK_ROOT_ID} .native-input { margin-top:16px; display:flex; gap:8px; }
      #${MOCK_ROOT_ID} .mind-type { margin-top:12px; padding:8px 12px; border-radius:6px; background:#374151; cursor:pointer; }
      #${MOCK_ROOT_ID} .shortcut-bar { margin-top:10px; display:flex; flex-wrap:wrap; gap:6px; }
      #${MOCK_ROOT_ID} .shortcut-btn, #${MOCK_ROOT_ID} .instruction-chip, #${MOCK_ROOT_ID} .back-btn { padding:7px 10px; border-radius:6px; background:#374151; cursor:pointer; }
      #${MOCK_ROOT_ID} .shortcut-btn img { display:none; }
      #${MOCK_ROOT_ID} .instruction-bar { margin-top:8px; display:flex; gap:6px; }
      #${MOCK_ROOT_ID} .instruction-scroll { display:flex; gap:6px; }
      #${MOCK_ROOT_ID} .hidden { display:none; }
      #${MOCK_ROOT_ID} .conv-style-modal { width:min(680px,92vw); padding:16px; border-radius:12px; background:#1f2937; }
      #${MOCK_ROOT_ID} .cs-modal-header { display:flex; justify-content:space-between; gap:8px; }
      #${MOCK_ROOT_ID} .cs-header-left, #${MOCK_ROOT_ID} .cs-header-right { cursor:pointer; }
      #${MOCK_ROOT_ID} .cs-group-card { margin-top:12px; padding:10px; border-radius:8px; background:#263244; }
      #${MOCK_ROOT_ID} .cs-style-grid { margin-top:8px; display:flex; gap:6px; }
      #${MOCK_ROOT_ID} .cs-style-item { padding:6px 9px; border-radius:5px; background:#374151; }
      #${MOCK_ROOT_ID} .model-switch-scope, #${MOCK_ROOT_ID} .model-setting-scope { width:min(720px,92vw); max-height:78vh; padding:16px; overflow:auto; border-radius:12px; background:#1f2937; }
      #${MOCK_ROOT_ID} .model-filter-tabs, #${MOCK_ROOT_ID} .mp-tokens, #${MOCK_ROOT_ID} .mp-preset-list { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
      #${MOCK_ROOT_ID} .model-filter-tab, #${MOCK_ROOT_ID} .mp-token-btn, #${MOCK_ROOT_ID} .mp-preset-item { padding:7px 10px; border-radius:6px; background:#374151; cursor:pointer; }
      #${MOCK_ROOT_ID} .active, #${MOCK_ROOT_ID} .selected, #${MOCK_ROOT_ID} .model-item-active { outline:2px solid #67e8f9; }
      #${MOCK_ROOT_ID} .model-item { margin:8px 0; padding:12px; border-radius:8px; background:#263244; cursor:pointer; }
      #${MOCK_ROOT_ID} .model-top-scope, #${MOCK_ROOT_ID} .mp-top, #${MOCK_ROOT_ID} .mp-info-bar, #${MOCK_ROOT_ID} .mp-switch-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      #${MOCK_ROOT_ID} .model-opt-btn, #${MOCK_ROOT_ID} .mp-close, #${MOCK_ROOT_ID} .bottom .btn, #${MOCK_ROOT_ID} .u-switch { padding:6px 9px; border-radius:5px; background:#4b5563; cursor:pointer; }
      #${MOCK_ROOT_ID} .model-intro, #${MOCK_ROOT_ID} .model-bottom-scope, #${MOCK_ROOT_ID} .mp-card-hint, #${MOCK_ROOT_ID} .mp-sw-desc { margin-top:5px; color:#9ca3af; }
      #${MOCK_ROOT_ID} .more-options-scope { margin-top:10px; padding:8px 12px; background:#374151; cursor:pointer; }
      #${MOCK_ROOT_ID} .more-scope { margin-top:8px; padding:8px; border-radius:8px; background:#263244; }
      #${MOCK_ROOT_ID} .more-scope > .item { padding:8px; cursor:pointer; }
      #${MOCK_ROOT_ID} .conversation-list-scope, #${MOCK_ROOT_ID} .role-profile-modal, #${MOCK_ROOT_ID} .role-extra-setting, #${MOCK_ROOT_ID} .modify-scope, #${MOCK_ROOT_ID} .custom-instruction-scope, #${MOCK_ROOT_ID} .conv-style-modal { width:min(680px,92vw); padding:16px; border-radius:12px; background:#1f2937; }
      #${MOCK_ROOT_ID} .modify-item { margin-top:8px; padding:10px; border-radius:6px; background:#374151; }
      #${MOCK_ROOT_ID} .conversation-item { margin:8px 0; padding:10px; background:#374151; cursor:pointer; }
      #${MOCK_ROOT_ID} .header-box, #${MOCK_ROOT_ID} .setting-item { display:flex; justify-content:space-between; gap:8px; }
      #${MOCK_ROOT_ID} .complete-btn, #${MOCK_ROOT_ID} .picker-field { padding:7px 10px; background:#4b5563; cursor:pointer; }
      #${MOCK_ROOT_ID} .picker-layer { position:fixed; inset:0; z-index:25; padding:16px; background:#111827; }
      #${MOCK_ROOT_ID} .u-picker__view__column__item { padding:8px; text-align:center; cursor:pointer; }
      #${MOCK_ROOT_ID} .u-picker__view__column__item--selected { color:#ff6d97; font-weight:700; }
      #${MOCK_ROOT_ID} textarea { flex:1; min-height:58px; }
    </style>
    <div class="native-card">
      <div class="topTabbar">
        <div class="header-box">
          <button class="icon-back" type="button">原生退出</button>
        </div>
        <div class="header-roleName">原型测试角色</div>
        <img class="header-role-img" src="/mock-role-avatar.png" alt="原型测试角色">
        <div class="header-icon-meun">
          <button class="header-meun header-meun-rating" type="button">评论区</button>
          <button class="header-meun" type="button">分享</button>
          <button class="header-meun" type="button">收藏</button>
          <button class="header-meun" type="button">刷新对话</button>
        </div>
      </div>
      <h2>模拟 MMD 原生界面</h2>
      <div class="header-card">
        <div><span>作者</span><span>本地 Mock 作者</span></div>
        <div><span>角色昵称</span><span>原型测试角色</span></div>
        <div><span>角色ID</span><span>mock-role</span></div>
      </div>
      <div id="msglistview">
        <div class="item Ai"><div class="touch-scope" id="title-item"><div class="content left" id="title-content"><p>原型测试角色</p></div></div></div>
        <div class="item Ai"><div class="touch-scope" id="item-a1"><div class="content left" id="q-mock-a1"><p>这是第一条模拟 AI 消息。</p><p><font color="#DC8333">“富文本颜色也会保留。”</font></p></div><div class="modify-btn-scope"><button class="modify-btn" type="button">编辑</button><button class="modify-btn" type="button">分享</button></div></div></div>
        <div class="item self"><div class="touch-scope" id="item-u1"><div class="content right" id="q-mock-u1"><p>测试玩家消息</p></div></div></div>
        <div class="item Ai"><div class="touch-scope" id="item-a2"><div class="content left" id="q-mock-a2"><p>这是第二条模拟 AI 消息。</p><p>【开局面板】</p></div><div class="modify-btn-scope"><button class="modify-btn" type="button">重新生成</button><button class="modify-btn" type="button">编辑</button><button class="modify-btn" type="button">分享</button></div></div></div>
      </div>
      <div class="mind-type">15 <span class="icon-battery">电量</span><span class="icon-change">切换模型</span></div>
      <div class="shortcut-bar-wrapper theme-dark">
        <div class="shortcut-bar">
          <div class="shortcut-btn"><span class="sb-icon"><img src="/static/imgs/ico_setting2_dark.png"></span><span class="sb-text">模型设置</span></div>
          <div class="shortcut-btn"><span class="sb-icon"><img src="/static/imgs/ico_chat_set_dark.svg"></span><span class="sb-text">对话设置</span></div>
          <div class="shortcut-btn"><span class="sb-icon"><img src="/static/imgs/ico_instruction_dark.png"></span><span class="sb-text">选择指令</span></div>
          <div class="shortcut-btn"><span class="sb-icon"><img src="/static/imgs/ico_rechat2_dark.png"></span><span class="sb-text">新的聊天</span></div>
          <div class="shortcut-btn"><span class="sb-icon"><img src="/static/imgs/ico_user_setting_dark.svg"></span><span class="sb-text">用户人设</span></div>
        </div>
        <div class="instruction-bar hidden"><div class="back-btn">‹</div><div class="instruction-scroll"><div class="instruction-chip" data-prompt="请概括当前剧情。">剧情总结</div><div class="instruction-chip" data-prompt="请生成三个行动选项。">选项生成</div></div></div>
      </div>
      <div class="native-input" id="chat-input-scope">
        <uni-textarea class="chatMsgTextarea"><textarea class="uni-textarea-textarea" maxlength="2000"></textarea></uni-textarea>
        <button class="chat-send-proxy" type="button">原生发送</button>
      </div>
      <div class="more-options-scope"><span class="btn-icon"><img src="/static/imgs/ico_more_dark.png"></span>更多</div>
    </div>
  `
  document.body.appendChild(root)

  const input = root.querySelector<HTMLTextAreaElement>('.uni-textarea-textarea')!
  const send = root.querySelector<HTMLButtonElement>('.chat-send-proxy')!
  const list = root.querySelector<HTMLElement>('#msglistview')!
  const exit = root.querySelector<HTMLButtonElement>('.icon-back')!
  const headerActions = [...root.querySelectorAll<HTMLButtonElement>('.topTabbar > .header-icon-meun > .header-meun')]
  const modelEntry = root.querySelector<HTMLElement>('.mind-type')!
  const shortcutBar = root.querySelector<HTMLElement>('.shortcut-bar')!
  const instructionBar = root.querySelector<HTMLElement>('.instruction-bar')!
  const shortcutButtons = [...shortcutBar.querySelectorAll<HTMLElement>(':scope > .shortcut-btn')]
  const moreEntryTarget = root.querySelector<HTMLElement>('.more-options-scope .btn-icon')!

  shortcutButtons[1]?.addEventListener('click', () => openMockChatSettings(root))
  shortcutButtons[2]?.addEventListener('click', () => {
    shortcutBar.classList.add('hidden')
    instructionBar.classList.remove('hidden')
  })
  instructionBar.querySelector<HTMLElement>(':scope > .back-btn')?.addEventListener('click', () => {
    instructionBar.classList.add('hidden')
    shortcutBar.classList.remove('hidden')
  })
  instructionBar.querySelectorAll<HTMLElement>('.instruction-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const text = chip.dataset.prompt ?? ''
      input.value = text
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  })

  moreEntryTarget.addEventListener('click', () => {
    const existing = root.querySelector('.more-scope')
    if (existing) existing.remove()
    else openMockMorePanel(root)
  })
  modelEntry.addEventListener('click', () => openMockModelPanel(root, modelEntry))
  headerActions[0]?.addEventListener('click', () => {
    headerActions[0]!.textContent = '已转到评论区'
  })
  headerActions[1]?.addEventListener('click', () => openMockSharePanel(root))
  headerActions[2]?.addEventListener('click', () => {
    headerActions[2]!.classList.toggle('active')
    headerActions[2]!.textContent = headerActions[2]!.classList.contains('active') ? '已收藏' : '收藏'
  })
  headerActions[3]?.addEventListener('click', () => {
    headerActions[3]!.textContent = '已刷新'
    list.dataset.refreshCount = String(Number(list.dataset.refreshCount ?? '0') + 1)
  })

  list.addEventListener('mousedown', (event) => {
    const item = (event.target as Element | null)?.closest<HTMLElement>('.item.Ai, .item.self')
    if (!item || (event.target as Element | null)?.closest('.modify-btn')) return
    const timer = window.setTimeout(() => openMockMessageOptions(root, item), 560)
    const cancel = (): void => window.clearTimeout(timer)
    item.addEventListener('mouseup', cancel, { once: true })
    item.addEventListener('mouseleave', cancel, { once: true })
  })

  list.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.modify-btn')
    const item = button?.closest<HTMLElement>('.item.Ai')
    const scope = button?.parentElement
    if (!button || !item || !scope) return

    const buttons = [...scope.querySelectorAll<HTMLButtonElement>(':scope > .modify-btn')]
    const actionIndex = buttons.indexOf(button)
    if (buttons.length === 3 && actionIndex === 0) regenerateMockMessage(item)
    if ((buttons.length === 3 && actionIndex === 1) || (buttons.length === 2 && actionIndex === 0)) {
      openMockEditPanel(root, item)
    }
  })

  send.addEventListener('click', () => {
    const text = input.value.trim()
    if (!text) return
    appendMessage(list, 'self', text)
    input.value = ''
    input.disabled = true
    input.dispatchEvent(new Event('input', { bubbles: true }))
    streamAssistantMessage(
      list,
      `收到“${text}”。这是一段由本地 Mock 逐字写入的 AI 回复，用于验证桥接层的 MutationObserver 和 HUD 响应式更新。`,
      input,
    )
  })

  exit.addEventListener('click', () => {
    exit.textContent = '已触发原生退出'
  })
}

function appendMessage(list: HTMLElement, role: 'self' | 'Ai', text: string): HTMLElement {
  const sequence = list.querySelectorAll('.item').length
  const item = document.createElement('div')
  item.className = `item ${role}`
  const contentClass = role === 'self' ? 'content right' : 'content left'
  const actions = role === 'Ai'
    ? '<div class="modify-btn-scope"><button class="modify-btn" type="button">重新生成</button><button class="modify-btn" type="button">编辑</button><button class="modify-btn" type="button">分享</button></div>'
    : ''
  item.innerHTML = `<div class="touch-scope" id="mock-item-${sequence}"><div class="${contentClass}" id="mock-content-${sequence}"><p></p></div>${actions}</div>`
  item.querySelector('p')!.textContent = text
  list.appendChild(item)
  return item
}

function regenerateMockMessage(item: HTMLElement): void {
  const paragraph = item.querySelector<HTMLParagraphElement>('.content.left p')
  if (!paragraph) return
  paragraph.textContent = ''
  const text = `重新生成于 ${new Date().toLocaleTimeString()}。这段文本用于验证目标消息变化和流式同步。`
  let cursor = 0
  const timer = window.setInterval(() => {
    cursor += 1
    paragraph.textContent = text.slice(0, cursor)
    if (cursor >= text.length) window.clearInterval(timer)
  }, 24)
}

function openMockEditPanel(root: HTMLElement, item: HTMLElement): void {
  root.querySelector('.native-panel')?.remove()
  const panel = document.createElement('div')
  panel.className = 'native-panel msg-modify-scope'
  const content = item.querySelector<HTMLElement>('.content.left')

  panel.innerHTML = `
    <div class="modify-input-box">
      <div id="vditor" class="vditor"><div class="vditor-ir" style="display: block;"><pre class="vditor-reset" contenteditable="true" spellcheck="false"></pre></div></div>
    </div>
    <div class="option-box"><div class="option-item">简转繁</div><div class="option-item">繁转简</div><div class="option-item">去除异常符号</div><div class="option-item">去除异常文字</div></div>
    <div class="modify-btn-box"><div class="modify-btn">保存</div></div>`
  const editor = panel.querySelector<HTMLElement>('pre.vditor-reset')!
  editor.innerText = content?.innerText ?? ''
  panel.addEventListener('click', (event) => {
    if (event.target === panel) panel.remove()
  })
  panel.querySelectorAll<HTMLElement>('.option-item').forEach((option, index) => {
    option.addEventListener('click', () => {
      if (index === 0) editor.innerText = editor.innerText.replaceAll('后', '後')
      if (index === 1) editor.innerText = editor.innerText.replaceAll('後', '后')
      if (index === 2) editor.innerText = editor.innerText.replace(/[​-‍﻿]/g, '')
      if (index === 3) editor.innerText = editor.innerText.replace(/[^\S\r\n]+/g, ' ')
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    })
  })
  panel.querySelector<HTMLElement>('.modify-btn')?.addEventListener('click', () => {
    if (content) {
      content.innerHTML = ''
      for (const line of editor.innerText.split('\n')) {
        const paragraph = document.createElement('p')
        paragraph.textContent = line
        content.appendChild(paragraph)
      }
    }
    panel.remove()
  })

  root.appendChild(panel)
}

function openMockMorePanel(root: HTMLElement): void {
  const panel = document.createElement('div')
  panel.className = 'more-scope'
  panel.innerHTML = MMD_MORE_MENU_ITEMS.map(({ kind, label, icon }) => `
    <div class="item" data-more-kind="${kind}"><div class="item-icon"><img src="/static/imgs/${icon}"></div><div class="item-title">${label}</div></div>`).join('')
  const activate = (kind: string, handler: () => void): void => {
    panel.querySelector<HTMLElement>(`[data-more-kind="${kind}"]`)?.addEventListener('click', handler)
  }
  activate('newChat', () => openMockConversationPanel(root))
  activate('background', () => openMockBackgroundPanel(root))
  activate('customInstructions', () => openMockCustomInstructions(root))
  activate('persona', () => openMockPersonaPanel(root))
  activate('supplement', () => openMockSupplementPanel(root))
  activate('chatSettings', () => openMockChatSettings(root))
  activate('tutorial', () => {
    window.history.pushState({}, '', `#${MMD_TUTORIAL_ROUTE}`)
    panel.remove()
  })
  root.querySelector('.native-card')?.appendChild(panel)
}

function openMockBackgroundPanel(root: HTMLElement): void {
  const panel = document.createElement('div')
  panel.className = 'modify-scope'
  panel.innerHTML = '<div class="modify-title">更换背景</div><div class="modify-item">重置背景图</div><div class="modify-item">从相册选择</div>'
  mockPopup(root, panel)
}

function openMockCustomInstructions(root: HTMLElement): void {
  const panel = document.createElement('div')
  panel.className = 'custom-instruction-scope'
  panel.innerHTML = '<div class="list-scope"><div class="header-scope"><div class="title">自定义指令</div></div><div class="sub-title">(0/30)</div><div class="empty-default-show">请添加指令内容~</div></div>'
  mockPopup(root, panel)
}

function mockPopup(root: HTMLElement, content: HTMLElement): HTMLElement {
  const layer = document.createElement('div')
  layer.className = 'u-transition native-panel'
  const popup = document.createElement('div')
  popup.className = 'u-popup__content'
  popup.appendChild(content)
  layer.appendChild(popup)
  layer.addEventListener('click', (event) => {
    if (event.target === layer || event.target === popup) layer.remove()
  })
  root.appendChild(layer)
  return layer
}

function openMockChatSettings(root: HTMLElement): void {
  const panel = document.createElement('div')
  panel.className = 'conv-style-modal'
  panel.innerHTML = `<div class="cs-modal-header"><div class="cs-header-left">取消</div><div class="cs-header-center"><span class="cs-header-title">对话设置</span></div><div class="cs-header-right"><span class="confirm-btn">确定</span></div></div>
    <div class="cs-modal-content"><div class="outer-scroll-view"><div class="cs-group-card"><div class="cs-section-header"><span class="cs-section-title">叙事风格</span><span class="cs-section-subtitle">选择回复使用的风格</span></div><div class="cs-style-grid"><div class="cs-style-item active"><span class="style-label">跟随角色</span></div><div class="cs-style-item"><span class="style-label">简洁</span></div><div class="cs-style-item fixed-item"><span class="style-label">自定义+</span></div></div></div></div></div>`
  const layer = mockPopup(root, panel)
  panel.querySelector<HTMLElement>('.cs-header-left')?.addEventListener('click', () => layer.remove())
  panel.querySelector<HTMLElement>('.cs-header-right')?.addEventListener('click', () => layer.remove())
}

function openMockConversationPanel(root: HTMLElement): void {
  const panel = document.createElement('div')
  panel.className = 'conversation-list-scope'
  panel.innerHTML = `<div class="title">开启新的聊天</div><div class="title" style="display:none">选择要分享的聊天记录</div>
    <div class="conversation-list"><div class="conversation-item"><div class="left-scope"><div class="avatar"><img src="/mock-avatar.png"></div></div><div class="center-scope"><div class="title-scope"><uni-view>历史聊天 1</uni-view><div class="cur-conversation">当前会话</div></div><div class="content-scope">当前模拟会话</div></div><button class="edit-icon" type="button">备注</button><button class="delete-icon" type="button">删除</button></div><div class="conversation-item"><div class="left-scope"><div class="avatar"><img src="/mock-avatar.png"></div></div><div class="center-scope"><div class="title-scope"><uni-view>历史聊天 2</uni-view></div><div class="content-scope">另一个模拟会话</div></div><button class="edit-icon" type="button">备注</button><button class="delete-icon" type="button">删除</button></div></div>
    <div class="bottom"><div class="btn">创建新的聊天</div></div>`
  const layer = mockPopup(root, panel)
  const items = [...panel.querySelectorAll<HTMLElement>('.conversation-item')]
  items.forEach((item) => {
    item.addEventListener('click', (event) => {
      if ((event.target as Element | null)?.closest('.edit-icon, .delete-icon')) return
      panel.querySelector('.cur-conversation')?.remove()
      const current = document.createElement('div')
      current.className = 'cur-conversation'
      current.textContent = '当前会话'
      item.querySelector('.title-scope')?.appendChild(current)
      layer.remove()
    })
    item.querySelector<HTMLElement>('.edit-icon')?.addEventListener('click', () => {
      openMockConversationRename(root, item)
    })
    item.querySelector<HTMLElement>('.delete-icon')?.addEventListener('click', () => {
      if (item.querySelector('.cur-conversation')) return
      openMockConversationDeleteConfirmation(root, item)
    })
  })
  panel.querySelector<HTMLElement>(':scope > .bottom > .btn')?.addEventListener('click', () => {
    const list = root.querySelector<HTMLElement>('#msglistview')
    if (list) list.innerHTML = '<div class="item Ai"><div class="touch-scope"><div class="content left"><p>原型测试角色</p></div></div></div>'
    layer.remove()
  })
  const close = document.createElement('div')
  close.className = 'u-popup__content__close'
  close.textContent = '关闭'
  close.addEventListener('click', () => layer.remove())
  layer.querySelector('.u-popup__content')?.appendChild(close)
}

function openMockConversationRename(root: HTMLElement, item: HTMLElement): void {
  root.querySelector('.confirm-edit-scope')?.closest('.u-popup__content')?.remove()
  const popup = document.createElement('div')
  popup.className = 'u-popup__content'
  const title = item.querySelector<HTMLElement>('.title-scope > uni-view')
  popup.innerHTML = `<div class="confirm-edit-scope"><div class="confirm-title">聊天记录备注</div><input class="uni-input-input" maxlength="140"><div class="confirm-bottom"><button class="cancel-btn" type="button">取消</button><button class="ok-btn" type="button">确定</button></div></div>`
  const input = popup.querySelector<HTMLInputElement>('input.uni-input-input')!
  input.value = title?.textContent ?? ''
  popup.querySelector<HTMLElement>('.cancel-btn')?.addEventListener('click', () => popup.remove())
  popup.querySelector<HTMLElement>('.ok-btn')?.addEventListener('click', () => {
    if (title) title.textContent = input.value.trim()
    popup.remove()
  })
  root.appendChild(popup)
}

function openMockConversationDeleteConfirmation(root: HTMLElement, item: HTMLElement): void {
  const popup = document.createElement('div')
  popup.className = 'u-popup__content'
  popup.innerHTML = `<div class="confirm-scope"><div class="confirm-title">删除聊天记录</div><div class="confirm-content">删除后无法恢复，是否确认删除这条聊天记录？</div><div class="confirm-bottom"><button class="cancel-btn" type="button">取消</button><button class="ok-btn" type="button">确定</button></div></div>`
  popup.querySelector<HTMLElement>('.cancel-btn')?.addEventListener('click', () => popup.remove())
  popup.querySelector<HTMLElement>('.ok-btn')?.addEventListener('click', () => {
    item.remove()
    popup.remove()
  })
  root.appendChild(popup)
}

function openMockPersonaPanel(root: HTMLElement): void {
  const panel = document.createElement('div')
  panel.className = 'role-profile-modal'
  panel.innerHTML = `<div class="header-scope"><div class="header-box"><div class="icon-back">取消</div><div class="page-title">用户人设</div><div class="complete-btn">保存</div></div></div>
    <div class="role-setting"><div class="switch-card"><div class="radio-group"><label class="radio-item"><uni-radio></uni-radio><uni-text>仅使用称呼</uni-text></label><label class="radio-item"><uni-radio></uni-radio><uni-text>全局人设</uni-text></label><label class="radio-item"><uni-radio></uni-radio><uni-text>单独设置</uni-text></label></div></div><div class="persona-fields"></div></div>`
  const layer = mockPopup(root, panel)
  const modes = [...panel.querySelectorAll<HTMLElement>('.radio-item')]
  const fields = panel.querySelector<HTMLElement>('.persona-fields')!
  let selectedMode = 0
  const renderMode = (): void => {
    modes.forEach((mode, index) => {
      const radio = mode.querySelector<HTMLElement>('uni-radio')!
      radio.innerHTML = index === selectedMode ? '<div><svg></svg></div>' : ''
    })
    if (selectedMode === 0) {
      fields.innerHTML = '<div class="card"><input type="text" maxlength="20" value="测试用户"></div>'
      return
    }
    const disabled = selectedMode === 1
    fields.innerHTML = `<div class="card"><input type="text" maxlength="20" value="测试用户"${disabled ? ' disabled class="disabled"' : ''}></div>
      <div class="card"><div class="gender-box"><div class="gender-item active${disabled ? ' disabled' : ''}">男</div><div class="gender-item${disabled ? ' disabled' : ''}">女</div><div class="gender-item${disabled ? ' disabled' : ''}">其他</div></div></div>
      <div class="card textarea-wrapper"><textarea maxlength="500"${disabled ? ' disabled class="disabled"' : ''}>模拟身份设定</textarea></div>`
    fields.querySelectorAll<HTMLElement>('.gender-item:not(.disabled)').forEach((choice) => {
      choice.addEventListener('click', () => {
        fields.querySelector('.gender-item.active')?.classList.remove('active')
        choice.classList.add('active')
      })
    })
  }
  modes.forEach((mode, index) => mode.addEventListener('click', () => {
    selectedMode = index
    renderMode()
  }))
  renderMode()
  panel.querySelector<HTMLElement>('.icon-back')?.addEventListener('click', () => layer.remove())
  panel.querySelector<HTMLElement>('.complete-btn')?.addEventListener('click', () => layer.remove())
}

function openMockSupplementPanel(root: HTMLElement): void {
  const panel = document.createElement('div')
  panel.className = 'supplement-wrapper'
  panel.innerHTML = `<div class="header-scope"><div class="header-box"><div class="icon-back">取消</div><div class="page-title">设定补充</div><div class="complete-btn">保存</div></div></div><div class="role-extra-setting"><div class="setting-top"><div class="setting-item"><span>角色&位置</span><div class="picker-field"><span class="picker-value">角色人设后</span></div></div></div><div class="textarea-wrapper"><textarea class="uni-textarea-textarea" maxlength="1000"></textarea></div></div>`
  const layer = mockPopup(root, panel)
  panel.querySelector<HTMLElement>('.icon-back')?.addEventListener('click', () => layer.remove())
  panel.querySelector<HTMLElement>('.complete-btn')?.addEventListener('click', () => layer.remove())
  panel.querySelector<HTMLElement>('.picker-field')?.addEventListener('click', () => openMockSupplementPicker(root, panel))
}

function openMockSupplementPicker(root: HTMLElement, supplement: HTMLElement): void {
  root.querySelector('.picker-layer')?.remove()
  const picker = document.createElement('div')
  picker.className = 'u-transition picker-layer'
  picker.innerHTML = `<header><span class="picker-cancel">取消</span><span class="picker-confirm">确定</span></header><div class="uni-picker-view-content">${['system', 'user', 'assistant', '角色人设前', '角色人设后'].map((label) => `<div class="u-picker__view__column__item${label === supplement.querySelector('.picker-value')?.textContent ? ' u-picker__view__column__item--selected' : ''}">${label}</div>`).join('')}</div>`
  picker.querySelectorAll<HTMLElement>('.u-picker__view__column__item').forEach((option) => option.addEventListener('click', () => {
    picker.querySelector('.u-picker__view__column__item--selected')?.classList.remove('u-picker__view__column__item--selected')
    option.classList.add('u-picker__view__column__item--selected')
  }))
  picker.querySelector<HTMLElement>('.picker-cancel')?.addEventListener('click', () => picker.remove())
  picker.querySelector<HTMLElement>('.picker-confirm')?.addEventListener('click', () => {
    const selected = picker.querySelector('.u-picker__view__column__item--selected')?.textContent ?? ''
    const value = supplement.querySelector<HTMLElement>('.picker-value')
    if (value) value.textContent = selected
    picker.remove()
  })
  root.appendChild(picker)
}

function mockModelItem(name: string, intro: string, battery: number, active = false): string {
  return `<div class="model-item${active ? ' model-item-active' : ''}">
    <div class="model-top-scope"><div class="model-title">${name}</div><div class="model-opt-btn"><span class="mock-setting"><img src="/static/imgs/ico_setting2_dark.png"></span><span>?</span></div></div>
    <div class="model-intro">${intro}</div>
    <div class="model-bottom-scope"><div class="model-battery">${battery} /每条消息</div><div class="model-perm">已解锁此模型</div><div class="model-success-rate"><div class="success-badge">成功率 99.00%</div></div></div>
  </div>`
}

function openMockModelPanel(root: HTMLElement, entry: HTMLElement): void {
  root.querySelector('.model-layer')?.remove()
  const layer = document.createElement('div')
  layer.className = 'u-popup model-layer'
  layer.innerHTML = `<div class="u-popup__content"><div class="model-switch-scope">
    <div class="title">对话模型选择</div>
    <div class="model-filter-tabs"><div class="model-filter-tab active">最近使用</div><div class="model-filter-tab">全部</div><div class="model-filter-tab">Claude</div></div>
    <div class="model-list">${mockModelItem('M2-pro（测试）', '回复速度快，状态栏稳定', 15, true)}${mockModelItem('claude-4.6-opus(逆向）', '逆向性价比极高', 75)}${mockModelItem('deepseek-v4-pro（推荐）', '文风好，强烈推荐', 40)}</div>
  </div><div class="u-popup__content__close">关闭</div></div>`
  layer.querySelector<HTMLElement>('.u-popup__content__close')?.addEventListener('click', () => layer.remove())
  layer.querySelectorAll<HTMLElement>('.model-filter-tab').forEach((filter) => filter.addEventListener('click', () => {
    layer.querySelector('.model-filter-tab.active')?.classList.remove('active')
    filter.classList.add('active')
  }))
  layer.querySelectorAll<HTMLElement>('.model-item').forEach((item) => {
    item.addEventListener('click', (event) => {
      if ((event.target as Element | null)?.closest('.model-opt-btn')) return
      const battery = item.querySelector('.model-battery')?.textContent?.match(/\d+/)?.[0] ?? '0'
      entry.firstChild!.textContent = `${battery} `
      layer.remove()
    })
    item.querySelector<HTMLElement>('.mock-setting')?.addEventListener('click', (event) => {
      event.stopPropagation()
      const name = item.querySelector('.model-title')?.textContent?.trim() ?? ''
      const battery = item.querySelector('.model-battery')?.textContent?.match(/\d+/)?.[0] ?? '0'
      openMockModelConfiguration(root, name, battery)
    })
  })
  root.appendChild(layer)
}

function openMockModelConfiguration(root: HTMLElement, name: string, battery: string): void {
  const panel = document.createElement('div')
  panel.className = 'model-setting-scope theme-dark'
  panel.innerHTML = `<div class="mp-top"><div class="mp-title">模型设置</div><div class="mp-close">×</div></div>
    <div class="mp-info-bar"><div class="mp-model-name">${name}</div><div class="mp-energy-pill"><span class="mp-ev">${battery}</span><span class="mp-el">/次</span></div></div>
    <div class="mp-setting-body"><div class="mp-card"><div class="mp-card-head"><span class="mp-card-title">输出Token上限</span><span class="mp-card-hint">回复不全时可提高</span></div><div class="mp-tokens"><div class="mp-token-btn selected">4000</div><div class="mp-token-btn">8000</div></div></div>
    <div class="mp-switch-row"><div><span class="mp-sw-title">流式输出</span><span class="mp-sw-desc">内容过长时开启</span></div><div class="u-switch"><div class="u-switch__node u-switch__node--on"></div></div></div>
    <div class="mp-preset-card"><div class="mp-card-title">预设提示词</div><div class="mp-preset-list"><div class="mp-preset-item selected"><span class="mp-pi-name">跟随系统</span></div><div class="mp-preset-item"><span class="mp-pi-name">超级思考模式</span></div></div></div></div>
    <div class="bottom"><div class="btn">确定</div></div>`
  panel.querySelector<HTMLElement>('.mp-close')?.addEventListener('click', () => panel.remove())
  panel.querySelector<HTMLElement>('.bottom .btn')?.addEventListener('click', () => panel.remove())
  panel.querySelectorAll<HTMLElement>('.mp-token-btn, .mp-preset-item').forEach((option) => option.addEventListener('click', () => {
    option.parentElement?.querySelector('.selected')?.classList.remove('selected')
    option.classList.add('selected')
  }))
  panel.querySelector<HTMLElement>('.u-switch')?.addEventListener('click', (event) => {
    ;(event.currentTarget as HTMLElement).querySelector('.u-switch__node')?.classList.toggle('u-switch__node--on')
  })
  root.appendChild(panel)
}

function openMockSharePanel(root: HTMLElement): void {
  root.querySelector('.u-popup.share-layer')?.remove()
  const popup = document.createElement('div')
  popup.className = 'u-popup share-layer'
  popup.innerHTML = `
    <div class="u-popup__content">
      <div class="share-popup">
        <div class="share-title">分享角色</div>
        <div class="share-sub-title">https://www.sexyai.ai/#/pages/chat/chat?roleId=mock-role&amp;inviteCode=mock-code</div>
        <div class="gen-link-btn">复制链接</div>
        <div class="u-popup__content__close">关闭</div>
      </div>
    </div>`
  popup.querySelector<HTMLElement>('.gen-link-btn')?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLElement
    button.textContent = '已复制'
  })
  popup.querySelector<HTMLElement>('.u-popup__content__close')?.addEventListener('click', () => popup.remove())
  root.appendChild(popup)
}

function openMockMessageOptions(root: HTMLElement, item: HTMLElement): void {
  root.querySelector('.msg-option-scope')?.remove()
  const panel = document.createElement('div')
  panel.className = 'msg-option-scope'
  const canStartNewStory = item.matches('.item.Ai')
  panel.innerHTML = `
    <div class="msg-options-box">
      <div class="option-item">复制</div>
      <div class="option-item">删除</div>
      <div class="option-item">回溯</div>
      ${canStartNewStory ? '<div class="option-item">开启新的故事</div>' : ''}
    </div>`
  panel.addEventListener('click', (event) => {
    if (event.target === panel) panel.remove()
  })
  const options = [...panel.querySelectorAll<HTMLElement>('.option-item')]
  options[1]?.addEventListener('click', () => {
    panel.remove()
    openMockDeleteConfirmation(root, item)
  })
  options[2]?.addEventListener('click', () => {
    panel.remove()
    openMockRollbackConfirmation(root, item)
  })
  if (canStartNewStory) options[3]?.addEventListener('click', () => {
    const list = item.closest<HTMLElement>('#msglistview')
    if (list) {
      list.innerHTML = ''
      const title = document.createElement('div')
      title.className = 'item Ai'
      title.innerHTML = '<div class="touch-scope"><div class="content left"><p>原型测试角色 · 新故事</p></div></div>'
      list.append(title, item.cloneNode(true))
    }
    panel.remove()
  })
  root.appendChild(panel)
}

function openMockDeleteConfirmation(root: HTMLElement, item: HTMLElement): void {
  const popup = document.createElement('div')
  popup.className = 'u-popup__content'
  popup.innerHTML = `
    <div class="confirm-scope">
      <div class="confirm-title">删除</div>
      <div class="confirm-content">删除后将无法恢复，是否确认删除?</div>
      <div class="confirm-bottom">
        <div class="cancel-btn">取消</div>
        <div class="ok-btn">确定</div>
      </div>
    </div>`
  popup.querySelector<HTMLElement>('.cancel-btn')?.addEventListener('click', () => popup.remove())
  popup.querySelector<HTMLElement>('.ok-btn')?.addEventListener('click', () => {
    item.remove()
    popup.remove()
  })
  root.appendChild(popup)
}

function openMockRollbackConfirmation(root: HTMLElement, item: HTMLElement): void {
  const popup = document.createElement('div')
  popup.className = 'u-popup__content'
  popup.innerHTML = `
    <div class="confirm-scope">
      <div class="confirm-title">回溯</div>
      <div class="confirm-content">回溯将会删除此消息下方的所有消息，并且无法找回，是否确认回溯?</div>
      <div class="confirm-bottom">
        <div class="cancel-btn">取消</div>
        <div class="ok-btn">确定</div>
      </div>
    </div>`
  popup.querySelector<HTMLElement>('.cancel-btn')?.addEventListener('click', () => popup.remove())
  popup.querySelector<HTMLElement>('.ok-btn')?.addEventListener('click', () => {
    let current = item.nextElementSibling
    while (current) {
      const next = current.nextElementSibling
      current.remove()
      current = next
    }
    popup.remove()
  })
  root.appendChild(popup)
}

function streamAssistantMessage(
  list: HTMLElement,
  text: string,
  input: HTMLTextAreaElement,
): void {
  const item = appendMessage(list, 'Ai', '')
  const paragraph = item.querySelector('p')!
  const actions = item.querySelector<HTMLElement>('.modify-btn-scope')!
  actions.firstElementChild?.remove()
  let cursor = 0
  const timer = window.setInterval(() => {
    cursor += 1
    paragraph.textContent = text.slice(0, cursor)
    if (cursor >= text.length) {
      window.clearInterval(timer)
      const regenerate = document.createElement('button')
      regenerate.className = 'modify-btn'
      regenerate.type = 'button'
      regenerate.textContent = '重新生成'
      actions.prepend(regenerate)
      input.disabled = false
    }
  }, 24)
}
