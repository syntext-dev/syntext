import { apiFetch, type ApiDeps } from './api'

export type DevicePollDeps = {
  fetchImpl?: ApiDeps['fetchImpl']
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export type DevicePollOptions = {
  apiUrl: string
  deviceCode: string
  clientId: string
  intervalSec: number
  expiresInSec: number
  deps?: DevicePollDeps
}

export type DevicePollResult =
  | { kind: 'approved'; token: string; user: { name: string; email: string } }
  | { kind: 'denied' | 'not_found' | 'expired' | 'timeout' | 'error'; message: string }

type Classification = 'pending' | 'slow_down' | 'denied' | 'not_found' | 'expired' | 'retry' | 'error'

/** RFC 8628 §3.5 slow_down: add 5 seconds to the polling interval. */
const SLOW_DOWN_STEP_MS = 5000

export const DEVICE_MESSAGES = {
  denied: 'Sign-in was denied in the browser. Run `stx login` to try again.',
  notFound: 'This sign-in code is no longer valid (it expired or was removed). Run `stx login` to start again.',
  expired: 'Authentication timed out. Please try again.',
  timeout: 'Authentication timed out.',
} as const

/** How to react to a non-2xx `POST /v1/auth/device-token` answer. */
export function classifyDeviceTokenResponse(status: number, code: string | undefined): Classification {
  if (code === 'authorization_pending') return 'pending'
  if (code === 'slow_down') return 'slow_down'
  if (code === 'access_denied' || status === 403) return 'denied'
  if (code === 'expired' || code === 'expired_token' || status === 410) return 'expired'
  if (status === 404) return 'not_found'
  if (status === 428) return 'pending'
  if (status >= 500 || status === 429) return 'retry'
  return 'error'
}

async function readError(res: Response): Promise<{ code?: string; message?: string }> {
  try {
    const body = (await res.json()) as { error?: { code?: unknown; message?: unknown } }
    return {
      code: typeof body?.error?.code === 'string' ? body.error.code : undefined,
      message: typeof body?.error?.message === 'string' ? body.error.message : undefined,
    }
  } catch {
    return {}
  }
}

/**
 * Polls `POST /v1/auth/device-token` until the browser approves or denies the
 * request, the code disappears or expires, or `expiresInSec` runs out.
 * Network errors propagate to the caller.
 */
export async function pollDeviceToken(options: DevicePollOptions): Promise<DevicePollResult> {
  const sleep = options.deps?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = options.deps?.now ?? Date.now
  const deadline = now() + options.expiresInSec * 1000
  let interval = (options.intervalSec || 5) * 1000

  while (now() < deadline) {
    await sleep(interval)

    const res = await apiFetch(
      `${options.apiUrl}/v1/auth/device-token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceCode: options.deviceCode, clientId: options.clientId }),
      },
      { fetchImpl: options.deps?.fetchImpl },
    )

    if (res.ok) {
      const { data } = (await res.json()) as { data: { token: string; user: { name: string; email: string } } }
      return { kind: 'approved', token: data.token, user: data.user }
    }

    const err = await readError(res)
    switch (classifyDeviceTokenResponse(res.status, err.code)) {
      case 'pending':
      case 'retry':
        continue
      case 'slow_down':
        interval += SLOW_DOWN_STEP_MS
        continue
      case 'denied':
        return { kind: 'denied', message: DEVICE_MESSAGES.denied }
      case 'not_found':
        return { kind: 'not_found', message: DEVICE_MESSAGES.notFound }
      case 'expired':
        return { kind: 'expired', message: DEVICE_MESSAGES.expired }
      case 'error':
        return { kind: 'error', message: err.message ?? `Login failed (HTTP ${res.status})` }
    }
  }

  return { kind: 'timeout', message: DEVICE_MESSAGES.timeout }
}
