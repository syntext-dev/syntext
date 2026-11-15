import { describe, it, expect, afterEach } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { findPagesDir, listPageFiles } from './pages-dir'

let dir = ''
async function tree(files: Record<string, string>): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'stx-pages-'))
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(dir, name, '..'), { recursive: true })
    await writeFile(join(dir, name), content)
  }
  return dir
}
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = ''
})

describe('findPagesDir', () => {
  it('should use docs/ when it holds pages directly', async () => {
    const root = await tree({ 'syntext.json': '{}', 'docs/index.mdx': '', 'README.md': '' })
    expect(await findPagesDir(root)).toEqual({ dir: join(root, 'docs'), prefix: 'docs' })
  })

  it('should use the project folder when there is no docs/', async () => {
    const root = await tree({ 'syntext.json': '{}', 'index.mdx': '' })
    expect(await findPagesDir(root)).toEqual({ dir: root, prefix: '' })
  })

  it('should use the project folder when docs/ holds no page at its top level, like the hosted build', async () => {
    const root = await tree({ 'syntext.json': '{}', 'index.mdx': '', 'docs/images/a.png': '', 'docs/guides/a.mdx': '' })
    expect(await findPagesDir(root)).toEqual({ dir: root, prefix: '' })
  })

  it('should use the project folder when docs is a file', async () => {
    const root = await tree({ docs: 'not a folder', 'index.md': '' })
    expect((await findPagesDir(root)).prefix).toBe('')
  })
})

describe('listPageFiles', () => {
  it('should list pages and skip node_modules, .git, _syntext, dist and dot folders', async () => {
    const root = await tree({
      'index.mdx': '',
      'guides/a.md': '',
      'guides/b.txt': '',
      'node_modules/pkg/readme.md': '',
      '.git/x.md': '',
      '_syntext/head.md': '',
      'dist/index.md': '',
      '.cache/y.mdx': '',
      'docs/_syntext/z.mdx': '',
    })
    expect(await listPageFiles(root)).toEqual(['guides/a.md', 'index.mdx'])
  })

  it('should return nothing for a folder that does not exist', async () => {
    expect(await listPageFiles(join(tmpdir(), 'stx-no-such-folder-xyz'))).toEqual([])
  })
})
