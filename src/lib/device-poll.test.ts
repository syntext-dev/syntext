import { describe, it, expect } from 'bun:test'
import { pollDeviceToken, classifyDeviceTokenResponse, type DevicePollDeps } from './device-poll'
import { userAgent } from './api'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const pending = () => json(428, { error: { code: 'authorization_pending', message: 'Awaiting user authorization' } })
const approved = () =>
  json(200, { data: { token: 'jwt', expiresIn: 31536000, user: { name: 'Ada', email: 'ada@example.com' } } })

/** Fake clock: sleep advances time instantly. */
function harness(responses: Array<Response | Error>) {
  let t = 0
  const sleeps: number[] = []
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const deps: DevicePollDeps = {
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms)
      t += ms
    },
    fetchImpl: async (url, init) => {
      requests.push({ url, init })
      const next = responses.shift() ?? pending()
      if (next instanceof Error) throw next
      return next
    },
  }
  return { deps, sleeps, requests }
}

const base = { apiUrl: 'https://api.test', deviceCode: 'dc', clientId: 'syntext-cli', intervalSec: 5, expiresInSec: 600 }

describe('classifyDeviceTokenResponse', () => {
  it('should treat authorization_pending (428) as pending', () => {
    expect(classifyDeviceTokenResponse(428, 'authorization_pending')).toBe('pending')
  })

  it('should treat RFC 8628 400 authorization_pending as pending', () => {
    expect(classifyDeviceTokenResponse(400, 'authorization_pending')).toBe('pending')
  })

  it('should recognise slow_down', () => {
    expect(classifyDeviceTokenResponse(400, 'slow_down')).toBe('slow_down')
  })

  it('should treat 403 or access_denied as denied', () => {
    expect(classifyDeviceTokenResponse(403, 'access_denied')).toBe('denied')
    expect(classifyDeviceTokenResponse(403, undefined)).toBe('denied')
    expect(classifyDeviceTokenResponse(400, 'access_denied')).toBe('denied')
  })

  it('should treat 404 as not_found', () => {
    expect(classifyDeviceTokenResponse(404, 'not_found')).toBe('not_found')
    expect(classifyDeviceTokenResponse(404, undefined)).toBe('not_found')
  })

  it('should treat 410 or expired / expired_token as expired', () => {
    expect(classifyDeviceTokenResponse(410, 'expired')).toBe('expired')
    expect(classifyDeviceTokenResponse(400, 'expired_token')).toBe('expired')
  })

  it('should retry on server errors and rate limits', () => {
    expect(classifyDeviceTokenResponse(500, 'internal_error')).toBe('retry')
    expect(classifyDeviceTokenResponse(503, undefined)).toBe('retry')
    expect(classifyDeviceTokenResponse(429, undefined)).toBe('retry')
  })

  it('should stop on other client errors', () => {
    expect(classifyDeviceTokenResponse(400, 'validation_error')).toBe('error')
    expect(classifyDeviceTokenResponse(401, 'unauthorized')).toBe('error')
  })
})

describe('pollDeviceToken', () => {
  it('should return the token once approved, after pending polls', async () => {
    const h = harness([pending(), pending(), approved()])
    const out = await pollDeviceToken({ ...base, deps: h.deps })
    expect(out).toEqual({ kind: 'approved', token: 'jwt', user: { name: 'Ada', email: 'ada@example.com' } })
    expect(h.requests).toHaveLength(3)
    expect(h.sleeps).toEqual([5000, 5000, 5000])
  })

  it('should POST the device code and send the stx User-Agent', async () => {
    const h = harness([approved()])
    await pollDeviceToken({ ...base, deps: h.deps })
    expect(h.requests[0].url).toBe('https://api.test/v1/auth/device-token')
    expect(h.requests[0].init?.method).toBe('POST')
    expect(JSON.parse(String(h.requests[0].init?.body))).toEqual({ deviceCode: 'dc', clientId: 'syntext-cli' })
    expect(new Headers(h.requests[0].init?.headers).get('User-Agent')).toBe(userAgent())
  })

  it('should stop polling with a clear message on 403 access_denied', async () => {
    const h = harness([pending(), json(403, { error: { code: 'access_denied', message: 'The sign-in request was denied' } }), approved()])
    const out = await pollDeviceToken({ ...base, deps: h.deps })
    expect(out.kind).toBe('denied')
    expect(out.kind !== 'approved' && out.message).toBe('Sign-in was denied in the browser. Run `stx login` to try again.')
    expect(h.requests).toHaveLength(2)
  })

  it('should stop polling on 404 (code gone or expired)', async () => {
    const h = harness([json(404, { error: { code: 'not_found', message: 'Device code not found' } }), approved()])
    const out = await pollDeviceToken({ ...base, deps: h.deps })
    expect(out.kind).toBe('not_found')
    expect(out.kind !== 'approved' && out.message).toContain('no longer valid')
    expect(out.kind !== 'approved' && out.message).toContain('stx login')
    expect(h.requests).toHaveLength(1)
  })

  it('should stop with the existing timeout message on 410 expired', async () => {
    const h = harness([json(410, { error: { code: 'expired', message: 'Device code has expired' } })])
    const out = await pollDeviceToken({ ...base, deps: h.deps })
    expect(out).toEqual({ kind: 'expired', message: 'Authentication timed out. Please try again.' })
  })

  it('should add 5 seconds to the interval on slow_down', async () => {
    const h = harness([json(400, { error: { code: 'slow_down' } }), pending(), approved()])
    await pollDeviceToken({ ...base, deps: h.deps })
    expect(h.sleeps).toEqual([5000, 10000, 10000])
  })

  it('should keep polling through a 5xx', async () => {
    const h = harness([json(502, { error: { code: 'internal_error' } }), new Response('bad gateway', { status: 503 }), approved()])
    const out = await pollDeviceToken({ ...base, deps: h.deps })
    expect(out.kind).toBe('approved')
  })

  it('should fail with the server message on another client error', async () => {
    const h = harness([json(401, { error: { code: 'unauthorized', message: 'Account no longer exists' } })])
    const out = await pollDeviceToken({ ...base, deps: h.deps })
    expect(out).toEqual({ kind: 'error', message: 'Account no longer exists' })
  })

  it('should time out at expiresIn when the user never acts', async () => {
    const h = harness([])
    const out = await pollDeviceToken({ ...base, expiresInSec: 12, deps: h.deps })
    expect(out).toEqual({ kind: 'timeout', message: 'Authentication timed out.' })
    expect(h.requests.length).toBeLessThanOrEqual(3)
  })

  it('should default the interval to 5 seconds when the server sends 0', async () => {
    const h = harness([approved()])
    await pollDeviceToken({ ...base, intervalSec: 0, deps: h.deps })
    expect(h.sleeps).toEqual([5000])
  })

  it('should propagate network errors', async () => {
    const h = harness([new Error('ECONNRESET')])
    await expect(pollDeviceToken({ ...base, deps: h.deps })).rejects.toThrow('ECONNRESET')
  })
})
