import { join } from 'node:path'
import { readFile, access } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'

const CONFIG_FILE_NAMES = [
  'syntext.json', 'syntext.yaml', 'syntext.yml',
  'stx.json', 'stx.yaml', 'stx.yml',
  'syntext.config.ts', 'syntext.config.js', 'syntext.config.json',
]

/**
 * Per-token theme overrides applied on top of the `theme` preset.
 * Mirrors the token contract in `apps/backend/src/modules/theme`.
 */
export type ThemeOverrides = {
  fonts?: {
    display?: string | { family?: string; weights?: number[]; fallback?: string }
    body?: string | { family?: string; weights?: number[]; fallback?: string }
    mono?: string | { family?: string; weights?: number[]; fallback?: string }
  }
  colors?: {
    light?: Record<string, string>
    dark?: Record<string, string>
  }
  typography?: Record<
    string,
    { font?: 'display' | 'body' | 'mono'; weight?: number; size?: number; lineHeight?: number; letterSpacing?: number }
  >
  radius?: { sm?: number; md?: number; lg?: number; xl?: number; full?: number }
  shadow?: {
    light?: { sm?: string; md?: string; lg?: string }
    dark?: { sm?: string; md?: string; lg?: string }
  }
}

export type SyntextConfig = {
  name?: string
  projectId?: string
  /** Theme preset name — resolved server-side. Unknown names warn and fall back. */
  theme?: string
  /** Per-token overrides applied on top of the preset. */
  themeOverrides?: ThemeOverrides
  /**
   * Legacy colour shorthand, applied after `themeOverrides` so existing sites
   * are unaffected by adding a preset. `accent` maps to `accent-strong`.
   */
  colors?: {
    primary?: string
    accent?: string
    background?: string
  }
  /**
   * @deprecated Use `themeOverrides.fonts` instead, which maps to the theme's
   * display/body/mono roles. `heading` is normalised to `display` by
   * `normalizeLegacyFonts` on load.
   */
  fonts?: {
    heading?: string
    body?: string
    mono?: string
  }
  navigation?: {
    tabs?: string[]
    sidebar?: SidebarOverride[]
  }
  logo?: {
    light?: string
    dark?: string
  }
  favicon?: string
  footer?: {
    links?: Array<{ label: string; href: string }>
    copyright?: string
    socials?: Array<{ platform: string; url: string }>
  }
  banner?: {
    text?: string
    dismissible?: boolean
    link?: { label: string; href: string }
  }
  customCSS?: string[]
  customJS?: string[]
  redirects?: Array<{ from: string; to: string; status?: number }>
  i18n?: {
    defaultLocale?: string
    locales?: Array<{ code: string; label: string; dir?: 'ltr' | 'rtl' }>
  }
  versioning?: {
    versions?: Array<{
      label: string
      branch?: string
      tag?: string
      default?: boolean
      deprecated?: boolean
      deprecationMessage?: string
      autoRedirectToLatest?: boolean
    }>
  }
}

export type SidebarOverride = {
  group: string
  pages: Array<string | { title: string; slug: string; icon?: string }>
}

/**
 * Fold the deprecated top-level `fonts` block into `themeOverrides.fonts`.
 *
 * `fonts` was declared here for a long time but never consumed by anything, so
 * setting it silently did nothing. It now maps onto the theme's font roles —
 * `heading` becomes `display`, since that is what the token contract calls it.
 * Explicit `themeOverrides.fonts` always wins over the legacy block.
 */
export function normalizeLegacyFonts(config: SyntextConfig): SyntextConfig {
  const legacy = config.fonts
  if (!legacy) return config

  const mapped: NonNullable<ThemeOverrides['fonts']> = {}
  if (legacy.heading) mapped.display = legacy.heading
  if (legacy.body) mapped.body = legacy.body
  if (legacy.mono) mapped.mono = legacy.mono
  if (Object.keys(mapped).length === 0) return config

  return {
    ...config,
    themeOverrides: {
      ...config.themeOverrides,
      fonts: { ...mapped, ...config.themeOverrides?.fonts },
    },
  }
}

export async function loadConfig(rootDir: string): Promise<SyntextConfig> {
  const configPaths = CONFIG_FILE_NAMES.map(f => join(rootDir, f))

  for (const configPath of configPaths) {
    try {
      const file = Bun.file(configPath)
      if (await file.exists()) {
        if (configPath.endsWith('.json')) {
          return normalizeLegacyFonts(JSON.parse(await readFile(configPath, 'utf-8')))
        }
        if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
          const content = await readFile(configPath, 'utf-8')
          return normalizeLegacyFonts(parseYaml(content) as SyntextConfig)
        }
        // For TS/JS configs, import them
        const mod = await import(configPath)
        return normalizeLegacyFonts(mod.default ?? mod)
      }
    } catch {
      continue
    }
  }

  // Return defaults
  return {
    name: 'Documentation',
    theme: 'default',
    colors: { primary: '#6366f1', accent: '#8b5cf6' },
  }
}

// Export for use in syntext init
export function defineConfig(config: SyntextConfig): SyntextConfig {
  return config
}

/**
 * Check if a config file exists in the given directory.
 */
export async function configFileExists(rootDir: string): Promise<boolean> {
  for (const file of CONFIG_FILE_NAMES) {
    try {
      await access(join(rootDir, file))
      return true
    } catch {
      continue
    }
  }
  return false
}
