import pkg from '../../package.json'
import {
  loadCredentials as loadStoredCredentials,
  clearCredentials as clearStoredCredentials,
  type Credentials,
} from './credentials'

/** The CLI version, read from package.json so it never drifts from the release. */
export const CLI_VERSION: string = pkg.version

/**
 * `stx/<version> (<platform>; <arch>)`. The backend parses the `stx/<version>`
 * prefix and the platform to name the session ("stx CLI · macOS", "stx 0.6.5")
 * in the dashboard's sessions list and on the device consent screen.
 */
export function userAgent(
  platform: string = process.platform,
  arch: string = process.arch,
  version: string = CLI_VERSION,
): string {
  return `stx/${version} (${platform}; ${arch})`
}

export type ApiDeps = {
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>
  loadCredentials?: () => Promise<Credentials | null>
  clearCredentials?: () => Promise<void>
}

/**
 * Thrown when the backend answers 401 `session_revoked`: the session was signed
 * out from the dashboard, by a password change, or by "sign out everywhere".
 * `cleared` says whether the stored credentials were the revoked token and were
 * removed (a token passed with `--token` leaves the stored login alone).
 */
export class SessionRevokedError extends Error {
  readonly code = 'session_revoked'
  readonly cleared: boolean

  constructor(cleared: boolean) {
    super(
      cleared
        ? 'Your Syntext session was signed out (revoked from the dashboard or by a password change). Stored credentials were removed. Run `stx login` to sign in again.'
        : 'This token\'s session was signed out (revoked from the dashboard or by a password change). Run `stx login` to sign in again, or pass a current token.',
    )
    this.name = 'SessionRevokedError'
    this.cleared = cleared
  }
}

export function isSessionRevokedError(err: unknown): err is SessionRevokedError {
  return err instanceof SessionRevokedError
}

function bearerToken(headers: Headers): string | null {
  const auth = headers.get('authorization')
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null
}

async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.clone().json()) as { error?: { code?: unknown } }
    return typeof body?.error?.code === 'string' ? body.error.code : undefined
  } catch {
    return undefined
  }
}

/**
 * `fetch` for every backend call. Adds the stx `User-Agent`, and turns a 401
 * `session_revoked` into a {@link SessionRevokedError} after clearing the stored
 * credentials when they hold the token that was rejected. Every other response,
 * including other 401s, is returned untouched for the caller to handle.
 */
export async function apiFetch(url: string, init: RequestInit = {}, deps: ApiDeps = {}): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const headers = new Headers(init.headers)
  headers.set('User-Agent', userAgent())

  const res = await fetchImpl(url, { ...init, headers })

  if (res.status === 401 && (await errorCode(res)) === 'session_revoked') {
    const load = deps.loadCredentials ?? loadStoredCredentials
    const clear = deps.clearCredentials ?? clearStoredCredentials
    const sent = bearerToken(headers)
    const stored = await load().catch(() => null)
    const cleared = !!stored?.token && (sent === null || stored.token === sent)
    if (cleared) await clear()
    throw new SessionRevokedError(cleared)
  }

  return res
}

/** The `--json` error shape: `{ success: false, error, code? }`. */
export function jsonError(err: unknown): { success: false; error: string; code?: string } {
  const message = err instanceof Error ? err.message : String(err)
  return isSessionRevokedError(err)
    ? { success: false, error: message, code: err.code }
    : { success: false, error: message }
}
