import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EFFECT_SETTINGS,
  EFFECT_SETTINGS_KEY,
  effectCanRun,
  normalizeEffectSettings,
  readEffectSettings,
  resolveBrowserStorage,
  writeEffectSettings,
} from './useEffectSettings'

describe('effect settings', () => {
  it('normalizes partial and invalid persisted values', () => {
    expect(normalizeEffectSettings({ enabled: false, distortion: 'bad', density: 'high' })).toEqual({
      ...DEFAULT_EFFECT_SETTINGS,
      enabled: false,
      density: 'high',
    })
  })

  it('falls back when persisted JSON is malformed', () => {
    const storage = { getItem: () => '{broken' }
    expect(readEffectSettings(storage)).toEqual(DEFAULT_EFFECT_SETTINGS)
  })

  it('falls back when browser storage access is denied', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => { throw new DOMException('Blocked', 'SecurityError') },
    })
    try {
      expect(resolveBrowserStorage()).toBeNull()
      expect(readEffectSettings()).toEqual(DEFAULT_EFFECT_SETTINGS)
      expect(writeEffectSettings({ ...DEFAULT_EFFECT_SETTINGS })).toBe(false)
    } finally {
      if (descriptor) Object.defineProperty(window, 'localStorage', descriptor)
    }
  })

  it('uses the scoped storage key and normalized payload', () => {
    const writes: Record<string, string> = {}
    expect(writeEffectSettings({ ...DEFAULT_EFFECT_SETTINGS, mobile: 'off' }, { setItem: (key, value) => { writes[key] = value } })).toBe(true)
    expect(JSON.parse(writes[EFFECT_SETTINGS_KEY])).toEqual({ ...DEFAULT_EFFECT_SETTINGS, mobile: 'off' })
  })

  it('disables runtime for reduced motion, hidden pages, and mobile policy', () => {
    expect(effectCanRun({ ...DEFAULT_EFFECT_SETTINGS }, false, false, true)).toBe(true)
    expect(effectCanRun({ ...DEFAULT_EFFECT_SETTINGS }, true, false, true)).toBe(false)
    expect(effectCanRun({ ...DEFAULT_EFFECT_SETTINGS }, false, false, false)).toBe(false)
    expect(effectCanRun({ ...DEFAULT_EFFECT_SETTINGS, mobile: 'off' }, false, true, true)).toBe(false)
    expect(effectCanRun({ ...DEFAULT_EFFECT_SETTINGS, mobile: 'on', intensity: 'hyper', density: 'high' }, false, true, true)).toBe(true)
    expect(effectCanRun({ ...DEFAULT_EFFECT_SETTINGS, intensity: 'hyper' }, false, true, true)).toBe(false)
  })
})
