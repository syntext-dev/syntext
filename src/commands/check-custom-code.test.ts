import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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

describe('checkCustomCodeFolder', () => {
  it('should report nothing without a _syntext folder', async () => {
    expect(await checkCustomCodeFolder(root)).toEqual([])
  })

  it('should report errors and the scripts warning named from the project folder', async () => {
    await put('docs/_syntext/theme.css', '</style>')
    await put('docs/_syntext/app.js', 'x()')
    const issues = await checkCustomCodeFolder(root)
    expect(issues[0]).toEqual({ file: 'docs/_syntext/theme.css', type: 'error', message: 'CSS must not contain </style>' })
    expect(issues[1].type).toBe('warning')
    expect(issues[1].file).toBe('docs/_syntext/')
    expect(issues[1].message).toContain('Allow scripts from the repository')
  })

  it('should warn about an ignored root folder', async () => {
    await put('docs/_syntext/theme.css')
    await put('_syntext/theme.css')
    expect(await checkCustomCodeFolder(root)).toEqual([
      { file: '_syntext/', type: 'warning', message: 'ignored: docs/_syntext/ exists and takes precedence. Move these files into docs/_syntext/.' },
    ])
  })

  it('should find the folder in a nested .syntext project and name it from the given folder', async () => {
    await put('.syntext/syntext.json', '{}')
    await put('.syntext/_syntext/theme.css', '</body>')
    expect(await checkCustomCodeFolder(root)).toEqual([
      { file: '.syntext/_syntext/theme.css', type: 'error', message: 'CSS must not contain </head> or </body>' },
    ])
  })
})

describe('checkPageCss', () => {
  it('should return an error naming the page and value', async () => {
    const issues = checkPageCss('---\ncss: ./x.css\n---\n', 'guides/a.mdx', join(root, 'docs'), 'docs/guides/a.mdx')
    expect(issues).toEqual([{ file: 'docs/guides/a.mdx', type: 'error', message: 'css "./x.css": file not found (guides/x.css in the docs folder)' }])
  })

  it('should return nothing for a valid stylesheet', async () => {
    await put('docs/guides/x.css', 'a{}')
    expect(checkPageCss('---\ncss: ./x.css\n---\n', 'guides/a.mdx', join(root, 'docs'), 'docs/guides/a.mdx')).toEqual([])
  })
})

describe('stx check with repo custom code', () => {
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
    expect(body.issues.some((i: { file: string; type: string; message: string }) => i.file === 'docs/_syntext/' && i.type === 'warning' && i.message.startsWith('head.html run on the live site only when'))).toBe(true)
    expect(body.issues.some((i: { file: string }) => i.file.includes('notes.md'))).toBe(false)
  }, 30000)
})
