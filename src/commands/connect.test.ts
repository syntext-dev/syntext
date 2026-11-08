import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as credentials from '../lib/credentials'
import { connectCommand } from './connect'
import { userAgent } from '../lib/api'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

class ExitError extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`)
  }
}

describe('connect', () => {
  const realFetch = globalThis.fetch
  let dir: string
  let output: string[]
  let seen: RequestInit | undefined
  let spies: Array<{ mockRestore: () => void }>

  function respond(res: Response) {
    globalThis.fetch = Object.assign(
      async (_input: string | URL | Request, init?: RequestInit) => {
        seen = init
        return res
      },
      { preconnect: realFetch.preconnect },
    ) as typeof fetch
  }

  async function run(args: string[]): Promise<{ exitCode?: number; out: unknown }> {
    try {
      await connectCommand.parseAsync([...args, '--dir', dir, '--json'], { from: 'user' })
      return { out: JSON.parse(output.join('')) }
    } catch (err) {
      if (err instanceof ExitError) return { exitCode: err.code, out: JSON.parse(output.join('')) }
      throw err
    }
  }

  beforeEach(async () => {
    output = []
    dir = await mkdtemp(join(tmpdir(), 'stx-connect-'))
    await writeFile(join(dir, 'syntext.json'), JSON.stringify({ name: 'x' }))
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

  it('should write the projectId and send the stx User-Agent', async () => {
    respond(json(200, { data: { id: 'p1', name: 'Docs', slug: 'docs', docsUrl: 'https://docs-docs.syntext.dev' } }))
    const { exitCode, out } = await run(['p1'])
    expect(exitCode).toBeUndefined()
    expect(out).toMatchObject({ success: true })
    expect(JSON.parse(await readFile(join(dir, 'syntext.json'), 'utf-8')).projectId).toBe('p1')
    expect(new Headers(seen?.headers).get('User-Agent')).toBe(userAgent())
  })

  it('should report session_revoked and clear credentials', async () => {
    respond(json(401, { error: { code: 'session_revoked', message: 'signed out' } }))
    const { exitCode, out } = await run(['p1'])
    expect(exitCode).toBe(1)
    expect(out).toMatchObject({ success: false, code: 'session_revoked' })
    expect((out as { error: string }).error).toContain('stx login')
    expect(credentials.clearCredentials).toHaveBeenCalledTimes(1)
  })

  it('should keep the not-found message for a 404', async () => {
    respond(json(404, { error: { code: 'not_found', message: 'nope' } }))
    const { exitCode, out } = await run(['p1'])
    expect(exitCode).toBe(1)
    expect((out as { error: string }).error).toContain('not found')
  })
})
