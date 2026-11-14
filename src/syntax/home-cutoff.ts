// Copied from syntext-backend src/modules/deprecations/home-cutoff.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * The generated docs home's cut-off (home-as-content.md): the last day an
 * index page that has not opted in still renders the generated home.
 *
 * One constant for every message: build warnings, the registry's fixes, the
 * frontmatter catalogue, MCP authoring hints and the home-change notice email.
 * The notice must give a full 14 days from the day it is sent, so this is the
 * planned send date (17 November 2026, UK) plus 14 days. Scheduling the
 * notice (services/customer-notices.ts) refuses a send date that does not
 * match it, and the send is held if it would start late.
 *
 * The CLI, web dashboard, MCP server and product docs each carry their own
 * copy of this date; keep them in step.
 */
export const HOME_CUTOFF = '2026-12-01'

/** The deprecation codes the home-change notice covers. */
export const HOME_DEPRECATION_CODES = ['frontmatter.home', 'frontmatter.implicit-home', 'config.layout-home'] as const

/** "1 December 2026". */
export function homeCutoffLabel(iso: string = HOME_CUTOFF): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
