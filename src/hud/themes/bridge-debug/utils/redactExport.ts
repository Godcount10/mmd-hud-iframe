const REDACTED = '[REDACTED]'
const PRIVATE_TEXT_KEYS = /^(text|html|identity|subtitle|preview)$/i

export function redactForExport(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    if (/confirmationToken/i.test(key)) return REDACTED
    if (/^(link|avatar)$/i.test(key) && /^https?:/i.test(value)) return REDACTED
    if (PRIVATE_TEXT_KEYS.test(key)) return value ? `[REDACTED ${value.length} chars]` : ''
    return value
  }
  if (Array.isArray(value)) return value.map((item) => redactForExport(item))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, redactForExport(child, childKey)]),
    )
  }
  return value
}
