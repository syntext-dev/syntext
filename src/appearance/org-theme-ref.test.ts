import { describe, expect, it } from 'bun:test'
import { formatOrgThemeRef, isThemeSlug, parseOrgThemeRef, slugifyThemeName } from './org-theme-ref'

describe('parseOrgThemeRef', () => {
  it('should follow the latest version when no version is given', () => {
    expect(parseOrgThemeRef('@acme/brand')).toEqual({ org: 'acme', slug: 'brand', version: null })
  })

  it('should pin a version when one is given', () => {
    expect(parseOrgThemeRef('@acme/brand@3')).toEqual({ org: 'acme', slug: 'brand', version: 3 })
    expect(parseOrgThemeRef(' @acme/brand-2@12 ')).toEqual({ org: 'acme', slug: 'brand-2', version: 12 })
    expect(parseOrgThemeRef('@-acme-/brand')).toEqual({ org: '-acme-', slug: 'brand', version: null })
  })

  it('should return null when the reference is malformed', () => {
    for (const bad of ['acme/brand', '@acme', '@acme/', '@/brand', '@acme/brand@', '@acme/brand@0', '@acme/brand@x', '@acme/Brand Book', 42, null]) {
      expect(parseOrgThemeRef(bad)).toBeNull()
    }
  })
})

describe('formatOrgThemeRef', () => {
  it('should write latest and pinned references', () => {
    expect(formatOrgThemeRef('acme', 'brand')).toBe('@acme/brand')
    expect(formatOrgThemeRef('acme', 'brand', 3)).toBe('@acme/brand@3')
  })
})

describe('slugifyThemeName', () => {
  it('should lower-case and hyphenate a name when deriving a slug', () => {
    expect(slugifyThemeName('  Acme Brand — 2026! ')).toBe('acme-brand-2026')
    expect(isThemeSlug(slugifyThemeName('x'.repeat(80)))).toBe(true)
  })

  it('should fall back to "theme" when nothing usable is left', () => {
    expect(slugifyThemeName('!!!')).toBe('theme')
  })
})

describe('isThemeSlug', () => {
  it('should accept lower-case slugs and refuse anything else', () => {
    expect(isThemeSlug('brand')).toBe(true)
    expect(isThemeSlug('brand-2')).toBe(true)
    expect(isThemeSlug('-brand')).toBe(false)
    expect(isThemeSlug('Brand')).toBe(false)
    expect(isThemeSlug('')).toBe(false)
  })
})
