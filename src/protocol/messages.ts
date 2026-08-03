import type {
  ActionResult,
  BridgeEvent,
  ChatSnapshot,
  NativeAction,
  NativeActionPayload,
} from '../contracts'

export const IFRAME_PROTOCOL_NAME = 'mmd-hud-iframe' as const
export const IFRAME_PROTOCOL_VERSION = 2 as const

export type HudThemeId = 'game' | 'bridge-debug'
export type HudControlCommand = 'hide' | 'destroy' | 'reload-frame'
export type HostClosingReason = 'destroy' | 'reload' | 'navigation'

export interface HostHandshake {
  type: 'host-handshake'
  protocol: typeof IFRAME_PROTOCOL_NAME
  protocolVersion: typeof IFRAME_PROTOCOL_VERSION
  buildId: string
  bootstrapId: string
  channelId: string
  theme: HudThemeId
  knownActions: readonly NativeAction[]
  registeredActions: readonly NativeAction[]
}

interface ChannelMessage {
  protocolVersion: typeof IFRAME_PROTOCOL_VERSION
  buildId: string
  channelId: string
}

interface RequestMessage extends ChannelMessage {
  requestId: string
}

export interface FrameReadyMessage extends ChannelMessage {
  type: 'frame-ready'
  bootstrapId: string
}

type InvokePayloadField<A extends NativeAction> =
  [NativeActionPayload<A>] extends [never]
    ? { payload?: never }
    : NativeActionPayload<A> extends undefined
      ? { payload?: undefined }
      : { payload: NativeActionPayload<A> }

export type InvokeRequestFor<A extends NativeAction> = RequestMessage & {
  type: 'invoke'
  action: A
} & InvokePayloadField<A>

export type InvokeRequest = {
  [A in NativeAction]: InvokeRequestFor<A>
}[NativeAction]

export interface RefreshRequest extends RequestMessage {
  type: 'refresh'
}

export interface HudControlRequest extends RequestMessage {
  type: 'hud-control'
  command: HudControlCommand
}

export interface CancelRequest extends ChannelMessage {
  type: 'cancel-request'
  targetRequestId: string
}

export interface SnapshotMessage extends ChannelMessage {
  type: 'snapshot'
  snapshot: ChatSnapshot
}

export interface BridgeEventMessage extends ChannelMessage {
  type: 'bridge-event'
  event: BridgeEvent
}

export interface InvokeResultMessage extends RequestMessage {
  type: 'invoke-result'
  action: NativeAction
  result: ActionResult
}

export interface RefreshResultMessage extends RequestMessage {
  type: 'refresh-result'
  snapshot: ChatSnapshot
}

export interface HudControlResultMessage extends RequestMessage {
  type: 'hud-control-result'
  command: HudControlCommand
}

export type ProtocolErrorCode =
  | 'INVALID_MESSAGE'
  | 'VERSION_MISMATCH'
  | 'BUILD_MISMATCH'
  | 'CHANNEL_MISMATCH'
  | 'DUPLICATE_REQUEST_ID'
  | 'REQUEST_CANCELLED'
  | 'TIMEOUT'
  | 'HOST_DESTROYED'
  | 'INTERNAL_ERROR'

export interface RequestFailureMessage extends RequestMessage {
  type: 'request-failure'
  code: ProtocolErrorCode
  message: string
}

export interface ConnectionErrorMessage extends ChannelMessage {
  type: 'connection-error'
  code: Extract<ProtocolErrorCode, 'INVALID_MESSAGE' | 'VERSION_MISMATCH' | 'BUILD_MISMATCH' | 'CHANNEL_MISMATCH' | 'TIMEOUT'>
  message: string
}

export interface HostClosingMessage extends ChannelMessage {
  type: 'host-closing'
  reason: HostClosingReason
}

export type FrameToHostMessage =
  | FrameReadyMessage
  | InvokeRequest
  | RefreshRequest
  | HudControlRequest
  | CancelRequest

export type HostToFrameMessage =
  | SnapshotMessage
  | BridgeEventMessage
  | InvokeResultMessage
  | RefreshResultMessage
  | HudControlResultMessage
  | RequestFailureMessage
  | ConnectionErrorMessage
  | HostClosingMessage

export type RequestType = InvokeRequest['type'] | RefreshRequest['type'] | HudControlRequest['type']
export type ResponseType = InvokeResultMessage['type'] | RefreshResultMessage['type'] | HudControlResultMessage['type']
