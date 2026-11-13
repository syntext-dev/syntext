import { apiFetch, type ApiDeps } from './api'

/**
 * Wait for a server-side build to finish (`stx deploy`, `stx build`).
 *
 * Builds of one project run one at a time on the server. When a deploy lands
 * while another build of the project is running — typically the GitHub
 * webhook's build of the latest merge — it waits at `queued` until that one
 * finishes. The backend names the build it waits on as `queuedBehind`, on
 * `POST /deploy` and on `GET /builds/:id`. Time spent queued behind another
 * build has its own, longer budget; the build's own run time is measured from
 * when it leaves the queue. Before this, a deploy gave up after 2 minutes
 * total, often while still queued, and later published anyway.
 */

/** The build a queued build is waiting on, as the backend reports it. */
export type QueuedBehind = {
  buildId: string
  status: string
  trigger: string
  branch?: string | null
  commitSha?: string | null
}

export type BuildWaitResult =
  | { status: 'deployed'; deployUrl?: string; pageCount?: number; durationMs?: number }
  | { status: 'failed' | 'cancelled' | 'timeout'; error: string }

type BuildBody = {
  status: string
  deployUrl?: string | null
  pageCount?: number | null
  durationMs?: number | null
  error?: string | null
  queuedBehind?: QueuedBehind | null
}

export type BuildWaitOptions = {
  apiUrl: string
  token: string
  projectId: string
  buildId: string
  /** What the build was queued behind when it was created (`POST /deploy`). */
  queuedBehind?: QueuedBehind | null
  /** Spinner text for each status; anything else shows "Status: x". */
  labels?: Record<string, string>
  onProgress?: (text: string) => void
  /** Longest wait while queued behind other builds. Default 20 minutes. */
  queueTimeoutMs?: number
  /** Longest wait once the build itself is running. Default 10 minutes. */
  buildTimeoutMs?: number
  pollIntervalMs?: number
  fetchImpl?: ApiDeps['fetchImpl']
  sleep?: (ms: number) => Promise<unknown>
  now?: () => number
}

export const QUEUE_TIMEOUT_MS = 20 * 60_000
export const BUILD_TIMEOUT_MS = 10 * 60_000

const TRIGGERS: Record<string, string> = {
  push: 'a push',
  github_app: 'a push',
  pull_request: 'a pull request',
  cli_upload: 'stx deploy',
  manual: 'a manual build',
  rollback: 'a rollback',
  schedule: 'a scheduled build',
}

/** "Waiting for build 1a2b3c4d (a push, commit abc1234, compiling) to finish" */
export function describeQueuedBehind(q: QueuedBehind): string {
  const parts = [TRIGGERS[q.trigger] ?? q.trigger]
  if (q.commitSha) parts.push(`commit ${q.commitSha.slice(0, 7)}`)
  parts.push(q.status)
  return `Waiting for build ${q.buildId.slice(0, 8)} (${parts.join(', ')}) to finish`
}

function minutes(ms: number): string {
  const m = Math.round(ms / 60_000)
  return `${m} minute${m === 1 ? '' : 's'}`
}

export async function waitForBuild(opts: BuildWaitOptions): Promise<BuildWaitResult> {
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? ((ms: number) => Bun.sleep(ms))
  const pollInterval = opts.pollIntervalMs ?? 2_000
  const queueTimeout = opts.queueTimeoutMs ?? QUEUE_TIMEOUT_MS
  const buildTimeout = opts.buildTimeoutMs ?? BUILD_TIMEOUT_MS
  const id = opts.buildId.slice(0, 8)

  const start = now()
  let runningSince: number | null = null
  let lastStatus = 'queued'
  let behind = opts.queuedBehind ?? null
  if (behind) opts.onProgress?.(`${describeQueuedBehind(behind)}...`)

  for (;;) {
    const res = await apiFetch(
      `${opts.apiUrl}/v1/projects/${opts.projectId}/builds/${opts.buildId}`,
      { headers: { Authorization: `Bearer ${opts.token}` } },
      { fetchImpl: opts.fetchImpl },
    )

    if (res.ok) {
      const { data: build } = (await res.json()) as { data: BuildBody }
      lastStatus = build.status

      if (build.status === 'deployed') {
        return {
          status: 'deployed',
          deployUrl: build.deployUrl || undefined,
          pageCount: build.pageCount || undefined,
          durationMs: build.durationMs || undefined,
        }
      }
      if (build.status === 'failed') return { status: 'failed', error: build.error || 'Build failed' }
      if (build.status === 'cancelled') return { status: 'cancelled', error: build.error || 'Build was cancelled; nothing was published' }

      if (build.status === 'queued' || build.status === 'uploading') {
        behind = build.queuedBehind ?? null
        opts.onProgress?.(behind ? `${describeQueuedBehind(behind)}...` : (opts.labels?.[build.status] ?? 'Queued...'))
      } else {
        runningSince ??= now()
        opts.onProgress?.(opts.labels?.[build.status] ?? `Status: ${build.status}`)
      }
    }

    const t = now()
    if (runningSince === null && t - start >= queueTimeout) {
      const why = behind ? `, behind build ${behind.buildId.slice(0, 8)}` : ''
      return {
        status: 'timeout',
        error: `Build ${id} is still queued after ${minutes(t - start)}${why}. It stays queued and publishes when it runs; follow it in the dashboard under Deployments.`,
      }
    }
    if (runningSince !== null && t - runningSince >= buildTimeout) {
      return {
        status: 'timeout',
        error: `Build ${id} is still ${lastStatus} after ${minutes(t - runningSince)}. It keeps running on the server and publishes when it finishes; follow it in the dashboard under Deployments.`,
      }
    }

    await sleep(pollInterval)
  }
}
