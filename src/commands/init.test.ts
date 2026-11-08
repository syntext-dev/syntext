import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import * as credentials from '../lib/credentials'
import { createRemoteProject } from './init'
import { SessionRevokedError, userAgent } from '../lib/api'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('init', () => {
  const realFetch = globalThis.fetch
  let seen: RequestInit | undefined
  let spies: Array<{ mockRestore: () => void }>

  function respond(res: Response | Error) {
    globalThis.fetch = Object.assign(
      async (_input: string | URL | Request, init?: RequestInit) => {
        seen = init
        if (res instanceof Error) throw res
        return res
      },
      { preconnect: realFetch.preconnect },
    ) as typeof fetch
  }

  beforeEach(() => {
    seen = undefined
    spies = [
      spyOn(credentials, 'loadCredentials').mockResolvedValue({ token: 'tok' }),
      spyOn(credentials, 'clearCredentials').mockResolvedValue(undefined),
    ]
  })

  afterEach(() => {
    for (const s of spies) s.mockRestore()
    globalThis.fetch = realFetch
  })

  describe('createRemoteProject', () => {
    it('should return the new project id and send the stx User-Agent', async () => {
      respond(json(201, { data: { id: 'proj_1' } }))
      expect(await createRemoteProject('docs', 'tok')).toBe('proj_1')
      expect(new Headers(seen?.headers).get('User-Agent')).toBe(userAgent())
      expect(new Headers(seen?.headers).get('Authorization')).toBe('Bearer tok')
    })

    it('should return null on a plan limit or other API error', async () => {
      respond(json(402, { error: { code: 'plan_required', message: 'limit' } }))
      expect(await createRemoteProject('docs', 'tok')).toBeNull()
    })

    it('should return null on a network error', async () => {
      respond(new Error('ECONNREFUSED'))
      expect(await createRemoteProject('docs', 'tok')).toBeNull()
    })

    it('should rethrow a revoked session instead of hiding it', async () => {
      respond(json(401, { error: { code: 'session_revoked', message: 'signed out' } }))
      await expect(createRemoteProject('docs', 'tok')).rejects.toBeInstanceOf(SessionRevokedError)
      expect(credentials.clearCredentials).toHaveBeenCalledTimes(1)
    })
  })
})
