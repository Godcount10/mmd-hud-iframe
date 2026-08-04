import { isProxy, ref } from 'vue'
import { createTestSnapshot } from '../../../../../tests/helpers/snapshot'
import type { ActionRunRecord, BridgeEventRecord, SnapshotRecord } from '../types'
import { buildBridgeDebugExport } from './useLabExport'

function createReactiveExportInput() {
  const snapshot = createTestSnapshot()
  snapshot.messages.push({
    id: 'message-1',
    role: 'assistant',
    index: 0,
    text: '私密消息',
    html: '<p>私密消息</p>',
    streaming: false,
    capabilities: {
      copy: true,
      edit: false,
      delete: false,
      regenerate: false,
      rollback: false,
      startNewStory: false,
      previousBranch: false,
      nextBranch: false,
    },
  })
  snapshot.sharePanel.link = 'https://example.com/private'

  const snapshots = ref<SnapshotRecord[]>([{
    revision: snapshot.revision,
    capturedAt: '2026-08-04T00:00:00.000Z',
    snapshot,
  }])
  const events = ref<BridgeEventRecord[]>([{
    id: 1,
    receivedAt: '2026-08-04T00:00:01.000Z',
    revision: snapshot.revision,
    event: { type: 'snapshot', snapshot },
  }])
  const actionRuns = ref<ActionRunRecord[]>([{
    id: 1,
    action: 'sendMessage',
    sourceRevision: snapshot.revision,
    startedAt: '2026-08-04T00:00:02.000Z',
    finishedAt: '2026-08-04T00:00:02.100Z',
    durationMs: 100,
    capability: { available: true },
    payload: { text: '待发送消息' },
    result: {
      ok: true,
      action: 'sendMessage',
      data: { confirmationToken: 'private-token' },
    },
  }])

  return { snapshots, events, actionRuns }
}

describe('buildBridgeDebugExport', () => {
  it('exports Vue reactive history collections without cloning Proxy values', () => {
    const { snapshots, events, actionRuns } = createReactiveExportInput()
    expect(isProxy(snapshots.value)).toBe(true)
    expect(isProxy(events.value)).toBe(true)
    expect(isProxy(actionRuns.value)).toBe(true)

    const result = buildBridgeDebugExport({
      snapshots: snapshots.value,
      events: events.value,
      actionRuns: actionRuns.value,
      droppedSnapshots: 0,
      droppedEvents: 0,
      droppedActionRuns: 0,
      full: true,
    })

    expect(result.snapshots[0]?.snapshot.messages[0]?.text).toBe('私密消息')
    expect(result.actionRuns[0]?.payload).toEqual({ text: '待发送消息' })
    expect(() => JSON.stringify(result)).not.toThrow()
  })

  it('redacts reactive history after converting it to exportable data', () => {
    const { snapshots, events, actionRuns } = createReactiveExportInput()

    const result = buildBridgeDebugExport({
      snapshots: snapshots.value,
      events: events.value,
      actionRuns: actionRuns.value,
      droppedSnapshots: 0,
      droppedEvents: 0,
      droppedActionRuns: 0,
    })

    expect(result.snapshots[0]?.snapshot.messages[0]?.text).toBe('[REDACTED 4 chars]')
    expect(result.snapshots[0]?.snapshot.sharePanel.link).toBe('[REDACTED]')
    expect(result.actionRuns[0]?.payload).toEqual({ text: '[REDACTED 5 chars]' })
    expect(result.actionRuns[0]?.result.data).toEqual({ confirmationToken: '[REDACTED]' })
  })
})
