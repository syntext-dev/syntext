import { describe, it, expect, afterEach } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deprecationTable } from '../syntax/table'
import { migrateSyntax } from './run'

const items = deprecationTable().items
let dir = ''

async function site(files: Record<string, string>): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'stx-migrate-'))
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(dir, name, '..'), { recursive: true })
    await writeFile(join(dir, name), content)
  }
  return dir
}

const read = (name: string) => readFile(join(dir, name), 'utf-8')

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = ''
})

describe('migrateSyntax', () => {
  const files = {
    'syntext.json': '{\n  "name": "A",\n  "theme": "default",\n  "colors": {\n    "primary": "#6366F1",\n    "accent": "#2AC3DE"\n  },\n  "nmae": "typo"\n}\n',
    'docs/updates.mdx': '---\ntitle: Updates\n---\n<Update label="June">\nx\n</Update>\n\n```mdx\n<Update label="example">\n```\n',
    'docs/guide.mdx': '---\ntitle: Guide\nnoIndex: true\n---\n<Caution>c</Caution>\n',
    'docs/clean.mdx': '---\ntitle: Clean\n---\n',
  }

  it('should show the diff and write nothing on a dry run', async () => {
    const root = await site(files)
    const r = await migrateSyntax({ rootDir: root, dryRun: true, applyV2: false, items })
    expect(r.files.map((f) => f.file).sort()).toEqual(['docs/guide.mdx', 'docs/updates.mdx', 'syntext.json'])
    expect(r.files.find((f) => f.file === 'docs/updates.mdx')?.diff).toContain('-<Update label="June">\n+<Update title="June">')
    expect(await read('docs/updates.mdx')).toBe(files['docs/updates.mdx'])
    expect(r.applied.map((c) => c.code).sort()).toEqual(['config.colors-accent', 'frontmatter.noIndex', 'mdx.caution', 'mdx.update-label'])
    expect(r.held.map((h) => h.code)).toEqual(['config.colors-primary'])
    expect(r.remaining.map((i) => i.code)).toEqual(['config.unknown-key'])
  })

  it('should write the changes and be idempotent', async () => {
    const root = await site(files)
    await migrateSyntax({ rootDir: root, dryRun: false, applyV2: false, items })
    expect(await read('docs/guide.mdx')).toBe('---\ntitle: Guide\nnoindex: true\n---\n<Warning>c</Warning>\n')
    expect(JSON.parse(await read('syntext.json'))).toEqual({ name: 'A', theme: 'default', colors: { primary: '#6366F1' }, nmae: 'typo', themeOverrides: { colors: { light: { 'accent-strong': '#2AC3DE' }, dark: { 'accent-strong': '#2AC3DE' } } } })
    const again = await migrateSyntax({ rootDir: root, dryRun: false, applyV2: false, items })
    expect(again.applied).toEqual([])
    expect(again.files).toEqual([])
  })

  it('should apply v2-only moves with applyV2', async () => {
    const root = await site(files)
    const r = await migrateSyntax({ rootDir: root, dryRun: false, applyV2: true, items })
    expect(r.held).toEqual([])
    expect(JSON.parse(await read('syntext.json')).appearance).toEqual({ accent: '#6366F1' })
  })

  it('should rename syntext.config.json to syntext.json', async () => {
    const root = await site({ 'syntext.config.json': '{ "language": "en" }\n' })
    const r = await migrateSyntax({ rootDir: root, dryRun: false, applyV2: false, items })
    expect(existsSync(join(root, 'syntext.config.json'))).toBe(false)
    expect(await read('syntext.json')).toBe('{ "locale": "en" }\n')
    expect(r.files[0]).toMatchObject({ file: 'syntext.config.json', renamedTo: 'syntext.json' })
    expect(r.applied.map((c) => c.code)).toEqual(['config.language', 'config.file-name'])
  })

  it('should keep syntext.config.json when syntext.json also exists', async () => {
    const root = await site({ 'syntext.config.json': '{}\n', 'syntext.json': '{}\n' })
    const r = await migrateSyntax({ rootDir: root, dryRun: false, applyV2: false, items })
    expect(r.configFile).toBe('syntext.json')
    expect(existsSync(join(root, 'syntext.config.json'))).toBe(true)
  })

  it('should rewrite YAML configs', async () => {
    const root = await site({ 'syntext.yml': '# my site\nlanguage: en # main\n' })
    await migrateSyntax({ rootDir: root, dryRun: false, applyV2: false, items })
    expect(await read('syntext.yml')).toBe('# my site\nlocale: en # main\n')
  })

  it('should find docs nested under .syntext', async () => {
    const root = await site({ '.syntext/syntext.json': '{}\n', '.syntext/docs/a.mdx': '<Caution>x</Caution>\n' })
    const r = await migrateSyntax({ rootDir: root, dryRun: false, applyV2: false, items })
    expect(r.files.map((f) => f.file)).toEqual(['.syntext/docs/a.mdx'])
  })

  it('should stop with a clear error when the config does not parse', async () => {
    const root = await site({ 'syntext.json': '{ nope' })
    await expect(migrateSyntax({ rootDir: root, dryRun: false, applyV2: false, items })).rejects.toThrow('syntext.json is not valid JSON')
  })

  it('should work on a site with no config', async () => {
    const root = await site({ 'docs/a.mdx': '<Callout type="tip">x</Callout>\n' })
    const r = await migrateSyntax({ rootDir: root, dryRun: false, applyV2: false, items })
    expect(r.configFile).toBeNull()
    expect(await read('docs/a.mdx')).toBe('<Tip>x</Tip>\n')
  })

  describe('generated home (home-to-mdx)', () => {
    const v2 = { 'syntext.json': '{\n  "name": "Acme",\n  "theme": "paper"\n}\n', 'docs/guides/a.mdx': '---\ntitle: A\n---\n' }

    it('should write the implicit home as components from the local files, and be idempotent', async () => {
      const root = await site({ ...v2, 'docs/index.mdx': '---\ntitle: Welcome\n---\n\nHello.\n' })
      const r = await migrateSyntax({ rootDir: root, dryRun: false, applyV2: false, items })
      const text = await read('docs/index.mdx')
      expect(text).toStartWith('---\ntitle: Welcome\nlayout: wide\n---\n\n<Hero title="How can we help?"')
      expect(text).toEndWith('\nHello.\n')
      expect(r.applied).toEqual([expect.objectContaining({ code: 'frontmatter.implicit-home', file: 'docs/index.mdx' })])
      expect(r.home).toEqual({ file: 'docs/index.mdx', from: 'local', reason: expect.stringContaining('not logged in') })
      expect(r.remaining).toEqual([])
      const again = await migrateSyntax({ rootDir: root, dryRun: false, applyV2: false, items })
      expect(again.applied).toEqual([])
      expect(again.files).toEqual([])
    })

    it('should use the site data the provider gives (the last build) and show it in a dry run', async () => {
      const root = await site({ ...v2, 'docs/index.mdx': '---\ntitle: Welcome\nhome:\n  hero:\n    title: Acme\n---\n' })
      const homeSite = async () => ({ from: 'last-build' as const, mdx: '<Hero title="Acme" />\n', warnings: [] })
      const r = await migrateSyntax({ rootDir: root, dryRun: true, applyV2: false, items, homeSite })
      expect(r.home).toEqual({ file: 'docs/index.mdx', from: 'last-build' })
      expect(r.files[0]?.diff).toContain('+<Hero title="Acme" />')
      expect(r.files[0]?.diff).toContain('-home:')
      expect(await read('docs/index.mdx')).toContain('home:')
    })

    it('should leave a v1 site\'s index page alone', async () => {
      const root = await site({ 'syntext.json': '{ "name": "A", "theme": "default" }\n', 'docs/index.mdx': '---\ntitle: Welcome\n---\n' })
      const r = await migrateSyntax({ rootDir: root, dryRun: false, applyV2: false, items })
      expect(r.applied).toEqual([])
      expect(r.home).toBeUndefined()
    })
  })

  it('should report page rules it does not know instead of skipping them', async () => {
    const root = await site({ 'docs/a.mdx': '---\ntitle: A\n---\n' })
    const future = { ...items[0]!, code: 'frontmatter.future', kind: 'frontmatter' as const, rewrite: { type: 'split-page' } as unknown as (typeof items)[number]['rewrite'] }
    const r = await migrateSyntax({ rootDir: root, dryRun: false, applyV2: false, items: [...items, future] })
    expect(r.unsupported).toEqual(['frontmatter.future'])
  })
})
