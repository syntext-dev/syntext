/**
 * `stx check --explain appearance`: every resolved appearance value and where
 * it came from, then the tokens that `themeOverrides` and the legacy keys set
 * on top, then the accent contrast.
 *
 * Precedence, lowest first, as the build applies it (syntext-backend
 * `modules/appearance/resolve.ts` and `workers/build.worker.ts`):
 *   values: preset → v1 theme mapping → v1 features flags → organization theme → appearance
 *   tokens: appearance → organization theme's themeOverrides → themeOverrides
 *           (legacy fonts folded in, explicit wins) → legacy colors (last)
 */
import { accentContrast, type ContrastCheck } from './contrast'
import type { FetchedOrgTheme } from './org-theme-fetch'
import type { PresetName } from './presets'
import { resolveAppearance, type AppearanceIssue, type AppearanceSource } from './resolve'
import { pageBackground } from './surfaces'

export type ValueSource = AppearanceSource | 'themeOverrides' | 'legacy'
export type ExplainRow = { path: string; value: string; source: ValueSource; from: string; overriddenBy?: string }
export type OrgThemeStatus = { ref: string; resolved: boolean; version?: number; pinned?: boolean; message?: string }

export type AppearanceExplanation = {
  /** The site renders with doc engine v2. When false, `values` is what switching would look like. */
  v2: boolean
  theme: string | null
  preset: PresetName
  orgTheme?: OrgThemeStatus
  values: ExplainRow[]
  tokens: ExplainRow[]
  contrast: ContrastCheck[]
  issues: AppearanceIssue[]
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const FLAG_FOR: Readonly<Record<string, string>> = {
  'layout.header': 'features.navStyle',
  'layout.nav': 'features.sidebarStyle',
  'components.code': 'features.codeBlockStyle',
  width: 'features.shellWidth',
  toggle: 'features.themeToggle',
}

/** What `colors.primary` sets, per mode (syntext-backend `modules/theme/registry.ts` `applyLegacyColors`). */
function legacyPrimaryRamp(primary: string, mode: 'light' | 'dark'): Record<string, string> {
  const mixTarget = mode === 'light' ? 'black' : 'white'
  const subtleTarget = mode === 'light' ? 'white' : '#09090b'
  const subtlePct = mode === 'light' ? '6%' : '10%'
  return {
    accent: primary,
    'accent-fill': primary,
    'accent-hover': `color-mix(in srgb, ${primary} 85%, ${mixTarget})`,
    'accent-subtle': `color-mix(in srgb, ${primary} ${subtlePct}, ${subtleTarget})`,
    'accent-muted': `color-mix(in srgb, ${primary} 30%, transparent)`,
    'param-name': primary,
  }
}
const LEGACY_FONT_ROLES: Readonly<Record<string, string>> = { heading: 'display', display: 'display', body: 'body', mono: 'mono' }

const show = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (isObject(v) && typeof v.family === 'string') return v.family
  return JSON.stringify(v)
}

/** Leaf token paths of a themeOverrides block; a font spec is one leaf. */
function leaves(block: unknown, prefix: string[] = []): Array<[string, unknown]> {
  if (!isObject(block)) return []
  const out: Array<[string, unknown]> = []
  for (const [k, v] of Object.entries(block)) {
    const path = [...prefix, k]
    if (isObject(v) && !(path[0] === 'fonts' && path.length === 2)) out.push(...leaves(v, path))
    else out.push([path.join('.'), v])
  }
  return out
}

function legacyRows(config: Record<string, unknown>): ExplainRow[] {
  const rows: ExplainRow[] = []
  const colors = isObject(config.colors) ? config.colors : {}
  const add = (path: string, value: unknown, from: string) => rows.push({ path, value: show(value), source: 'legacy', from })
  const primary = colors.primary
  if (typeof primary === 'string' && primary) {
    for (const mode of ['light', 'dark'] as const) {
      for (const [token, value] of Object.entries(legacyPrimaryRamp(primary, mode))) add(`colors.${mode}.${token}`, value, 'colors.primary')
    }
  }
  for (const [key, token] of [['accent', 'accent-strong'], ['background', 'bg-page']] as const) {
    const v = colors[key]
    if (typeof v === 'string' && v) for (const mode of ['light', 'dark']) add(`colors.${mode}.${token}`, v, `colors.${key}`)
  }
  if (isObject(config.fonts)) {
    for (const [key, value] of Object.entries(config.fonts)) {
      const role = LEGACY_FONT_ROLES[key.toLowerCase()]
      if (role && typeof value === 'string' && value.trim()) add(`fonts.${role}`, value.trim(), `fonts.${key}`)
    }
  }
  return rows
}

function tokenRows(config: Record<string, unknown>, org?: FetchedOrgTheme): ExplainRow[] {
  const orgRows: ExplainRow[] = org ? leaves(org.themeOverrides).map(([path, v]) => ({ path, value: show(v), source: 'org-theme', from: org.ref })) : []
  const own: ExplainRow[] = leaves(config.themeOverrides).map(([path, v]) => ({ path, value: show(v), source: 'themeOverrides', from: `themeOverrides.${path}` }))
  const legacy = legacyRows(config)
  const ownPaths = new Map(own.map((r) => [r.path, r.from]))
  for (const r of orgRows) if (ownPaths.has(r.path)) r.overriddenBy = ownPaths.get(r.path)
  for (const r of legacy) {
    // Legacy fonts are folded under themeOverrides.fonts (explicit wins); legacy colours apply after everything.
    if (r.path.startsWith('fonts.') && ownPaths.has(r.path)) r.overriddenBy = ownPaths.get(r.path)
  }
  const legacyColours = new Map(legacy.filter((r) => r.path.startsWith('colors.')).map((r) => [r.path, r.from]))
  for (const r of [...orgRows, ...own]) if (legacyColours.has(r.path)) r.overriddenBy = legacyColours.get(r.path)
  return [...orgRows, ...own, ...legacy]
}

function fromFor(path: string, source: AppearanceSource, ctx: { preset: string; theme: string; orgRef?: string; appearance: unknown }): string {
  switch (source) {
    case 'preset': return `${ctx.preset} preset`
    case 'legacy-theme': return `theme "${ctx.theme}"`
    case 'feature-flag': return FLAG_FOR[path] ?? 'features'
    case 'org-theme': return ctx.orgRef ?? 'organization theme'
    case 'appearance':
      if (path.startsWith('accent.') && isObject(ctx.appearance) && typeof ctx.appearance.accent === 'string') return 'appearance.accent'
      return `appearance.${path}`
  }
}

function valueAt(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => (isObject(v) ? v[k] : undefined), root)
}

export function explainAppearance(config: Record<string, unknown>, opts: { orgTheme?: FetchedOrgTheme; orgThemeError?: string } = {}): AppearanceExplanation {
  const org = opts.orgTheme
  const result = resolveAppearance(config, org ? { orgTheme: { preset: org.preset, appearance: org.appearance } } : {})
  const theme = typeof config.theme === 'string' ? config.theme.trim() : ''
  const a = result.appearance
  const ctx = { preset: a.preset, theme, orgRef: org?.ref ?? result.orgTheme, appearance: config.appearance }
  const values: ExplainRow[] = Object.entries(result.sources).map(([path, source]) => ({ path, value: show(String(valueAt(a, path))), source, from: fromFor(path, source, ctx) }))

  let orgTheme: OrgThemeStatus | undefined
  let issues = result.issues
  if (result.orgTheme) {
    orgTheme = org
      ? { ref: org.ref, resolved: true, version: org.version, pinned: org.pinned }
      : { ref: result.orgTheme, resolved: false, ...(opts.orgThemeError ? { message: opts.orgThemeError } : {}) }
    // The resolver's "was not found" is replaced by the fetch's own reason.
    if (!org) issues = issues.filter((i) => i.path !== 'theme')
  }

  const contrast = accentContrast({ accent: a.accent, background: (mode) => pageBackground(a.preset, mode) })
  return { v2: result.v2, theme: theme || null, preset: a.preset, ...(orgTheme ? { orgTheme } : {}), values, tokens: tokenRows(config, org), contrast, issues }
}
