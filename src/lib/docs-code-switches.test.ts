import { describe, it, expect } from 'bun:test'
import { docsCodeWarnings, fetchDocsCodeSwitches, runsOnlyWhenOn, skippedWhenOff, type DocsCodeFiles } from './docs-code-switches'

const files = (over: Partial<DocsCodeFiles> = {}): DocsCodeFiles => ({ css: [], js: [], head: null, pageCss: [], ...over })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('messages', () => {
  it('should word the generic and skipped warnings', () => {
    expect(runsOnlyWhenOn('app.js', 'scripts')).toBe('_syntext/app.js runs only when "Scripts from your docs" is on in Integrations › Custom code (off by default), and never on previews')
    expect(runsOnlyWhenOn('head.html', 'head')).toBe('_syntext/head.html runs only when "Head tags from your docs" is on in Integrations › Custom code (off by default), and never on previews')
    expect(skippedWhenOff('_syntext/app.js', 'scripts')).toBe('_syntext/app.js is skipped: "Scripts from your docs" is off in Integrations › Custom code')
  })

  it('should never say "repository"', () => {
    expect(runsOnlyWhenOn('a.js', 'scripts') + skippedWhenOff('x', 'css')).not.toContain('repository')
  })
})

describe('docsCodeWarnings', () => {
  const all = files({ css: ['docs/_syntext/theme.css'], js: ['docs/_syntext/a.js', 'docs/_syntext/b.js'], head: 'docs/_syntext/head.html', pageCss: [{ file: 'docs/p.mdx', value: './p.css' }] })

  it('should warn once per head.html and script without switches', () => {
    expect(docsCodeWarnings(all, null)).toEqual([
      { file: 'docs/_syntext/head.html', message: runsOnlyWhenOn('head.html', 'head') },
      { file: 'docs/_syntext/a.js', message: runsOnlyWhenOn('a.js', 'scripts') },
      { file: 'docs/_syntext/b.js', message: runsOnlyWhenOn('b.js', 'scripts') },
    ])
  })

  it('should say nothing for CSS only without switches', () => {
    expect(docsCodeWarnings(files({ css: ['_syntext/a.css'] }), null)).toEqual([])
  })

  it('should report files under a switch that is off as skipped', () => {
    expect(docsCodeWarnings(all, { css: false, head: false, scripts: true })).toEqual([
      { file: 'docs/_syntext/theme.css', message: '_syntext/theme.css is skipped: "CSS from your docs" is off in Integrations › Custom code' },
      { file: 'docs/p.mdx', message: 'css "./p.css" is skipped: "CSS from your docs" is off in Integrations › Custom code' },
      { file: 'docs/_syntext/head.html', message: '_syntext/head.html is skipped: "Head tags from your docs" is off in Integrations › Custom code' },
    ])
  })

  it('should say nothing when every switch is on', () => {
    expect(docsCodeWarnings(all, { css: true, head: true, scripts: true })).toEqual([])
  })
})

describe('fetchDocsCodeSwitches', () => {
  it('should read data.docsCode with the token and the stx User-Agent', async () => {
    let seen: { url: string; init?: RequestInit } | null = null
    const fetchImpl = async (url: string, init?: RequestInit) => {
      seen = { url, init }
      return json(200, { data: { enabled: true, docsCode: { css: true, head: false, scripts: true, updatedAt: null, updatedBy: null } } })
    }
    expect(await fetchDocsCodeSwitches('https://api.test', 'p1', 'tok', { fetchImpl })).toEqual({ css: true, head: false, scripts: true })
    expect(seen!.url).toBe('https://api.test/v1/projects/p1/custom-scripts')
    expect(new Headers(seen!.init?.headers).get('Authorization')).toBe('Bearer tok')
    expect(new Headers(seen!.init?.headers).get('User-Agent')).toStartWith('stx/')
  })

  it('should return null on an error status, a bad shape or a network error', async () => {
    expect(await fetchDocsCodeSwitches('https://api.test', 'p1', 'tok', { fetchImpl: async () => json(404, { error: { code: 'not_found', message: 'x' } }) })).toBeNull()
    expect(await fetchDocsCodeSwitches('https://api.test', 'p1', 'tok', { fetchImpl: async () => json(200, { data: { docsCode: { css: 'yes' } } }) })).toBeNull()
    expect(await fetchDocsCodeSwitches('https://api.test', 'p1', 'tok', { fetchImpl: async () => { throw new Error('offline') } })).toBeNull()
  })

  it('should return null for a revoked session without throwing', async () => {
    const fetchImpl = async () => json(401, { error: { code: 'session_revoked', message: 'signed out' } })
    expect(await fetchDocsCodeSwitches('https://api.test', 'p1', 'tok', { fetchImpl })).toBeNull()
  })
})
