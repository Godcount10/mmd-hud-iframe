import { describe, it, expect } from 'vitest'
import { ACTION_DEBUG_MANIFEST, resolveActionDefinition } from './actionDebugManifest'
import type { NativeAction } from '../../../contracts'

const set = (...actions: NativeAction[]) => new Set<NativeAction>(actions)

describe('resolveActionDefinition', () => {
  it('leaves a statically-registered action unchanged when the Host also registers it', () => {
    const def = resolveActionDefinition('sendMessage', set('sendMessage'))
    expect(def).toBe(ACTION_DEBUG_MANIFEST.sendMessage)
    expect(def.support).toBe('registered')
  })

  it('promotes a contract-only action the Host now handles, and clears its placeholder payload', () => {
    // stopGeneration is contract-only in the built-in adapter; a host bridge can register it.
    expect(ACTION_DEBUG_MANIFEST.stopGeneration.support).toBe('contract-only')
    expect(ACTION_DEBUG_MANIFEST.stopGeneration.payloadKind).toBe('contract-only')
    const def = resolveActionDefinition('stopGeneration', set('stopGeneration'))
    expect(def.support).toBe('registered')
    // no-arg action: placeholder payloadKind becomes 'none' so the lab lets it run
    expect(def.payloadKind).toBe('none')
    expect(def.description).toContain('执行并验证')
  })

  it('demotes an action the Host does not register to contract-only', () => {
    const def = resolveActionDefinition('sendMessage', set())
    expect(def.support).toBe('contract-only')
    expect(def.payloadKind).toBe('contract-only')
    expect(def.description).toContain('没有原生 handler')
  })

  it('keeps label, group and effect from the static manifest', () => {
    const base = ACTION_DEBUG_MANIFEST.deleteMessage
    const def = resolveActionDefinition('deleteMessage', set())
    expect(def.label).toBe(base.label)
    expect(def.group).toBe(base.group)
    expect(def.effect).toBe(base.effect)
    expect(def.confirm).toBe(base.confirm)
  })
})
