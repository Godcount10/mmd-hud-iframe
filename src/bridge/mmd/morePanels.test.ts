// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationOptionSnapshot, DeleteConversationResult } from '../../contracts'
import { invokeRegisteredAction } from '../actions/actionRegistry'
import {
  findConversationItem,
  readConversationPanel,
} from './morePanels'

function visibleRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 32,
    top: 0,
    right: 100,
    bottom: 32,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect
}

function conversationItem(title: string, preview: string, avatar: string, current = false): string {
  return `<div class="conversation-item">
    <div class="left-scope"><div class="avatar"><img src="${avatar}"></div></div>
    <div class="center-scope"><div class="title-scope"><uni-view>${title}</uni-view>${current ? '<div class="cur-conversation">当前</div>' : ''}</div><div class="content-scope">${preview}</div></div>
    <button class="edit-icon">编辑</button><button class="delete-icon">删除</button>
  </div>`
}

function appendDeleteDialog(onConfirm?: () => void, onCancel?: () => void): HTMLElement {
  const popup = document.createElement('div')
  popup.className = 'u-popup__content'
  popup.innerHTML = `<div class="confirm-scope"><div class="confirm-title">删除聊天记录</div><div class="confirm-content">确认删除这条聊天记录？</div><div class="confirm-bottom"><button class="cancel-btn">取消</button><button class="ok-btn">确定</button></div></div>`
  popup.querySelector('.cancel-btn')?.addEventListener('click', () => {
    onCancel?.()
    popup.remove()
  })
  popup.querySelector('.ok-btn')?.addEventListener('click', () => {
    onConfirm?.()
    popup.remove()
  })
  document.body.appendChild(popup)
  return popup.querySelector<HTMLElement>('.confirm-scope')!
}

function appendRenameDialog(
  onConfirm?: (value: string) => void,
  onCancel?: () => void,
): HTMLElement {
  const popup = document.createElement('div')
  popup.innerHTML = `<div class="confirm-edit-scope"><div class="confirm-edit-title">聊天记录备注</div><input class="uni-input-input" maxlength="140"><button class="cancel-btn">取消</button><button class="ok-btn">确定</button></div>`
  const dialog = popup.querySelector<HTMLElement>('.confirm-edit-scope')!
  const input = dialog.querySelector<HTMLInputElement>('input')!
  dialog.querySelector('.cancel-btn')?.addEventListener('click', () => {
    onCancel?.()
    popup.remove()
  })
  dialog.querySelector('.ok-btn')?.addEventListener('click', () => {
    onConfirm?.(input.value)
    popup.remove()
  })
  document.body.appendChild(popup)
  return dialog
}

function installConversationDom(): void {
  document.body.innerHTML = `
    <div class="conversation-list-scope">
      <div class="title">开启新的聊天</div>
      <div class="conversation-list">
        <div class="conversation-item">
          <div class="left-scope"><div class="avatar"><img src="/same.png"></div></div>
          <div class="center-scope"><div class="title-scope"><uni-view>重复标题</uni-view><div class="cur-conversation">当前</div></div><div class="content-scope">重复预览</div></div>
          <button class="edit-icon">编辑</button><button class="delete-icon">删除</button>
        </div>
        <div class="conversation-item">
          <div class="left-scope"><div class="avatar"><img src="/other.png"></div></div>
          <div class="center-scope"><div class="title-scope"><uni-view>重复标题</uni-view></div><div class="content-scope">重复预览</div></div>
          <button class="edit-icon">编辑</button><button class="delete-icon">删除</button>
        </div>
      </div>
    </div>`
}

function payload(conversation: ConversationOptionSnapshot, extra: Record<string, unknown> = {}) {
  return {
    conversationId: conversation.id,
    fingerprint: conversation.fingerprint,
    index: conversation.index,
    ...extra,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: visibleRect,
  })
  Object.defineProperty(window, 'PointerEvent', {
    configurable: true,
    value: undefined,
  })
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 1),
  })
  installConversationDom()
})

describe('native conversation references', () => {
  it('uses snapshot index and fingerprint validation and fails closed after reorder', () => {
    const snapshot = readConversationPanel(document)
    expect(snapshot.conversations).toHaveLength(2)
    expect(snapshot.conversations[0]?.fingerprint).not.toBe(snapshot.conversations[1]?.fingerprint)
    expect(snapshot.conversations[0]?.id).not.toBe(snapshot.conversations[1]?.id)

    const panel = document.querySelector<HTMLElement>('.conversation-list-scope')!
    const target = snapshot.conversations[1]!
    expect(findConversationItem(panel, target)).toBe(
      panel.querySelectorAll('.conversation-item')[1],
    )
    panel.querySelector('.conversation-list')?.prepend(
      panel.querySelectorAll('.conversation-item')[1]!,
    )
    expect(findConversationItem(panel, target)).toBeNull()
  })

  it('only exposes destructive capability on non-current rows with both semantic icons', () => {
    const snapshot = readConversationPanel(document)
    expect(snapshot.conversations[0]?.capabilities).toEqual({ rename: true, delete: false })
    expect(snapshot.conversations[1]?.capabilities).toEqual({ rename: true, delete: true })

    document.querySelectorAll('.conversation-item')[1]?.querySelector('.edit-icon')?.remove()
    expect(readConversationPanel(document).conversations[1]?.capabilities)
      .toEqual({ rename: false, delete: false })
  })
})

describe('native conversation mutations', () => {
  it('renames through the validated 140-character native dialog and verifies the title', async () => {
    const target = readConversationPanel(document).conversations[1]!
    document.querySelectorAll<HTMLElement>('.edit-icon')[1]?.addEventListener('click', () => {
      const popup = document.createElement('div')
      popup.innerHTML = `<div class="confirm-edit-scope"><div class="confirm-edit-title">聊天记录备注</div><input class="uni-input-input" maxlength="140"><button class="cancel-btn">取消</button><button class="ok-btn">确定</button></div>`
      const input = popup.querySelector<HTMLInputElement>('input')!
      popup.querySelector('.cancel-btn')?.addEventListener('click', () => popup.remove())
      popup.querySelector('.ok-btn')?.addEventListener('click', () => {
        const title = document.querySelectorAll('.conversation-item')[1]?.querySelector('uni-view')
        if (title) title.textContent = input.value
        popup.remove()
      })
      document.body.appendChild(popup)
    })

    const promise = invokeRegisteredAction(
      'renameConversation',
      payload(target, { title: '新的备注' }),
      { document, messages: [] },
    )
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true, action: 'renameConversation' })
    expect(readConversationPanel(document).conversations[1]?.title).toBe('新的备注')
  })

  it('closes a pre-existing A rename dialog and writes only the fresh B dialog', async () => {
    const target = readConversationPanel(document).conversations[1]!
    let staleValue = ''
    let staleCancelled = false
    const stale = appendRenameDialog(
      (value) => { staleValue = value },
      () => { staleCancelled = true },
    )
    let fresh: HTMLElement | null = null
    document.querySelectorAll<HTMLElement>('.edit-icon')[1]?.addEventListener('click', () => {
      fresh = appendRenameDialog((value) => {
        const title = document.querySelectorAll('.conversation-item')[1]?.querySelector('uni-view')
        if (title) title.textContent = value
      })
    })

    const promise = invokeRegisteredAction(
      'renameConversation',
      payload(target, { title: 'B 的新备注' }),
      { document, messages: [] },
    )
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toMatchObject({ ok: true })
    expect(staleCancelled).toBe(true)
    expect(stale.isConnected).toBe(false)
    expect(fresh).not.toBe(stale)
    expect(staleValue).toBe('')
    expect(readConversationPanel(document).conversations[1]?.title).toBe('B 的新备注')
  })

  it('requires request/confirmation and verifies list shrink plus target disappearance', async () => {
    const target = readConversationPanel(document).conversations[1]!
    document.querySelectorAll<HTMLElement>('.delete-icon')[1]?.addEventListener('click', () => {
      const popup = document.createElement('div')
      popup.className = 'u-popup__content'
      popup.innerHTML = `<div class="confirm-scope"><div class="confirm-title">删除聊天记录</div><div class="confirm-content">确认删除这条聊天记录？</div><div class="confirm-bottom"><button class="cancel-btn">取消</button><button class="ok-btn">确定</button></div></div>`
      popup.querySelector('.ok-btn')?.addEventListener('click', () => {
        document.querySelectorAll('.conversation-item')[1]?.remove()
        popup.remove()
      })
      document.body.appendChild(popup)
    })

    const request = invokeRegisteredAction(
      'requestDeleteConversation', payload(target), { document, messages: [] },
    )
    await vi.runAllTimersAsync()
    const requestResult = await request
    expect(requestResult, JSON.stringify(requestResult)).toMatchObject({ ok: true, action: 'requestDeleteConversation' })
    if (!requestResult.ok) throw new Error(requestResult.error?.message)
    const requestData = requestResult.data as Extract<DeleteConversationResult, { phase: 'confirmation-required' }>

    const deletion = invokeRegisteredAction(
      'deleteConversation', payload(target, {
        confirmationToken: requestData.confirmation.confirmationToken,
      }), { document, messages: [] },
    )
    await vi.runAllTimersAsync()
    await expect(deletion).resolves.toMatchObject({ ok: true, action: 'deleteConversation' })
    const current = readConversationPanel(document)
    expect(current.conversations).toHaveLength(1)
    expect(current.conversations.some((conversation) => conversation.fingerprint === target.fingerprint))
      .toBe(false)
    expect(current.conversations.some((conversation) => conversation.id === target.id)).toBe(false)
  })

  it('closes a pre-existing A dialog and binds only the new dialog opened for B', async () => {
    const target = readConversationPanel(document).conversations[1]!
    let staleConfirmed = false
    let staleCancelled = false
    const staleDialog = appendDeleteDialog(
      () => { staleConfirmed = true },
      () => { staleCancelled = true },
    )
    let freshDialog: HTMLElement | null = null
    document.querySelectorAll<HTMLElement>('.delete-icon')[1]?.addEventListener('click', () => {
      freshDialog = appendDeleteDialog(() => {
        document.querySelectorAll('.conversation-item')[1]?.remove()
      })
    })

    const request = invokeRegisteredAction(
      'requestDeleteConversation', payload(target), { document, messages: [] },
    )
    await vi.runAllTimersAsync()
    const result = await request
    if (!result.ok) throw new Error(result.error?.message)
    const data = result.data as Extract<DeleteConversationResult, { phase: 'confirmation-required' }>

    expect(staleCancelled).toBe(true)
    expect(staleDialog.isConnected).toBe(false)
    expect(freshDialog).not.toBeNull()
    expect(freshDialog).not.toBe(staleDialog)

    const deletion = invokeRegisteredAction(
      'deleteConversation', payload(target, {
        confirmationToken: data.confirmation.confirmationToken,
      }), { document, messages: [] },
    )
    await vi.runAllTimersAsync()
    await expect(deletion).resolves.toMatchObject({ ok: true })
    expect(staleConfirmed).toBe(false)
  })

  it('verifies a non-last deletion by ordered surviving fingerprints after IDs reindex', async () => {
    document.querySelector('.conversation-list')!.innerHTML = [
      conversationItem('当前会话', '预览 A', '/a.png', true),
      conversationItem('中间会话', '预览 B', '/b.png'),
      conversationItem('末尾会话', '预览 C', '/c.png'),
    ].join('')
    const before = readConversationPanel(document).conversations
    const target = before[1]!
    const lastBefore = before[2]!
    document.querySelectorAll<HTMLElement>('.delete-icon')[1]?.addEventListener('click', () => {
      appendDeleteDialog(() => {
        document.querySelectorAll('.conversation-item')[1]?.remove()
      })
    })

    const request = invokeRegisteredAction(
      'requestDeleteConversation', payload(target), { document, messages: [] },
    )
    await vi.runAllTimersAsync()
    const requestResult = await request
    if (!requestResult.ok) throw new Error(requestResult.error?.message)
    const requestData = requestResult.data as Extract<DeleteConversationResult, { phase: 'confirmation-required' }>
    const deletion = invokeRegisteredAction(
      'deleteConversation', payload(target, {
        confirmationToken: requestData.confirmation.confirmationToken,
      }), { document, messages: [] },
    )
    await vi.runAllTimersAsync()

    await expect(deletion).resolves.toMatchObject({ ok: true, data: { phase: 'deleted' } })
    const after = readConversationPanel(document).conversations
    expect(after.map((conversation) => conversation.fingerprint)).toEqual([
      before[0]!.fingerprint,
      lastBefore.fingerprint,
    ])
    expect(after[1]!.id).not.toBe(lastBefore.id)
    expect(after.some((conversation) => conversation.fingerprint === target.fingerprint)).toBe(false)
  })

  it('invalidates an earlier token when a newer delete request supersedes it', async () => {
    const target = readConversationPanel(document).conversations[1]!
    document.querySelectorAll<HTMLElement>('.delete-icon')[1]?.addEventListener('click', () => {
      const popup = document.createElement('div')
      popup.className = 'u-popup__content'
      popup.innerHTML = `<div class="confirm-scope"><div class="confirm-title">删除聊天记录</div><div class="confirm-content">确认删除这条聊天记录？</div><div class="confirm-bottom"><button class="cancel-btn">取消</button><button class="ok-btn">确定</button></div></div>`
      document.body.appendChild(popup)
    })

    const firstRequest = invokeRegisteredAction(
      'requestDeleteConversation', payload(target), { document, messages: [] },
    )
    await vi.runAllTimersAsync()
    const firstResult = await firstRequest
    if (!firstResult.ok) throw new Error(firstResult.error?.message)
    const firstData = firstResult.data as Extract<DeleteConversationResult, { phase: 'confirmation-required' }>
    document.querySelector('.confirm-scope')?.closest('.u-popup__content')?.remove()

    const secondRequest = invokeRegisteredAction(
      'requestDeleteConversation', payload(target), { document, messages: [] },
    )
    await vi.runAllTimersAsync()
    const secondResult = await secondRequest
    if (!secondResult.ok) throw new Error(secondResult.error?.message)

    await expect(invokeRegisteredAction(
      'deleteConversation', payload(target, {
        confirmationToken: firstData.confirmation.confirmationToken,
      }), { document, messages: [] },
    )).resolves.toMatchObject({ ok: false, error: { code: 'NOT_AVAILABLE' } })
  })

  it('rejects missing, wrong-target, stale-dialog, expired, and replayed confirmations', async () => {
    const conversations = readConversationPanel(document).conversations
    const target = conversations[1]!
    const current = conversations[0]!
    let deleteClicks = 0
    document.querySelectorAll<HTMLElement>('.delete-icon')[1]?.addEventListener('click', () => {
      deleteClicks += 1
      const popup = document.createElement('div')
      popup.className = 'u-popup__content'
      popup.innerHTML = `<div class="confirm-scope"><div class="confirm-title">删除聊天记录</div><div class="confirm-content">确认删除这条聊天记录？</div><div class="confirm-bottom"><button class="cancel-btn">取消</button><button class="ok-btn">确定</button></div></div>`
      popup.querySelector('.cancel-btn')?.addEventListener('click', () => popup.remove())
      document.body.appendChild(popup)
    })

    await expect(invokeRegisteredAction(
      'deleteConversation', payload(target), { document, messages: [] },
    )).resolves.toMatchObject({ ok: false, error: { code: 'NOT_AVAILABLE' } })

    const firstRequest = invokeRegisteredAction(
      'requestDeleteConversation', payload(target), { document, messages: [] },
    )
    await vi.runAllTimersAsync()
    const firstResult = await firstRequest
    if (!firstResult.ok) throw new Error(firstResult.error?.message)
    const firstData = firstResult.data as Extract<DeleteConversationResult, { phase: 'confirmation-required' }>
    const firstToken = firstData.confirmation.confirmationToken

    await expect(invokeRegisteredAction(
      'deleteConversation', payload(current, { confirmationToken: firstToken }), { document, messages: [] },
    )).resolves.toMatchObject({ ok: false, error: { code: 'NOT_AVAILABLE' } })
    expect(deleteClicks).toBe(1)

    document.querySelector('.confirm-scope')?.closest('.u-popup__content')?.remove()
    const secondRequest = invokeRegisteredAction(
      'requestDeleteConversation', payload(target), { document, messages: [] },
    )
    await vi.runAllTimersAsync()
    const secondResult = await secondRequest
    if (!secondResult.ok) throw new Error(secondResult.error?.message)
    const secondData = secondResult.data as Extract<DeleteConversationResult, { phase: 'confirmation-required' }>
    const secondToken = secondData.confirmation.confirmationToken

    const replacement = document.querySelector('.confirm-scope')?.closest('.u-popup__content')?.cloneNode(true)
    document.querySelector('.confirm-scope')?.closest('.u-popup__content')?.remove()
    if (replacement) document.body.appendChild(replacement)
    await expect(invokeRegisteredAction(
      'deleteConversation', payload(target, { confirmationToken: secondToken }), { document, messages: [] },
    )).resolves.toMatchObject({ ok: false, error: { code: 'NOT_AVAILABLE' } })

    document.querySelector('.confirm-scope')?.closest('.u-popup__content')?.remove()
    const thirdRequest = invokeRegisteredAction(
      'requestDeleteConversation', payload(target), { document, messages: [] },
    )
    await vi.runAllTimersAsync()
    const thirdResult = await thirdRequest
    if (!thirdResult.ok) throw new Error(thirdResult.error?.message)
    const thirdData = thirdResult.data as Extract<DeleteConversationResult, { phase: 'confirmation-required' }>
    const thirdToken = thirdData.confirmation.confirmationToken
    vi.advanceTimersByTime(30_001)
    await expect(invokeRegisteredAction(
      'deleteConversation', payload(target, { confirmationToken: thirdToken }), { document, messages: [] },
    )).resolves.toMatchObject({ ok: false, error: { code: 'NOT_AVAILABLE' } })

    await expect(invokeRegisteredAction(
      'deleteConversation', payload(target, { confirmationToken: thirdToken }), { document, messages: [] },
    )).resolves.toMatchObject({ ok: false, error: { code: 'NOT_AVAILABLE' } })
  })

  it('rejects deleting the current row and stale title-only references', async () => {
    const current = readConversationPanel(document).conversations[0]!
    await expect(invokeRegisteredAction(
      'requestDeleteConversation', payload(current), { document, messages: [] },
    )).resolves.toMatchObject({ ok: false, error: { code: 'NOT_AVAILABLE' } })
    await expect(invokeRegisteredAction(
      'renameConversation', { conversationId: current.id, title: '误改' }, { document, messages: [] },
    )).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_ARGUMENT' } })
  })
})
