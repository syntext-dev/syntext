import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { appendSourceFiles, BundleTooLargeError, collectSourceBundle, MAX_ROOT_BUNDLE_BYTES } from './source-bundle'
import type { SyntextConfig } from './config'

async function tree(root: string, files: Record<string, string>): Promise<void> {
  for (const [f, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, f)), { recursive: true })
    await writeFile(join(root, f), body)
  }
}

const paths = (b: { files: Array<{ path: string }> }) => b.files.map((f) => f.path).sort()

/** The upload `stx deploy` 0.11.1 built (config, docs.json, docs/**, public/**, root _syntext/, root openapi.*). */
async function legacyDocsBundle(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const name of ['syntext.json', 'syntext.yaml', 'syntext.yml', 'stx.json', 'stx.yaml', 'stx.yml']) {
    if (await Bun.file(join(root, name)).exists()) {
      out.set(name, await Bun.file(join(root, name)).text())
      break
    }
  }
  for (const top of ['docs', 'public', '_syntext']) {
    try {
      for await (const f of new Bun.Glob('**/*').scan({ cwd: join(root, top) })) {
        if (top === '_syntext' && (f.includes('/') || !/\.(css|js)$|^head\.html$/.test(f))) continue
        out.set(`${top}/${f}`, await Bun.file(join(root, top, f)).text())
      }
    } catch {
      // missing folder
    }
  }
  for (const s of ['openapi.json', 'openapi.yaml', 'openapi.yml']) {
    if (await Bun.file(join(root, s)).exists()) out.set(s, await Bun.file(join(root, s)).text())
  }
  return out
}

describe('collectSourceBundle', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'stx-bundle-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  describe('docs/ layout', () => {
    it('should upload exactly the files and bytes it uploaded before', async () => {
      await tree(root, {
        'syntext.json': '{"name":"x"}',
        'docs/index.mdx': '# Hi',
        'docs/guides/start.md': '# Start',
        'docs/guides/_meta.json': '{}',
        'docs/img/a.png': 'png',
        'docs/_syntext/theme.css': 'a{}',
        'public/logo.svg': '<svg/>',
        '_syntext/site.css': 'b{}',
        'openapi.yaml': 'openapi: 3.0.0',
        'README.md': '# not a page here',
        'node_modules/x/README.md': '# dep',
      })
      const bundle = await collectSourceBundle(root, {})
      const legacy = await legacyDocsBundle(root)
      expect(bundle.layout).toBe('docs')
      expect(paths(bundle)).toEqual([...legacy.keys()].sort())
      for (const f of bundle.files) expect(f.content.toString()).toBe(legacy.get(f.path)!)
    })

    it('should include a declared spec in a subfolder and schemas outside docs/', async () => {
      await tree(root, {
        'syntext.json': '{}', 'docs/index.mdx': '# Hi',
        'specs/v1/api.yaml': 'openapi: 3.0.0', 'proto/svc.proto': 'syntax = "proto3";',
      })
      const bundle = await collectSourceBundle(root, { openapi: [{ path: './specs/v1/api.yaml', prefix: '/v1' }] } as SyntextConfig)
      expect(paths(bundle)).toEqual(['docs/index.mdx', 'proto/svc.proto', 'specs/v1/api.yaml', 'syntext.json'])
    })

    it('should upload a spec inside docs/ once', async () => {
      await tree(root, { 'syntext.json': '{}', 'docs/index.mdx': '# Hi', 'docs/api.json': '{}' })
      const bundle = await collectSourceBundle(root, { openapi: 'docs/api.json' })
      expect(paths(bundle)).toEqual(['docs/api.json', 'docs/index.mdx', 'syntext.json'])
    })

    it('should never upload key or certificate files from docs/ or public/', async () => {
      await tree(root, { 'syntext.json': '{}', 'docs/index.mdx': '# Hi', 'docs/server.pem': 'k', 'public/tls.key': 'k', 'docs/.env': 'S=1' })
      expect(paths(await collectSourceBundle(root, {}))).toEqual(['docs/index.mdx', 'syntext.json'])
    })

    it('should fail when a declared spec is missing', async () => {
      await tree(root, { 'syntext.json': '{}', 'docs/index.mdx': '# Hi' })
      await expect(collectSourceBundle(root, { openapi: 'specs/missing.yaml' })).rejects.toThrow('specs/missing.yaml')
    })
  })

  describe('root layout', () => {
    const rootProject = {
      'syntext.json': '{"name":"x"}',
      'index.mdx': '# Home',
      'guides/start.mdx': '# Start',
      'guides/_meta.json': '{"order":[]}',
      'guides/img/shot.png': 'png',
      '_redirects.json': '[]',
      '_syntext/theme.css': 'a{}',
      'public/logo.svg': '<svg/>',
      'api/openapi.yaml': 'openapi: 3.0.0',
      'schema/schema.graphql': 'type Query { a: Int }',
      'node_modules/pkg/README.md': '# dep',
      '.git/HEAD': 'ref',
      '.github/PULL_REQUEST_TEMPLATE.md': '# pr',
      'dist/index.md': '# built',
      '.next/x.md': '#', 'out/x.md': '#', 'build/x.md': '#',
      '.env': 'SECRET=1', '.env.local': 'SECRET=2', 'guides/deploy.pem': 'k', 'id_rsa': 'k',
      'package.json': '{}', 'bun.lock': '{}', 'package-lock.json': '{}', 'src/index.ts': 'x',
    }

    it('should upload pages, config, custom code, assets and specs, and nothing else', async () => {
      await tree(root, rootProject)
      const bundle = await collectSourceBundle(root, { openapi: 'api/openapi.yaml' })
      expect(bundle.layout).toBe('root')
      expect(paths(bundle)).toEqual([
        '_redirects.json', '_syntext/theme.css', 'api/openapi.yaml', 'guides/_meta.json', 'guides/img/shot.png',
        'guides/start.mdx', 'index.mdx', 'public/logo.svg', 'schema/schema.graphql', 'syntext.json',
      ])
    })

    it('should use the root when docs/ has no pages at its top level', async () => {
      await tree(root, { 'syntext.json': '{}', 'index.md': '# Home', 'docs/deep/a.md': '# A' })
      const bundle = await collectSourceBundle(root, {})
      expect(bundle.layout).toBe('root')
      expect(paths(bundle)).toEqual(['docs/deep/a.md', 'index.md', 'syntext.json'])
    })

    it('should skip files .gitignore ignores', async () => {
      await tree(root, { 'syntext.json': '{}', 'index.md': '# Home', 'drafts/wip.md': '# WIP', '.gitignore': 'drafts/\n' })
      Bun.spawnSync(['git', 'init', '-q'], { cwd: root })
      expect(paths(await collectSourceBundle(root, {}))).toEqual(['index.md', 'syntext.json'])
    })

    it('should fail with a move-to-docs/ hint when the upload is too large', async () => {
      await tree(root, { 'syntext.json': '{}', 'index.md': '# Home', 'img/big.png': 'x'.repeat(2048) })
      const run = collectSourceBundle(root, {}, { maxRootBytes: 1024 })
      await expect(run).rejects.toBeInstanceOf(BundleTooLargeError)
      await expect(collectSourceBundle(root, {}, { maxRootBytes: 1024 })).rejects.toThrow('docs/ folder')
    })

    it('should keep the default limit under the API request limit', () => {
      expect(MAX_ROOT_BUNDLE_BYTES).toBeLessThan(128 * 1024 * 1024)
    })
  })
})

describe('appendSourceFiles', () => {
  it('should add one files blob and one paths entry per file', () => {
    const form = new FormData()
    appendSourceFiles(form, [{ path: 'index.md', content: Buffer.from('# Hi') }, { path: 'a/b.md', content: Buffer.from('x') }])
    expect(form.getAll('paths')).toEqual(['index.md', 'a/b.md'])
    expect(form.getAll('files')).toHaveLength(2)
  })
})
