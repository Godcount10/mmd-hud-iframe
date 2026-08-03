import type { SnapshotDiffEntry } from '../types'

function pointerSegment(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function sameValue(before: unknown, after: unknown): boolean {
  return Object.is(before, after)
}

export function diffJson(before: unknown, after: unknown, path = ''): SnapshotDiffEntry[] {
  if (sameValue(before, after)) return []

  const beforeObject = typeof before === 'object' && before !== null
  const afterObject = typeof after === 'object' && after !== null
  if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
    return [{ path: path || '/', operation: 'changed', before, after }]
  }

  const beforeRecord = before as Record<string, unknown>
  const afterRecord = after as Record<string, unknown>
  const keys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])
  const result: SnapshotDiffEntry[] = []

  for (const key of keys) {
    const nextPath = `${path}/${pointerSegment(key)}`
    if (!(key in afterRecord)) {
      result.push({ path: nextPath, operation: 'removed', before: beforeRecord[key] })
    } else if (!(key in beforeRecord)) {
      result.push({ path: nextPath, operation: 'added', after: afterRecord[key] })
    } else {
      result.push(...diffJson(beforeRecord[key], afterRecord[key], nextPath))
    }
  }
  return result
}
