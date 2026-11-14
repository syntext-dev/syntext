// Copied from syntext-backend src/modules/appearance/resolve.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * Resolve a site's `theme` and `appearance` (syntext.json) into one complete
 * appearance, with the source of every value — what the renderer draws and what
 * the dashboard's Appearance settings show and can reset.
 *
 * Precedence, lowest first (customization.md):
 *   preset → v1 theme mapping → v1 `features` flags → organization theme → `appearance`
 * `themeOverrides` and the legacy `colors`/`fonts` keys apply later, to tokens
 * (modules/theme), unchanged. v1 flags only fill fields `appearance` leaves out.
 *
 * Never throws: a bad value is reported as an issue (with "did you mean") and
 * the value it would have replaced stays.
 */
import { DEFAULT_V2_PRESET, isPresetName, LEGACY_THEMES, PRESET_NAMES, V2_PRESETS, type PresetName } from './presets'
import { didYouMean } from '../syntax/suggest'
import { homeCutoffLabel } from '../syntax/home-cutoff'
import {
  COMPONENT_SWITCHES, DENSITIES, HEX, LAYOUT_SWITCHES, MODES, RADII, SIZES, VALUE_ALIASES, WIDTHS,
  type ComponentValues, type Density, type LayoutValues, type Mode, type Radius, type Size, type Width,
} from './values'

export type AppearanceSource = 'preset' | 'legacy-theme' | 'feature-flag' | 'org-theme' | 'appearance'

export type ResolvedAppearance = {
  preset: PresetName
  accent: { light: string; dark: string }
  mode: Mode
  toggle: boolean
  fonts: { heading: string; body: string; mono: string }
  size: Size
  density: Density
  radius: Radius
  width: Width
  layout: LayoutValues
  components: ComponentValues
  illustrations: boolean
}

export type AppearanceIssue = { path: string; severity: 'error' | 'warning'; message: string }

export type AppearanceResult = {
  /**
   * Whether the site opted in to v2 rendering: it names a v2 preset, uses an
   * organization theme, or has an `appearance` block. When false the renderer
   * must produce exactly the v1 output (decided 2026-11-12: existing sites keep
   * their look until they choose to switch); `appearance` is still filled in so
   * the dashboard can preview what switching would look like.
   */
  v2: boolean
  appearance: ResolvedAppearance
  /** Dotted path (`layout.nav`, `accent.dark`) → where its value came from. */
  sources: Record<string, AppearanceSource>
  issues: AppearanceIssue[]
  /** `@org/slug` when `theme` names an organization theme. */
  orgTheme?: string
}

/** An organization theme, already loaded by the caller: its preset and appearance block. */
export type OrgThemeInput = { preset?: unknown; appearance?: unknown }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const SCALARS = ['accent', 'mode', 'toggle', 'fonts', 'size', 'density', 'radius', 'width', 'layout', 'components', 'illustrations'] as const

function base(preset: PresetName): ResolvedAppearance {
  const p = V2_PRESETS[preset]
  return {
    preset,
    accent: { light: p.accent, dark: p.accent },
    mode: p.mode,
    toggle: true,
    fonts: { ...p.fonts },
    size: p.size,
    density: 'comfortable',
    radius: p.radius,
    width: 'contained',
    layout: { ...p.layout },
    components: { ...p.components },
    illustrations: true,
  }
}

function allPaths(a: ResolvedAppearance): string[] {
  return [
    'accent.light', 'accent.dark', 'mode', 'toggle', 'fonts.heading', 'fonts.body', 'fonts.mono', 'size', 'density', 'radius', 'width',
    ...Object.keys(a.layout).map((k) => `layout.${k}`), ...Object.keys(a.components).map((k) => `components.${k}`), 'illustrations',
  ]
}

/** Apply one `appearance`-shaped block onto `out`, recording sources and issues. */
function apply(out: ResolvedAppearance, block: unknown, source: AppearanceSource, sources: Record<string, AppearanceSource>, issues: AppearanceIssue[], prefix = 'appearance'): void {
  if (block === undefined) return
  if (!isObject(block)) {
    issues.push({ path: prefix, severity: 'error', message: `${prefix} must be an object.` })
    return
  }
  const set = (path: string) => (sources[path] = source)
  const bad = (path: string, message: string) => issues.push({ path: `${prefix}.${path}`, severity: 'error', message })
  const pick = <T extends string | number>(path: string, value: unknown, allowed: readonly T[]): T | undefined => {
    if ((allowed as readonly unknown[]).includes(value)) return value as T
    bad(path, `"${String(value)}" is not a ${path} value. Use one of: ${allowed.join(', ')}.${typeof value === 'string' ? didYouMean(value, allowed.map(String)) : ''}`)
    return undefined
  }

  for (const [key, value] of Object.entries(block)) {
    switch (key) {
      case 'accent': {
        const pair = typeof value === 'string' ? { light: value, dark: value } : isObject(value) ? value : null
        if (!pair) {
          bad('accent', 'accent must be a hex colour like "#0E7A63", or { "light": "…", "dark": "…" }.')
          break
        }
        for (const m of ['light', 'dark'] as const) {
          const c = pair[m]
          if (c === undefined) continue
          if (typeof c === 'string' && HEX.test(c)) {
            out.accent[m] = c
            set(`accent.${m}`)
          } else bad(typeof value === 'string' ? 'accent' : `accent.${m}`, `"${String(c)}" is not a hex colour like "#0E7A63".`)
        }
        break
      }
      case 'mode': { const v = pick('mode', value, MODES); if (v) { out.mode = v; set('mode') } break }
      case 'density': { const v = pick('density', value, DENSITIES); if (v) { out.density = v; set('density') } break }
      case 'radius': { const v = pick('radius', value, RADII); if (v) { out.radius = v; set('radius') } break }
      case 'width': { const v = pick('width', value, WIDTHS); if (v) { out.width = v; set('width') } break }
      case 'size': { const v = pick('size', value, SIZES); if (v) { out.size = v; set('size') } break }
      case 'toggle':
      case 'illustrations':
        if (typeof value === 'boolean') {
          out[key] = value
          set(key)
        } else bad(key, `${key} must be true or false.`)
        break
      case 'fonts':
        if (!isObject(value)) { bad('fonts', 'fonts must be an object: { "heading", "body", "mono" }.'); break }
        for (const [f, name] of Object.entries(value)) {
          if (f !== 'heading' && f !== 'body' && f !== 'mono') { bad(`fonts.${f}`, `Unknown font role "${f}". Use heading, body or mono.${didYouMean(f, ['heading', 'body', 'mono'])}`); continue }
          if (typeof name === 'string' && name.trim()) { out.fonts[f] = name.trim(); set(`fonts.${f}`) } else bad(`fonts.${f}`, 'A font must be a family name.')
        }
        break
      case 'layout':
      case 'components': {
        const switches = (key === 'layout' ? LAYOUT_SWITCHES : COMPONENT_SWITCHES) as Record<string, readonly string[]>
        const target = out[key] as Record<string, string>
        if (!isObject(value)) { bad(key, `${key} must be an object.`); break }
        for (const [sw, raw] of Object.entries(value)) {
          const allowed = switches[sw]
          if (!allowed) { bad(`${key}.${sw}`, `Unknown ${key} switch "${sw}".${didYouMean(sw, Object.keys(switches))}`); continue }
          const v = typeof raw === 'string' ? (VALUE_ALIASES[`${key}.${sw}`]?.[raw] ?? raw) : raw
          if (typeof v === 'string' && allowed.includes(v)) { target[sw] = v; set(`${key}.${sw}`) }
          else bad(`${key}.${sw}`, `"${String(raw)}" is not a ${key}.${sw} value. Use one of: ${allowed.join(', ')}.${typeof raw === 'string' ? didYouMean(raw, allowed) : ''}`)
        }
        break
      }
      default:
        issues.push({ path: `${prefix}.${key}`, severity: 'error', message: `Unknown appearance key "${key}".${didYouMean(key, SCALARS)}` })
    }
  }
}

/** v1 `features` flags, mapped onto the fields they used to control (customization.md table). */
function featureFlags(features: unknown): Record<string, unknown> {
  if (!isObject(features)) return {}
  const f = features
  const layout: Record<string, string> = {}
  const components: Record<string, string> = {}
  const out: Record<string, unknown> = {}
  if (f.navStyle === 'split') layout.header = 'tabs'
  if (f.navStyle === 'single') layout.header = 'simple'
  if (f.sidebarStyle === 'collapsible') layout.nav = 'chevrons'
  if (f.sidebarStyle === 'flat') layout.nav = 'plain'
  if (f.codeBlockStyle === 'pill') components.code = 'dark'
  if (f.codeBlockStyle === 'panel') components.code = 'inset'
  if (f.shellWidth === 'contained' || f.shellWidth === 'full') out.width = f.shellWidth
  if (typeof f.themeToggle === 'boolean') out.toggle = f.themeToggle
  if (Object.keys(layout).length) out.layout = layout
  if (Object.keys(components).length) out.components = components
  return out
}

/** Drop from `flags` every field `appearance` sets, so flags never win over it. */
function withoutSetFields(flags: Record<string, unknown>, appearance: unknown): Record<string, unknown> {
  if (!isObject(appearance)) return flags
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(flags)) {
    if (isObject(v) && isObject(appearance[k])) {
      const rest = Object.fromEntries(Object.entries(v).filter(([sk]) => !(sk in (appearance[k] as Record<string, unknown>))))
      if (Object.keys(rest).length) out[k] = rest
    } else if (!(k in appearance)) out[k] = v
  }
  return out
}

/** The warning for `appearance.layout.home` (the date is modules/deprecations/home-cutoff.ts). */
export const LAYOUT_HOME_DEPRECATED = `appearance.layout.home is deprecated and stops working on ${homeCutoffLabel()}: the home blocks will then follow the preset. Remove it.`

export function resolveAppearance(config: unknown, opts: { orgTheme?: OrgThemeInput } = {}): AppearanceResult {
  const cfg = isObject(config) ? config : {}
  const issues: AppearanceIssue[] = []
  const sources: Record<string, AppearanceSource> = {}
  const rawTheme = typeof cfg.theme === 'string' ? cfg.theme.trim() : ''
  let preset: PresetName = DEFAULT_V2_PRESET
  let legacy: Record<string, unknown> | undefined
  let orgTheme: string | undefined

  if (rawTheme.startsWith('@')) {
    orgTheme = rawTheme
    const p = opts.orgTheme?.preset
    if (typeof p === 'string' && isPresetName(p)) preset = p
    if (!opts.orgTheme) issues.push({ path: 'theme', severity: 'warning', message: `Organization theme ${rawTheme} was not found; using the ${V2_PRESETS[preset].label} preset.` })
  } else if (rawTheme && isPresetName(rawTheme)) {
    preset = rawTheme
  } else if (rawTheme && LEGACY_THEMES[rawTheme]) {
    preset = LEGACY_THEMES[rawTheme].preset
    legacy = LEGACY_THEMES[rawTheme].appearance
  } else if (rawTheme) {
    issues.push({ path: 'theme', severity: 'warning', message: `Unknown theme "${rawTheme}"; using ${V2_PRESETS[preset].label}.${didYouMean(rawTheme, PRESET_NAMES)}` })
  }

  const out = base(preset)
  for (const p of allPaths(out)) sources[p] = 'preset'
  apply(out, legacy, 'legacy-theme', sources, issues, 'theme')
  apply(out, withoutSetFields(featureFlags(cfg.features), cfg.appearance), 'feature-flag', sources, [], 'features')
  if (opts.orgTheme?.appearance !== undefined) apply(out, opts.orgTheme.appearance, 'org-theme', sources, issues, `theme ${rawTheme}`)
  apply(out, cfg.appearance, 'appearance', sources, issues)
  // Deprecated with the generated home (home-as-content.md): still applied until the cut-off, then
  // ignored with this warning. Wherever it is stored (syntext.json, settings, an org theme), never an error.
  if (sources['layout.home'] === 'appearance' || sources['layout.home'] === 'org-theme') {
    issues.push({ path: 'appearance.layout.home', severity: 'warning', message: LAYOUT_HOME_DEPRECATED })
  }

  const v2 = Boolean(orgTheme) || (rawTheme !== '' && isPresetName(rawTheme)) || cfg.appearance !== undefined
  return { v2, appearance: out, sources, issues, ...(orgTheme ? { orgTheme } : {}) }
}
