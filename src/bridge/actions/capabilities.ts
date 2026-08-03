import { ALL_NATIVE_ACTIONS } from '../../contracts'
import type { CapabilityMap } from '../../contracts'

export { ALL_NATIVE_ACTIONS }

export function createEmptyCapabilities(reason = '尚未为当前 MMD 注册该功能'): CapabilityMap {
  return Object.fromEntries(
    ALL_NATIVE_ACTIONS.map((action) => [action, { available: false, reason }] as const),
  ) as CapabilityMap
}
