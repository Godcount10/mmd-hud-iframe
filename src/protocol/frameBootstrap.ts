export interface FrameBootstrapConfig {
  protocol: 'mmd-hud-iframe-bootstrap'
  buildId: string
  bootstrapId: string
  parentOrigin: string
  theme: 'game' | 'bridge-debug'
}

export function encodeFrameBootstrap(config: FrameBootstrapConfig): string {
  return JSON.stringify(config)
}

export function decodeFrameBootstrap(value: string): FrameBootstrapConfig | null {
  if (!value || value.length > 4_096) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    if (record.protocol !== 'mmd-hud-iframe-bootstrap') return null
    if (!isNonEmptyString(record.buildId) || !isNonEmptyString(record.bootstrapId)) return null
    if (!isHttpOrigin(record.parentOrigin)) return null
    if (record.theme !== 'game' && record.theme !== 'bridge-debug') return null
    return {
      protocol: 'mmd-hud-iframe-bootstrap',
      buildId: record.buildId,
      bootstrapId: record.bootstrapId,
      parentOrigin: record.parentOrigin,
      theme: record.theme,
    }
  } catch {
    return null
  }
}

export function createFrameSrcdoc(frameScriptUrl: URL): string {
  if (frameScriptUrl.protocol !== 'https:' && !isLoopbackHttp(frameScriptUrl)) {
    throw new Error('Frame 脚本必须使用 HTTPS；本地开发仅允许 loopback HTTP')
  }
  const scriptUrl = escapeHtmlAttribute(frameScriptUrl.href)
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>MMD iframe HUD</title>
</head>
<body style="margin:0;background:#050a0f">
<div id="app"></div>
<script type="module" src="${scriptUrl}"></script>
</body>
</html>`
}

export function createEmbeddedFrameSrcdoc(frameScriptSource: string): string {
  if (!frameScriptSource || frameScriptSource.length > 10_000_000) {
    throw new Error('内嵌 Frame 脚本为空或超过 10 MB 限制')
  }
  const scriptSource = escapeInlineScript(frameScriptSource)
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>MMD iframe HUD</title>
</head>
<body style="margin:0;background:#050a0f">
<div id="app"></div>
<script>${scriptSource}</script>
</body>
</html>`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1_024
}

function isHttpOrigin(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false
  try {
    const url = new URL(value)
    return url.origin === value && (url.protocol === 'https:' || url.protocol === 'http:')
  } catch {
    return false
  }
}

function isLoopbackHttp(url: URL): boolean {
  return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
}

function escapeInlineScript(value: string): string {
  return value
    .replaceAll('</script', '<\\/script')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029')
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
