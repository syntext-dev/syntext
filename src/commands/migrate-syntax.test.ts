import { describe, it, expect, afterEach } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deprecationTable } from '../syntax/table'
import { runSyntaxMigrate } from './migrate-syntax'

// eslint-disable-next-line no-control-regex
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

let dir = ''
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = ''
})

async function project(): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'stx-msyn-'))
  await mkdir(join(dir, 'docs'), { recursive: true })
  await writeFile(join(dir, 'syntext.json'), '{\n  "theme": "default",\n  "colors": {\n    "primary": "#6366F1",\n    "accent": "#2AC3DE"\n  }\n}\n')
  await writeFile(join(dir, 'docs/u.mdx'), '---\ntitle: U\n---\n<Update label="June">x</Update>\n')
  return dir
}

function harness(remote: 'ok' | 'down' = 'ok') {
  const lines: string[] = []
  return {
    lines,
    deps: {
      print: (s: string) => lines.push(plain(s)),
      fetchImpl: async () => (remote === 'ok' ? new Response(JSON.stringify(deprecationTable())) : new Response('no', { status: 503 })),
      spinner: false,
    },
  }
}

describe('runSyntaxMigrate', () => {
  it('should print a diff and a summary on --dry-run and write nothing', async () => {
    const root = await project()
    const h = harness()
    const code = await runSyntaxMigrate({ dir: root, dryRun: true }, h.deps)
    const out = h.lines.join('\n')
    expect(code).toBe(0)
    expect(out).toContain('--- a/docs/u.mdx')
    expect(out).toContain('+<Update title="June">x</Update>')
    expect(out).toContain('Would rewrite 2 deprecated forms in 2 files.')
    expect(out).toContain('Not rewritten (1)')
    expect(await readFile(join(root, 'docs/u.mdx'), 'utf-8')).toContain('label=')
  })

  it('should write the changes and report them', async () => {
    const root = await project()
    const h = harness()
    await runSyntaxMigrate({ dir: root }, h.deps)
    expect(await readFile(join(root, 'docs/u.mdx'), 'utf-8')).toContain('<Update title="June">')
    expect(h.lines.join('\n')).toContain('Rewrote 2 deprecated forms in 2 files.')
  })

  it('should apply v2-only rules with --v2', async () => {
    const root = await project()
    await runSyntaxMigrate({ dir: root, v2: true }, harness().deps)
    expect(JSON.parse(await readFile(join(root, 'syntext.json'), 'utf-8')).appearance).toEqual({ accent: '#6366F1' })
  })

  it('should print one JSON document with --json', async () => {
    const root = await project()
    const h = harness('down')
    await runSyntaxMigrate({ dir: root, json: true, dryRun: true }, h.deps)
    expect(h.lines).toHaveLength(1)
    const body = JSON.parse(h.lines[0])
    expect(body.success).toBe(true)
    expect(body.table.source).toBe('bundled')
    expect(body.applied).toHaveLength(2)
    expect(body.files[0].diff).toContain('@@')
  })

  it('should not touch the network with --offline', async () => {
    const root = await project()
    let called = false
    const h = harness()
    await runSyntaxMigrate({ dir: root, offline: true, json: true }, { ...h.deps, fetchImpl: async () => { called = true; return new Response('{}') } })
    expect(called).toBe(false)
    expect(JSON.parse(h.lines[0]).table.source).toBe('bundled')
  })

  it('should fail with a clear message on a broken config', async () => {
    dir = await mkdtemp(join(tmpdir(), 'stx-msyn-'))
    await writeFile(join(dir, 'syntext.json'), '{ nope')
    const h = harness()
    const code = await runSyntaxMigrate({ dir, json: true }, h.deps)
    expect(code).toBe(1)
    expect(JSON.parse(h.lines[0])).toMatchObject({ success: false })
    expect(JSON.parse(h.lines[0]).error).toContain('syntext.json is not valid JSON')
  })

  it('should fail when the directory does not exist', async () => {
    const h = harness()
    const code = await runSyntaxMigrate({ dir: '/nonexistent/stx/dir' }, h.deps)
    expect(code).toBe(1)
    expect(h.lines.join('\n')).toContain('/nonexistent/stx/dir does not exist')
  })
})
