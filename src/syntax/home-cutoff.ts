// Copied from syntext-backend src/modules/deprecations/home-cutoff.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * The generated docs home's cut-off (home-as-content.md): from this day (UTC)
 * a v2 build renders every index page as its own content; `home` frontmatter
 * and `appearance.layout.home` are ignored with a warning. Builds before it
 * kept the generated home and warned that it would stop on this date.
 *
 * Brought forward on 16 November 2026 (it was 1 December 2026, the planned
 * notice send date plus 14 days) because no live site used doc engine v2, so
 * nobody needed the notice window. The home-change notice keeps its own stored
 * cut-off; services/customer-notice-send.ts holds a notice whose cut-off no
 * longer matches this constant instead of sending it.
 *
 * One constant for every message: build warnings, the registry's fixes, the
 * frontmatter catalogue, MCP authoring hints and the home-change notice email.
 * The CLI, web dashboard, MCP server and product docs each carry their own
 * copy of this date; keep them in step.
 */
export const HOME_CUTOFF = '2026-11-16'

/** The deprecation codes the home-change notice covers. */
export const HOME_DEPRECATION_CODES = ['frontmatter.home', 'frontmatter.implicit-home', 'config.layout-home'] as const

/** "16 November 2026". */
export function homeCutoffLabel(iso: string = HOME_CUTOFF): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Whether a build at `now` is on or after the cut-off (UTC calendar day). */
export function homeCutoffPassed(now: Date | string = new Date(), cutoff: string = HOME_CUTOFF): boolean {
  const t = typeof now === 'string' ? Date.parse(now) : now.getTime()
  return Number.isFinite(t) && t >= Date.parse(`${cutoff}T00:00:00Z`)
}
