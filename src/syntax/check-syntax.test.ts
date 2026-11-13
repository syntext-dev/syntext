import { describe, it, expect, afterEach } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdir } from 'node:fs/promises'
import { checkProjectSyntax, checkSyntax, readSiteConfig } from './check-syntax'

const config = (content: string, fileName = 'syntext.json') => ({ fileName, content, config: JSON.parse(content) as Record<string, unknown> })

describe('checkSyntax', () => {
  it('should report nothing for a clean site', () => {
    const r = checkSyntax({ config: config('{ "name": "A", "theme": "paper" }'), pages: [{ file: 'docs/a.mdx', source: '---\ntitle: A\n---\n<Note>x</Note>\n' }] })
    expect(r.issues).toEqual([])
    expect(r.usages).toEqual([])
  })

  it('should warn about deprecated config keys with the line and the backend wording', () => {
    const r = checkSyntax({ config: config('{\n  "colors": {\n    "accent": "#2AC3DE"\n  }\n}\n'), pages: [] })
    expect(r.issues).toEqual([{
      file: 'syntext.json',
      line: 3,
      type: 'warning',
      code: 'config.colors-accent',
      message: 'colors.accent: "#2AC3DE" is deprecated. Use themeOverrides.colors.light.accent-strong: "#2AC3DE" and themeOverrides.colors.dark.accent-strong: "#2AC3DE" instead.',
    }])
  })

  it('should tell a v1 site to keep v2-only forms until it switches', () => {
    const r = checkSyntax({ config: config('{ "theme": "default", "colors": { "primary": "#6366F1" } }'), pages: [] })
    expect(r.issues[0]?.message).toContain('Keep it until the site moves to doc engine v2')
  })

  it('should not add the v1 note on a v2 site', () => {
    const r = checkSyntax({ config: config('{ "theme": "paper", "colors": { "primary": "#6366F1" } }'), pages: [] })
    expect(r.issues[0]?.message).not.toContain('Keep it until')
  })

  it('should report unknown keys as warnings with did you mean', () => {
    const r = checkSyntax({ config: config('{\n  "nmae": "A"\n}'), pages: [] })
    expect(r.issues).toEqual([{ file: 'syntext.json', line: 2, type: 'warning', code: 'config.unknown-key', message: 'Unknown key "nmae" is ignored. Did you mean "name"?' }])
  })

  it('should report invalid values with the allowed ones', () => {
    const r = checkSyntax({ config: config('{ "features": { "endpointBarAction": "nope" } }'), pages: [] })
    expect(r.issues[0]?.message).toBe('"nope" is not a valid features.endpointBarAction value. Use one of: tryIt, copy, none. Did you mean "none"?')
  })

  it('should report appearance problems in the resolver wording, once', () => {
    const r = checkSyntax({ config: config('{\n  "appearance": {\n    "layout": { "nav": "tre" }\n  }\n}'), pages: [] })
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0]).toMatchObject({ line: 3, code: 'appearance', message: '"tre" is not a layout.nav value. Use one of: tree, pills, mono, chevrons, plain, dock, chapters, overlay. Did you mean "tree"?' })
  })

  it('should report an unknown theme with did you mean', () => {
    const r = checkSyntax({ config: config('{ "theme": "papr" }'), pages: [] })
    expect(r.issues[0]?.message).toBe('Unknown theme "papr"; using Workbench. Did you mean "paper"?')
  })

  it('should not claim an organization theme is missing when it cannot look', () => {
    const r = checkSyntax({ config: config('{ "theme": "@acme/brand" }'), pages: [] })
    expect(r.issues).toEqual([])
  })

  it('should report the deprecated file name', () => {
    const r = checkSyntax({ config: config('{}', 'syntext.config.json'), pages: [] })
    expect(r.issues[0]).toMatchObject({ code: 'config.file-name', message: 'syntext.config.json is deprecated. Use syntext.json instead.' })
  })

  it('should report deprecated MDX props and tags and frontmatter keys on pages', () => {
    const source = '---\ntitle: A\nnoIndex: true\ntitel: x\n---\n\n<Update label="June">\nx\n</Update>\n\n<Caution>y</Caution>\n\n```mdx\n<Update label="in a fence">\n```\n'
    const r = checkSyntax({ config: null, pages: [{ file: 'docs/a.mdx', source }] })
    expect(r.issues.map((i) => [i.line, i.code])).toEqual([
      [3, 'frontmatter.noIndex'],
      [4, 'frontmatter.unknown-key'],
      [7, 'mdx.update-label'],
      [11, 'mdx.caution'],
    ])
    expect(r.issues[2]?.message).toBe('<Update label="…"> is deprecated. Use <Update title="…"> instead.')
  })

  it('should report frontmatter values outside their enum', () => {
    const r = checkSyntax({ config: null, pages: [{ file: 'docs/a.mdx', source: '---\ntitle: A\nlayout: wide\n---\n' }] })
    expect(r.issues[0]).toMatchObject({ line: 3, type: 'warning' })
    expect(r.issues[0]?.message).toContain('"wide" is not a valid layout')
  })

  it('should turn a config that does not parse into an error', () => {
    const r = checkSyntax({ config: null, configError: { fileName: 'syntext.json', message: 'syntext.json is not valid JSON: x' }, pages: [] })
    expect(r.issues).toEqual([{ file: 'syntext.json', line: 1, type: 'error', message: 'syntext.json is not valid JSON: x' }])
  })
})

describe('readSiteConfig', () => {
  let dir = ''
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }) })

  it('should return null when there is no config', async () => {
    dir = await mkdtemp(join(tmpdir(), 'stx-cfg-'))
    expect(await readSiteConfig(dir)).toBeNull()
  })

  it('should prefer syntext.json over YAML', async () => {
    dir = await mkdtemp(join(tmpdir(), 'stx-cfg-'))
    await writeFile(join(dir, 'syntext.yml'), 'name: Y\n')
    await writeFile(join(dir, 'syntext.json'), '{ "name": "J" }')
    const r = await readSiteConfig(dir)
    expect(r && 'config' in r ? r.config.name : null).toBe('J')
  })

  it('should read YAML and the deprecated syntext.config.json', async () => {
    dir = await mkdtemp(join(tmpdir(), 'stx-cfg-'))
    await writeFile(join(dir, 'syntext.config.json'), '{ "name": "Old" }')
    expect((await readSiteConfig(dir))?.fileName).toBe('syntext.config.json')
    await writeFile(join(dir, 'syntext.yml'), '# c\nname: Y\n')
    const r = await readSiteConfig(dir)
    expect(r?.fileName).toBe('syntext.yml')
  })

  it('should return the parse error instead of throwing', async () => {
    dir = await mkdtemp(join(tmpdir(), 'stx-cfg-'))
    await writeFile(join(dir, 'syntext.json'), '{ nope')
    const r = await readSiteConfig(dir)
    expect(r && 'error' in r ? r.error : '').toContain('syntext.json is not valid JSON')
  })
})

describe('checkProjectSyntax', () => {
  let dir = ''
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }) })

  it('should check the config and every page, naming files from the project folder', async () => {
    dir = await mkdtemp(join(tmpdir(), 'stx-proj-'))
    await mkdir(join(dir, 'docs/guides'), { recursive: true })
    await writeFile(join(dir, 'syntext.json'), '{\n  "language": "en"\n}\n')
    await writeFile(join(dir, 'docs/guides/a.mdx'), '---\ntitle: A\n---\n<Caution>x</Caution>\n')
    const r = await checkProjectSyntax(dir)
    expect(r.configFile).toBe('syntext.json')
    expect(r.issues.map((i) => `${i.file}:${i.line} ${i.code}`)).toEqual(['syntext.json:2 config.language', 'docs/guides/a.mdx:4 mdx.caution'])
  })

  it('should use the nested .syntext folder like stx build does', async () => {
    dir = await mkdtemp(join(tmpdir(), 'stx-proj-'))
    await mkdir(join(dir, '.syntext/docs'), { recursive: true })
    await writeFile(join(dir, '.syntext/syntext.json'), '{ "nmae": "x" }')
    const r = await checkProjectSyntax(dir)
    expect(r.issues[0]).toMatchObject({ file: '.syntext/syntext.json', code: 'config.unknown-key' })
  })

  it('should report a config that does not parse as an error', async () => {
    dir = await mkdtemp(join(tmpdir(), 'stx-proj-'))
    await writeFile(join(dir, 'syntext.yml'), 'a: [1,\n')
    const r = await checkProjectSyntax(dir)
    expect(r.issues[0]).toMatchObject({ file: 'syntext.yml', type: 'error' })
  })

  it('should work without a config or a docs folder', async () => {
    dir = await mkdtemp(join(tmpdir(), 'stx-proj-'))
    expect(await checkProjectSyntax(dir)).toEqual({ configFile: null, issues: [] })
  })
})
