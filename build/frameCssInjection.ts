import type { OutputAsset, OutputBundle, OutputChunk } from 'rollup'
import type { Plugin } from 'vite'

export const FRAME_STYLE_ATTRIBUTE = 'data-mmd-hud-frame-styles'

function assetText(asset: OutputAsset): string {
  return typeof asset.source === 'string'
    ? asset.source
    : new TextDecoder().decode(asset.source)
}

function javascriptString(value: string): string {
  return JSON.stringify(value)
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029')
}

export function createFrameStyleInstaller(css: string): string {
  const serializedCss = javascriptString(css)
  return `(()=>{if(!document.querySelector("style[${FRAME_STYLE_ATTRIBUTE}]")){const style=document.createElement("style");style.setAttribute("${FRAME_STYLE_ATTRIBUTE}","");style.textContent=${serializedCss};(document.head||document.documentElement).appendChild(style)}})();`
}

export function injectFrameCss(bundle: OutputBundle): void {
  const cssAssets = Object.values(bundle)
    .filter((item): item is OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
    .sort((left, right) => left.fileName.localeCompare(right.fileName))
  if (cssAssets.length === 0) return

  const entryChunks = Object.values(bundle)
    .filter((item): item is OutputChunk => item.type === 'chunk' && item.isEntry)
  if (entryChunks.length !== 1) {
    throw new Error(`Frame CSS 注入要求恰好一个入口 chunk，当前为 ${entryChunks.length} 个`)
  }

  const css = cssAssets.map(assetText).join('\n')
  entryChunks[0].code = `${createFrameStyleInstaller(css)}${entryChunks[0].code}`
  for (const asset of cssAssets) delete bundle[asset.fileName]
}

export function frameCssInjectionPlugin(): Plugin {
  return {
    name: 'mmd-frame-css-injection',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      injectFrameCss(bundle)
    },
  }
}
