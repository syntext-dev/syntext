import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import * as credentials from '../lib/credentials'
import { createRemoteProject, generateConfig, parsePreset, starterFiles, SYNTEXT_SCHEMA_URL } from './init'
import { findBrokenLinks } from './check'
import { starterIndexMdx } from '../lib/starter-index'
import { checkSyntax } from '../syntax/check-syntax'
import { SessionRevokedError, userAgent } from '../lib/api'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('init', () => {
  const realFetch = globalThis.fetch
  let seen: RequestInit | undefined
  let spies: Array<{ mockRestore: () => void }>

  function respond(res: Response | Error) {
    globalThis.fetch = Object.assign(
      async (_input: string | URL | Request, init?: RequestInit) => {
        seen = init
        if (res instanceof Error) throw res
        return res
      },
      { preconnect: realFetch.preconnect },
    ) as typeof fetch
  }

  beforeEach(() => {
    seen = undefined
    spies = [
      spyOn(credentials, 'loadCredentials').mockResolvedValue({ token: 'tok' }),
      spyOn(credentials, 'clearCredentials').mockResolvedValue(undefined),
    ]
  })

  afterEach(() => {
    for (const s of spies) s.mockRestore()
    globalThis.fetch = realFetch
  })

  describe('createRemoteProject', () => {
    it('should return the new project id and send the stx User-Agent', async () => {
      respond(json(201, { data: { id: 'proj_1' } }))
      expect(await createRemoteProject('docs', 'tok')).toBe('proj_1')
      expect(new Headers(seen?.headers).get('User-Agent')).toBe(userAgent())
      expect(new Headers(seen?.headers).get('Authorization')).toBe('Bearer tok')
    })

    it('should return null on a plan limit or other API error', async () => {
      respond(json(402, { error: { code: 'plan_required', message: 'limit' } }))
      expect(await createRemoteProject('docs', 'tok')).toBeNull()
    })

    it('should return null on a network error', async () => {
      respond(new Error('ECONNREFUSED'))
      expect(await createRemoteProject('docs', 'tok')).toBeNull()
    })

    it('should rethrow a revoked session instead of hiding it', async () => {
      respond(json(401, { error: { code: 'session_revoked', message: 'signed out' } }))
      await expect(createRemoteProject('docs', 'tok')).rejects.toBeInstanceOf(SessionRevokedError)
      expect(credentials.clearCredentials).toHaveBeenCalledTimes(1)
    })
  })
})

describe('generateConfig', () => {
  it('should put the $schema URL first', () => {
    const text = generateConfig('acme')
    expect(SYNTEXT_SCHEMA_URL).toBe('https://syntext.dev/schema/syntext.json')
    expect(Object.keys(JSON.parse(text))[0]).toBe('$schema')
    expect(JSON.parse(text).$schema).toBe(SYNTEXT_SCHEMA_URL)
  })

  it('should pass stx check with no deprecated or unknown keys', () => {
    const content = generateConfig('acme')
    expect(checkSyntax({ config: { fileName: 'syntext.json', content, config: JSON.parse(content) }, pages: [] }).issues).toEqual([])
  })

  it('should end with a newline and use the project name', () => {
    const text = generateConfig('acme')
    expect(text.endsWith('}\n')).toBe(true)
    expect(JSON.parse(text).name).toBe('acme')
  })

  describe('starterFiles', () => {
    const pages = (files: Record<string, string>) => Object.keys(files).filter((f) => f.startsWith('docs/')).map((f) => f.slice('docs/'.length))
    const check = (files: Record<string, string>) => checkSyntax({
      config: { fileName: 'syntext.json', content: files['syntext.json']!, config: JSON.parse(files['syntext.json']!) },
      pages: pages(files).map((f) => ({ file: `docs/${f}`, docsFile: f, source: files[`docs/${f}`]! })),
    })

    it('should keep a plain Markdown home on a v1 site', () => {
      const files = starterFiles('acme')
      expect(Object.keys(files).sort()).toEqual(['docs/guides/getting-started.mdx', 'docs/index.mdx', 'syntext.json'])
      expect(JSON.parse(files['syntext.json']!).theme).toBe('default')
      expect(files['docs/index.mdx']).toContain('# Welcome to acme')
      expect(files['docs/index.mdx']).not.toContain('<Hero')
      expect(check(files).issues).toEqual([])
    })

    it('should write the backend\'s starter index.mdx on a v2 site, with the pages its hero links to', () => {
      const files = starterFiles('acme', { preset: 'paper' })
      const config = JSON.parse(files['syntext.json']!)
      expect(config.theme).toBe('paper')
      expect(config.navigation).toEqual([
        { group: 'Getting Started', pages: ['index', 'quickstart'] },
        { group: 'API reference', pages: ['api-reference/index'] },
      ])
      expect(files['docs/index.mdx']).toBe(starterIndexMdx({ title: 'acme' }))
      expect(files['docs/index.mdx']).toContain('layout: wide')
      expect(files['docs/quickstart.mdx']).toContain('title: Quickstart')
      // A new v2 site passes stx check: no generated-home warning, no broken links.
      expect(check(files).issues).toEqual([])
      for (const f of pages(files)) expect(findBrokenLinks(files[`docs/${f}`]!, pages(files))).toEqual([])
    })
  })

  describe('parsePreset', () => {
    it('should accept a v2 preset name in any case and nothing without the flag', () => {
      expect(parsePreset(undefined)).toBeUndefined()
      expect(parsePreset('Paper')).toBe('paper')
    })

    it('should name the presets for an unknown one', () => {
      expect(() => parsePreset('papper')).toThrow('"papper" is not a doc engine v2 preset. Use one of: workbench, paper, console, atlas, plain, orbit, grid, margin.')
    })
  })
})
