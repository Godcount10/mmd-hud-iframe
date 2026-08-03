import { computed, onUnmounted, ref, type Ref } from 'vue'
import type { ActionResult, ChatSnapshot, NativeAction } from '../../../../contracts'
import { ACTION_DEBUG_MANIFEST } from '../actionDebugManifest'
import type { ActionRunRecord, PendingConfirmation } from '../types'
import { cloneDebugValue } from '../utils/cloneDebugValue'

export const MAX_ACTION_RUNS = 200

export function useActionExecutor(
  snapshot: Readonly<Ref<ChatSnapshot>>,
  invoke: <T = unknown>(action: NativeAction, payload?: unknown) => Promise<ActionResult<T>>,
) {
  const actionRuns = ref<ActionRunRecord[]>([])
  const pending = ref(false)
  const pendingConfirmation = ref<PendingConfirmation | null>(null)
  const droppedActionRuns = ref(0)
  let runId = 0
  let confirmationTimer: ReturnType<typeof setInterval> | null = null

  const clearConfirmation = () => {
    pendingConfirmation.value = null
    if (confirmationTimer) clearInterval(confirmationTimer)
    confirmationTimer = null
  }

  const setConfirmation = (confirmation: PendingConfirmation) => {
    clearConfirmation()
    pendingConfirmation.value = confirmation
    confirmationTimer = setInterval(() => {
      if (pendingConfirmation.value && Date.now() >= pendingConfirmation.value.expiresAt) clearConfirmation()
    }, 250)
  }

  const execute = async <T = unknown>(action: NativeAction, payload?: unknown): Promise<ActionResult<T>> => {
    const definition = ACTION_DEBUG_MANIFEST[action]
    if (definition.support === 'contract-only') {
      return { ok: false, action, error: { code: 'NOT_AVAILABLE', message: '该动作只有协议声明，当前没有 handler。' } }
    }
    if (pending.value) {
      return { ok: false, action, error: { code: 'NOT_AVAILABLE', message: '已有原生动作正在执行。' } }
    }

    const capability = cloneDebugValue(snapshot.value.capabilities[action])
    if (!capability.available) {
      return { ok: false, action, error: { code: 'NOT_AVAILABLE', message: capability.reason ?? '当前不可用' } }
    }

    pending.value = true
    const startedAt = new Date()
    const sourceRevision = snapshot.value.revision
    let result: ActionResult<T>
    try {
      result = await invoke<T>(action, payload)
    } catch (error) {
      result = {
        ok: false,
        action,
        error: { code: 'UNKNOWN', message: error instanceof Error ? error.message : '调试台调用失败' },
      }
    } finally {
      pending.value = false
    }
    const finishedAt = new Date()
    actionRuns.value.unshift({
      id: ++runId,
      action,
      sourceRevision,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      capability,
      payload: payload === undefined ? undefined : cloneDebugValue(payload),
      result: cloneDebugValue(result),
    })
    if (actionRuns.value.length > MAX_ACTION_RUNS) {
      droppedActionRuns.value += actionRuns.value.splice(MAX_ACTION_RUNS).length
    }
    return result
  }

  onUnmounted(clearConfirmation)

  return {
    actionRuns,
    pending,
    pendingConfirmation,
    droppedActionRuns,
    confirmationRemaining: computed(() => pendingConfirmation.value
      ? Math.max(0, pendingConfirmation.value.expiresAt - Date.now())
      : 0),
    execute,
    setConfirmation,
    clearConfirmation,
    clearActionRuns: () => {
      actionRuns.value = []
      droppedActionRuns.value = 0
    },
  }
}
