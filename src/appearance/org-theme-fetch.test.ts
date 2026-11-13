import { describe, it, expect } from 'bun:test'
import { fetchOrgTheme } from './org-theme-fetch'

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function api(routes: Record<string, Route>) {
  const calls: Array<{ url: string; auth: string | null }> = []
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get('authorization') })
    const path = url.replace('https://api.test', '')
    const route = routes[path]
    return route ? route(url, init) : json(404, { error: { code: 'not_found', message: 'Not found' } })
  }
  return { calls, fetchImpl }
}

const theme = { slug: 'brand', name: 'Brand', version: 3, preset: 'paper', appearance: { accent: '#0E7A63' }, themeOverrides: {} }
const orgs = () => json(200, { data: [{ id: 'org_1', slug: 'acme' }, { id: 'org_2', slug: 'other' }] })
const base = { apiUrl: 'https://api.test', token: 'tok' }

describe('fetchOrgTheme', () => {
  it('should load the latest version for an unpinned reference', async () => {
    const { calls, fetchImpl } = api({ '/v1/orgs': orgs, '/v1/orgs/org_1/themes/brand': () => json(200, { data: theme }) })
    const r = await fetchOrgTheme('@acme/brand', { ...base, fetchImpl })
    expect(r).toEqual({ ok: true, theme: { ref: '@acme/brand', slug: 'brand', version: 3, pinned: false, preset: 'paper', appearance: { accent: '#0E7A63' }, themeOverrides: {} } })
    expect(calls.every((c) => c.auth === 'Bearer tok')).toBe(true)
  })

  it('should load a pinned version from the history', async () => {
    const { fetchImpl } = api({
      '/v1/orgs': orgs,
      '/v1/orgs/org_1/themes/brand': () => json(200, { data: theme }),
      '/v1/orgs/org_1/themes/brand/versions': () => json(200, { data: [{ version: 3, preset: 'paper', appearance: {}, themeOverrides: {} }, { version: 2, preset: 'atlas', appearance: { mode: 'dark' }, themeOverrides: {} }] }),
    })
    const r = await fetchOrgTheme('@acme/brand@2', { ...base, fetchImpl })
    expect(r.ok && r.theme).toMatchObject({ version: 2, pinned: true, preset: 'atlas', appearance: { mode: 'dark' } })
  })

  it('should say so when the pinned version does not exist', async () => {
    const { fetchImpl } = api({
      '/v1/orgs': orgs,
      '/v1/orgs/org_1/themes/brand': () => json(200, { data: theme }),
      '/v1/orgs/org_1/themes/brand/versions': () => json(200, { data: [{ version: 3, preset: 'paper' }] }),
    })
    const r = await fetchOrgTheme('@acme/brand@9', { ...base, fetchImpl })
    expect(r).toEqual({ ok: false, reason: 'not-found', message: 'Organization theme @acme/brand has no version 9 (latest is 3).' })
  })

  it('should not try without a login', async () => {
    const { calls, fetchImpl } = api({})
    const r = await fetchOrgTheme('@acme/brand', { apiUrl: 'https://api.test', token: null, fetchImpl })
    expect(r).toEqual({ ok: false, reason: 'offline', message: 'Organization theme @acme/brand could not be resolved offline. Run `stx login` to fetch it.' })
    expect(calls).toHaveLength(0)
  })

  it('should report a network failure as offline', async () => {
    const r = await fetchOrgTheme('@acme/brand', { ...base, fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND') } })
    expect(r).toMatchObject({ ok: false, reason: 'offline' })
    expect(!r.ok && r.message).toContain('could not be resolved offline')
  })

  it('should reject a malformed reference', async () => {
    const r = await fetchOrgTheme('@Acme/Brand!', { ...base, fetchImpl: async () => json(200, {}) })
    expect(r).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('should say when the user is not in that organization', async () => {
    const { fetchImpl } = api({ '/v1/orgs': orgs })
    const r = await fetchOrgTheme('@nope/brand', { ...base, fetchImpl })
    expect(r).toEqual({ ok: false, reason: 'not-found', message: 'Organization theme @nope/brand: you are not a member of an organization with the slug "nope".' })
  })

  it('should say when the theme does not exist', async () => {
    const { fetchImpl } = api({ '/v1/orgs': orgs })
    const r = await fetchOrgTheme('@acme/missing', { ...base, fetchImpl })
    expect(r).toEqual({ ok: false, reason: 'not-found', message: 'Organization theme @acme/missing was not found.' })
  })

  it('should report other HTTP errors with the status', async () => {
    const { fetchImpl } = api({ '/v1/orgs': () => json(500, { error: { code: 'internal', message: 'boom' } }) })
    const r = await fetchOrgTheme('@acme/brand', { ...base, fetchImpl })
    expect(r).toMatchObject({ ok: false, reason: 'error' })
    expect(!r.ok && r.message).toContain('500')
  })
})
