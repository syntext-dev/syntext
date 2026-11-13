import { describe, expect, it } from 'bun:test'
import { SessionRevokedError } from '../lib/api'
import { deprecationTable } from '../syntax/table'
import type { HomeMigrationSite } from './home-to-mdx'
import { convertWithSiteData, homeCodeFor, homeSiteProvider, localHomeSite, readFrontmatter, rewriteHome, type HomeSiteContext, type HomeSiteData } from './home-rewrite'

const items = deprecationTable().items
const site: HomeMigrationSite = { layout: 'command', siteName: 'Acme', assistant: true, has: { changelog: true, api: false, cli: false } }
const ctx = (over: Partial<HomeSiteContext> = {}): HomeSiteContext => ({
  config: { name: 'Acme', theme: 'paper' },
  docsFiles: ['index.mdx', 'guides/a.mdx'],
  index: { docsFile: 'index.mdx', source: '', frontmatter: {} },
  ...over,
})

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('homeCodeFor', () => {
  it('should name the implicit home and the home frontmatter on the root index only', () => {
    expect(homeCodeFor('index.mdx', '---\ntitle: A\n---\nHi')).toBe('frontmatter.implicit-home')
    expect(homeCodeFor('index.md', '---\nhome:\n  hero:\n    title: A\n---\n')).toBe('frontmatter.home')
    expect(homeCodeFor('guides/index.mdx', 'Hi')).toBeNull()
  })

  it('should return null once the page opts in', () => {
    expect(homeCodeFor('index.mdx', '---\nhome: false\n---\n')).toBeNull()
    expect(homeCodeFor('index.mdx', '<SectionCards />')).toBeNull()
  })
})

describe('readFrontmatter', () => {
  it('should return {} without frontmatter or when it does not parse', () => {
    expect(readFrontmatter('Hi')).toEqual({})
    expect(readFrontmatter('---\na: [1,\n---\n')).toEqual({})
    expect(readFrontmatter('---\na: 1\n---\n')).toEqual({ a: 1 })
  })
})

describe('localHomeSite', () => {
  it('should take the home layout from the preset and the rest from syntext.json and the pages', () => {
    const s = localHomeSite(ctx({
      config: { name: 'Acme', description: 'Build.', theme: 'paper', github: 'https://github.com/acme', features: { aiAssistant: false } },
      docsFiles: ['index.mdx', 'changelog.mdx', 'cli/run.mdx', 'api-reference/users.mdx'],
      index: { docsFile: 'index.mdx', source: '', frontmatter: { title: 'Acme docs' } },
    }))
    expect(s).toEqual({
      layout: 'pill', siteName: 'Acme', title: 'Acme docs', description: 'Build.', assistant: false,
      has: { changelog: true, api: true, cli: true }, githubUrl: 'https://github.com/acme', changelogHref: '/changelog',
    })
  })

  it('should follow appearance.layout.home and default what is missing', () => {
    const s = localHomeSite(ctx({ config: { theme: 'paper', appearance: { layout: { home: 'mega' } }, openapi: 'openapi.yaml' } }))
    expect(s).toMatchObject({ layout: 'mega', siteName: 'Docs', assistant: true, has: { changelog: false, api: true, cli: false } })
    expect(localHomeSite(ctx({ config: null })).layout).toBe('command')
  })
})

describe('homeSiteProvider', () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchWith = (res: Response | Error) => async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (res instanceof Error) throw res
    return res
  }

  it('should ask the API for a preview conversion when logged in and connected', async () => {
    calls.length = 0
    const data = { mode: 'preview', mdx: '<Hero title="A" />\n', warnings: ['w'], source: 'x' }
    const r = await homeSiteProvider({ apiUrl: 'https://api.test/', token: 'tok', projectId: 'p1', fetchImpl: fetchWith(json(200, { data })) })(ctx())
    expect(r).toEqual({ from: 'last-build', mdx: '<Hero title="A" />\n', warnings: ['w'] })
    expect(calls[0]?.url).toBe('https://api.test/v1/projects/p1/appearance/home/convert')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ target: 'preview' })
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBe('Bearer tok')
  })

  it('should read the projectId from syntext.json', async () => {
    calls.length = 0
    await homeSiteProvider({ apiUrl: 'https://api.test', token: 'tok', fetchImpl: fetchWith(json(200, { data: { mdx: 'x' } })) })(ctx({ config: { projectId: 'p9' } }))
    expect(calls[0]?.url).toBe('https://api.test/v1/projects/p9/appearance/home/convert')
  })

  it('should use the site the API sends, when it sends one', async () => {
    const r = await homeSiteProvider({ apiUrl: 'https://api.test', token: 'tok', projectId: 'p1', fetchImpl: fetchWith(json(200, { data: { mdx: 'x', warnings: [], site } })) })(ctx())
    expect(r).toMatchObject({ from: 'last-build', site })
  })

  it('should fall back to the local files with the reason', async () => {
    const offline = homeSiteProvider({ apiUrl: 'https://api.test', token: null, projectId: 'p1' })
    expect(await offline(ctx())).toMatchObject({ from: 'local', reason: expect.stringContaining('not logged in') })
    const unlinked = homeSiteProvider({ apiUrl: 'https://api.test', token: 'tok' })
    expect(await unlinked(ctx())).toMatchObject({ from: 'local', reason: expect.stringContaining('no projectId') })
    const noBuild = homeSiteProvider({ apiUrl: 'https://api.test', token: 'tok', projectId: 'p1', fetchImpl: fetchWith(json(404, { error: { code: 'not_found', message: 'No build yet.' } })) })
    expect(await noBuild(ctx())).toMatchObject({ from: 'local', reason: 'the API answered 404: No build yet.' })
    const down = homeSiteProvider({ apiUrl: 'https://api.test', token: 'tok', projectId: 'p1', fetchImpl: fetchWith(new Error('ECONNREFUSED')) })
    expect(await down(ctx())).toMatchObject({ from: 'local', reason: expect.stringContaining('ECONNREFUSED') })
    const odd = homeSiteProvider({ apiUrl: 'https://api.test', token: 'tok', projectId: 'p1', fetchImpl: fetchWith(json(200, { data: {} })) })
    expect(await odd(ctx())).toMatchObject({ from: 'local', reason: 'the API did not return the home components' })
  })

  it('should not call the API when offline', async () => {
    calls.length = 0
    const r = await homeSiteProvider({ apiUrl: 'https://api.test', token: 'tok', projectId: 'p1', offline: '--offline', fetchImpl: fetchWith(json(200, {})) })(ctx())
    expect(r).toMatchObject({ from: 'local', reason: '--offline' })
    expect(calls).toEqual([])
  })

  it('should rethrow a revoked session', async () => {
    const p = homeSiteProvider({ apiUrl: 'https://api.test', token: 'tok', projectId: 'p1', fetchImpl: fetchWith(new SessionRevokedError(false)) })
    await expect(p(ctx())).rejects.toBeInstanceOf(SessionRevokedError)
  })
})

describe('convertWithSiteData', () => {
  const source = '---\ntitle: Home\nlayout: centered\nhome:\n  hero:\n    title: Old\n---\n\nWelcome.\n'

  it('should convert with the site when there is one', () => {
    const r = convertWithSiteData(source, { from: 'local', site, reason: 'offline' })
    expect(r.source).toStartWith('---\ntitle: Home\nlayout: wide\n---\n\n<Hero title="Old"')
    expect(r.source).toEndWith('\nWelcome.\n')
  })

  it('should put the API\'s components between this file\'s frontmatter and body', () => {
    const data: HomeSiteData = { from: 'last-build', mdx: '<Hero title="From build" />\n\n<SectionCards />\n', warnings: ['note'] }
    const r = convertWithSiteData(source, data)
    expect(r.source).toBe('---\ntitle: Home\nlayout: wide\n---\n\n<Hero title="From build" />\n\n<SectionCards />\n\nWelcome.\n')
    expect(r.warnings).toEqual(['note'])
  })

  it('should handle a page with no frontmatter and no body', () => {
    const r = convertWithSiteData('', { from: 'last-build', mdx: '<SectionCards />\n', warnings: [] })
    expect(r.source).toBe('---\nlayout: wide\n---\n\n<SectionCards />\n')
  })
})

describe('rewriteHome', () => {
  const provider = async (): Promise<HomeSiteData> => ({ from: 'local', site, reason: 'not logged in' })
  const base = { file: 'docs/index.mdx', docsFile: 'index.mdx', items, siteIsV2: true, ctx: { config: {}, docsFiles: ['index.mdx'] }, provider }

  it('should convert the implicit home and say where the site data came from', async () => {
    const r = await rewriteHome({ ...base, source: '---\ntitle: Home\n---\nHi\n' })
    expect(r.text).toContain('<Hero title="Acme"')
    expect(r.text).toContain('layout: wide')
    expect(r.from).toBe('local')
    expect(r.applied).toEqual([expect.objectContaining({ code: 'frontmatter.implicit-home', file: 'docs/index.mdx', line: 1 })])
    expect(r.reason).toBe('not logged in')
    expect(r.applied[0]?.replacement).toContain('<Hero>')
    // Running it again changes nothing: the page now uses the home components.
    expect((await rewriteHome({ ...base, source: r.text })).applied).toEqual([])
  })

  it('should convert home frontmatter', async () => {
    const r = await rewriteHome({ ...base, source: '---\nhome:\n  hero:\n    title: Acme\n---\n' })
    expect(r.applied[0]?.code).toBe('frontmatter.home')
    expect(r.text).not.toContain('home:')
  })

  it('should do nothing on a v1 site, on other pages, or when the table has no rule', async () => {
    const src = '---\ntitle: Home\n---\nHi\n'
    expect((await rewriteHome({ ...base, siteIsV2: false, source: src })).text).toBe(src)
    expect((await rewriteHome({ ...base, docsFile: 'guides/index.mdx', source: src })).applied).toEqual([])
    expect((await rewriteHome({ ...base, items: items.filter((i) => i.rewrite.type !== 'home-to-mdx'), source: src })).applied).toEqual([])
  })
})
