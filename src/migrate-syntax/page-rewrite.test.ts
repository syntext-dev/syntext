import { describe, it, expect } from 'bun:test'
import { deprecationTable } from '../syntax/table'
import { PAGE_REWRITE_TYPES, rewritePage, unsupportedPageRules } from './page-rewrite'

const items = deprecationTable().items
const run = (source: string) => rewritePage('docs/a.mdx', source, items)

describe('rewritePage: frontmatter', () => {
  it('should rename noIndex to noindex in place', () => {
    const r = run('---\ntitle: A\nnoIndex: true # hide\n---\nBody\n')
    expect(r.text).toBe('---\ntitle: A\nnoindex: true # hide\n---\nBody\n')
    expect(r.applied).toEqual([{ code: 'frontmatter.noIndex', file: 'docs/a.mdx', line: 3, old: 'noIndex: true', replacement: 'noindex: true' }])
  })

  it('should drop noIndex when noindex is already set', () => {
    const r = run('---\nnoindex: false\nnoIndex: true\n---\n')
    expect(r.text).toBe('---\nnoindex: false\n---\n')
    expect(r.applied[0]?.note).toBe('noindex was already set; removed noIndex.')
  })

  it('should turn fullWidth: true into layout: full-width and drop fullWidth: false', () => {
    expect(run('---\nfullWidth: true\n---\n').text).toBe('---\nlayout: full-width\n---\n')
    expect(run('---\ntitle: A\nfullWidth: false\n---\n').text).toBe('---\ntitle: A\n---\n')
    expect(run('---\nlayout: centered\nfullWidth: true\n---\n').text).toBe('---\nlayout: centered\n---\n')
  })

  it('should leave a non-boolean fullWidth alone', () => {
    expect(run('---\nfullWidth: maybe\n---\n').applied).toEqual([])
  })

  it('should leave a page without frontmatter alone', () => {
    expect(run('# Title\nnoIndex: true\n').applied).toEqual([])
  })
})

describe('rewritePage: MDX', () => {
  it('should rename deprecated props and keep everything else', () => {
    const r = run('<Update label="June 2026" description="x">\nBody\n</Update>\n')
    expect(r.text).toBe('<Update title="June 2026" description="x">\nBody\n</Update>\n')
    expect(r.applied[0]).toEqual({ code: 'mdx.update-label', file: 'docs/a.mdx', line: 1, old: '<Update label="…">', replacement: '<Update title="…">' })
  })

  it('should hold a prop whose new name is already there', () => {
    const r = run('<Update label="a" title="b">x</Update>\n')
    expect(r.text).toBe('<Update label="a" title="b">x</Update>\n')
    expect(r.held[0]).toMatchObject({ code: 'mdx.update-label', reason: 'The tag already has title; delete label by hand.' })
  })

  it('should rename tags, opening and closing', () => {
    expect(run('<Caution>\nx\n</Caution>\n<Caution />\n').text).toBe('<Warning>\nx\n</Warning>\n<Warning />\n')
  })

  it('should turn <Callout type> into the named callout, nested and self-closing', () => {
    const src = '<Callout type="tip">\n<Callout type="Danger">x</Callout>\n</Callout>\n<Callout type="odd">y</Callout>\n<Callout type="note" />\n'
    const r = run(src)
    expect(r.text).toBe('<Tip>\n<Danger>x</Danger>\n</Tip>\n<Callout type="odd">y</Callout>\n<Note />\n')
    expect(r.held.map((h) => h.code)).toEqual(['mdx.callout-type'])
  })

  it('should not touch code fences, inline code, comments or frontmatter', () => {
    const src = '---\ntitle: "<Caution>"\n---\n```mdx\n<Update label="x">\n```\n`<Caution>` and <!-- <Caution> -->\n'
    expect(run(src).text).toBe(src)
  })

  it('should rename Playground props', () => {
    expect(run('<Playground base-url="u" auth-label="a" key-label="k" />\n').text).toBe('<Playground baseUrl="u" authLabel="a" keyLabel="k" />\n')
  })

  it('should be idempotent', () => {
    const once = run('---\nnoIndex: true\nfullWidth: true\n---\n<Callout type="tip">x</Callout>\n<Endpoint url="/v1" />\n<SearchBar hint="⌘K" />\n')
    const twice = run(once.text)
    expect(twice.applied).toEqual([])
    expect(twice.text).toBe(once.text)
  })
})

describe('unsupportedPageRules', () => {
  const table = deprecationTable().items
  const as = (type: string) => ({ ...table[0]!, code: `frontmatter.${type}`, kind: 'frontmatter' as const, rewrite: { type } as unknown as (typeof table)[number]['rewrite'] })

  it('should know every page rule in the bundled table, home-to-mdx included', () => {
    expect(unsupportedPageRules(table)).toEqual([])
    expect(PAGE_REWRITE_TYPES.has('home-to-mdx')).toBe(true)
  })

  it('should name page rules of a type this stx does not know, and ignore config rules', () => {
    expect(unsupportedPageRules([as('split-page'), { ...as('split-page'), kind: 'config' as const, code: 'config.x' }])).toEqual(['frontmatter.split-page'])
  })
})
