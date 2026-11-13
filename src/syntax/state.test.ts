import { describe, expect, it } from 'bun:test'
import { deprecationPhase, NOTICE_WINDOW_DAYS, removedAtFor } from './state'

const notice = new Date('2026-12-01T00:00:00Z')

describe('deprecation state', () => {
  it('should put removal fourteen days after the notice', () => {
    expect(NOTICE_WINDOW_DAYS).toBe(14)
    expect(removedAtFor(notice)?.toISOString()).toBe('2026-12-15T00:00:00.000Z')
    expect(removedAtFor(null)).toBeNull()
  })

  it('should warn when no notice was recorded', () => {
    expect(deprecationPhase(null, new Date('2030-01-01'))).toBe('warning')
  })

  it('should stay in the window until the removal instant', () => {
    expect(deprecationPhase(notice, new Date('2026-12-14T23:59:59Z'))).toBe('window')
    expect(deprecationPhase(notice, new Date('2026-12-15T00:00:00Z'))).toBe('removed')
  })

  it('should keep a v2-only form in the window for a v1 site after removal', () => {
    const later = new Date('2027-01-01')
    expect(deprecationPhase(notice, later, { requiresV2: true, siteIsV2: false })).toBe('window')
    expect(deprecationPhase(notice, later, { requiresV2: true, siteIsV2: true })).toBe('removed')
  })
})
