import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { scanSourceFiles } from './scan-sources'

let root: string

const ANNOTATED = `/**
 * @stx group "Users"
 * @stx param id {string} The user id
 */
export function getUser(id) {}
`

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'stx-scan-'))
  const src = join(root, 'src')
  await mkdir(join(src, 'nested'), { recursive: true })
  await mkdir(join(root, 'node_modules'), { recursive: true })

  for (const name of [
    'a.ts', 'b.tsx', 'c.mts', 'd.cts',
    'e.js', 'f.jsx', 'g.mjs', 'h.cjs',
    'i.py', 'j.go', 'k.rs', 'l.java',
    'm.kt', 'n.kts', 'o.php', 'p.cs',
    'q.rb',
    'skip.test.ts', 'skip.spec.ts',
    'readme.md',
  ]) {
    await writeFile(join(src, name), ANNOTATED)
  }
  await writeFile(join(src, 'nested', 'deep.ts'), ANNOTATED)
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('scanSourceFiles', () => {
  it('should find every locally parseable extension', async () => {
    const { files } = await scanSourceFiles(root, ['src'])
    const names = files.map((f) => basename(f))
    for (const n of [
      'a.ts', 'b.tsx', 'c.mts', 'd.cts',
      'e.js', 'f.jsx', 'g.mjs', 'h.cjs',
      'i.py', 'j.go', 'k.rs', 'l.java',
      'm.kt', 'n.kts', 'o.php', 'p.cs',
    ]) {
      expect(names).toContain(n)
    }
  })

  it('should include the C# and Kotlin files that stx check used to miss', async () => {
    // Regression: `stx check` scanned a 9-extension list without cs/kt/kts while
    // `stx generate` scanned a 12-extension one, so those symbols were documented
    // but never drift-checked.
    const names = (await scanSourceFiles(root, ['src'])).files.map((f) => basename(f))
    expect(names).toContain('p.cs')
    expect(names).toContain('m.kt')
    expect(names).toContain('n.kts')
  })

  it('should include the ESM and CJS extensions the backend parser accepts', async () => {
    const names = (await scanSourceFiles(root, ['src'])).files.map((f) => basename(f))
    expect(names).toContain('c.mts')
    expect(names).toContain('d.cts')
    expect(names).toContain('g.mjs')
    expect(names).toContain('h.cjs')
  })

  it('should recurse into nested directories', async () => {
    const names = (await scanSourceFiles(root, ['src'])).files.map((f) => basename(f))
    expect(names).toContain('deep.ts')
  })

  it('should skip test, spec and non-source files', async () => {
    const names = (await scanSourceFiles(root, ['src'])).files.map((f) => basename(f))
    expect(names).not.toContain('skip.test.ts')
    expect(names).not.toContain('skip.spec.ts')
    expect(names).not.toContain('readme.md')
  })

  it('should not silently drop Ruby — it warns instead', async () => {
    const { files, warnings } = await scanSourceFiles(root, ['src'])
    expect(files.map((f) => basename(f))).not.toContain('q.rb')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Ruby')
    expect(warnings[0]).toContain('1 Ruby file skipped')
  })

  it('should emit no warnings when no unsupported files are present', async () => {
    const { warnings } = await scanSourceFiles(root, ['src/nested'])
    expect(warnings).toEqual([])
  })

  it('should return empty results for a missing directory', async () => {
    const { files, warnings } = await scanSourceFiles(root, ['does-not-exist'])
    expect(files).toEqual([])
    expect(warnings).toEqual([])
  })

  it('should accept multiple source directories', async () => {
    const { files } = await scanSourceFiles(root, ['src', 'does-not-exist'])
    expect(files.length).toBeGreaterThan(0)
  })
})
