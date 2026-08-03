import {
  MMD_HEADER_ACTION_ICONS,
  MMD_HEADER_ACTION_LABELS,
  MMD_SELECTORS,
} from './selectors'

export type HeaderActionKind = keyof typeof MMD_HEADER_ACTION_ICONS

export interface ResolveHeaderActionResult {
  button: HTMLElement | null
  reason?: string
}

export interface HeaderActionState {
  comments: boolean
  share: boolean
  favorite: boolean
  refresh: boolean
  reason?: string
}

const HEADER_ACTION_KINDS = Object.keys(MMD_HEADER_ACTION_ICONS) as HeaderActionKind[]

function normalizeSemanticToken(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, '')
}

function semanticTokens(value: string): string[] {
  return value
    .split(/[\s,;|/\\]+/)
    .map(normalizeSemanticToken)
    .filter(Boolean)
}

function semanticLabels(button: HTMLElement): string[] {
  const values = [
    button.textContent ?? '',
    button.getAttribute('aria-label') ?? '',
    button.getAttribute('title') ?? '',
    button.getAttribute('data-action') ?? '',
    button.getAttribute('data-title') ?? '',
  ]
  button.querySelectorAll<HTMLElement>('[aria-label], [title], [data-action], [data-title]').forEach((element) => {
    values.push(
      element.getAttribute('aria-label') ?? '',
      element.getAttribute('title') ?? '',
      element.getAttribute('data-action') ?? '',
      element.getAttribute('data-title') ?? '',
    )
  })
  button.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    values.push(image.alt, image.title)
  })
  return values.flatMap(semanticTokens)
}

function sourceBasename(value: string, document: Document): string | null {
  const cssUrl = value.match(/url\(["']?([^"')]+)["']?\)/i)?.[1] ?? value
  let pathname: string
  try {
    pathname = new URL(cssUrl, document.baseURI).pathname
  }
  catch {
    pathname = cssUrl.split(/[?#]/, 1)[0]
  }
  try {
    return decodeURIComponent(pathname.split('/').at(-1) ?? '').toLocaleLowerCase()
  }
  catch {
    return pathname.split('/').at(-1)?.toLocaleLowerCase() ?? null
  }
}

function iconBasenames(button: HTMLElement): string[] {
  const values: string[] = []
  button.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => values.push(image.src))
  button.querySelectorAll<HTMLElement>('[style*="background-image"]').forEach((element) => {
    values.push(element.style.backgroundImage)
  })
  return values
    .map((value) => sourceBasename(value, button.ownerDocument))
    .filter((value): value is string => Boolean(value))
}

interface HeaderActionMetadata {
  labels: Set<string>
  basenames: Set<string>
}

function headerActionMetadata(button: HTMLElement): HeaderActionMetadata {
  return {
    labels: new Set(semanticLabels(button)),
    basenames: new Set(iconBasenames(button)),
  }
}

function matchesHeaderAction(metadata: HeaderActionMetadata, action: HeaderActionKind): boolean {
  const labelMatch = MMD_HEADER_ACTION_LABELS[action].some((hint) => (
    metadata.labels.has(normalizeSemanticToken(hint))
  ))
  const iconMatch = MMD_HEADER_ACTION_ICONS[action].some((hint) => (
    metadata.basenames.has(hint.toLocaleLowerCase())
  ))
  return labelMatch || iconMatch
}

function readHeaderButtons(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(MMD_SELECTORS.headerActionButtons)]
}

function resolveHeaderSignature(document: Document): {
  actions: Partial<Record<HeaderActionKind, HTMLElement>>
  reason?: string
} {
  const scopes = [...document.querySelectorAll<HTMLElement>(MMD_SELECTORS.headerActionScope)]
  if (scopes.length !== 1) {
    return {
      actions: {},
      reason: `原生顶部操作区应唯一，当前检测到 ${scopes.length} 个，已停止以避免误点`,
    }
  }

  const buttons = readHeaderButtons(scopes[0])
  if (buttons.length !== HEADER_ACTION_KINDS.length) {
    return {
      actions: {},
      reason: `原生顶部操作结构应为 4 个按钮，当前检测到 ${buttons.length} 个，已停止以避免误点`,
    }
  }

  const actions: Partial<Record<HeaderActionKind, HTMLElement>> = {}
  for (const button of buttons) {
    const metadata = headerActionMetadata(button)
    const matches = HEADER_ACTION_KINDS.filter((action) => matchesHeaderAction(metadata, action))
    if (matches.length !== 1) {
      return {
        actions: {},
        reason: matches.length
          ? `原生顶部按钮同时匹配 ${matches.join('、')}，已停止以避免误点`
          : '原生顶部按钮缺少可验证的图标、文字或无障碍标签，已停止以避免误点',
      }
    }
    const action = matches[0]
    if (actions[action]) {
      return {
        actions: {},
        reason: `原生顶部操作“${action}”匹配到多个按钮，已停止以避免误点`,
      }
    }
    actions[action] = button
  }

  const missing = HEADER_ACTION_KINDS.filter((action) => !actions[action])
  return missing.length
    ? { actions: {}, reason: `原生顶部四按钮签名缺少 ${missing.join('、')}，已停止以避免误点` }
    : { actions }
}

export function resolveHeaderAction(
  document: Document,
  action: HeaderActionKind,
): ResolveHeaderActionResult {
  const resolved = resolveHeaderSignature(document)
  return resolved.actions[action]
    ? { button: resolved.actions[action]! }
    : { button: null, reason: resolved.reason ?? '原生顶部四按钮签名不完整' }
}

export function inspectHeaderActions(document: Document): HeaderActionState {
  const resolved = resolveHeaderSignature(document)
  return {
    comments: Boolean(resolved.actions.comments),
    share: Boolean(resolved.actions.share),
    favorite: Boolean(resolved.actions.favorite),
    refresh: Boolean(resolved.actions.refresh),
    reason: resolved.reason,
  }
}
