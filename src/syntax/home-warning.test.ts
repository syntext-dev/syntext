import { describe, expect, it } from 'bun:test'
import { LAYOUT_HOME_DEPRECATED } from '../appearance/resolve'
import { HOME_CUTOFF, homeCutoffLabel, homeDeprecationWarning } from './home-warning'

describe('homeDeprecationWarning', () => {
  it('should name the cut-off date as the build does', () => {
    expect(HOME_CUTOFF).toBe('2026-11-27')
    expect(homeCutoffLabel()).toBe('27 November 2026')
  })

  it('should keep the same date as the appearance.layout.home warning', () => {
    expect(LAYOUT_HOME_DEPRECATED).toContain(homeCutoffLabel())
  })

  it('should word the home frontmatter warning', () => {
    const m = homeDeprecationWarning('frontmatter.home')
    expect(m).toStartWith('`home` frontmatter is deprecated: the generated home it builds stops on 27 November 2026')
    expect(m).toContain('`stx migrate`')
  })

  it('should word the implicit home warning with the home: false way out', () => {
    const m = homeDeprecationWarning('frontmatter.implicit-home')
    expect(m).toStartWith('This index page shows the generated docs home, which stops on 27 November 2026')
    expect(m).toContain('`home: false`')
  })

  it('should return undefined for any other code', () => {
    expect(homeDeprecationWarning('frontmatter.noIndex')).toBeUndefined()
  })
})
