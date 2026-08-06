#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST_DIR = join(ROOT, 'dist')
const OUTPUT_DIR = join(DIST_DIR, 'inline')
const HOST_FILE = join(DIST_DIR, 'host', 'mmd-hud-iframe-host.js')
const FRAME_FILE = join(DIST_DIR, 'frame', 'mmd-hud-iframe-frame.js')
const MAX_REPLACEMENT_LENGTH = 18_000
const RULE_PREFIX = '【MMD HUD 内嵌注入 '
const RULE_SUFFIX = '】'
const STATE_KEY = '__MMD_HUD_INLINE_STATE__'

function requiredBuildId() {
  const value = process.env.MMD_HUD_BUILD_ID
  if (!value || value === 'dev') {
    throw new Error('请使用非 dev Build ID，例如 MMD_HUD_BUILD_ID=inline-20260806 npm run build:inline')
  }
  return value
}

function splitSource(source, label, startIndex) {
  const chunks = []
  let offset = 0
  let index = 0
  while (offset < source.length) {
    let length = Math.min(source.length - offset, MAX_REPLACEMENT_LENGTH - 256)
    let replacement = appendChunk(label, source.slice(offset, offset + length), placeholder(startIndex + index + 2))
    while (replacement.length > MAX_REPLACEMENT_LENGTH && length > 1) {
      length = Math.max(1, length - Math.ceil((replacement.length - MAX_REPLACEMENT_LENGTH) * 1.1))
      replacement = appendChunk(label, source.slice(offset, offset + length), placeholder(startIndex + index + 2))
    }
    if (replacement.length > MAX_REPLACEMENT_LENGTH) {
      throw new Error(`${label} 第 ${index + 1} 个片段超过 ${MAX_REPLACEMENT_LENGTH} 字符`)
    }
    chunks.push({ source: replacement, index })
    offset += length
    index += 1
  }
  return chunks
}

function appendChunk(label, chunk, nextPlaceholder) {
  const encoded = JSON.stringify(chunk).replaceAll('<', '\\u003c')
  return `<script>(()=>{const s=globalThis.${STATE_KEY}??=Object.create(null);s.${label}=(s.${label}??'')+${encoded};})()</script>${nextPlaceholder}`
}

function placeholder(index) {
  return `${RULE_PREFIX}${String(index).padStart(3, '0')}${RULE_SUFFIX}`
}

function startReplacement(buildId) {
  const source = `<script>(()=>{const s=globalThis.${STATE_KEY};if(!s||!s.h||!s.f)throw new Error('MMD HUD inline bundle incomplete');globalThis.__MMD_HUD_IFRAME_CONFIG__={theme:'bridge-debug',frameScriptSource:s.f};const e=document.createElement('script');e.dataset.mmdHudInline='${buildId}';e.textContent=s.h;(document.head||document.documentElement).appendChild(e);})()</script>`
  if (source.length > MAX_REPLACEMENT_LENGTH) throw new Error('内嵌启动片段超过字符限制')
  return source
}

function createRules(hostSource, frameSource, buildId) {
  const hostChunks = splitSource(hostSource, 'h', 0).map((part, index) => ({
    name: `h${index}`,
    replacement: part.source,
  }))
  const frameChunks = splitSource(frameSource, 'f', hostChunks.length).map((part, index) => ({
    name: `f${index}`,
    replacement: part.source,
  }))
  const chunks = [...hostChunks, ...frameChunks]
  const scripts = chunks.map((chunk, index) => ({
    id: -1,
    replaceString: chunk.replacement,
    scriptName: `MMD HUD 内嵌注入 ${String(index + 1).padStart(3, '0')}`,
    findRegex: placeholder(index + 1),
  }))
  const startIndex = scripts.length + 1
  scripts.push({
    id: -1,
    replaceString: startReplacement(buildId),
    scriptName: 'MMD HUD 内嵌注入 启动',
    findRegex: placeholder(startIndex),
  })
  return { scripts, hostCount: hostChunks.length, frameCount: frameChunks.length }
}

function validateRules(scripts) {
  for (const [index, script] of scripts.entries()) {
    if (script.replaceString.length > MAX_REPLACEMENT_LENGTH) {
      throw new Error(`规则 ${index + 1} 超过 ${MAX_REPLACEMENT_LENGTH} 字符`)
    }
    if (script.findRegex !== placeholder(index + 1)) {
      throw new Error(`规则 ${index + 1} 的占位符顺序错误`)
    }
  }
}

const buildId = requiredBuildId()
const [hostSource, frameSource] = await Promise.all([
  readFile(HOST_FILE, 'utf8'),
  readFile(FRAME_FILE, 'utf8'),
])
const result = createRules(hostSource, frameSource, buildId)
validateRules(result.scripts)

const rules = result.scripts
const statusbar = rules[0]?.findRegex ?? ''
const importData = {
  pageDepth: 2,
  statusbar,
  beginning: '第一句话',
  regex_scripts: rules,
}
const placeholders = statusbar
  ? `${statusbar}${rules.slice(1).map((script) => script.findRegex).join('')}`
  : ''
const manifest = {
  version: 1,
  buildId,
  maxReplacementLength: MAX_REPLACEMENT_LENGTH,
  hostParts: result.hostCount,
  frameParts: result.frameCount,
  totalRules: result.scripts.length,
  entry: result.scripts.at(-1)?.findRegex,
  generatedFiles: {
    importJson: 'mmd-hud-iframe-inline.json',
    placeholders: 'mmd-hud-iframe-inline.txt',
  },
}

await mkdir(OUTPUT_DIR, { recursive: true })
await Promise.all([
  writeFile(join(OUTPUT_DIR, 'mmd-hud-iframe-inline.json'), `${JSON.stringify(importData, null, 2)}\n`, 'utf8'),
  writeFile(join(OUTPUT_DIR, 'mmd-hud-iframe-inline.txt'), `${placeholders}\n`, 'utf8'),
  writeFile(join(OUTPUT_DIR, 'mmd-hud-iframe-inline-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
])

console.log(`Generated ${result.scripts.length} regex rules in ${OUTPUT_DIR}`)
console.log(`Host parts: ${result.hostCount}; Frame parts: ${result.frameCount}; max replacement: ${MAX_REPLACEMENT_LENGTH}`)
