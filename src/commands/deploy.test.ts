import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as credentials from '../lib/credentials'
import { userAgent } from '../lib/api'
import { deployCommand } from './deploy'

describe('deploy session handling', () => {
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
    dir = await mkdtemp(join(tmpdir(), 'stx-deploy-revoked-'))
    await writeFile(join(dir, 'syntext.json'), JSON.stringify({ name: 'x', projectId: 'p1' }))
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
    const err = await deployCommand.parseAsync(['--promote', '--dir', dir, '--json'], { from: 'user' }).catch((e) => e)
    expect(err).toBeInstanceOf(ExitError)
    expect((err as ExitError).code).toBe(1)
    const body = JSON.parse(output.join('')) as { success: boolean; code: string; error: string }
    expect(body).toMatchObject({ success: false, code: 'session_revoked' })
    expect(body.error).toContain('stx login')
    expect(credentials.clearCredentials).toHaveBeenCalledTimes(1)
    expect(new Headers(seen?.headers).get('User-Agent')).toBe(userAgent())
  })

  it('should upload the root _syntext/ files', async () => {
    await mkdir(join(dir, 'docs'))
    await writeFile(join(dir, 'docs', 'index.mdx'), '# Hi')
    await mkdir(join(dir, '_syntext'))
    await writeFile(join(dir, '_syntext', 'theme.css'), 'a{}')
    await deployCommand.parseAsync(['--dir', dir, '--json'], { from: 'user' }).catch(() => undefined)
    expect((seen?.body as FormData).getAll('paths')).toEqual(expect.arrayContaining(['docs/index.mdx', '_syntext/theme.css']))
  })

  it('should upload pages that sit next to syntext.json, without dependencies or secrets', async () => {
    await writeFile(join(dir, 'index.mdx'), '# Home')
    await mkdir(join(dir, 'guides'))
    await writeFile(join(dir, 'guides', 'start.md'), '# Start')
    await mkdir(join(dir, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(join(dir, 'node_modules', 'pkg', 'README.md'), '# dep')
    await writeFile(join(dir, '.env'), 'SECRET=1')
    await deployCommand.parseAsync(['--dir', dir, '--json'], { from: 'user' }).catch(() => undefined)
    expect([...(seen?.body as FormData).getAll('paths')].sort()).toEqual(['guides/start.md', 'index.mdx', 'syntext.json'])
  })

  it('should fail with --json before uploading when a declared spec is missing', async () => {
    await writeFile(join(dir, 'syntext.json'), JSON.stringify({ name: 'x', projectId: 'p1', openapi: 'specs/api.yaml' }))
    await writeFile(join(dir, 'index.mdx'), '# Home')
    await deployCommand.parseAsync(['--dir', dir, '--json'], { from: 'user' }).catch(() => undefined)
    expect(seen).toBeUndefined()
    expect(JSON.parse(output.join(''))).toMatchObject({ success: false })
    expect(output.join('')).toContain('specs/api.yaml')
  })

  it('should describe --token as a login token or project API key', () => {
    expect(deployCommand.helpInformation()).toContain('project API key')
  })
})

describe('deploy waiting behind another build', () => {
  const realFetch = globalThis.fetch
  let dir: string
  let output: string[]
  let polls: number
  let buildBody: Record<string, unknown>
  let spies: Array<{ mockRestore: () => void }>

  class ExitError extends Error {
    constructor(readonly code: number | undefined) {
      super(`exit ${code}`)
    }
  }

  beforeEach(async () => {
    output = []
    polls = 0
    dir = await mkdtemp(join(tmpdir(), 'stx-deploy-queued-'))
    await writeFile(join(dir, 'syntext.json'), JSON.stringify({ name: 'x', projectId: 'p1' }))
    await mkdir(join(dir, 'docs'))
    await writeFile(join(dir, 'docs', 'index.mdx'), '# Hi')
    globalThis.fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'POST' && url.endsWith('/v1/projects/p1/deploy')) {
          return Response.json({
            data: {
              buildId: 'build-cli-1', status: 'queued', branch: 'main', isPreview: false, fileCount: 2, logsUrl: '/x',
              queuedBehind: { buildId: 'build-webhook-1', status: 'compiling', trigger: 'push', commitSha: 'abc1234' },
            },
          }, { status: 202 })
        }
        if (url.endsWith('/v1/projects/p1/builds/build-cli-1')) {
          polls++
          return Response.json({ data: buildBody })
        }
        return new Response('{}', { status: 404 })
      },
      { preconnect: realFetch.preconnect },
    ) as typeof fetch
    spies = [
      spyOn(process, 'cwd').mockReturnValue('/'),
      spyOn(credentials, 'loadCredentials').mockResolvedValue({ token: 'tok' }),
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

  it('should report success once the build behind the webhook build deploys', async () => {
    buildBody = { status: 'deployed', deployUrl: 'https://acme-docs.syntext.dev', pageCount: 1, durationMs: 900 }
    await deployCommand.parseAsync(['--dir', dir, '--json'], { from: 'user' })
    expect(JSON.parse(output.join(''))).toMatchObject({ success: true, buildId: 'build-cli-1', url: 'https://acme-docs.syntext.dev' })
    expect(polls).toBe(1)
  })

  it('should explain a deploy the server superseded with a newer live build', async () => {
    buildBody = { status: 'cancelled', error: 'Superseded: build b9 was requested later and is already live, so this build did not publish' }
    const err = await deployCommand.parseAsync(['--dir', dir, '--json'], { from: 'user' }).catch((e) => e)
    expect((err as ExitError).code).toBe(1)
    const body = JSON.parse(output.join('')) as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(body.error).toContain('Superseded: build b9')
  })
})
