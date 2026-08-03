import { toRaw } from 'vue'

export function cloneDebugValue<T>(value: T): T {
  return structuredClone(toRaw(value))
}
