const MAX_DEPTH = 12
const MAX_ARRAY_LENGTH = 10_000
const MAX_OBJECT_KEYS = 1_000

export function toWireValue<T>(value: T): T {
  return copyValue(value, new WeakSet<object>(), 0) as T
}

function copyValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Wire value 不接受非有限数字')
    return value
  }
  if (typeof value !== 'object') throw new TypeError(`Wire value 不接受 ${typeof value}`)
  if (depth >= MAX_DEPTH) throw new TypeError('Wire value 嵌套过深')
  if (seen.has(value)) throw new TypeError('Wire value 不接受循环引用')
  seen.add(value)

  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_LENGTH) throw new TypeError('Wire value 数组过长')
      return value.map((item) => copyValue(item, seen, depth + 1))
    }

    const keys = Object.keys(value)
    if (keys.length > MAX_OBJECT_KEYS) throw new TypeError('Wire value 对象字段过多')
    const result: Record<string, unknown> = Object.create(null)
    for (const key of keys) {
      result[key] = copyValue((value as Record<string, unknown>)[key], seen, depth + 1)
    }
    return result
  } finally {
    seen.delete(value)
  }
}
