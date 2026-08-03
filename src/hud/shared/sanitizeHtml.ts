const FORBIDDEN_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template',
  'form', 'input', 'textarea', 'select', 'option', 'button', 'video', 'audio',
  'canvas', 'meta', 'link', 'base', 'noscript',
])

const ALLOWED_TAGS = new Set([
  'p', 'br', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark',
  'small', 'sub', 'sup', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'hr', 'code', 'pre', 'ruby', 'rt', 'rp', 'div', 'font',
  'uni-view', 'uni-text',
])

function applySafeColor(target: HTMLElement, value: string | null): void {
  if (!value) return
  const probe = document.createElement('span')
  probe.style.color = value.trim()
  if (probe.style.color) target.style.color = probe.style.color
}

export function sanitizeHtml(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html
  const output = document.createElement('div')

  function copyNode(source: Node, target: Node): void {
    if (source.nodeType === Node.TEXT_NODE) {
      target.appendChild(document.createTextNode(source.nodeValue || ''))
      return
    }
    if (source.nodeType !== Node.ELEMENT_NODE) return

    const element = source as HTMLElement
    const sourceTag = element.tagName.toLowerCase()
    if (FORBIDDEN_TAGS.has(sourceTag)) return
    if (!ALLOWED_TAGS.has(sourceTag)) {
      element.childNodes.forEach((child) => copyNode(child, target))
      return
    }

    const outputTag = sourceTag === 'uni-view'
      ? 'div'
      : sourceTag === 'uni-text' || sourceTag === 'font'
        ? 'span'
        : sourceTag
    const clean = document.createElement(outputTag)
    if (sourceTag === 'font') applySafeColor(clean, element.getAttribute('color'))
    if (sourceTag === 'span') {
      const styleProbe = document.createElement('span')
      styleProbe.style.cssText = element.getAttribute('style') || ''
      applySafeColor(clean, styleProbe.style.color)
    }
    element.childNodes.forEach((child) => copyNode(child, clean))
    target.appendChild(clean)
  }

  template.content.childNodes.forEach((node) => copyNode(node, output))
  return output.innerHTML
}

interface SanitizedHtmlCacheEntry {
  content: string
  contentHash: number
  sanitized: string
}

function hashHtmlContent(content: string): number {
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export interface SanitizedHtmlCache {
  get(messageId: string, content: string): string
  prune(messageIds: Iterable<string>): void
}

/** 每个对话视图独享的有界缓存，避免无关响应式刷新重建整段历史 HTML。 */
export function createSanitizedHtmlCache(
  sanitize: (html: string) => string = sanitizeHtml,
): SanitizedHtmlCache {
  const entries = new Map<string, SanitizedHtmlCacheEntry>()

  return {
    get(messageId, content) {
      const contentHash = hashHtmlContent(content)
      const cached = entries.get(messageId)
      if (cached?.contentHash === contentHash && cached.content === content) return cached.sanitized
      const sanitized = sanitize(content)
      entries.set(messageId, { content, contentHash, sanitized })
      return sanitized
    },
    prune(messageIds) {
      const live = new Set(messageIds)
      for (const messageId of entries.keys()) {
        if (!live.has(messageId)) entries.delete(messageId)
      }
    },
  }
}
