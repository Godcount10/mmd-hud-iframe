import {
  ALL_NATIVE_ACTIONS,
  type ActionResult,
  type BridgeEvent,
  type ChatSnapshot,
  type NativeAction,
} from '../contracts'
import type {
  FrameToHostMessage,
  HostHandshake,
  HostToFrameMessage,
  HudControlCommand,
  HudThemeId,
  InvokeRequest,
  ProtocolErrorCode,
} from './messages'
import { IFRAME_PROTOCOL_NAME, IFRAME_PROTOCOL_VERSION } from './messages'

export interface DecodeSuccess<T> {
  ok: true
  value: T
}

export interface DecodeFailure {
  ok: false
  error: string
  requestId?: string
}

export type DecodeResult<T> = DecodeSuccess<T> | DecodeFailure

const ACTIONS = new Set<string>(ALL_NATIVE_ACTIONS)
const HUD_CONTROLS = new Set<string>(['hide', 'destroy', 'reload-frame'] satisfies HudControlCommand[])
const THEMES = new Set<string>(['game', 'bridge-debug'] satisfies HudThemeId[])
const BRIDGE_EVENT_TYPES = new Set<string>([
  'ready',
  'snapshot',
  'generation-started',
  'generation-streaming',
  'generation-finished',
  'error',
])
const PROTOCOL_ERROR_CODES = new Set<string>([
  'INVALID_MESSAGE',
  'VERSION_MISMATCH',
  'BUILD_MISMATCH',
  'CHANNEL_MISMATCH',
  'DUPLICATE_REQUEST_ID',
  'REQUEST_CANCELLED',
  'TIMEOUT',
  'HOST_DESTROYED',
  'INTERNAL_ERROR',
] satisfies ProtocolErrorCode[])

const NO_PAYLOAD_ACTIONS = new Set<NativeAction>([
  'exit',
  'cancelEditMessage',
  'openComments',
  'openSharePanel',
  'copyShareLink',
  'closeSharePanel',
  'toggleFavorite',
  'refreshConversation',
  'openModelSettings',
  'closeModelSettings',
  'submitModelConfiguration',
  'closeModelConfiguration',
  'openChatSettings',
  'closeChatSettings',
  'submitChatSettings',
  'openMoreMenu',
  'closeMoreMenu',
  'openTutorial',
  'openBackgroundPanel',
  'openCustomInstructions',
  'openConversationPanel',
  'createConversation',
  'closeConversationPanel',
  'openPersona',
  'closePersona',
  'openSupplement',
  'openSupplementPositionPicker',
  'confirmSupplementPosition',
  'cancelSupplementPosition',
  'closeSupplement',
  'openPromptSelector',
  'closePromptSelector',
])

const CONTRACT_ONLY_ACTIONS = new Set<NativeAction>([
  'stopGeneration',
  'continueGeneration',
  'editMessage',
  'previousBranch',
  'nextBranch',
  'newChat',
])

const SINGLE_STRING_FIELD_ACTIONS = {
  sendMessage: 'text',
  setInputText: 'text',
  copyMessage: 'messageId',
  regenerateMessage: 'messageId',
  openEditMessage: 'messageId',
  setEditText: 'text',
  applyEditTransform: 'transformId',
  rollbackMessage: 'messageId',
  startNewStoryFromMessage: 'messageId',
  selectModelFilter: 'filterId',
  selectModel: 'modelId',
  openModelConfiguration: 'modelId',
  activateMoreMenuItem: 'itemId',
  setPersonaMode: 'modeId',
  setPersonaName: 'name',
  setPersonaGender: 'genderId',
  setPersonaIdentity: 'identity',
  setSupplementText: 'text',
  setSupplementPosition: 'choiceId',
  submitSupplement: 'text',
} as const satisfies Partial<Record<NativeAction, string>>

function success<T>(value: T): DecodeSuccess<T> {
  return { ok: true, value }
}

function failure(error: string, requestId?: string): DecodeFailure {
  return requestId ? { ok: false, error, requestId } : { ok: false, error }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown, maxLength = 512): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.every((key) => allowed.includes(key))
}

function isBoundedString(value: unknown, maxLength = 100_000): value is string {
  return typeof value === 'string' && value.length <= maxLength
}

function hasStringFields(value: unknown, fields: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  if (!isRecord(value) || !hasOnlyKeys(value, [...fields, ...optional])) return false
  if (!fields.every((field) => isBoundedString(value[field]))) return false
  return optional.every((field) => value[field] === undefined || isBoundedString(value[field]))
}

function hasConversationReference(value: unknown, extraRequired: readonly string[] = [], optional: readonly string[] = []): value is Record<string, unknown> {
  const stringFields = ['conversationId', 'fingerprint', ...extraRequired]
  if (!isRecord(value) || !hasOnlyKeys(value, [...stringFields, 'index', ...optional])) return false
  if (!stringFields.every((field) => isNonEmptyString(value[field], 100_000))) return false
  if (!optional.every((field) => value[field] === undefined || isNonEmptyString(value[field], 100_000))) return false
  return Number.isInteger(value.index) && (value.index as number) >= 0
}

function isInstructionReference(value: unknown): value is Record<string, unknown> {
  const fields = ['instructionId', 'revision', 'fingerprint', 'label']
  if (!isRecord(value) || !hasOnlyKeys(value, [...fields, 'index'])) return false
  if (!fields.every((field) => isNonEmptyString(value[field], 100_000))) return false
  return Number.isInteger(value.index) && (value.index as number) >= 0
}

export function isHudThemeId(value: unknown): value is HudThemeId {
  return typeof value === 'string' && THEMES.has(value)
}

export function isNativeAction(value: unknown): value is NativeAction {
  return typeof value === 'string' && ACTIONS.has(value)
}

export function validateActionPayload(action: NativeAction, payload: unknown): boolean {
  if (CONTRACT_ONLY_ACTIONS.has(action)) return payload === undefined
  if (NO_PAYLOAD_ACTIONS.has(action)) return payload === undefined

  const stringField = SINGLE_STRING_FIELD_ACTIONS[action as keyof typeof SINGLE_STRING_FIELD_ACTIONS]
  if (stringField) return hasStringFields(payload, [stringField])

  switch (action) {
    case 'submitEditMessage':
      return hasStringFields(payload, ['messageId', 'text'])
    case 'deleteMessage':
      return hasStringFields(payload, ['messageId'], ['confirmationToken'])
    case 'setModelSetting':
      return hasStringFields(payload, ['controlId'], ['choiceId'])
    case 'selectConversation':
    case 'requestDeleteConversation':
      return hasConversationReference(payload)
    case 'renameConversation':
      return hasConversationReference(payload, ['title'])
    case 'deleteConversation':
      return hasConversationReference(payload, [], ['confirmationToken'])
    case 'submitPersona':
      return hasStringFields(payload, ['name', 'identity'])
    case 'applyInstruction':
      return isInstructionReference(payload)
    default:
      return false
  }
}

function decodeChannel(value: Record<string, unknown>, request = false): DecodeFailure | null {
  const requestId = isNonEmptyString(value.requestId) ? value.requestId : undefined
  if (value.protocolVersion !== IFRAME_PROTOCOL_VERSION) return failure('协议版本不匹配', requestId)
  if (!isNonEmptyString(value.buildId)) return failure('buildId 无效', requestId)
  if (!isNonEmptyString(value.channelId)) return failure('channelId 无效', requestId)
  if (request && !requestId) return failure('requestId 必须是非空字符串')
  return null
}

export function decodeHostHandshake(value: unknown): DecodeResult<HostHandshake> {
  if (!isRecord(value)) return failure('握手消息必须是普通对象')
  if (!hasOnlyKeys(value, ['type', 'protocol', 'protocolVersion', 'buildId', 'bootstrapId', 'channelId', 'theme', 'knownActions', 'registeredActions'])) {
    return failure('握手消息包含未知字段')
  }
  if (value.type !== 'host-handshake' || value.protocol !== IFRAME_PROTOCOL_NAME || value.protocolVersion !== IFRAME_PROTOCOL_VERSION) {
    return failure('握手协议不匹配')
  }
  if (!isNonEmptyString(value.buildId) || !isNonEmptyString(value.bootstrapId) || !isNonEmptyString(value.channelId)) {
    return failure('握手标识无效')
  }
  if (!isHudThemeId(value.theme)) return failure('握手 Theme 无效')
  const knownActions = value.knownActions
  if (!Array.isArray(knownActions) || knownActions.length !== ALL_NATIVE_ACTIONS.length || !knownActions.every(isNativeAction)) {
    return failure('knownActions 与本地契约不匹配')
  }
  if (new Set(knownActions).size !== ALL_NATIVE_ACTIONS.length || !ALL_NATIVE_ACTIONS.every((action) => knownActions.includes(action))) {
    return failure('knownActions 不完整或存在重复')
  }
  if (!Array.isArray(value.registeredActions) || !value.registeredActions.every(isNativeAction) || new Set(value.registeredActions).size !== value.registeredActions.length) {
    return failure('registeredActions 无效')
  }
  return success(value as unknown as HostHandshake)
}

export function decodeFrameToHostMessage(value: unknown): DecodeResult<FrameToHostMessage> {
  if (!isRecord(value) || typeof value.type !== 'string') return failure('Frame 消息必须是带 type 的普通对象')
  const channelFailure = decodeChannel(value, value.type !== 'frame-ready' && value.type !== 'cancel-request')
  if (channelFailure) return channelFailure
  const requestId = isNonEmptyString(value.requestId) ? value.requestId : undefined

  switch (value.type) {
    case 'frame-ready':
      if (!hasOnlyKeys(value, ['type', 'protocolVersion', 'buildId', 'bootstrapId', 'channelId']) || !isNonEmptyString(value.bootstrapId)) {
        return failure('frame-ready 字段无效')
      }
      return success(value as unknown as FrameToHostMessage)
    case 'invoke':
      if (!hasOnlyKeys(value, ['type', 'protocolVersion', 'buildId', 'channelId', 'requestId', 'action', 'payload'])) {
        return failure('invoke 包含未知字段', requestId)
      }
      if (!isNativeAction(value.action)) return failure('未知 NativeAction', requestId)
      if (!validateActionPayload(value.action, value.payload)) return failure(`动作 ${value.action} 的 payload 无效`, requestId)
      return success(value as unknown as InvokeRequest)
    case 'refresh':
      if (!hasOnlyKeys(value, ['type', 'protocolVersion', 'buildId', 'channelId', 'requestId'])) return failure('refresh 字段无效', requestId)
      return success(value as unknown as FrameToHostMessage)
    case 'hud-control':
      if (!hasOnlyKeys(value, ['type', 'protocolVersion', 'buildId', 'channelId', 'requestId', 'command'])
        || typeof value.command !== 'string'
        || !HUD_CONTROLS.has(value.command)) return failure('hud-control command 无效', requestId)
      return success(value as unknown as FrameToHostMessage)
    case 'cancel-request':
      if (!hasOnlyKeys(value, ['type', 'protocolVersion', 'buildId', 'channelId', 'targetRequestId']) || !isNonEmptyString(value.targetRequestId)) {
        return failure('cancel-request 字段无效')
      }
      return success(value as unknown as FrameToHostMessage)
    default:
      return failure('未知 Frame 消息类型', requestId)
  }
}

function isChatSnapshot(value: unknown): value is ChatSnapshot {
  if (!isRecord(value)) return false
  const capabilities = value.capabilities
  if (!Number.isInteger(value.revision) || !isRecord(value.connection) || !isRecord(capabilities)) return false
  return ALL_NATIVE_ACTIONS.every((action) => {
    const capability = capabilities[action]
    return isRecord(capability) && typeof capability.available === 'boolean'
  })
}

function isBridgeEvent(value: unknown): value is BridgeEvent {
  if (!isRecord(value) || typeof value.type !== 'string' || !BRIDGE_EVENT_TYPES.has(value.type)) return false
  if (value.type === 'error') return isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string'
  return isChatSnapshot(value.snapshot)
}

function isActionResult(value: unknown): value is ActionResult {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || !isNativeAction(value.action)) return false
  if (value.ok) return true
  return isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string'
}

export function decodeHostToFrameMessage(value: unknown): DecodeResult<HostToFrameMessage> {
  if (!isRecord(value) || typeof value.type !== 'string') return failure('Host 消息必须是带 type 的普通对象')
  const requestTypes = new Set(['invoke-result', 'refresh-result', 'hud-control-result', 'request-failure'])
  const channelFailure = decodeChannel(value, requestTypes.has(value.type))
  if (channelFailure) return channelFailure
  const requestId = isNonEmptyString(value.requestId) ? value.requestId : undefined

  switch (value.type) {
    case 'snapshot':
      if (!hasOnlyKeys(value, ['type', 'protocolVersion', 'buildId', 'channelId', 'snapshot']) || !isChatSnapshot(value.snapshot)) return failure('snapshot 消息无效')
      return success(value as unknown as HostToFrameMessage)
    case 'bridge-event':
      if (!hasOnlyKeys(value, ['type', 'protocolVersion', 'buildId', 'channelId', 'event']) || !isBridgeEvent(value.event)) return failure('bridge-event 消息无效')
      return success(value as unknown as HostToFrameMessage)
    case 'invoke-result':
      if (!hasOnlyKeys(value, ['type', 'protocolVersion', 'buildId', 'channelId', 'requestId', 'action', 'result'])
        || !isNativeAction(value.action)
        || !isActionResult(value.result)
        || value.result.action !== value.action) return failure('invoke-result 消息无效', requestId)
      return success(value as unknown as HostToFrameMessage)
    case 'refresh-result':
      if (!hasOnlyKeys(value, ['type', 'protocolVersion', 'buildId', 'channelId', 'requestId', 'snapshot']) || !isChatSnapshot(value.snapshot)) {
        return failure('refresh-result 消息无效', requestId)
      }
      return success(value as unknown as HostToFrameMessage)
    case 'hud-control-result':
      if (!hasOnlyKeys(value, ['type', 'protocolVersion', 'buildId', 'channelId', 'requestId', 'command'])
        || typeof value.command !== 'string'
        || !HUD_CONTROLS.has(value.command)) return failure('hud-control-result 消息无效', requestId)
      return success(value as unknown as HostToFrameMessage)
    case 'request-failure':
      if (!hasOnlyKeys(value, ['type', 'protocolVersion', 'buildId', 'channelId', 'requestId', 'code', 'message'])
        || typeof value.code !== 'string'
        || !PROTOCOL_ERROR_CODES.has(value.code)
        || !isNonEmptyString(value.message, 10_000)) return failure('request-failure 消息无效', requestId)
      return success(value as unknown as HostToFrameMessage)
    case 'connection-error':
      if (!hasOnlyKeys(value, ['type', 'protocolVersion', 'buildId', 'channelId', 'code', 'message'])
        || typeof value.code !== 'string'
        || !PROTOCOL_ERROR_CODES.has(value.code)
        || !isNonEmptyString(value.message, 10_000)) return failure('connection-error 消息无效')
      return success(value as unknown as HostToFrameMessage)
    case 'host-closing':
      if (!hasOnlyKeys(value, ['type', 'protocolVersion', 'buildId', 'channelId', 'reason'])
        || (value.reason !== 'destroy' && value.reason !== 'reload' && value.reason !== 'navigation')) return failure('host-closing 消息无效')
      return success(value as unknown as HostToFrameMessage)
    default:
      return failure('未知 Host 消息类型', requestId)
  }
}
