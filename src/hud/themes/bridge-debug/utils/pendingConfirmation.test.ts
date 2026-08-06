import type { ActionResult } from '../../../../contracts'
import { pendingConfirmationFromResult } from './pendingConfirmation'

const NOW = 1_786_000_000_000

describe('pendingConfirmationFromResult', () => {
  it('connects requestDeleteConversation to the deleteConversation token phase', () => {
    const result: ActionResult = {
      ok: true,
      action: 'requestDeleteConversation',
      data: {
        phase: 'confirmation-required',
        conversationId: 'conversation-2',
        confirmation: {
          conversationId: 'conversation-2',
          fingerprint: 'fingerprint-2',
          index: 2,
          confirmationToken: 'token-2',
          prompt: '确认删除测试会话',
        },
      },
    }

    expect(pendingConfirmationFromResult(result, NOW)).toEqual({
      kind: 'conversation-delete',
      action: 'deleteConversation',
      expiresAt: NOW + 30_000,
      prompt: '确认删除测试会话',
      targetLabel: 'conversation-2',
      payload: {
        conversationId: 'conversation-2',
        fingerprint: 'fingerprint-2',
        index: 2,
        confirmationToken: 'token-2',
      },
    })
  })

  it('ignores completed and unrelated action results', () => {
    expect(pendingConfirmationFromResult({
      ok: true,
      action: 'deleteConversation',
      data: { phase: 'deleted', conversationId: 'conversation-2' },
    }, NOW)).toBeNull()

    expect(pendingConfirmationFromResult({
      ok: false,
      action: 'requestDeleteConversation',
      error: { code: 'NOT_AVAILABLE', message: '不可用' },
    }, NOW)).toBeNull()
  })
})
