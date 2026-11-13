// Copied from syntext-backend src/services/v2/home-to-mdx.test.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
import { describe, expect, it } from 'bun:test'
import { convertIndexSource, homeToMdx, type HomeMigrationSite } from './home-to-mdx'

const site: HomeMigrationSite = {
  layout: 'command', siteName: 'Acme', title: 'Acme docs', description: 'Build with Acme.', assistant: true,
  has: { changelog: true, api: true, cli: true }, quickstart: { title: 'Quickstart', href: '/quickstart' }, githubUrl: 'https://github.com/acme', changelogHref: '/changelog',
}

describe('homeToMdx', () => {
  it('should write the components the preset home drew when there is no home frontmatter', () => {
    const { mdx, warnings } = homeToMdx(undefined, site)
    expect(mdx).toBe([
      '<Hero title="Acme docs" description="Build with Acme.">\n  <SearchBar mode="both" suggestions="popular" />\n</Hero>',
      '<QuickStart />',
      '<SectionCards />',
      '<LatestUpdates />',
    ].join('\n\n') + '\n')
    expect(warnings).toEqual([])
  })

  it('should follow each layout\'s blocks and fixed headlines', () => {
    expect(homeToMdx(undefined, { ...site, layout: 'pill' }).mdx).toStartWith('<Hero title="How can we help?" description="Build with Acme.">')
    expect(homeToMdx(undefined, { ...site, layout: 'pill' }).mdx).toContain('<PopularPages />')
    expect(homeToMdx(undefined, { ...site, layout: 'path' }).mdx).toStartWith('<Hero title="What are you building?" description="Build with Acme." eyebrow="Acme docs">')
    expect(homeToMdx(undefined, { ...site, layout: 'tabs' }).mdx).toContain('<CommandList />')
    expect(homeToMdx(undefined, { ...site, layout: 'mega' }).mdx).toContain('<ApiGroups />')
    expect(homeToMdx(undefined, { ...site, layout: 'mega', has: { ...site.has, api: false } }).mdx).toContain('<SectionCards />')
    expect(homeToMdx(undefined, { ...site, layout: 'simple' }).mdx).toContain('\n\n  [Quickstart](/quickstart) [GitHub](https://github.com/acme) [Changelog](/changelog)\n</Hero>')
    expect(homeToMdx(undefined, { ...site, layout: 'index' }).mdx).toContain('<Columns cols={2}>\n<Column>\n\n<LatestUpdates />\n\n</Column>\n<Column>\n\n<QuickStart />')
    expect(homeToMdx(undefined, { ...site, layout: 'island' }).warnings[0]).toContain('Agent tile')
    expect(homeToMdx(undefined, { ...site, layout: 'index' }).mdx).toStartWith('<Hero title="Acme docs" description="Build with Acme." eyebrow="Documentation">\n  <SearchBar mode="both" />')
  })

  it('should leave out auto blocks the site has nothing for, and search only without the assistant', () => {
    const { mdx } = homeToMdx(undefined, { ...site, layout: 'tabs', assistant: false, has: { changelog: false, api: false, cli: false } })
    expect(mdx).toContain('  <SearchBar suggestions="popular" />')
    expect(mdx).not.toContain('LatestUpdates')
    expect(mdx).not.toContain('CommandList')
  })

  it('should turn home frontmatter blocks into components with their authored items', () => {
    const home = {
      hero: { title: 'Welcome', description: 'Hi "there"', install: 'npm i acme\nacme init' },
      blocks: [
        { type: 'cards', items: [{ title: 'Billing', href: '/billing', links: [{ label: 'Plans', href: '/billing/plans' }] }] },
        { type: 'ask', placeholder: 'Ask us', suggestions: ['Keys', 'Deploy'], question: 'Q', answer: 'A' },
        { type: 'changelog', title: 'News', items: [{ title: 'x' }] },
        { type: 'quickstart', steps: [{ title: 'Install', description: 'Get it.', href: '/install' }] },
      ],
    }
    const { mdx, warnings } = homeToMdx(home, site)
    expect(mdx).toContain('<Hero title="Welcome" description="Hi &quot;there&quot;" install="npm i acme\\nacme init">\n  <SearchBar mode="both" placeholder="Ask us" suggestions={["Keys", "Deploy"]} />\n</Hero>')
    expect(mdx).toContain('<QuickStart>\n  <Step title="Install" href="/install">\n    Get it.\n  </Step>\n</QuickStart>')
    expect(mdx).toContain('<SectionCards>\n  <Card title="Billing" href="/billing">\n\n  - [Plans](/billing/plans)\n\n  </Card>\n</SectionCards>')
    expect(mdx).toContain('<LatestUpdates title="News" />')
    expect(mdx.indexOf('QuickStart')).toBeLessThan(mdx.indexOf('SectionCards'))
    expect(warnings).toEqual([
      'home ask: the example answer card has no component and is left out.',
      'home changelog items: written entries are not kept; <LatestUpdates> reads the changelog page\'s <Update> entries.',
    ])
  })

  it('should leave out blocks the frontmatter did not list, and keep search when ask is not listed', () => {
    const { mdx } = homeToMdx({ blocks: [{ type: 'support', title: 'Help', text: 'Mail us.<br>Soon.', cta: { label: 'Mail', href: 'mailto:a@b.c' } }] }, { ...site, layout: 'pill' })
    expect(mdx).toContain('<SupportCard title="Help" cta="Mail" href="mailto:a@b.c">\n  Mail us. Soon.\n</SupportCard>')
    expect(mdx).not.toContain('SectionCards')
    expect(mdx).toContain('<SearchBar suggestions="popular" />')
  })

  it('should write commands as a table', () => {
    const { mdx } = homeToMdx({ blocks: [{ type: 'commands', items: [{ cmd: 'acme dev', description: 'Preview | live', href: '/cli/dev' }] }] }, { ...site, layout: 'tabs' })
    expect(mdx).toContain('| [`acme dev`](/cli/dev) | Preview \\| live |')
  })
})

describe('convertIndexSource', () => {
  it('should drop home, add layout: wide and put the components before the body', () => {
    const src = '---\ntitle: Acme docs\nhome:\n  hero:\n    title: Welcome\n  blocks:\n    - type: cards\ndescription: Hi\n---\n\n## More\n\nBody.\n'
    const r = convertIndexSource(src, { hero: { title: 'Welcome' }, blocks: [{ type: 'cards' }] }, site)
    expect(r.source).toBe('---\ntitle: Acme docs\ndescription: Hi\nlayout: wide\n---\n\n<Hero title="Welcome" description="Build with Acme.">\n  <SearchBar suggestions="popular" />\n</Hero>\n\n<SectionCards />\n\n## More\n\nBody.\n')
  })

  it('should replace a layout the generated home ignored, and handle a page without frontmatter', () => {
    expect(convertIndexSource('---\nlayout: full-width\ntitle: A\n---\nHi', undefined, site).source).toStartWith('---\ntitle: A\nlayout: wide\n---\n\n<Hero')
    expect(convertIndexSource('Hi', undefined, site).source).toStartWith('---\nlayout: wide\n---\n\n<Hero')
  })
})
