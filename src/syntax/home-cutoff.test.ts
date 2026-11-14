import { describe, it, expect } from 'bun:test'
import { HOME_CUTOFF, HOME_DEPRECATION_CODES, homeCutoffLabel } from './home-cutoff'
import { findDeprecation } from './registry'

describe('home cut-off', () => {
  it('should be 14 days after the planned send date', () => {
    expect(HOME_CUTOFF).toBe('2026-12-01')
    const planned = Date.UTC(2026, 10, 17)
    expect(Date.parse(`${HOME_CUTOFF}T00:00:00Z`) - planned).toBe(14 * 24 * 60 * 60 * 1000)
  })

  it('should label a date in British English', () => {
    expect(homeCutoffLabel()).toBe('1 December 2026')
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
    }
  })
})
