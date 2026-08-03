export const HOST_REQUEST_TIMEOUT_MS = 15_000
export const DEFAULT_RPC_TIMEOUT_MS = 16_000
export const CONNECT_TIMEOUT_MS = 10_000

export function createRequestId(prefix = 'request'): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function createBootstrapId(): string {
  return `bootstrap-${crypto.randomUUID()}`
}

export function createChannelId(): string {
  return `channel-${crypto.randomUUID()}`
}
