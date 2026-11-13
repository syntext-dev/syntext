import { describe, expect, it } from 'bun:test'
import { formatUsage, type DeprecationUsage } from './usage'

const u: DeprecationUsage = { code: 'config.features-navStyle', kind: 'config', file: 'syntext.json', line: 3, old: 'features.navStyle: "single"', replacement: 'appearance.layout.header: "simple"' }

describe('formatUsage', () => {
  it('should name file, line, the old form and the replacement when warning', () => {
    expect(formatUsage(u, { phase: 'warning', siteIsV2: true })).toBe('syntext.json:3: features.navStyle: "single" is deprecated. Use appearance.layout.header: "simple" instead.')
  })

  it('should say when the old form stops working during the window', () => {
    const msg = formatUsage({ ...u, code: 'mdx.caution', kind: 'mdx-tag', old: '<Caution>', replacement: '<Warning>', file: 'a.mdx' }, { phase: 'window', removedAt: new Date('2026-12-15T00:00:00Z') })
    expect(msg).toBe('a.mdx:3: <Caution> is deprecated and stops working on 2026-12-15. Use <Warning> instead.')
  })

  it('should give the exact fix once removed', () => {
    const msg = formatUsage({ ...u, code: 'mdx.caution', kind: 'mdx-tag', old: '<Caution>', replacement: '<Warning>', file: 'a.mdx' }, { phase: 'removed', removedAt: new Date('2026-12-15T00:00:00Z') })
    expect(msg).toBe('a.mdx:3: <Caution> is no longer supported (removed 2026-12-15). Fix: use <Warning>. Rename <Caution> to <Warning>; they always rendered the same. `stx migrate` rewrites it.')
  })

  it('should explain the v2 switch for v2-only forms on a v1 site', () => {
    expect(formatUsage(u, { phase: 'warning', siteIsV2: false })).toContain('Keep it until the site moves to doc engine v2: adding appearance switches the renderer.')
  })

  it('should word unknown keys as a did-you-mean in every phase', () => {
    const k = { ...u, code: 'config.unknown-key', old: 'navigaton', replacement: 'navigation' }
    expect(formatUsage(k, { phase: 'warning' })).toBe('syntext.json:3: Unknown key "navigaton" is ignored. Did you mean "navigation"?')
    expect(formatUsage({ ...k, replacement: 'nothing (delete the key)' }, { phase: 'window', removedAt: new Date('2026-12-15T00:00:00Z') }))
      .toBe('syntext.json:3: Unknown key "navigaton" is ignored. Delete it. Unknown keys fail the build from 2026-12-15.')
    expect(formatUsage(k, { phase: 'removed' })).toBe('syntext.json:3: Unknown key "navigaton" is no longer accepted. Fix: rename it to "navigation".')
  })
})
