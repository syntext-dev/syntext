import { describe, it, expect, afterEach } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runExplain } from './check-explain'

// eslint-disable-next-line no-control-regex
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

let dir = ''
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = ''
})

async function withConfig(content: string, name = 'syntext.json'): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'stx-explain-'))
  await writeFile(join(dir, name), content)
  return dir
}

function harness(over: { token?: string | null; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response> } = {}) {
  const lines: string[] = []
  const urls: string[] = []
  return {
    lines,
    urls,
    deps: {
      print: (s: string) => lines.push(plain(s)),
      loadCredentials: async () => (over.token === null ? null : { token: over.token ?? 'tok', apiUrl: 'https://api.test' }),
      fetchImpl: over.fetchImpl ?? (async (url: string) => { urls.push(url); return new Response('{}', { status: 404 }) }),
    },
  }
}

describe('runExplain', () => {
  it('should print each value with its source', async () => {
    const root = await withConfig('{ "theme": "paper", "appearance": { "mode": "dark" } }')
    const h = harness()
    expect(await runExplain(true, { dir: root }, h.deps)).toBe(0)
    const out = h.lines.join('\n')
    expect(out).toContain('Appearance (syntext.json)')
    expect(out).toMatch(/mode\s+dark\s+appearance/)
    expect(h.urls).toEqual([])
  })

  it('should accept the appearance topic and read YAML', async () => {
    const root = await withConfig('theme: atlas\n', 'syntext.yml')
    const h = harness()
    expect(await runExplain('appearance', { dir: root }, h.deps)).toBe(0)
    expect(h.lines.join('\n')).toContain('atlas preset')
  })

  it('should reject an unknown topic', async () => {
    const root = await withConfig('{}')
    const h = harness()
    expect(await runExplain('apperance', { dir: root }, h.deps)).toBe(1)
    expect(h.lines.join('\n')).toContain('Unknown --explain topic "apperance". Did you mean "appearance"?')
  })

  it('should print one JSON document with --json', async () => {
    const root = await withConfig('{ "theme": "grid" }')
    const h = harness()
    await runExplain(true, { dir: root, json: true }, h.deps)
    const body = JSON.parse(h.lines[0])
    expect(body).toMatchObject({ success: true, configFile: 'syntext.json', v2: true, preset: 'grid' })
    expect(body.values.length).toBeGreaterThan(10)
    expect(body.contrast).toHaveLength(4)
  })

  it('should fetch an organization theme when logged in', async () => {
    const root = await withConfig('{ "theme": "@acme/brand" }')
    const h = harness({
      fetchImpl: async (url) => {
        if (url.endsWith('/v1/orgs')) return new Response(JSON.stringify({ data: [{ id: 'o1', slug: 'acme' }] }))
        return new Response(JSON.stringify({ data: { version: 2, preset: 'console', appearance: {}, themeOverrides: {} } }))
      },
    })
    await runExplain(true, { dir: root, json: true }, h.deps)
    const body = JSON.parse(h.lines[0])
    expect(body.orgTheme).toEqual({ ref: '@acme/brand', resolved: true, version: 2, pinned: false })
    expect(body.preset).toBe('console')
  })

  it('should say an organization theme could not be resolved offline when logged out', async () => {
    const root = await withConfig('{ "theme": "@acme/brand" }')
    const h = harness({ token: null })
    await runExplain(true, { dir: root }, h.deps)
    expect(h.lines.join('\n')).toContain('Organization theme @acme/brand could not be resolved offline. Run `stx login` to fetch it.')
    expect(h.urls).toEqual([])
  })

  it('should fail clearly without a config', async () => {
    dir = await mkdtemp(join(tmpdir(), 'stx-explain-'))
    const h = harness()
    expect(await runExplain(true, { dir, json: true }, h.deps)).toBe(1)
    expect(JSON.parse(h.lines[0]).error).toContain('No syntext.json, syntext.yaml or syntext.yml')
  })

  it('should fail clearly on a config that does not parse', async () => {
    const root = await withConfig('{ nope')
    const h = harness()
    expect(await runExplain(true, { dir: root }, h.deps)).toBe(1)
    expect(h.lines.join('\n')).toContain('syntext.json is not valid JSON')
  })
})
