import type { ActionResult, BridgeEvent, ChatSnapshot, NativeAction } from '../../../contracts'

export type ActionGroup =
  | '输入与生成'
  | '消息'
  | '编辑'
  | '顶部与分享'
  | '模型'
  | '对话设置'
  | '更多菜单'
  | '会话'
  | '用户人设'
  | '设定补充'
  | '指令'
  | '生命周期'

export type ActionEffect = 'read' | 'write' | 'destructive'

export type PayloadKind =
  | 'none'
  | 'text'
  | 'message'
  | 'edit-transform'
  | 'edit-submit'
  | 'model-filter'
  | 'model'
  | 'model-setting'
  | 'more-item'
  | 'conversation'
  | 'conversation-title'
  | 'conversation-delete'
  | 'persona-mode'
  | 'persona-name'
  | 'persona-gender'
  | 'persona-identity'
  | 'persona-submit'
  | 'supplement-text'
  | 'supplement-choice'
  | 'instruction'
  | 'contract-only'

export interface ActionDebugDefinition {
  action: NativeAction
  label: string
  description: string
  group: ActionGroup
  support: 'registered' | 'contract-only'
  effect: ActionEffect
  payloadKind: PayloadKind
  confirm: boolean
  workflow?: 'edit' | 'model' | 'persona' | 'supplement' | 'message-delete' | 'conversation-delete'
}

export interface ActionRunRecord {
  id: number
  action: NativeAction
  sourceRevision: number
  startedAt: string
  finishedAt: string
  durationMs: number
  capability: ChatSnapshot['capabilities'][NativeAction]
  payload?: unknown
  result: ActionResult
}

export interface BridgeEventRecord {
  id: number
  receivedAt: string
  event: BridgeEvent
  revision: number | null
}

export interface SnapshotRecord {
  revision: number
  capturedAt: string
  snapshot: ChatSnapshot
}

export interface SnapshotDiffEntry {
  path: string
  operation: 'added' | 'removed' | 'changed'
  before?: unknown
  after?: unknown
}

export interface PendingConfirmation {
  kind: 'message-delete' | 'conversation-delete'
  action: NativeAction
  expiresAt: number
  prompt: string
  payload: Record<string, unknown>
  targetLabel: string
}

export interface BridgeDebugExport {
  schemaVersion: 1
  generatedAt: string
  theme: 'bridge-debug'
  retention: {
    maxSnapshots: number
    maxTimeline: number
    maxActionRuns: number
    droppedSnapshots: number
    droppedEvents: number
    droppedActionRuns: number
  }
  manifest: {
    total: number
    registered: number
    contractOnly: number
  }
  snapshots: SnapshotRecord[]
  events: BridgeEventRecord[]
  actionRuns: ActionRunRecord[]
}
