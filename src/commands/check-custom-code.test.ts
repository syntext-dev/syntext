import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { join } from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as credentials from '../lib/credentials'
import { checkCustomCodeFolder, checkPageCss } from './check-custom-code'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'stx-check-custom-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function put(rel: string, content = ''): Promise<void> {
  const abs = join(root, rel)
  await mkdir(join(abs, '..'), { recursive: true })
  await writeFile(abs, content)
}

const offline = { loadSwitches: async () => null }
const RUNS_JS = '_syntext/app.js runs only when "Scripts from your docs" is on in Integrations › Custom code (off by default), and never on previews'
const RUNS_HEAD = '_syntext/head.html runs only when "Head tags from your docs" is on in Integrations › Custom code (off by default), and never on previews'

describe('checkCustomCodeFolder', () => {
  it('should report nothing without a _syntext folder, without asking for the switches', async () => {
    let asked = false
    expect(await checkCustomCodeFolder(root, [], { loadSwitches: async () => { asked = true; return null } })).toEqual([])
    expect(asked).toBe(false)
  })

  it('should report errors and one generic warning per head.html and script when the switches are unknown', async () => {
    await put('docs/_syntext/theme.css', '</style>')
    await put('docs/_syntext/app.js', 'x()')
    await put('docs/_syntext/head.html', '<meta name="a">')
    expect(await checkCustomCodeFolder(root, [], offline)).toEqual([
      { file: 'docs/_syntext/theme.css', type: 'error', message: 'CSS must not contain </style>' },
      { file: 'docs/_syntext/head.html', type: 'warning', message: RUNS_HEAD },
      { file: 'docs/_syntext/app.js', type: 'warning', message: RUNS_JS },
    ])
  })

  it('should name what a switch that is off skips, and say nothing for switches that are on', async () => {
    await put('docs/_syntext/theme.css', 'a{}')
    await put('docs/_syntext/app.js', 'x()')
    await put('docs/_syntext/head.html', '<meta name="a">')
    const pageCss = [{ file: 'docs/p.mdx', value: './p.css' }]
    expect(await checkCustomCodeFolder(root, pageCss, { loadSwitches: async () => ({ css: false, head: true, scripts: false }) })).toEqual([
      { file: 'docs/_syntext/theme.css', type: 'warning', message: '_syntext/theme.css is skipped: "CSS from your docs" is off in Integrations › Custom code' },
      { file: 'docs/p.mdx', type: 'warning', message: 'css "./p.css" is skipped: "CSS from your docs" is off in Integrations › Custom code' },
      { file: 'docs/_syntext/app.js', type: 'warning', message: '_syntext/app.js is skipped: "Scripts from your docs" is off in Integrations › Custom code' },
    ])
    expect(await checkCustomCodeFolder(root, pageCss, { loadSwitches: async () => ({ css: true, head: true, scripts: true }) })).toEqual([])
  })

  it('should read the switches of a linked project from the API', async () => {
    await put('syntext.json', JSON.stringify({ name: 'A', projectId: 'p1' }))
    await put('_syntext/app.js', 'x()')
    const creds = spyOn(credentials, 'loadCredentials').mockResolvedValue({ token: 'tok' })
    const urls: string[] = []
    const fetchImpl = async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify({ data: { docsCode: { css: true, head: false, scripts: false } } }), { status: 200 })
    }
    try {
      expect(await checkCustomCodeFolder(root, [], { fetchImpl })).toEqual([
        { file: '_syntext/app.js', type: 'warning', message: '_syntext/app.js is skipped: "Scripts from your docs" is off in Integrations › Custom code' },
      ])
      expect(urls[0]).toEndWith('/v1/projects/p1/custom-scripts')
    } finally {
      creds.mockRestore()
    }
  })

  it('should fall back to the generic warning when the API cannot be reached', async () => {
    await put('syntext.json', JSON.stringify({ name: 'A', projectId: 'p1' }))
    await put('_syntext/app.js', 'x()')
    const creds = spyOn(credentials, 'loadCredentials').mockResolvedValue({ token: 'tok' })
    try {
      const issues = await checkCustomCodeFolder(root, [], { fetchImpl: async () => { throw new Error('offline') } })
      expect(issues).toEqual([{ file: '_syntext/app.js', type: 'warning', message: RUNS_JS }])
    } finally {
      creds.mockRestore()
    }
  })

  it('should not call the API for a project that is not linked', async () => {
    await put('syntext.json', JSON.stringify({ name: 'A' }))
    await put('_syntext/app.js', 'x()')
    let called = false
    await checkCustomCodeFolder(root, [], { fetchImpl: async () => { called = true; return new Response('{}') } })
    expect(called).toBe(false)
  })

  it('should warn about an ignored root folder', async () => {
    await put('docs/_syntext/theme.css')
    await put('_syntext/theme.css')
    expect(await checkCustomCodeFolder(root, [], offline)).toEqual([
      { file: '_syntext/', type: 'warning', message: 'ignored: docs/_syntext/ exists and takes precedence. Move these files into docs/_syntext/.' },
    ])
  })

  it('should find the folder in a nested .syntext project and name it from the given folder', async () => {
    await put('.syntext/syntext.json', '{}')
    await put('.syntext/_syntext/theme.css', '</body>')
    expect(await checkCustomCodeFolder(root, [], offline)).toEqual([
      { file: '.syntext/_syntext/theme.css', type: 'error', message: 'CSS must not contain </head> or </body>' },
    ])
  })
})

describe('checkPageCss', () => {
  it('should return an error naming the page and value', async () => {
    const r = checkPageCss('---\ncss: ./x.css\n---\n', 'guides/a.mdx', join(root, 'docs'), 'docs/guides/a.mdx')
    expect(r).toEqual({ issues: [{ file: 'docs/guides/a.mdx', type: 'error', message: 'css "./x.css": file not found (guides/x.css in the docs folder)' }], css: null })
  })

  it('should return the value of a valid stylesheet', async () => {
    await put('docs/guides/x.css', 'a{}')
    expect(checkPageCss('---\ncss: ./x.css\n---\n', 'guides/a.mdx', join(root, 'docs'), 'docs/guides/a.mdx')).toEqual({ issues: [], css: { file: 'docs/guides/a.mdx', value: './x.css' } })
  })

  it('should return nothing for a page without css', () => {
    expect(checkPageCss('---\ntitle: A\n---\n', 'a.mdx', join(root, 'docs'), 'docs/a.mdx')).toEqual({ issues: [], css: null })
  })
})

describe('stx check with custom code from your docs', () => {
  const run = async (args: string[]) => {
    const proc = Bun.spawn(['bun', 'run', join(import.meta.dir, '../index.ts'), 'check', ...args], { stdout: 'pipe', stderr: 'pipe' })
    const out = await new Response(proc.stdout).text()
    return { code: await proc.exited, out }
  }

  it('should fail on custom code errors, warn about scripts and skip _syntext pages, in --json', async () => {
    await put('syntext.json', '{ "name": "A" }\n')
    await put('docs/index.mdx', '---\ntitle: Home\ncss: /missing.css\n---\n# Home\n')
    await put('docs/_syntext/theme.css', 'a{} </style>')
    await put('docs/_syntext/head.html', '<meta name="a">')
    await put('docs/_syntext/notes.md', '[broken](/nowhere)\n')
    const { code, out } = await run(['--dir', root, '--json', '--src', 'none'])
    const body = JSON.parse(out)
    expect(code).toBe(1)
    expect(body.files).toBe(1)
    expect(body.issues).toEqual(expect.arrayContaining([
      { file: 'docs/_syntext/theme.css', type: 'error', message: 'CSS must not contain </style>' },
      { file: 'docs/index.mdx', type: 'error', message: 'css "/missing.css": file not found (missing.css in the docs folder)' },
    ]))
    expect(body.issues.some((i: { file: string; type: string; message: string }) => i.file === 'docs/_syntext/head.html' && i.type === 'warning' && i.message === '_syntext/head.html runs only when "Head tags from your docs" is on in Integrations › Custom code (off by default), and never on previews')).toBe(true)
    expect(body.issues.some((i: { file: string }) => i.file.includes('notes.md'))).toBe(false)
  }, 30000)
})
