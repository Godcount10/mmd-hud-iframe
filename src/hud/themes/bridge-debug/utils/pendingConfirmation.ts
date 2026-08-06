import type { ActionResult, DeleteConversationResult, DeleteMessageResult } from '../../../../contracts'
import type { PendingConfirmation } from '../types'

export function pendingConfirmationFromResult(result: ActionResult, now = Date.now()): PendingConfirmation | null {
  if (!result.ok || !result.data || typeof result.data !== 'object') return null

  if (result.action === 'deleteMessage') {
    const data = result.data as DeleteMessageResult
    if (data.phase !== 'confirmation-required') return null
    const confirmation = data.confirmation
    return {
      kind: 'message-delete',
      action: 'deleteMessage',
      expiresAt: now + 30_000,
      prompt: confirmation.prompt,
      targetLabel: confirmation.messageId,
      payload: {
        messageId: confirmation.messageId,
        confirmationToken: confirmation.confirmationToken,
      },
    }
  }

  if (result.action === 'requestDeleteConversation') {
    const data = result.data as DeleteConversationResult
    if (data.phase !== 'confirmation-required') return null
    const confirmation = data.confirmation
    return {
      kind: 'conversation-delete',
      action: 'deleteConversation',
      expiresAt: now + 30_000,
      prompt: confirmation.prompt,
      targetLabel: confirmation.conversationId,
      payload: {
        conversationId: confirmation.conversationId,
        fingerprint: confirmation.fingerprint,
        index: confirmation.index,
        confirmationToken: confirmation.confirmationToken,
      },
    }
  }

  return null
}
