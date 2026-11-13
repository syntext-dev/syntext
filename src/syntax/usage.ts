// Copied from syntext-backend src/modules/deprecations/usage.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * One use of a deprecated form, and how the build says so.
 */
import { findDeprecation, type DeprecationKind } from './registry'
import type { DeprecationPhase } from './state'

export type DeprecationUsage = {
  code: string
  kind: DeprecationKind
  /** Path relative to the repository root (config) or the docs root (pages). */
  file: string
  line: number
  /** The deprecated form as this file writes it. */
  old: string
  /** What to write instead, for this file's value. */
  replacement: string
}

const day = (d: Date) => d.toISOString().slice(0, 10)

export function formatUsage(u: DeprecationUsage, opts: { phase: DeprecationPhase; removedAt?: Date | null; siteIsV2?: boolean }): string {
  const d = findDeprecation(u.code)
  const where = `${u.file}:${u.line}`
  if (u.code.endsWith('.unknown-key')) {
    const hint = u.replacement.startsWith('nothing') ? 'Delete it.' : `Did you mean "${u.replacement}"?`
    if (opts.phase === 'removed') return `${where}: Unknown key "${u.old}" is no longer accepted. Fix: ${u.replacement.startsWith('nothing') ? 'delete it' : `rename it to "${u.replacement}"`}.`
    const when = opts.phase === 'window' && opts.removedAt ? ` Unknown keys fail the build from ${day(opts.removedAt)}.` : ''
    return `${where}: Unknown key "${u.old}" is ignored. ${hint}${when}`
  }
  if (opts.phase === 'removed') {
    return `${where}: ${u.old} is no longer supported${opts.removedAt ? ` (removed ${day(opts.removedAt)})` : ''}. Fix: use ${u.replacement}.${d ? ` ${d.fix}` : ''} \`stx migrate\` rewrites it.`
  }
  const when = opts.phase === 'window' && opts.removedAt ? ` and stops working on ${day(opts.removedAt)}` : ''
  const v1 = d?.requiresV2 && opts.siteIsV2 === false ? ' Keep it until the site moves to doc engine v2: adding appearance switches the renderer.' : ''
  return `${where}: ${u.old} is deprecated${when}. Use ${u.replacement} instead.${v1}`
}
