#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInlineRules, verifyInlineRules, MAX_REPLACEMENT_LENGTH, MAX_INLINE_RULES } from './inline-rules.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const outputDir = join(root, 'dist/inline')
const outputName = 'mmd-hud-iframe-inline'
const theme = process.env.MMD_HUD_INLINE_THEME || 'bridge-debug'
if (!['game', 'bridge-debug'].includes(theme)) {
  throw new Error(`MMD_HUD_INLINE_THEME 只能是 game 或 bridge-debug，收到：${theme}`)
}
const buildId = process.env.MMD_HUD_BUILD_ID
if (!buildId || buildId === 'dev') throw new Error('请先设置非 dev 的 MMD_HUD_BUILD_ID，并用它构建 Host / Frame')

const [hostSource, frameSource] = await Promise.all([
  readFile(join(root, 'dist/host/mmd-hud-iframe-host.js'), 'utf8'),
  readFile(join(root, 'dist/frame/mmd-hud-iframe-frame.js'), 'utf8'),
])
const { scripts, hostCount, frameCount } = createInlineRules(hostSource, frameSource, buildId, theme)
verifyInlineRules(scripts, hostSource, frameSource, buildId, theme)

const importData = { pageDepth: 2, statusbar: scripts[0].findRegex, beginning: '第一句话', regex_scripts: scripts }
const manifest = {
  version: 2, encoding: 'utf8-safe-string', theme, buildId,
  maxReplacementLength: MAX_REPLACEMENT_LENGTH, maxRules: MAX_INLINE_RULES,
  hostParts: hostCount, frameParts: frameCount, totalRules: scripts.length,
  entry: scripts.at(-1).findRegex,
  validation: 'string-and-callback-replacement; exact-roundtrip; repeat-injection',
  generatedFiles: { importJson: `${outputName}.json`, placeholders: `${outputName}.txt` },
}

await mkdir(outputDir, { recursive: true })
await Promise.all([
  writeFile(join(outputDir, `${outputName}.json`), `${JSON.stringify(importData, null, 2)}\n`, 'utf8'),
  writeFile(join(outputDir, `${outputName}.txt`), `${scripts.map(script => script.findRegex).join('')}\n`, 'utf8'),
  writeFile(join(outputDir, `${outputName}-manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
])
console.log(`Generated and verified ${scripts.length} regex rules in ${outputDir}`)
console.log(`Host parts: ${hostCount}; Frame parts: ${frameCount}; max replacement: ${MAX_REPLACEMENT_LENGTH}`)
