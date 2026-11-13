import { describe, expect, it } from 'bun:test'
import { KNOWN_FRONTMATTER_KEYS, validateFrontmatter } from './frontmatter'

describe('validateFrontmatter', () => {
  it('should accept the settled keys, generator keys and documented inert keys', () => {
    const fm = { title: 'A', description: 'B', sidebarTitle: 'C', icon: 'rocket', hidden: true, noindex: true, tag: 'New', group: 'g', deprecated: true, scopes: [], since: '1.0', type: 'guide', date: '2026-01-01' }
    expect(validateFrontmatter(fm)).toEqual([])
  })

  it('should suggest the closest key for an unknown one, with its line', () => {
    const [issue] = validateFrontmatter({ title: 'A', sidebarTitel: 'B' }, 'title: A\nsidebarTitel: B')
    expect(issue).toMatchObject({ key: 'sidebarTitel', kind: 'unknown-key', suggestion: 'sidebarTitle', line: 3 })
    expect(issue.message).toBe('Unknown frontmatter key "sidebarTitel". Did you mean "sidebarTitle"?')
  })

  it('should name the allowed values for a bad enum value', () => {
    const [issue] = validateFrontmatter({ layout: 'centred' })
    expect(issue).toMatchObject({ key: 'layout', kind: 'invalid-value', suggestion: 'centered' })
    expect(issue.message).toContain('Use one of: default, centered, full-width, landing, wide.')
  })

  it('should leave case-insensitive enum values alone', () => {
    expect(validateFrontmatter({ protocol: 'REST', category: 'API' })).toEqual([])
  })

  it('should know every catalogue key', () => {
    for (const key of ['title', 'noIndex', 'fullWidth', 'servers', 'broker']) expect(KNOWN_FRONTMATTER_KEYS).toContain(key)
  })
})
