import { describe, it, expect } from 'bun:test'
import { describeQueuedBehind, waitForBuild, type BuildWaitOptions } from './build-wait'

type Step = Record<string, unknown> | number

/**
 * A fake clock and API: each poll answers the next step (a build body, or an
 * HTTP status to fail with) and every sleep advances the clock. Nothing
 * reaches the network.
 */
function harness(steps: Step[], opts: Partial<BuildWaitOptions> = {}) {
  let clock = 0
  let i = 0
  const progress: string[] = []
  const urls: string[] = []
  const run = waitForBuild({
    apiUrl: 'https://api.test',
    token: 'tok',
    projectId: 'p1',
    buildId: 'build-cli-123456',
    pollIntervalMs: 2_000,
    onProgress: (t) => progress.push(t),
    labels: { compiling: 'Compiling pages...', deploying: 'Deploying to CDN...' },
    fetchImpl: async (url) => {
      urls.push(url)
      const step = steps[Math.min(i++, steps.length - 1)]!
      if (typeof step === 'number') return new Response('{}', { status: step })
      return new Response(JSON.stringify({ data: step }), { status: 200 })
    },
    sleep: async (ms) => {
      clock += ms
    },
    now: () => clock,
    ...opts,
  })
  return { run, progress, urls, elapsed: () => clock }
}

const webhook = { buildId: 'build-webhook-9999', status: 'compiling', trigger: 'push', commitSha: 'abc1234def' }

describe('describeQueuedBehind', () => {
  it('should name the build, what started it, its commit and its status', () => {
    expect(describeQueuedBehind(webhook)).toBe('Waiting for build build-we (a push, commit abc1234, compiling) to finish')
  })

  it('should leave out a missing commit', () => {
    expect(describeQueuedBehind({ buildId: '12345678abc', status: 'deploying', trigger: 'cli_upload' })).toBe(
      'Waiting for build 12345678 (stx deploy, deploying) to finish',
    )
  })
})

describe('waitForBuild', () => {
  it('should keep waiting past 2 minutes while queued behind another build, then succeed', async () => {
    // 3 minutes queued behind the webhook build, then 30s of its own build.
    const queued = Array.from({ length: 90 }, () => ({ status: 'queued', queuedBehind: webhook }))
    const h = harness([...queued, { status: 'compiling' }, ...Array(14).fill({ status: 'compiling' }), { status: 'deployed', deployUrl: 'https://acme-docs.syntext.dev', pageCount: 12, durationMs: 31000 }])
    const r = await h.run
    expect(r).toEqual({ status: 'deployed', deployUrl: 'https://acme-docs.syntext.dev', pageCount: 12, durationMs: 31000 })
    expect(h.elapsed()).toBeGreaterThan(120_000)
    expect(h.progress[0]).toBe('Waiting for build build-we (a push, commit abc1234, compiling) to finish...')
    expect(h.progress).toContain('Compiling pages...')
  })

  it('should show what it is queued behind from the deploy response before the first poll', async () => {
    const h = harness([{ status: 'deployed' }], { queuedBehind: webhook })
    await h.run
    expect(h.progress[0]).toContain('Waiting for build build-we')
  })

  it('should poll this project\'s build', async () => {
    const h = harness([{ status: 'deployed' }])
    await h.run
    expect(h.urls[0]).toBe('https://api.test/v1/projects/p1/builds/build-cli-123456')
  })

  it('should time out the queue wait separately, naming the build it waits on', async () => {
    const h = harness([{ status: 'queued', queuedBehind: webhook }], { queueTimeoutMs: 60_000 })
    const r = await h.run
    expect(r.status).toBe('timeout')
    expect((r as { error: string }).error).toBe(
      'Build build-cl is still queued after 1 minute, behind build build-we. It stays queued and publishes when it runs; follow it in the dashboard under Deployments.',
    )
  })

  it('should measure the build timeout from when the build leaves the queue', async () => {
    const h = harness([...Array(30).fill({ status: 'queued' }), { status: 'compiling' }], { buildTimeoutMs: 10_000 })
    const r = await h.run
    expect(r.status).toBe('timeout')
    expect((r as { error: string }).error).toContain('is still compiling after 0 minutes')
    // 60s queued + 10s running: the queue time did not count against the build.
    expect(h.elapsed()).toBe(70_000)
  })

  it('should report a superseded or cancelled build with the server\'s reason', async () => {
    const r = await harness([{ status: 'cancelled', error: 'Superseded: build b2 was requested later and is already live, so this build did not publish' }]).run
    expect(r).toEqual({ status: 'cancelled', error: 'Superseded: build b2 was requested later and is already live, so this build did not publish' })
  })

  it('should fall back to a generic message for a cancelled build without a reason', async () => {
    const r = await harness([{ status: 'cancelled' }]).run
    expect(r).toEqual({ status: 'cancelled', error: 'Build was cancelled; nothing was published' })
  })

  it('should return the server error for a failed build', async () => {
    expect(await harness([{ status: 'failed', error: 'Invalid syntext.json' }]).run).toEqual({ status: 'failed', error: 'Invalid syntext.json' })
  })

  it('should ride out a failed poll', async () => {
    const r = await harness([503, { status: 'deployed' }]).run
    expect(r.status).toBe('deployed')
  })
})
