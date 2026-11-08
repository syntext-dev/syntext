import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as credentials from '../lib/credentials'
import { userAgent } from '../lib/api'
import { extractExportBundle, buildCommand } from './build'

function makeBundle(files: Array<{ path: string; content: Buffer | string; contentType?: string }>): Uint8Array {
  const manifest = JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    files: files.map((f) => ({
      path: f.path,
      contentType: f.contentType ?? 'text/html',
      encoding: 'base64',
      content: (typeof f.content === 'string' ? Buffer.from(f.content, 'utf-8') : f.content).toString('base64'),
    })),
  })
  return Bun.gzipSync(Buffer.from(manifest, 'utf-8'))
}

describe('BuildCommand', () => {
  let outDir: string

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'stx-build-test-'))
  })

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true })
  })

  it('should extract bundle files preserving nested paths', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff])
    const bundle = makeBundle([
      { path: 'index.html', content: '<html>home</html>' },
      { path: 'guides/getting-started.html', content: '<html>guide</html>' },
      { path: '_assets/search-index.json', content: '{"documents":[]}', contentType: 'application/json' },
      { path: 'public/logo.png', content: png, contentType: 'image/png' },
    ])

    const result = await extractExportBundle(bundle, outDir)

    expect(result.fileCount).toBe(4)
    expect(await readFile(join(outDir, 'index.html'), 'utf-8')).toBe('<html>home</html>')
    expect(await readFile(join(outDir, 'guides/getting-started.html'), 'utf-8')).toBe('<html>guide</html>')
    expect(await readFile(join(outDir, '_assets/search-index.json'), 'utf-8')).toBe('{"documents":[]}')
    expect(Buffer.from(await readFile(join(outDir, 'public/logo.png'))).equals(png)).toBe(true)
  })

  it('should report total bytes written', async () => {
    const bundle = makeBundle([{ path: 'a.html', content: 'x'.repeat(1000) }])

    const result = await extractExportBundle(bundle, outDir)

    expect(result.totalBytes).toBe(1000)
  })

  it('should reject unsafe paths in the bundle', async () => {
    const bundle = makeBundle([{ path: '../evil.html', content: 'nope' }])

    await expect(extractExportBundle(bundle, outDir)).rejects.toThrow('Unsafe path')
  })
})

describe('build session handling', () => {
  const realFetch = globalThis.fetch
  let dir: string
  let output: string[]
  let seen: RequestInit | undefined
  let spies: Array<{ mockRestore: () => void }>

  class ExitError extends Error {
    constructor(readonly code: number | undefined) {
      super(`exit ${code}`)
    }
  }

  beforeEach(async () => {
    output = []
    seen = undefined
    dir = await mkdtemp(join(tmpdir(), 'stx-build-revoked-'))
    await writeFile(join(dir, 'syntext.json'), JSON.stringify({ name: 'x', projectId: 'p1' }))
    await mkdir(join(dir, 'docs'))
    await writeFile(join(dir, 'docs', 'index.mdx'), '# Hi')
    globalThis.fetch = Object.assign(
      async (_input: string | URL | Request, init?: RequestInit) => {
        seen = init
        return new Response(JSON.stringify({ error: { code: 'session_revoked', message: 'signed out' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      },
      { preconnect: realFetch.preconnect },
    ) as typeof fetch
    spies = [
      spyOn(process, 'cwd').mockReturnValue('/'),
      spyOn(credentials, 'loadCredentials').mockResolvedValue({ token: 'tok' }),
      spyOn(credentials, 'clearCredentials').mockResolvedValue(undefined),
      spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new ExitError(code)
      }) as typeof process.exit),
      spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
        output.push(a.map(String).join(' '))
      }),
    ]
  })

  afterEach(async () => {
    for (const s of spies) s.mockRestore()
    globalThis.fetch = realFetch
    await rm(dir, { recursive: true, force: true })
  })

  it('should clear credentials and report session_revoked with --json', async () => {
    const err = await buildCommand.parseAsync(['--dir', dir, '--json'], { from: 'user' }).catch((e) => e)
    expect(err).toBeInstanceOf(ExitError)
    expect((err as ExitError).code).toBe(1)
    const body = JSON.parse(output.join('')) as { success: boolean; code: string; error: string }
    expect(body).toMatchObject({ success: false, code: 'session_revoked' })
    expect(body.error).toContain('stx login')
    expect(credentials.clearCredentials).toHaveBeenCalledTimes(1)
    expect(new Headers(seen?.headers).get('User-Agent')).toBe(userAgent())
  })

  it('should describe --token as a login token or project API key', () => {
    expect(buildCommand.helpInformation()).toContain('project API key')
  })
})
