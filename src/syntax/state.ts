// Copied from syntext-backend src/modules/deprecations/state.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * Where a deprecation stands for a build: before notice and during the
 * two-week window it warns; after the window it fails the build with the fix.
 */

export const NOTICE_WINDOW_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

export type DeprecationPhase = 'warning' | 'window' | 'removed'

export function removedAtFor(noticeAt: Date | null | undefined): Date | null {
  return noticeAt ? new Date(noticeAt.getTime() + NOTICE_WINDOW_DAYS * DAY_MS) : null
}

/**
 * `warning` before any notice; `window` from the notice until two weeks later;
 * `removed` after. A form that `requiresV2` is never `removed` for a v1 site:
 * its replacement only exists in the v2 renderer, so failing the build would
 * force a renderer switch rather than a rename.
 */
export function deprecationPhase(noticeAt: Date | null | undefined, now: Date, opts: { requiresV2?: boolean; siteIsV2?: boolean } = {}): DeprecationPhase {
  const removedAt = removedAtFor(noticeAt)
  if (!noticeAt || !removedAt) return 'warning'
  if (now.getTime() < removedAt.getTime()) return 'window'
  if (opts.requiresV2 && !opts.siteIsV2) return 'window'
  return 'removed'
}
