import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as credentials from '../lib/credentials'
import { devCommand, deployPreview, devWatchDirs, exitIfSessionRevoked, previewScriptsNote } from './dev'
import { SessionRevokedError, userAgent } from '../lib/api'

const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '')

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

class ExitError extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`)
  }
}

describe('dev', () => {
  const realFetch = globalThis.fetch
  let dir: string
  let requests: Array<{ url: string; init?: RequestInit }>
  let spies: Array<{ mockRestore: () => void }>

  function respond(...responses: Response[]) {
    globalThis.fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(input), init })
        const next = responses.shift()
        if (!next) throw new Error('no more responses')
        return next
      },
      { preconnect: realFetch.preconnect },
    ) as typeof fetch
  }

  beforeEach(async () => {
    requests = []
    dir = await mkdtemp(join(tmpdir(), 'stx-dev-'))
    await writeFile(join(dir, 'syntext.json'), JSON.stringify({ name: 'x', projectId: 'p1' }))
    await mkdir(join(dir, 'docs'))
    await writeFile(join(dir, 'docs', 'index.mdx'), '# Hi')
    spies = [
      spyOn(credentials, 'loadCredentials').mockResolvedValue({ token: 'tok' }),
      spyOn(credentials, 'clearCredentials').mockResolvedValue(undefined),
      spyOn(process.stderr, 'write').mockImplementation(() => true),
      spyOn(console, 'error').mockImplementation(() => {}),
    ]
  })

  afterEach(async () => {
    for (const s of spies) s.mockRestore()
    globalThis.fetch = realFetch
    await rm(dir, { recursive: true, force: true })
  })

  describe('deployPreview', () => {
    it('should upload with the stx User-Agent and return the preview URL', async () => {
      respond(
        json(202, { data: { buildId: 'b1', status: 'queued', branch: 'dev', isPreview: true, fileCount: 2 } }),
        json(200, { data: { status: 'deployed', deployUrl: 'https://preview.test', pageCount: 1, durationMs: 5, error: null } }),
      )
      expect(await deployPreview(dir, 'https://api.test', 'tok', 'p1', 'dev')).toBe('https://preview.test')
      expect(requests[0].url).toBe('https://api.test/v1/projects/p1/deploy')
      for (const r of requests) expect(new Headers(r.init?.headers).get('User-Agent')).toBe(userAgent())
    })

    it('should upload the root _syntext/ files alongside docs/_syntext/', async () => {
      await mkdir(join(dir, '_syntext'))
      await writeFile(join(dir, '_syntext', 'theme.css'), 'a{}')
      await writeFile(join(dir, '_syntext', 'notes.txt'), 'skip')
      await mkdir(join(dir, 'docs', '_syntext'))
      await writeFile(join(dir, 'docs', '_syntext', 'app.js'), 'x()')
      respond(
        json(202, { data: { buildId: 'b1', status: 'queued', branch: 'dev', isPreview: true, fileCount: 3 } }),
        json(200, { data: { status: 'deployed', deployUrl: 'https://preview.test', pageCount: 1, durationMs: 5, error: null } }),
      )
      await deployPreview(dir, 'https://api.test', 'tok', 'p1', 'dev')
      const paths = (requests[0].init?.body as FormData).getAll('paths')
      expect(paths).toContain('_syntext/theme.css')
      expect(paths).toContain('docs/_syntext/app.js')
      expect(paths).not.toContain('_syntext/notes.txt')
    })

    it('should return null on an ordinary deploy error', async () => {
      respond(json(500, { error: { code: 'internal_error', message: 'boom' } }))
      expect(await deployPreview(dir, 'https://api.test', 'tok', 'p1', 'dev')).toBeNull()
    })

    it('should rethrow a revoked session and clear the stored login', async () => {
      respond(json(401, { error: { code: 'session_revoked', message: 'signed out' } }))
      await expect(deployPreview(dir, 'https://api.test', 'tok', 'p1', 'dev')).rejects.toBeInstanceOf(SessionRevokedError)
      expect(credentials.clearCredentials).toHaveBeenCalledTimes(1)
    })
  })

  describe('devWatchDirs', () => {
    it('should watch docs/, public/ and the root _syntext/', () => {
      expect(devWatchDirs('/p')).toEqual(['/p/docs', '/p/public', '/p/_syntext'])
    })
  })

  describe('previewScriptsNote', () => {
    it('should be null with no scripts', async () => {
      await mkdir(join(dir, 'docs', '_syntext'))
      await writeFile(join(dir, 'docs', '_syntext', 'theme.css'), 'a{}')
      expect(previewScriptsNote(dir)).toBeNull()
    })

    it('should say scripts do not run in previews when _syntext has a script or head.html', async () => {
      await mkdir(join(dir, '_syntext'))
      await writeFile(join(dir, '_syntext', 'head.html'), '<meta>')
      expect(previewScriptsNote(dir)).toBe('Note: _syntext/*.js and head.html never run in previews (CSS does). On the live site they run only when "Scripts from your docs" / "Head tags from your docs" are on in Integrations › Custom code.')
    })
  })

  describe('exitIfSessionRevoked', () => {
    it('should exit 1 with the sign-in message for a revoked session', () => {
      const exit = spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new ExitError(code)
      }) as typeof process.exit)
      try {
        expect(() => exitIfSessionRevoked(new SessionRevokedError(true))).toThrow(ExitError)
        expect(exit).toHaveBeenCalledWith(1)
        expect(String((console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).toContain('stx login')
      } finally {
        exit.mockRestore()
      }
    })

    it('should rethrow other errors', () => {
      expect(() => exitIfSessionRevoked(new Error('other'))).toThrow('other')
    })
  })

  it('should describe --token as a login token or project API key', () => {
    expect(strip(devCommand.helpInformation())).toContain('project API key')
  })
})
