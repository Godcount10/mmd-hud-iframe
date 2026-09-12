// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createInlineRules, verifyInlineRules, MAX_REPLACEMENT_LENGTH, MAX_INLINE_RULES } from '../../scripts/inline-rules.mjs'

describe('platform inline regex injection', () => {
  it('reproduces the old replacement-template corruption before JavaScript execution', () => {
    const source = 'globalThis.text=' + JSON.stringify('$`')
    const wrapper = '<script>globalThis.source=' + JSON.stringify(source) + '</script>'
    const prefix = '<p title="prefix">earlier content</p>'
    expect(() => new Function(wrapper.match(/<script>([\s\S]*?)<\/script>/)[1])).not.toThrow()
    const expanded = (prefix + 'ENTRY').replace(/ENTRY/g, wrapper)
    expect(expanded).not.toBe(prefix + wrapper)
    expect(() => new Function(expanded.match(/<script>([\s\S]*?)<\/script>/)[1])).toThrow(SyntaxError)
  })

  it.each(['bridge-debug', 'game'])('preserves %s source through string and callback replacement and repeated injection', theme => {
    const text = "$& $$ $` $' $1 $<name> </script><SCRIPT> &quot; \\ \" ' 中文 🧪\u2028\u2029"
    const host = 'globalThis.host=' + JSON.stringify(text)
    const frame = 'globalThis.frame=' + JSON.stringify(text.repeat(800))
    const id = 'release-' + text
    const { scripts } = createInlineRules(host, frame, id, theme)
    expect(scripts.length).toBeGreaterThan(3)
    expect(scripts.length).toBeLessThanOrEqual(MAX_INLINE_RULES)
    expect(scripts.every(r => r.replaceString.length <= MAX_REPLACEMENT_LENGTH && !r.replaceString.includes('$'))).toBe(true)
    expect(() => verifyInlineRules(scripts, host, frame, id, theme)).not.toThrow()
  })

  it('preserves UTF-8 and emoji across chunk boundaries', () => {
    const source = '\ufeffglobalThis.text=' + JSON.stringify('🧪汉'.repeat(16000))
    const { scripts } = createInlineRules(source, source, 'utf8-test', 'game')
    expect(() => verifyInlineRules(scripts, source, source, 'utf8-test', 'game')).not.toThrow()
  })

  it('fails validation when a rule is missing or decodes to different source', () => {
    const host = 'globalThis.host=true'
    const frame = 'globalThis.frame=true'
    const { scripts } = createInlineRules(host, frame, 'test', 'game')
    expect(() => verifyInlineRules([scripts[0], scripts.at(-1)], host, frame, 'test', 'game')).toThrow()
    expect(() => verifyInlineRules(scripts, host + ';', frame, 'test', 'game')).toThrow(/Host/)
  })

  it('handles chunks made mostly of characters that expand when escaped', () => {
    const source = 'globalThis.text=' + JSON.stringify('<$\u2028\u2029'.repeat(6000))
    const { scripts } = createInlineRules(source, source, 'escaped', 'game')
    expect(() => verifyInlineRules(scripts, source, source, 'escaped', 'game')).not.toThrow()
  })

  it('accepts 130 rules including startup and rejects 131', () => {
    const host = 'globalThis.host=true'
    const frame = '/*' + 'a'.repeat(MAX_REPLACEMENT_LENGTH * MAX_INLINE_RULES) + '*/'
    expect(() => createInlineRules(host, frame, 'limit')).toThrow(/130/)
    // Frame placeholders keep the same three-digit width within the limit.
    const emptyFrame = createInlineRules(host, 'a', 'limit').scripts[1]
    const capacity = MAX_REPLACEMENT_LENGTH - (emptyFrame.replaceString.length - 1)
    const atLimit = '/*' + 'a'.repeat(capacity * (MAX_INLINE_RULES - 2) - 4) + '*/'
    const { scripts } = createInlineRules(host, atLimit, 'limit')
    expect(scripts).toHaveLength(MAX_INLINE_RULES)
    expect(() => verifyInlineRules(scripts, host, atLimit, 'limit', 'bridge-debug')).not.toThrow()
    expect(() => createInlineRules(host, atLimit + ' ', 'limit')).toThrow(/130/)
  })
})
