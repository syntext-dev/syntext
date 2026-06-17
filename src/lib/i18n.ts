import { join, relative } from 'node:path'
import { readdir, readFile, stat } from 'node:fs/promises'
import type { SyntextConfig } from './config'

export type LocaleConfig = {
  code: string
  label: string
  dir?: 'ltr' | 'rtl'
}

export type I18nConfig = {
  defaultLocale: string
  locales: LocaleConfig[]
}

export type TranslationCoverage = {
  locale: string
  label: string
  totalPages: number
  translatedPages: number
  percentage: number
  missingPages: string[]
}

/**
 * Resolve i18n config from syntext.config. Returns null if i18n not configured.
 */
export function getI18nConfig(config: SyntextConfig): I18nConfig | null {
  if (!config.i18n?.locales?.length) return null
  return {
    defaultLocale: config.i18n.defaultLocale ?? config.i18n.locales[0].code,
    locales: config.i18n.locales,
  }
}

/**
 * Determine which locale a file belongs to based on directory convention.
 * Convention: docs/{locale}/page.mdx (e.g. docs/fr/getting-started.mdx)
 * Files in docs/ directly (no locale prefix) belong to the default locale.
 */
export function resolveFileLocale(relativePath: string, i18nConfig: I18nConfig): string {
  const parts = relativePath.split('/')
  const localeCodes = i18nConfig.locales.map((l) => l.code)

  if (parts.length > 1 && localeCodes.includes(parts[0])) {
    return parts[0]
  }

  return i18nConfig.defaultLocale
}

/**
 * Strip the locale prefix from a file path to get the canonical slug.
 * This allows matching pages across locales for fallback behavior.
 */
export function stripLocalePrefix(relativePath: string, i18nConfig: I18nConfig): string {
  const parts = relativePath.split('/')
  const localeCodes = i18nConfig.locales.map((l) => l.code)

  if (parts.length > 1 && localeCodes.includes(parts[0])) {
    return parts.slice(1).join('/')
  }

  return relativePath
}

/**
 * Given a slug and target locale, resolve the actual file path.
 * Falls back to default locale if the translation doesn't exist.
 */
export async function resolveLocalizedPath(
  docsDir: string,
  slug: string,
  targetLocale: string,
  i18nConfig: I18nConfig,
): Promise<{ path: string; locale: string; isFallback: boolean }> {
  // Try the target locale first
  const localizedCandidates = [
    join(docsDir, targetLocale, `${slug}.mdx`),
    join(docsDir, targetLocale, `${slug}.md`),
    join(docsDir, targetLocale, slug, 'index.mdx'),
    join(docsDir, targetLocale, slug, 'index.md'),
  ]

  for (const candidate of localizedCandidates) {
    try {
      await stat(candidate)
      return { path: candidate, locale: targetLocale, isFallback: false }
    } catch {
      continue
    }
  }

  // Fallback to default locale
  if (targetLocale !== i18nConfig.defaultLocale) {
    const fallbackCandidates = [
      join(docsDir, `${slug}.mdx`),
      join(docsDir, `${slug}.md`),
      join(docsDir, slug, 'index.mdx'),
      join(docsDir, slug, 'index.md'),
      join(docsDir, i18nConfig.defaultLocale, `${slug}.mdx`),
      join(docsDir, i18nConfig.defaultLocale, `${slug}.md`),
    ]

    for (const candidate of fallbackCandidates) {
      try {
        await stat(candidate)
        return { path: candidate, locale: i18nConfig.defaultLocale, isFallback: true }
      } catch {
        continue
      }
    }
  }

  // Last resort: the slug directly in docs root
  const rootPath = join(docsDir, `${slug}.mdx`)
  return { path: rootPath, locale: i18nConfig.defaultLocale, isFallback: targetLocale !== i18nConfig.defaultLocale }
}

/**
 * Compute translation coverage for all configured locales.
 * Scans the docs directory and compares page counts per locale.
 */
export async function computeTranslationCoverage(
  docsDir: string,
  i18nConfig: I18nConfig,
): Promise<TranslationCoverage[]> {
  // Get all pages in the default locale (root or under default locale dir)
  const defaultPages = await scanLocalePages(docsDir, i18nConfig.defaultLocale, i18nConfig)

  const coverage: TranslationCoverage[] = []

  for (const locale of i18nConfig.locales) {
    if (locale.code === i18nConfig.defaultLocale) {
      coverage.push({
        locale: locale.code,
        label: locale.label,
        totalPages: defaultPages.length,
        translatedPages: defaultPages.length,
        percentage: 100,
        missingPages: [],
      })
      continue
    }

    const localePages = await scanLocalePages(docsDir, locale.code, i18nConfig)
    const localeSlugSet = new Set(localePages)
    const missingPages = defaultPages.filter((slug) => !localeSlugSet.has(slug))

    coverage.push({
      locale: locale.code,
      label: locale.label,
      totalPages: defaultPages.length,
      translatedPages: localePages.length,
      percentage: defaultPages.length > 0 ? Math.round((localePages.length / defaultPages.length) * 100) : 0,
      missingPages,
    })
  }

  return coverage
}

async function scanLocalePages(docsDir: string, locale: string, i18nConfig: I18nConfig): Promise<string[]> {
  const localeDir = join(docsDir, locale)
  const slugs: string[] = []

  async function scan(dir: string) {
    let entries: any[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        // Skip other locale directories
        const localeCodes = i18nConfig.locales.map((l) => l.code)
        if (dir === docsDir && localeCodes.includes(entry.name)) continue
        await scan(fullPath)
      } else if (entry.name.match(/\.(md|mdx)$/)) {
        const relPath = relative(localeDir, fullPath)
          .replace(/\.(md|mdx)$/, '')
          .replace(/\/index$/, '')
          .replace(/\\/g, '/')
        slugs.push(relPath || 'index')
      }
    }
  }

  // Try scanning the locale-specific directory
  try {
    await stat(localeDir)
    await scan(localeDir)
  } catch {
    // If locale dir doesn't exist and it's the default locale,
    // scan the root docs dir (excluding locale subdirs)
    if (locale === i18nConfig.defaultLocale) {
      await scan(docsDir)
    }
  }

  return slugs
}

/**
 * Generate the language switcher HTML component.
 */
export function generateLanguageSwitcherHtml(i18nConfig: I18nConfig, currentLocale: string): string {
  const options = i18nConfig.locales
    .map((l) => {
      const selected = l.code === currentLocale ? ' selected' : ''
      return `<option value="${l.code}"${selected}>${l.label}</option>`
    })
    .join('\n            ')

  return `
    <div class="stx-lang-switcher">
      <svg class="stx-lang-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      <select id="stx-lang-select" onchange="switchLanguage(this.value)" aria-label="Language">
        ${options}
      </select>
    </div>`
}

/**
 * Generate JS for language switching.
 * Redirects to the same page under the new locale prefix.
 */
export function generateLanguageSwitcherJs(i18nConfig: I18nConfig): string {
  const defaultLocale = i18nConfig.defaultLocale
  const localeCodes = JSON.stringify(i18nConfig.locales.map((l) => l.code))

  return `
    function switchLanguage(locale) {
      var localeCodes = ${localeCodes};
      var defaultLocale = "${defaultLocale}";
      var path = window.location.pathname.split('/').filter(Boolean);

      // Strip current locale prefix if present
      if (localeCodes.indexOf(path[0]) !== -1) {
        path.shift();
      }

      // Add new locale prefix (skip for default locale)
      if (locale !== defaultLocale) {
        path.unshift(locale);
      }

      window.location.pathname = '/' + path.join('/');
    }`
}

/**
 * Get CSS for the language switcher + RTL support.
 */
export function getI18nCSS(): string {
  return `
    .stx-lang-switcher {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }
    .stx-lang-icon {
      color: var(--stx-text-dim, #94a3b8);
    }
    .stx-lang-switcher select {
      appearance: none;
      background: transparent;
      border: none;
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--stx-text-secondary, #475569);
      cursor: pointer;
      font-family: inherit;
      padding-right: 1rem;
    }
    .stx-lang-switcher select:hover {
      color: var(--stx-primary, #6366f1);
    }

    /* RTL support */
    [dir="rtl"] .stx-sidebar { border-right: none; border-left: 1px solid var(--stx-border); }
    [dir="rtl"] .stx-toc-inner { padding-left: 0; padding-right: 0.5rem; border-left: none; border-right: 1px solid var(--stx-border); }
    [dir="rtl"] .stx-pn-prev { text-align: right; }
    [dir="rtl"] .stx-pn-next { text-align: left; }
    [dir="rtl"] .stx-article { direction: rtl; }
    [dir="rtl"] .stx-article ul, [dir="rtl"] .stx-article ol { padding-left: 0; padding-right: 1.5rem; }`
}
