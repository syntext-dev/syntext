import { describe, expect, it } from 'bun:test'
import { LAYOUT_HOME_DEPRECATED, LAYOUT_HOME_IGNORED } from '../appearance/resolve'
import { HOME_CUTOFF, homeCutoffLabel, homeDeprecationWarning } from './home-warning'

const BEFORE = '2026-11-15T23:59:59Z'
const AFTER = '2026-11-16T00:00:00Z'

describe('homeDeprecationWarning', () => {
  it('should name the cut-off date as the build does', () => {
    expect(HOME_CUTOFF).toBe('2026-11-16')
    expect(homeCutoffLabel()).toBe('16 November 2026')
  })

  it('should keep the same date as the appearance.layout.home warnings', () => {
    expect(LAYOUT_HOME_DEPRECATED).toContain(homeCutoffLabel())
    expect(LAYOUT_HOME_IGNORED).toBe('appearance.layout.home is ignored since 16 November 2026: the home blocks follow the preset. Remove it.')
  })

  it('should word the warnings in the future tense before the cut-off, as the build did', () => {
    expect(homeDeprecationWarning('frontmatter.home', BEFORE)).toBe('`home` frontmatter is deprecated: the generated home it builds stops on 16 November 2026, and index.mdx will then show only its own content. Convert it to components with Appearance › Convert home to content in the dashboard (or `stx migrate`), which writes the same blocks as MDX components.')
    expect(homeDeprecationWarning('frontmatter.implicit-home', BEFORE)).toBe('This index page shows the generated docs home, which stops on 16 November 2026: index.mdx will then show only its own content. Convert it to components with Appearance › Convert home to content in the dashboard (or `stx migrate`) to keep this look, or add `home: false` to switch now.')
  })

  it('should word the warnings in the past tense on and after the cut-off, as the build does', () => {
    expect(homeDeprecationWarning('frontmatter.home', AFTER)).toBe('`home` frontmatter is deprecated: the generated home stopped on 16 November 2026, and index.mdx now shows only its own content. Convert it to components with Appearance › Convert home to content in the dashboard (or `stx migrate`), which writes the same blocks as MDX components.')
    expect(homeDeprecationWarning('frontmatter.implicit-home', AFTER)).toBe('The generated docs home stopped on 16 November 2026: index.mdx now shows only its own content. Convert it to components with Appearance › Convert home to content in the dashboard (or `stx migrate`) to bring the preset\'s home blocks back.')
  })

  it('should read the clock by default, which is past the cut-off', () => {
    expect(homeDeprecationWarning('frontmatter.home')).toBe(homeDeprecationWarning('frontmatter.home', AFTER))
    expect(homeDeprecationWarning('frontmatter.implicit-home')).toBe(homeDeprecationWarning('frontmatter.implicit-home', AFTER))
  })

  it('should return undefined for any other code', () => {
    expect(homeDeprecationWarning('frontmatter.noIndex')).toBeUndefined()
    expect(homeDeprecationWarning('frontmatter.noIndex', BEFORE)).toBeUndefined()
  })
})
