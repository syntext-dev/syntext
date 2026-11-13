/**
 * The generated docs home's deprecation warnings (home-as-content.md), worded
 * as the hosted build words them. The backend's renderer writes these
 * (`services/v2/home-deprecation.ts` `homeDeprecationWarning`), not its syntax
 * pass (registry `reportedByRenderer`); `stx check` has no renderer, so it
 * writes them here. Keep the date and wording in step with that file.
 */

/** The last day the generated home renders without opting in. */
export const HOME_CUTOFF = '2026-11-27'

/** "27 November 2026". */
export function homeCutoffLabel(iso = HOME_CUTOFF): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const HOW = 'Convert it to components with Appearance › Convert home to content in the dashboard (or `stx migrate`)'

/** The warning for a `frontmatter.home` or `frontmatter.implicit-home` use; undefined for any other code. */
export function homeDeprecationWarning(code: string): string | undefined {
  const date = homeCutoffLabel()
  if (code === 'frontmatter.home') {
    return `\`home\` frontmatter is deprecated: the generated home it builds stops on ${date}, and index.mdx will then show only its own content. ${HOW}, which writes the same blocks as MDX components.`
  }
  if (code === 'frontmatter.implicit-home') {
    return `This index page shows the generated docs home, which stops on ${date}: index.mdx will then show only its own content. ${HOW} to keep this look, or add \`home: false\` to switch now.`
  }
  return undefined
}
