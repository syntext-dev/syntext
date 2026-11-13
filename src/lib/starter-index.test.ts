import { describe, expect, it } from 'bun:test'
import { parse as parseYaml } from 'yaml'
import { starterIndexMdx } from './starter-index'
import { scanPage } from '../syntax/scan-page'

describe('starterIndexMdx', () => {
  it('should write a wide home of components that opts the index in', () => {
    const mdx = starterIndexMdx({ title: 'Acme docs' })
    expect(mdx).toStartWith('---\ntitle: Acme docs\ndescription: Guides and answers, in one place.\nlayout: wide\n---\n')
    expect(mdx).toContain('<Hero title="Acme docs"')
    expect(mdx).toContain('<SectionCards />')
    expect(mdx).toContain('<LatestUpdates count={3} />')
    expect(mdx).toContain('  [Get started](/quickstart)\n</Hero>')
    expect(mdx).not.toContain('/ask')
    expect(mdx).not.toContain('API reference')
    // Uses the home components, so the generated-home deprecation does not fire.
    expect(scanPage('index.mdx', mdx).usages).toEqual([])
  })

  it('should quote titles YAML would misread and escape attribute quotes', () => {
    const mdx = starterIndexMdx({ title: 'Acme: "API"', description: 'x' })
    expect(mdx).toContain('title: "Acme: \\"API\\""')
    expect(mdx).toContain('<Hero title="Acme: &quot;API&quot;" description="x">')
    const fm = parseYaml(mdx.split('---\n')[1] ?? '') as Record<string, unknown>
    expect(fm.title).toBe('Acme: "API"')
  })
})
