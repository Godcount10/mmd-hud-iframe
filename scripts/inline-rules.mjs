import { Script, createContext } from 'node:vm'

// Keep a margin below MMD's 20,000-character replacement limit for platform
// metadata and future wrapper changes.
export const MAX_REPLACEMENT_LENGTH = 19_000
export const MAX_INLINE_RULES = 130
const STATE_KEY = '__MMD_HUD_INLINE_STATE__'

// MMD applies replacement strings with String.replace semantics, where `$` has
// special meaning. Encode only the characters that are unsafe in that context
// and in an inline <script>; the resulting JavaScript literal still evaluates
// back to the original UTF-8 text without Base64 expansion.
function safeStringLiteral(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('$', '\\x24')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

export function createInlineRules(hostSource, frameSource, buildId, theme = 'bridge-debug') {
  if (!['game', 'bridge-debug'].includes(theme)) throw new Error(`未知 Theme：${theme}`)
  if (!hostSource || !frameSource) throw new Error('Host / Frame 源码不能为空')
  const name = 'MMD HUD'
  const placeholder = (index) => `【${name} 内嵌注入 ${String(index).padStart(3, '0')}】`
  const scripts = []
  const push = (source, startup = false) => {
    if (source.length > MAX_REPLACEMENT_LENGTH) throw new Error('内嵌片段超过字符限制')
    if (scripts.length >= MAX_INLINE_RULES) throw new Error(`内嵌规则数量超过 MMD 上限 ${MAX_INLINE_RULES}`)
    scripts.push({ id: -1, replaceString: source,
      scriptName: `${name} 内嵌注入 ${startup ? '启动' : String(scripts.length + 1).padStart(3, '0')}`,
      findRegex: placeholder(scripts.length + 1),
    })
  }
  const split = (source, label) => {
    for (let offset = 0; offset < source.length;) {
      const reset = scripts.length === 0 ? `globalThis.${STATE_KEY}=Object.create(null);` : ''
      const prefix = `<script>(()=>{${reset}const s=globalThis.${STATE_KEY};s.${label}=(s.${label}??'')+`
      const suffix = `;})()</script>${placeholder(scripts.length + 2)}`
      const budget = MAX_REPLACEMENT_LENGTH - prefix.length - suffix.length
      // Size the encoded literal, not the raw source: escape-heavy input can
      // expand by six times. JSON also preserves split surrogate pairs exactly.
      let low = 1
      let high = Math.min(source.length - offset, budget - 2)
      let length = 0
      while (low <= high) {
        const candidate = Math.floor((low + high) / 2)
        if (safeStringLiteral(source.slice(offset, offset + candidate)).length <= budget) {
          length = candidate
          low = candidate + 1
        } else high = candidate - 1
      }
      if (!length) throw new Error('无法在内嵌片段限制内生成规则')
      push(prefix + safeStringLiteral(source.slice(offset, offset + length)) + suffix)
      offset += length
    }
  }
  split(hostSource, 'h')
  const hostCount = scripts.length
  split(frameSource, 'f')
  const frameCount = scripts.length - hostCount
  push(`<script>(()=>{const s=globalThis.${STATE_KEY};if(!s||!s.h||!s.f)throw new Error('MMD HUD inline bundle incomplete');globalThis.__MMD_HUD_IFRAME_CONFIG__={theme:'${theme}',frameScriptSource:s.f};const e=document.createElement('script');e.dataset.mmdHudInline=${safeStringLiteral(buildId)};e.textContent=s.h;(document.head||document.documentElement).appendChild(e);})()</script>`, true)
  return { scripts, hostCount, frameCount }
}

/** Exercise platform replacement semantics before publishing generated JSON. */
export function verifyInlineRules(scripts, hostSource, frameSource, buildId, theme) {
  new Script(hostSource, { filename: 'host-bundle.js' })
  new Script(frameSource, { filename: 'frame-bundle.js' })
  for (const callback of [false, true]) {
    let html = scripts[0]?.findRegex ?? ''
    for (const rule of scripts) {
      if (rule.replaceString.length > MAX_REPLACEMENT_LENGTH) throw new Error('内嵌片段超过字符限制')
      if (!html.includes(rule.findRegex)) throw new Error(`占位符链断裂：${rule.findRegex}`)
      html = html.replace(new RegExp(rule.findRegex, 'g'), callback ? () => rule.replaceString : rule.replaceString)
    }
    const wrappers = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1])
    if (wrappers.length !== scripts.length) throw new Error('正则替换改变了脚本数量')
    const appended = []
    const context = createContext({ document: {
      createElement: () => ({ dataset: {} }),
      head: { appendChild: element => appended.push(element) },
    } })
    for (let run = 0; run < 2; run++) {
      for (const [index, wrapper] of wrappers.entries()) {
        new Script(wrapper, { filename: `inline-rule-${index + 1}.js` }).runInContext(context, { timeout: 5000 })
      }
      if (appended.length !== run + 1 || appended[run].textContent !== hostSource) throw new Error('注入还原的 Host 与构建源码不一致')
      if (appended[run].dataset.mmdHudInline !== buildId) throw new Error('注入 Build ID 不一致')
      const config = context.__MMD_HUD_IFRAME_CONFIG__
      if (config?.frameScriptSource !== frameSource || config.theme !== theme) throw new Error('注入还原的 Frame / Theme 与构建源码不一致')
    }
  }
}
