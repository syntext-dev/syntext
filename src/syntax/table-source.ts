/**
 * The deprecation table `stx migrate` applies: the published one
 * (`GET /v1/schema/deprecations.json`) when it is reachable, so a CLI built
 * before a rename still learns it, otherwise the copy bundled in the binary.
 */
import { userAgent } from '../lib/api'
import { deprecationTable, type DeprecationTable } from './table'

export const DEFAULT_API_URL = 'https://api.syntext.dev'
export const DEPRECATIONS_PATH = '/v1/schema/deprecations.json'
export const DEPRECATIONS_URL = `${DEFAULT_API_URL}${DEPRECATIONS_PATH}`

export type TableItem = DeprecationTable['items'][number]
export type LoadedTable = { table: DeprecationTable; source: 'remote' | 'bundled'; warning?: string }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The table when `body` has the published shape; items without a code or a rewrite are dropped. */
export function parseDeprecationTable(body: unknown): DeprecationTable | null {
  if (!isObject(body) || body.version !== 1 || !Array.isArray(body.items)) return null
  const items = body.items.filter((i): i is TableItem =>
    isObject(i) && typeof i.code === 'string' && typeof i.kind === 'string' && isObject(i.rewrite) && typeof i.rewrite.type === 'string')
  return { version: 1, windowDays: typeof body.windowDays === 'number' ? body.windowDays : 14, items }
}

export async function loadDeprecationTable(opts: {
  offline?: boolean
  apiUrl?: string
  timeoutMs?: number
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
} = {}): Promise<LoadedTable> {
  const bundled = deprecationTable()
  if (opts.offline) return { table: bundled, source: 'bundled' }
  const base = (opts.apiUrl ?? process.env.SYNTEXT_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '')
  const url = `${base}${DEPRECATIONS_PATH}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 3000)
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, { signal: controller.signal, headers: { 'User-Agent': userAgent(), Accept: 'application/json' } })
    if (!res.ok) return { table: bundled, source: 'bundled', warning: `Could not refresh the deprecation table (${url} answered ${res.status}); using the one bundled with stx.` }
    const table = parseDeprecationTable(await res.json())
    if (!table) return { table: bundled, source: 'bundled', warning: `${url} did not return a deprecation table; using the one bundled with stx.` }
    return { table, source: 'remote' }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { table: bundled, source: 'bundled', warning: `Could not refresh the deprecation table (${reason}); using the one bundled with stx.` }
  } finally {
    clearTimeout(timer)
  }
}
