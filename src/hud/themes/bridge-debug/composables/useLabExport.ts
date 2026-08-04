import { ACTION_DEBUG_MANIFEST } from '../actionDebugManifest'
import { MAX_ACTION_RUNS } from './useActionExecutor'
import { MAX_TIMELINE } from './useBridgeLab'
import { MAX_SNAPSHOTS } from './useSnapshotHistory'
import { redactForExport } from '../utils/redactExport'
import { cloneDebugValue } from '../utils/cloneDebugValue'
import type { ActionRunRecord, BridgeDebugExport, BridgeEventRecord, SnapshotRecord } from '../types'

export function buildBridgeDebugExport(input: {
  snapshots: SnapshotRecord[]
  events: BridgeEventRecord[]
  actionRuns: ActionRunRecord[]
  droppedSnapshots: number
  droppedEvents: number
  droppedActionRuns: number
  full?: boolean
}): BridgeDebugExport {
  const manifest = Object.values(ACTION_DEBUG_MANIFEST)
  const value: BridgeDebugExport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    theme: 'bridge-debug',
    retention: {
      maxSnapshots: MAX_SNAPSHOTS,
      maxTimeline: MAX_TIMELINE,
      maxActionRuns: MAX_ACTION_RUNS,
      droppedSnapshots: input.droppedSnapshots,
      droppedEvents: input.droppedEvents,
      droppedActionRuns: input.droppedActionRuns,
    },
    manifest: {
      total: manifest.length,
      registered: manifest.filter((item) => item.support === 'registered').length,
      contractOnly: manifest.filter((item) => item.support === 'contract-only').length,
    },
    snapshots: cloneDebugValue(input.snapshots),
    events: cloneDebugValue(input.events),
    actionRuns: cloneDebugValue(input.actionRuns),
  }
  return input.full ? value : redactForExport(value) as BridgeDebugExport
}

export function downloadBridgeDebugExport(value: BridgeDebugExport): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `mmd-bridge-debug-${value.generatedAt.replace(/[:.]/g, '-')}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
