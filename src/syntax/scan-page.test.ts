import { describe, expect, it } from 'bun:test'
import { scanPage } from './scan-page'

describe('scanPage', () => {
  it('should find nothing on a clean page', () => {
    const r = scanPage('guide.mdx', '---\ntitle: A\nnoindex: true\ntag: New\n---\n<Warning>x</Warning>\n<Update title="v2">y</Update>\n')
    expect(r).toEqual({ usages: [], issues: [] })
  })

  it('should accept Update tags written as an array like the documented string', () => {
    // The hosted compiler (stx build and stx dev build there) turns tags={["a", "b"]} into tags="a, b".
    const asArray = scanPage('changelog.mdx', '---\ntitle: Changelog\n---\n<Update title="v2.5" tags={["Feature", "API"]}>\n\nBody\n\n</Update>\n')
    const asString = scanPage('changelog.mdx', '---\ntitle: Changelog\n---\n<Update title="v2.5" tags="Feature, API">\n\nBody\n\n</Update>\n')
    expect(asArray).toEqual({ usages: [], issues: [] })
    expect(asArray).toEqual(asString)
  })

  it('should find renamed frontmatter keys with their lines', () => {
    const { usages } = scanPage('a.mdx', '---\ntitle: A\nnoIndex: true\nfullWidth: true\n---\nBody')
    expect(usages).toEqual([
      { code: 'frontmatter.noIndex', kind: 'frontmatter', file: 'a.mdx', line: 3, old: 'noIndex: true', replacement: 'noindex: true' },
      { code: 'frontmatter.fullWidth', kind: 'frontmatter', file: 'a.mdx', line: 4, old: 'fullWidth: true', replacement: 'layout: full-width' },
    ])
  })

  it('should tell an author to delete fullWidth false', () => {
    expect(scanPage('a.mdx', '---\nfullWidth: false\n---\n').usages[0].replacement).toBe('nothing (delete fullWidth)')
  })

  it('should record unknown frontmatter keys and report bad values separately', () => {
    const r = scanPage('a.mdx', '---\ntitle: A\nsidebarTitel: B\nlayout: huge\n---\n')
    expect(r.usages).toEqual([{ code: 'frontmatter.unknown-key', kind: 'frontmatter', file: 'a.mdx', line: 3, old: 'sidebarTitel', replacement: 'sidebarTitle' }])
    expect(r.issues).toEqual([expect.objectContaining({ key: 'layout', kind: 'invalid-value', line: 4 })])
  })

  it('should find deprecated tags and props with their lines', () => {
    const src = '# T\n<Caution>x</Caution>\n<Callout type="tip">y</Callout>\n<Update label="v1">z</Update>\n<Playground\n  base-url="https://x"\n/>\n<Endpoint method="GET" url="/a" />\n<SearchBar hint="false" />\n'
    expect(scanPage('p.mdx', src).usages.map((u) => [u.code, u.line, u.old, u.replacement])).toEqual([
      ['mdx.caution', 2, '<Caution>', '<Warning>'],
      ['mdx.callout-type', 3, '<Callout type="tip">', '<Tip>'],
      ['mdx.update-label', 4, '<Update label="…">', '<Update title="…">'],
      ['mdx.playground-base-url', 6, '<Playground base-url="…">', '<Playground baseUrl="…">'],
      ['mdx.endpoint-url', 8, '<Endpoint url="…">', '<Endpoint path="…">'],
      ['mdx.searchbar-hint', 9, '<SearchBar hint="…">', '<SearchBar kbd="…">'],
    ])
  })

  it('should not flag examples in code fences or tags in frontmatter strings', () => {
    const src = '---\ntitle: "<Caution>"\n---\n```mdx\n<Caution>x</Caution>\n```\n'
    expect(scanPage('p.mdx', src).usages).toEqual([])
  })
})
