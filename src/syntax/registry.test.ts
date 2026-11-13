import { describe, expect, it } from 'bun:test'
import { DEPRECATION_CODES, DEPRECATIONS, findDeprecation } from './registry'

describe('deprecation registry', () => {
  it('should hold unique codes when listed', () => {
    expect(new Set(DEPRECATION_CODES).size).toBe(DEPRECATION_CODES.length)
  })

  it('should prefix every code with its kind family when declared', () => {
    for (const d of DEPRECATIONS) {
      const family = d.kind === 'config' ? 'config.' : d.kind === 'frontmatter' ? 'frontmatter.' : 'mdx.'
      expect({ code: d.code, ok: d.code.startsWith(family) }).toEqual({ code: d.code, ok: true })
    }
  })

  it('should give every entry an old form, a replacement and a fix when declared', () => {
    for (const d of DEPRECATIONS) {
      expect(d.old.trim().length).toBeGreaterThan(0)
      expect(d.replacement.trim().length).toBeGreaterThan(0)
      expect(d.fix.trim().endsWith('.')).toBe(true)
    }
  })

  it('should map every v1 style flag in customization.md to appearance when looked up', () => {
    for (const flag of ['navStyle', 'sidebarStyle', 'codeBlockStyle', 'shellWidth', 'themeToggle']) {
      const d = findDeprecation(`config.features-${flag}`)
      expect(d?.rewrite.type).toBe('move-key')
      expect(d?.requiresV2).toBe(true)
      if (d?.rewrite.type === 'move-key') expect(d.rewrite.to[0].startsWith('appearance.')).toBe(true)
    }
  })

  it('should map nav collapsible to chevrons when looked up', () => {
    expect(findDeprecation('config.layout-nav-collapsible')?.rewrite).toEqual({ type: 'set-value', path: 'appearance.layout.nav', from: 'collapsible', to: 'chevrons' })
  })

  it('should map every Callout type to a named callout when looked up', () => {
    const d = findDeprecation('mdx.callout-type')
    expect(d?.rewrite.type).toBe('tag-from-prop')
    if (d?.rewrite.type === 'tag-from-prop') expect(Object.values(d.rewrite.map).sort()).toEqual(['Danger', 'Info', 'Note', 'Tip', 'Warning', 'Warning'])
  })

  it('should return undefined for an unknown code', () => {
    expect(findDeprecation('config.nope')).toBeUndefined()
  })
})
