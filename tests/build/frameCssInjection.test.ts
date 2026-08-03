import type { OutputBundle } from 'rollup'
import {
  FRAME_STYLE_ATTRIBUTE,
  createFrameStyleInstaller,
  injectFrameCss,
} from '../../build/frameCssInjection'

function createBundle(): OutputBundle {
  return {
    'mmd-hud-iframe-frame.js': {
      type: 'chunk',
      code: 'globalThis.__frameStarted = true;',
      dynamicImports: [],
      exports: [],
      facadeModuleId: '/src/frame/main.ts',
      fileName: 'mmd-hud-iframe-frame.js',
      implicitlyLoadedBefore: [],
      importedBindings: {},
      imports: [],
      isDynamicEntry: false,
      isEntry: true,
      isImplicitEntry: false,
      map: null,
      modules: {},
      moduleIds: ['/src/frame/main.ts'],
      name: 'main',
      preliminaryFileName: 'mmd-hud-iframe-frame.js',
      referencedFiles: [],
      sourcemapFileName: null,
      viteMetadata: undefined,
    },
    'mmd-hud-iframe.css': {
      type: 'asset',
      fileName: 'mmd-hud-iframe.css',
      name: 'mmd-hud-iframe.css',
      names: ['mmd-hud-iframe.css'],
      needsCodeReference: false,
      originalFileName: null,
      originalFileNames: [],
      source: '.spark::before{content:"</style> "}',
    },
  }
}

describe('frameCssInjection', () => {
  it('将所有 CSS 注入唯一入口并删除独立 CSS 资产', () => {
    const bundle = createBundle()

    injectFrameCss(bundle)

    expect(bundle['mmd-hud-iframe.css']).toBeUndefined()
    const entry = bundle['mmd-hud-iframe-frame.js']
    expect(entry?.type).toBe('chunk')
    if (entry?.type !== 'chunk') throw new Error('缺少入口 chunk')
    expect(entry.code).toContain(FRAME_STYLE_ATTRIBUTE)
    expect(entry.code).toContain('.spark::before')
    expect(entry.code).toContain('globalThis.__frameStarted = true;')
    expect(entry.code).toContain('\\u2028')
  })

  it('生成带唯一标记和重复保护的样式安装器', () => {
    const installer = createFrameStyleInstaller('body{color:#fff}')

    expect(installer).toContain(`style[${FRAME_STYLE_ATTRIBUTE}]`)
    expect(installer).toContain(`setAttribute(\"${FRAME_STYLE_ATTRIBUTE}\",\"\")`)
    expect(installer).toContain('document.head||document.documentElement')
    expect(installer).toContain('body{color:#fff}')
  })

  it('没有 CSS 时保持入口不变', () => {
    const bundle = createBundle()
    delete bundle['mmd-hud-iframe.css']
    const entry = bundle['mmd-hud-iframe-frame.js']
    if (entry?.type !== 'chunk') throw new Error('缺少入口 chunk')
    const before = entry.code

    injectFrameCss(bundle)

    expect(entry.code).toBe(before)
  })

  it('CSS 存在但入口不唯一时拒绝构建', () => {
    const bundle = createBundle()
    const entry = bundle['mmd-hud-iframe-frame.js']
    if (entry?.type !== 'chunk') throw new Error('缺少入口 chunk')
    entry.isEntry = false

    expect(() => injectFrameCss(bundle)).toThrow('恰好一个入口 chunk')
  })
})
