/**
 * Load an organization theme (`"theme": "@acme/brand"` or `"@acme/brand@3"`)
 * for `stx check --explain appearance`, the way the build does
 * (syntext-backend `services/org-themes.ts` `loadOrgTheme`), through the API:
 *
 *   GET /v1/orgs                           → the org id for the slug
 *   GET /v1/orgs/:id/themes/:slug          → the latest version
 *   GET /v1/orgs/:id/themes/:slug/versions → a pinned version
 *
 * Needs a login. Without one, or without a network, it says the theme could
 * not be resolved offline rather than guessing.
 */
import { apiFetch } from '../lib/api'
import { parseOrgThemeRef } from './org-theme-ref'

export type FetchedOrgTheme = {
  ref: string
  slug: string
  version: number
  pinned: boolean
  preset: string
  appearance: Record<string, unknown>
  themeOverrides: Record<string, unknown>
}

export type OrgThemeFetch =
  | { ok: true; theme: FetchedOrgTheme }
  | { ok: false; reason: 'offline' | 'invalid' | 'not-found' | 'error'; message: string }

export type OrgThemeDeps = {
  apiUrl: string
  token: string | null | undefined
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const obj = (v: unknown): Record<string, unknown> => (isObject(v) ? v : {})

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

export async function fetchOrgTheme(ref: string, deps: OrgThemeDeps): Promise<OrgThemeFetch> {
  const parsed = parseOrgThemeRef(ref)
  if (!parsed) return { ok: false, reason: 'invalid', message: `"${ref}" is not a valid organization theme reference. Use "@<org>/<theme>" or "@<org>/<theme>@<version>".` }
  const name = `@${parsed.org}/${parsed.slug}`
  const offline = `Organization theme ${name} could not be resolved offline.`
  if (!deps.token) return { ok: false, reason: 'offline', message: `${offline} Run \`stx login\` to fetch it.` }

  const base = deps.apiUrl.replace(/\/+$/, '')
  const get = async (path: string): Promise<unknown | null> => {
    const res = await apiFetch(`${base}${path}`, { headers: { Authorization: `Bearer ${deps.token}` } }, deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {})
    if (res.status === 404) return null
    if (!res.ok) throw new HttpError(res.status)
    return obj(await res.json()).data
  }

  try {
    const orgs = await get('/v1/orgs')
    const org = (Array.isArray(orgs) ? orgs : []).map(obj).find((o) => o.slug === parsed.org)
    if (!org || typeof org.id !== 'string') {
      return { ok: false, reason: 'not-found', message: `Organization theme ${name}: you are not a member of an organization with the slug "${parsed.org}".` }
    }
    const themePath = `/v1/orgs/${encodeURIComponent(org.id)}/themes/${encodeURIComponent(parsed.slug)}`
    const latest = obj(await get(themePath))
    if (typeof latest.version !== 'number') return { ok: false, reason: 'not-found', message: `Organization theme ${name} was not found.` }

    let content = latest
    if (parsed.version !== null && parsed.version !== latest.version) {
      const versions = await get(`${themePath}/versions`)
      const pinned = (Array.isArray(versions) ? versions : []).map(obj).find((v) => v.version === parsed.version)
      if (!pinned) return { ok: false, reason: 'not-found', message: `Organization theme ${name} has no version ${parsed.version} (latest is ${latest.version}).` }
      content = pinned
    }
    return {
      ok: true,
      theme: {
        ref,
        slug: parsed.slug,
        version: content.version as number,
        pinned: parsed.version !== null,
        preset: typeof content.preset === 'string' ? content.preset : '',
        appearance: obj(content.appearance),
        themeOverrides: obj(content.themeOverrides),
      },
    }
  } catch (err) {
    if (err instanceof HttpError) return { ok: false, reason: 'error', message: `Could not load organization theme ${name}: the API answered ${err.status}.` }
    const reason = err instanceof Error ? err.message : String(err)
    if (err instanceof Error && err.name === 'SessionRevokedError') return { ok: false, reason: 'error', message: reason }
    return { ok: false, reason: 'offline', message: `${offline} (${reason})` }
  }
}
