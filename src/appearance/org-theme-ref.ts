// Copied from syntext-backend src/modules/appearance/org-theme-ref.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * Organization theme references in syntext.json `theme`:
 *
 *   "@acme/brand"    follows the latest version
 *   "@acme/brand@3"  stays on version 3
 *
 * `acme` is the organization's slug. The build only ever resolves a reference
 * against the project's own organization, so naming another org's slug finds
 * nothing (tenant isolation), and the build falls back to the preset.
 */

export type OrgThemeRef = { org: string; slug: string; version: number | null }

// Organization slugs are `^[a-z0-9-]+$` (routes/orgs.ts), so hyphens may lead or trail.
const ORG = '[a-z0-9-]{1,64}'
const SLUG = '[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?'
const REF = new RegExp(`^@(${ORG})/(${SLUG})(?:@([1-9][0-9]{0,8}))?$`)
const THEME_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/

export function parseOrgThemeRef(value: unknown): OrgThemeRef | null {
  if (typeof value !== 'string') return null
  const m = REF.exec(value.trim())
  if (!m) return null
  return { org: m[1]!, slug: m[2]!, version: m[3] ? Number(m[3]) : null }
}

export function formatOrgThemeRef(org: string, slug: string, version?: number | null): string {
  return `@${org}/${slug}${version ? `@${version}` : ''}`
}

/** A theme slug: lower-case letters, digits and inner hyphens, at most 48 characters. */
export function isThemeSlug(value: string): boolean {
  return THEME_SLUG.test(value)
}

export function slugifyThemeName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return slug || 'theme'
}
