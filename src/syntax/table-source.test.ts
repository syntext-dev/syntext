import { describe, it, expect } from 'bun:test'
import { deprecationTable } from './table'
import { DEPRECATIONS_URL, loadDeprecationTable, parseDeprecationTable } from './table-source'

const okFetch = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('parseDeprecationTable', () => {
  it('should accept the published shape', () => {
    expect(parseDeprecationTable(deprecationTable())?.items.length).toBe(deprecationTable().items.length)
  })

  it('should reject anything that is not a version 1 table', () => {
    expect(parseDeprecationTable(null)).toBeNull()
    expect(parseDeprecationTable({ version: 2, windowDays: 14, items: [] })).toBeNull()
    expect(parseDeprecationTable({ version: 1, windowDays: 14, items: 'x' })).toBeNull()
  })

  it('should drop items without a code or a rewrite', () => {
    const t = parseDeprecationTable({ version: 1, windowDays: 14, items: [{ code: 'a' }, { code: 'b', kind: 'config', rewrite: { type: 'remove-key', path: 'x' } }] })
    expect(t?.items.map((i) => i.code)).toEqual(['b'])
  })
})

describe('loadDeprecationTable', () => {
  it('should use the bundled table when offline is requested', async () => {
    let called = false
    const r = await loadDeprecationTable({ offline: true, fetchImpl: async () => { called = true; return new Response('{}') } })
    expect(called).toBe(false)
    expect(r.source).toBe('bundled')
    expect(r.table.items.length).toBe(deprecationTable().items.length)
  })

  it('should use the published table when it is reachable', async () => {
    const remote = { ...deprecationTable(), items: deprecationTable().items.slice(0, 2) }
    let url = ''
    const r = await loadDeprecationTable({ fetchImpl: async (u) => { url = u; return okFetch(remote)() } })
    expect(url).toBe(DEPRECATIONS_URL)
    expect(r.source).toBe('remote')
    expect(r.table.items.length).toBe(2)
  })

  it('should read the API base URL from the environment', async () => {
    let url = ''
    await loadDeprecationTable({ apiUrl: 'http://localhost:3000/', fetchImpl: async (u) => { url = u; return okFetch(deprecationTable())() } })
    expect(url).toBe('http://localhost:3000/v1/schema/deprecations.json')
  })

  it('should fall back to the bundled table on a network error', async () => {
    const r = await loadDeprecationTable({ fetchImpl: async () => { throw new Error('ENOTFOUND') } })
    expect(r.source).toBe('bundled')
    expect(r.warning).toContain('ENOTFOUND')
  })

  it('should fall back on an HTTP error or a malformed body', async () => {
    expect((await loadDeprecationTable({ fetchImpl: okFetch({}, 503) })).source).toBe('bundled')
    expect((await loadDeprecationTable({ fetchImpl: okFetch({ version: 9 }) })).warning).toContain('did not return a deprecation table')
  })

  it('should give up after the timeout', async () => {
    const r = await loadDeprecationTable({ timeoutMs: 5, fetchImpl: (_u, init) => new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted')))) })
    expect(r.source).toBe('bundled')
  })
})
