import { describe, it, expect, spyOn, beforeEach, afterEach, type Mock } from 'bun:test'
import * as credentials from '../lib/credentials'
import { projectsCommand, planLimitMessage } from './projects'
import { userAgent } from '../lib/api'

const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '')

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

class ExitError extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`)
  }
}

describe('projects', () => {
  const realFetch = globalThis.fetch
  let fetchMock: Mock<(input: string, init?: RequestInit) => Promise<Response>>
  let output: string[]
  let spies: Array<{ mockRestore: () => void }>
  let clearSpy: Mock<() => Promise<void>>

  function respond(res: Response) {
    fetchMock = (async () => res) as unknown as typeof fetchMock
    const wrapped = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => fetchMock(String(input), init),
      { preconnect: realFetch.preconnect },
    )
    globalThis.fetch = wrapped as typeof fetch
  }

  async function run(args: string[]): Promise<{ exitCode?: number; out: string }> {
    try {
      await projectsCommand.parseAsync(args, { from: 'user' })
      return { out: output.join('\n') }
    } catch (err) {
      if (err instanceof ExitError) return { exitCode: err.code, out: output.join('\n') }
      throw err
    }
  }

  beforeEach(() => {
    output = []
    const load = spyOn(credentials, 'loadCredentials').mockResolvedValue({ token: 'stored-token' })
    clearSpy = spyOn(credentials, 'clearCredentials').mockResolvedValue(undefined) as unknown as Mock<() => Promise<void>>
    const exit = spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitError(code)
    }) as typeof process.exit)
    const log = spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      output.push(a.map(String).join(' '))
    })
    spies = [load, clearSpy, exit, log]
  })

  afterEach(() => {
    for (const s of spies) s.mockRestore()
    globalThis.fetch = realFetch
  })

  it('should link the new billing route on a plan limit', () => {
    expect(planLimitMessage('Free plan allows 1 project')).toBe(
      'Plan limit reached: Free plan allows 1 project. Upgrade at https://app.syntext.dev/billing',
    )
    expect(planLimitMessage('x')).not.toContain('/settings/billing')
  })

  it('should report the plan limit with the billing link in --json output', async () => {
    respond(json(402, { error: { code: 'plan_required', message: 'Project limit reached' } }))
    const { exitCode, out } = await run(['create', 'docs', '--json'])
    expect(exitCode).toBe(1)
    expect(JSON.parse(out)).toEqual({
      success: false,
      error: 'Plan limit reached: Project limit reached. Upgrade at https://app.syntext.dev/billing',
    })
  })

  it('should list projects and send the stx User-Agent', async () => {
    let seen: RequestInit | undefined
    respond(json(200, { data: [] }))
    const inner = fetchMock
    fetchMock = (async (url: string, init?: RequestInit) => {
      seen = init
      return inner(url, init)
    }) as typeof fetchMock
    const { exitCode, out } = await run(['list', '--json'])
    expect(exitCode).toBeUndefined()
    expect(JSON.parse(out)).toEqual({ success: true, projects: [] })
    expect(new Headers(seen?.headers).get('User-Agent')).toBe(userAgent())
  })

  it('should clear credentials and say to run stx login on 401 session_revoked (--json)', async () => {
    respond(json(401, { error: { code: 'session_revoked', message: 'This session has been signed out. Sign in again.' } }))
    const { exitCode, out } = await run(['list', '--json'])
    expect(exitCode).toBe(1)
    const body = JSON.parse(out) as { success: boolean; code: string; error: string }
    expect(body.success).toBe(false)
    expect(body.code).toBe('session_revoked')
    expect(body.error).toContain('stx login')
    expect(clearSpy).toHaveBeenCalledTimes(1)
  })

  it('should keep a generic 401 as a normal error without clearing credentials', async () => {
    respond(json(401, { error: { code: 'unauthorized', message: 'Invalid or expired token' } }))
    const { exitCode, out } = await run(['delete', 'p1', '--confirm', '--json'])
    expect(exitCode).toBe(1)
    expect(JSON.parse(out)).toEqual({ success: false, error: 'Invalid or expired token' })
    expect(clearSpy).not.toHaveBeenCalled()
  })

  it('should mention billing in the create help', () => {
    const create = projectsCommand.commands.find((c) => c.name() === 'create')
    expect(strip(create?.helpInformation() ?? '')).toContain('https://app.syntext.dev/billing')
  })
})
