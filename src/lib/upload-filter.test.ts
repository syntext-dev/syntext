import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { gitIgnoredPaths, isInExcludedDir, isRootDocsFile, isSecretPath, listRootDocsFiles } from './upload-filter'

async function tree(root: string, files: string[]): Promise<void> {
  for (const f of files) {
    await mkdir(dirname(join(root, f)), { recursive: true })
    await writeFile(join(root, f), 'x')
  }
}

describe('upload-filter', () => {
  describe('isSecretPath', () => {
    it('should flag .env files and their variants', () => {
      for (const p of ['.env', '.env.local', 'guides/.env.production', '.ENV']) expect(isSecretPath(p)).toBe(true)
    })

    it('should flag private keys, certificates and credential files', () => {
      for (const p of ['server.pem', 'a/b/tls.key', 'cert.p12', 'id_rsa', 'credentials.json', '.npmrc']) {
        expect(isSecretPath(p)).toBe(true)
      }
    })

    it('should not flag ordinary docs files', () => {
      for (const p of ['index.mdx', 'environment.mdx', 'keys.md', 'img/key.png', 'openapi.yaml']) {
        expect(isSecretPath(p)).toBe(false)
      }
    })
  })

  describe('isRootDocsFile', () => {
    it('should accept pages, nav and redirect files, and images', () => {
      for (const p of ['index.mdx', 'g/a.md', 'g/_meta.json', '_redirects.json', 'img/a.PNG', 'd.svg']) {
        expect(isRootDocsFile(p)).toBe(true)
      }
    })

    it('should reject source code, lockfiles and other json', () => {
      for (const p of ['src/index.ts', 'package.json', 'bun.lockb', 'yarn.lock', 'package-lock.json', 'tsconfig.json']) {
        expect(isRootDocsFile(p)).toBe(false)
      }
    })
  })

  describe('isInExcludedDir', () => {
    it('should be true inside dependencies, git, build output and dot folders', () => {
      for (const p of ['node_modules/a/README.md', '.git/x', 'dist/a.md', '.next/a.md', 'out/a.md', 'build/a.md', 'a/.cache/b.md']) {
        expect(isInExcludedDir(p)).toBe(true)
      }
    })

    it('should be false for ordinary folders and top-level files', () => {
      expect(isInExcludedDir('guides/a.md')).toBe(false)
      expect(isInExcludedDir('index.md')).toBe(false)
    })
  })

  describe('listRootDocsFiles', () => {
    let root: string
    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'stx-upload-filter-'))
    })
    afterEach(async () => {
      await rm(root, { recursive: true, force: true })
    })

    it('should list pages and assets and skip excluded folders, secrets and code', async () => {
      await tree(root, [
        'index.mdx', 'guides/start.md', 'guides/_meta.json', 'img/logo.png',
        'node_modules/pkg/README.md', '.git/HEAD', '.github/workflows/ci.md', 'dist/index.md',
        '.next/a.md', 'out/a.md', 'build/a.md', 'guides/server.pem', 'package.json', 'src/a.ts',
        'public/x.png', '_syntext/theme.css',
      ])
      expect(await listRootDocsFiles(root, new Set(['public', '_syntext']))).toEqual([
        'guides/_meta.json', 'guides/start.md', 'img/logo.png', 'index.mdx',
      ])
    })

    it('should return nothing for a missing folder', async () => {
      expect(await listRootDocsFiles(join(root, 'nope'), new Set())).toEqual([])
    })
  })

  describe('gitIgnoredPaths', () => {
    let root: string
    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'stx-gitignore-'))
    })
    afterEach(async () => {
      await rm(root, { recursive: true, force: true })
    })

    it('should return what .gitignore ignores in a git repository', async () => {
      Bun.spawnSync(['git', 'init', '-q'], { cwd: root })
      await writeFile(join(root, '.gitignore'), 'drafts/\n*.tmp.md\n')
      const ignored = gitIgnoredPaths(root, ['index.md', 'drafts/a.md', 'x.tmp.md'])
      expect([...ignored].sort()).toEqual(['drafts/a.md', 'x.tmp.md'])
    })

    it('should return nothing outside a git repository or for no paths', () => {
      expect(gitIgnoredPaths(root, [])).toEqual(new Set())
      // tmpdir is not a repository; check-ignore exits 128.
      expect(gitIgnoredPaths(root, ['index.md']).size).toBe(0)
    })
  })
})
