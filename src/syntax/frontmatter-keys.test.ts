import { describe, it, expect } from 'bun:test'
import { FRONTMATTER_KEYS, findFrontmatterKey } from './frontmatter-keys'

describe('FRONTMATTER_KEYS', () => {
  it('should hold the settled page keys', () => {
    for (const key of ['title', 'description', 'sidebarTitle', 'icon', 'hidden', 'noindex', 'tag']) {
      expect(findFrontmatterKey(key)).toBeDefined()
    }
  })

  it('should list each key once', () => {
    const keys = FRONTMATTER_KEYS.map((k) => k.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('should mark the deprecated keys with their replacement', () => {
    expect(findFrontmatterKey('noIndex')?.deprecated).toBe('noindex')
    expect(findFrontmatterKey('fullWidth')?.deprecated).toBe('layout: full-width')
  })

  it('should give every enum key its values', () => {
    for (const k of FRONTMATTER_KEYS.filter((k) => k.type === 'enum')) expect(k.values?.length).toBeGreaterThan(0)
  })

  it('should look keys up case-sensitively', () => {
    expect(findFrontmatterKey('Title')).toBeUndefined()
  })
})
