import { describe, it, expect } from 'bun:test'
import { join } from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { stripCodeBlocks, findBrokenLinks } from './check'

describe('stripCodeBlocks', () => {
  it('should remove fenced code blocks', () => {
    const input = 'before\n```markdown\n![Screenshot](/images/screenshot.png)\n```\nafter'
    const result = stripCodeBlocks(input)
    expect(result).not.toContain('/images/screenshot.png')
    expect(result).toContain('before')
    expect(result).toContain('after')
  })

  it('should remove fenced blocks with language and title metadata', () => {
    const input = '```bash cURL\ncurl -X POST /v1/projects\n```\n\nprose'
    const result = stripCodeBlocks(input)
    expect(result).not.toContain('curl -X POST')
    expect(result).toContain('prose')
  })

  it('should remove tilde fences', () => {
    const input = '~~~md\n[link](/nowhere)\n~~~\nkeep'
    const result = stripCodeBlocks(input)
    expect(result).not.toContain('/nowhere')
    expect(result).toContain('keep')
  })

  it('should remove inline code spans', () => {
    const result = stripCodeBlocks('see `[x](/fake)` here')
    expect(result).not.toContain('/fake')
    expect(result).toContain('see')
  })

  it('should keep prose links outside code blocks', () => {
    const input = '```\nfenced\n```\n[real](/guides/quickstart)'
    expect(stripCodeBlocks(input)).toContain('(/guides/quickstart)')
  })

  it('should handle multiple fences without merging content between them', () => {
    const input = '```\na\n```\n[kept](/page)\n```\nb\n```'
    expect(stripCodeBlocks(input)).toContain('(/page)')
  })
})

describe('findBrokenLinks', () => {
  const files = ['guides/quickstart.mdx', 'concepts/annotations.mdx', 'index.mdx', 'api-reference/overview.md']

  it('should report links to nonexistent pages', () => {
    expect(findBrokenLinks('[x](/guides/missing)', files)).toEqual(['/guides/missing'])
  })

  it('should accept links to existing pages', () => {
    expect(findBrokenLinks('[x](/guides/quickstart)', files)).toEqual([])
  })

  it('should resolve links with anchors against the page path', () => {
    expect(findBrokenLinks('[x](/concepts/annotations#supported-languages)', files)).toEqual([])
  })

  it('should still report broken links that have anchors', () => {
    expect(findBrokenLinks('[x](/missing/page#anchor)', files)).toEqual(['/missing/page#anchor'])
  })

  it('should ignore links inside code fences', () => {
    const content = '```markdown\n![Screenshot](/images/screenshot.png)\n[x](/not/a/page)\n```'
    expect(findBrokenLinks(content, files)).toEqual([])
  })

  it('should ignore static asset paths', () => {
    expect(findBrokenLinks('![logo](/logo-dark.svg) [dl](/spec.pdf)', files)).toEqual([])
  })

  it('should ignore external and anchor-only links', () => {
    expect(findBrokenLinks('[a](https://example.com) [b](#local) [c](mailto:x@y.z)', files)).toEqual([])
  })

  it('should ignore query strings when resolving', () => {
    expect(findBrokenLinks('[x](/guides/quickstart?ref=home)', files)).toEqual([])
  })

  it('should resolve index pages and .md extensions', () => {
    expect(findBrokenLinks('[x](/api-reference/overview) [y](/)', files)).toEqual([])
  })

  it('should accept the built-in /ask route the build generates', () => {
    expect(findBrokenLinks('[Ask](/ask) [Shared](/ask/s/abc123) [q](/ask?q=hi)', files)).toEqual([])
    expect(findBrokenLinks('[x](/asking)', files)).toEqual(['/asking'])
  })

  it('should report multiple broken links in one document', () => {
    const content = '[a](/gone) and [b](/also/gone)'
    expect(findBrokenLinks(content, files)).toEqual(['/gone', '/also/gone'])
  })
})

describe('check command: syntax and --explain', () => {
  const run = async (args: string[]) => {
    const proc = Bun.spawn(['bun', 'run', join(import.meta.dir, '../index.ts'), 'check', ...args], { stdout: 'pipe', stderr: 'pipe' })
    const out = await new Response(proc.stdout).text()
    return { code: await proc.exited, out }
  }

  it('should offer --explain', async () => {
    const { checkCommand } = await import('./check')
    expect(checkCommand.options.map((o) => o.long)).toContain('--explain')
  })

  it('should warn about deprecated syntax with file, line and code in --json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stx-check-'))
    await mkdir(join(dir, 'docs'), { recursive: true })
    await writeFile(join(dir, 'syntext.json'), '{\n  "name": "A",\n  "nmae": "B"\n}\n')
    await writeFile(join(dir, 'docs/u.mdx'), '---\ntitle: U\n---\n<Update label="June">x</Update>\n')
    const { code, out } = await run(['--dir', dir, '--json'])
    const body = JSON.parse(out)
    expect(code).toBe(0)
    expect(body.issues).toEqual(expect.arrayContaining([
      { file: 'syntext.json', line: 3, type: 'warning', code: 'config.unknown-key', message: 'Unknown key "nmae" is ignored. Did you mean "name"?' },
      { file: 'docs/u.mdx', line: 4, type: 'warning', code: 'mdx.update-label', message: '<Update label="…"> is deprecated. Use <Update title="…"> instead.' },
    ]))
    const strict = await run(['--dir', dir, '--json', '--strict'])
    expect(strict.code).toBe(1)
    await rm(dir, { recursive: true, force: true })
  })

  it('should explain the appearance as JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stx-check-'))
    await writeFile(join(dir, 'syntext.json'), '{ "theme": "orbit" }\n')
    const { code, out } = await run(['--dir', dir, '--explain', 'appearance', '--json'])
    expect(code).toBe(0)
    expect(JSON.parse(out)).toMatchObject({ success: true, topic: 'appearance', preset: 'orbit' })
    await rm(dir, { recursive: true, force: true })
  })
})
