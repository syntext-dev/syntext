import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractExportBundle } from './build'

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
