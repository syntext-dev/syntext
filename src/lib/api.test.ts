import { describe, it, expect, mock } from 'bun:test'
import pkg from '../../package.json'
import {
  apiFetch,
  userAgent,
  CLI_VERSION,
  SessionRevokedError,
  isSessionRevokedError,
  jsonError,
  type ApiDeps,
} from './api'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function deps(res: Response, storedToken: string | null = 'stored-token') {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const clearCredentials = mock(async () => {})
  const d: ApiDeps = {
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return res
    },
    loadCredentials: async () => (storedToken ? { token: storedToken } : null),
    clearCredentials,
  }
  return { d, calls, clearCredentials }
}

const revoked = () =>
  jsonResponse(401, { error: { code: 'session_revoked', message: 'This session has been signed out. Sign in again.' } })

describe('userAgent', () => {
  it('should format stx/<version> (<platform>; <arch>)', () => {
    expect(userAgent('darwin', 'arm64', '1.2.3')).toBe('stx/1.2.3 (darwin; arm64)')
  })

  it('should default to the package.json version and the running platform', () => {
    expect(CLI_VERSION).toBe(pkg.version)
    expect(userAgent()).toBe(`stx/${pkg.version} (${process.platform}; ${process.arch})`)
  })

  it('should match the backend parser prefix', () => {
    expect(/^stx\/([\w.+-]+)/.exec(userAgent('linux', 'x64', '0.6.5'))?.[1]).toBe('0.6.5')
  })
})

describe('apiFetch', () => {
  it('should send the stx User-Agent and keep the caller headers', async () => {
    const { d, calls } = deps(jsonResponse(200, { data: {} }))
    await apiFetch('https://api.test/v1/projects', { headers: { Authorization: 'Bearer t' } }, d)
    const headers = new Headers(calls[0].init?.headers)
    expect(headers.get('User-Agent')).toBe(userAgent())
    expect(headers.get('Authorization')).toBe('Bearer t')
  })

  it('should pass method and body through', async () => {
    const { d, calls } = deps(jsonResponse(200, {}))
    await apiFetch('https://api.test/x', { method: 'POST', body: '{"a":1}' }, d)
    expect(calls[0].init?.method).toBe('POST')
    expect(calls[0].init?.body).toBe('{"a":1}')
  })

  it('should return non-revocation errors untouched, with a readable body', async () => {
    const { d, clearCredentials } = deps(jsonResponse(401, { error: { code: 'unauthorized', message: 'Invalid or expired token' } }))
    const res = await apiFetch('https://api.test/x', { headers: { Authorization: 'Bearer stored-token' } }, d)
    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: { message: string } }).error.message).toBe('Invalid or expired token')
    expect(clearCredentials).not.toHaveBeenCalled()
  })

  it('should not treat a 401 with a non-JSON body as revoked', async () => {
    const { d } = deps(new Response('nope', { status: 401 }))
    const res = await apiFetch('https://api.test/x', {}, d)
    expect(res.status).toBe(401)
  })

  it('should clear stored credentials and throw on 401 session_revoked for the stored token', async () => {
    const { d, clearCredentials } = deps(revoked())
    const err = await apiFetch('https://api.test/x', { headers: { Authorization: 'Bearer stored-token' } }, d).catch((e) => e)
    expect(err).toBeInstanceOf(SessionRevokedError)
    expect((err as SessionRevokedError).cleared).toBe(true)
    expect((err as Error).message).toContain('stx login')
    expect(clearCredentials).toHaveBeenCalledTimes(1)
  })

  it('should keep stored credentials when a different --token was revoked', async () => {
    const { d, clearCredentials } = deps(revoked())
    const err = await apiFetch('https://api.test/x', { headers: { Authorization: 'Bearer other-token' } }, d).catch((e) => e)
    expect(err).toBeInstanceOf(SessionRevokedError)
    expect((err as SessionRevokedError).cleared).toBe(false)
    expect((err as Error).message).toContain('stx login')
    expect(clearCredentials).not.toHaveBeenCalled()
  })

  it('should throw without clearing when nothing is stored', async () => {
    const { d, clearCredentials } = deps(revoked(), null)
    const err = await apiFetch('https://api.test/x', { headers: { Authorization: 'Bearer t' } }, d).catch((e) => e)
    expect(isSessionRevokedError(err)).toBe(true)
    expect(clearCredentials).not.toHaveBeenCalled()
  })

  it('should propagate network errors', async () => {
    const d: ApiDeps = { fetchImpl: async () => { throw new Error('ECONNREFUSED') } }
    await expect(apiFetch('https://api.test/x', {}, d)).rejects.toThrow('ECONNREFUSED')
  })
})

describe('jsonError', () => {
  it('should add code session_revoked for a revoked session', () => {
    expect(jsonError(new SessionRevokedError(true))).toMatchObject({ success: false, code: 'session_revoked' })
  })

  it('should give only the message for other errors', () => {
    expect(jsonError(new Error('boom'))).toEqual({ success: false, error: 'boom' })
    expect(jsonError('text')).toEqual({ success: false, error: 'text' })
  })
})
