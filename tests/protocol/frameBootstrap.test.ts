import {
  createEmbeddedFrameSrcdoc,
  createFrameSrcdoc,
  decodeFrameBootstrap,
  encodeFrameBootstrap,
  type FrameBootstrapConfig,
} from '../../src/protocol'

const bootstrap: FrameBootstrapConfig = {
  protocol: 'mmd-hud-iframe-bootstrap',
  buildId: 'build-test',
  bootstrapId: 'bootstrap-test',
  parentOrigin: 'https://mmd.example',
  theme: 'bridge-debug',
}

describe('srcdoc Frame bootstrap', () => {
  it('round-trips the window.name bootstrap without URL query parameters', () => {
    expect(decodeFrameBootstrap(encodeFrameBootstrap(bootstrap))).toEqual(bootstrap)
  })

  it('rejects malformed bootstrap values and non-origin parent URLs', () => {
    expect(decodeFrameBootstrap('not-json')).toBeNull()
    expect(decodeFrameBootstrap(JSON.stringify({ ...bootstrap, parentOrigin: 'https://mmd.example/path' }))).toBeNull()
    expect(decodeFrameBootstrap(JSON.stringify({ ...bootstrap, theme: 'unknown' }))).toBeNull()
  })

  it('creates a minimal srcdoc that loads an HTTPS Frame script', () => {
    const srcdoc = createFrameSrcdoc(new URL('https://cdn.jsdelivr.net/gh/example/release@sha/frame/mmd-hud-iframe-frame.js'))
    expect(srcdoc).toContain('<div id="app"></div>')
    expect(srcdoc).toContain('type="module"')
    expect(srcdoc).toContain('cdn.jsdelivr.net')
    expect(srcdoc).not.toContain('bootstrap-test')
  })

  it('rejects blob Frame URLs because inline bundles use embedded srcdoc', () => {
    expect(() => createFrameSrcdoc(new URL('blob:https://mmd.example/frame-inline'))).toThrow(/HTTPS/)
  })

  it('creates an inline Frame srcdoc without a remote script URL', () => {
    const srcdoc = createEmbeddedFrameSrcdoc('window.__inline_test__ = true;')
    expect(srcdoc).toContain('<script>window.__inline_test__ = true;</script>')
    expect(srcdoc).not.toContain('src="')
  })

  it('rejects insecure non-loopback Frame scripts', () => {
    expect(() => createFrameSrcdoc(new URL('http://cdn.example/frame.js'))).toThrow(/HTTPS/)
    expect(() => createFrameSrcdoc(new URL('http://127.0.0.1:5173/frame.js'))).not.toThrow()
  })
})
