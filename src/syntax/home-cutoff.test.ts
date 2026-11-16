import { describe, it, expect } from 'bun:test'
import { HOME_CUTOFF, HOME_DEPRECATION_CODES, homeCutoffLabel } from './home-cutoff'
import { findDeprecation } from './registry'

describe('home cut-off', () => {
  it('should be 16 November 2026, brought forward because no live site used v2', () => {
    expect(HOME_CUTOFF).toBe('2026-11-16')
  })

  it('should label a date in British English', () => {
    expect(homeCutoffLabel()).toBe('16 November 2026')
    expect(homeCutoffLabel('2027-01-09')).toBe('9 January 2027')
  })

  it('should name only registry codes that never fail the build', () => {
    for (const code of HOME_DEPRECATION_CODES) {
      const d = findDeprecation(code)
      expect(d?.neverFails).toBe(true)
      expect(d?.requiresV2).toBe(true)
    }
  })

  it('should put the cut-off in every home fix', () => {
    for (const code of HOME_DEPRECATION_CODES) {
      expect(findDeprecation(code)!.fix).toContain(homeCutoffLabel())
      expect(findDeprecation(code)!.fix).not.toContain('27 November')
      expect(findDeprecation(code)!.fix).not.toContain('1 December')
    }
  })

  it('should word every home fix in the past tense now the cut-off has passed', () => {
    expect(findDeprecation('frontmatter.home')!.fix).toBe('Convert the generated home to components: Appearance › Convert home to content, or `stx migrate`. The generated home stopped on 16 November 2026.')
    expect(findDeprecation('frontmatter.implicit-home')!.fix).toBe('Convert the generated home to components (Appearance › Convert home to content, or `stx migrate`) to bring its blocks back into index.mdx. The generated home stopped on 16 November 2026.')
    expect(findDeprecation('config.layout-home')!.fix).toBe('Delete appearance.layout.home; since 16 November 2026 the home blocks follow the preset.')
  })
})
