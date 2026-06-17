import { describe, it, expect, beforeEach } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  getI18nConfig,
  resolveFileLocale,
  stripLocalePrefix,
  resolveLocalizedPath,
  computeTranslationCoverage,
  generateLanguageSwitcherHtml,
  generateLanguageSwitcherJs,
  getI18nCSS,
} from './i18n'
import type { SyntextConfig } from './config'

const testI18nConfig = {
  defaultLocale: 'en',
  locales: [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
    { code: 'ar', label: 'العربية', dir: 'rtl' as const },
  ],
}

describe('i18n', () => {
  describe('getI18nConfig', () => {
    it('should return null when no i18n configured', () => {
      expect(getI18nConfig({})).toBeNull()
      expect(getI18nConfig({ i18n: {} } as any)).toBeNull()
      expect(getI18nConfig({ i18n: { locales: [] } } as any)).toBeNull()
    })

    it('should return config from syntext config', () => {
      const config: SyntextConfig = {
        i18n: {
          defaultLocale: 'en',
          locales: [
            { code: 'en', label: 'English' },
            { code: 'fr', label: 'Français' },
          ],
        },
      }
      const result = getI18nConfig(config)
      expect(result).not.toBeNull()
      expect(result!.defaultLocale).toBe('en')
      expect(result!.locales).toHaveLength(2)
    })

    it('should default to first locale if no defaultLocale specified', () => {
      const config: SyntextConfig = {
        i18n: {
          locales: [
            { code: 'fr', label: 'Français' },
            { code: 'en', label: 'English' },
          ],
        },
      }
      const result = getI18nConfig(config)
      expect(result!.defaultLocale).toBe('fr')
    })
  })

  describe('resolveFileLocale', () => {
    it('should detect locale from path prefix', () => {
      expect(resolveFileLocale('fr/getting-started.mdx', testI18nConfig)).toBe('fr')
      expect(resolveFileLocale('ar/guide/intro.mdx', testI18nConfig)).toBe('ar')
    })

    it('should return default locale for root-level files', () => {
      expect(resolveFileLocale('getting-started.mdx', testI18nConfig)).toBe('en')
      expect(resolveFileLocale('guide/intro.mdx', testI18nConfig)).toBe('en')
    })

    it('should not mistake regular dirs for locales', () => {
      expect(resolveFileLocale('frontend/setup.mdx', testI18nConfig)).toBe('en')
    })
  })

  describe('stripLocalePrefix', () => {
    it('should strip locale prefix from path', () => {
      expect(stripLocalePrefix('fr/getting-started.mdx', testI18nConfig)).toBe('getting-started.mdx')
      expect(stripLocalePrefix('ar/guide/intro.mdx', testI18nConfig)).toBe('guide/intro.mdx')
    })

    it('should leave root-level paths unchanged', () => {
      expect(stripLocalePrefix('getting-started.mdx', testI18nConfig)).toBe('getting-started.mdx')
    })
  })

  describe('resolveLocalizedPath', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'stx-i18n-'))
      await mkdir(join(tempDir, 'en'), { recursive: true })
      await mkdir(join(tempDir, 'fr'), { recursive: true })
      await writeFile(join(tempDir, 'en', 'intro.mdx'), '# Intro')
      await writeFile(join(tempDir, 'fr', 'intro.mdx'), '# Introduction')
    })

    it('should resolve to target locale when translation exists', async () => {
      const result = await resolveLocalizedPath(tempDir, 'intro', 'fr', testI18nConfig)
      expect(result.locale).toBe('fr')
      expect(result.isFallback).toBe(false)
    })

    it('should fallback to default locale when translation missing', async () => {
      const result = await resolveLocalizedPath(tempDir, 'intro', 'ar', testI18nConfig)
      expect(result.locale).toBe('en')
      expect(result.isFallback).toBe(true)
    })
  })

  describe('computeTranslationCoverage', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'stx-i18n-cov-'))
      await mkdir(join(tempDir, 'en'), { recursive: true })
      await mkdir(join(tempDir, 'fr'), { recursive: true })
      await writeFile(join(tempDir, 'en', 'intro.mdx'), '# Intro')
      await writeFile(join(tempDir, 'en', 'setup.mdx'), '# Setup')
      await writeFile(join(tempDir, 'en', 'advanced.mdx'), '# Advanced')
      await writeFile(join(tempDir, 'fr', 'intro.mdx'), '# Introduction')
    })

    it('should compute coverage percentages', async () => {
      const coverage = await computeTranslationCoverage(tempDir, testI18nConfig)
      const enCov = coverage.find((c) => c.locale === 'en')!
      const frCov = coverage.find((c) => c.locale === 'fr')!

      expect(enCov.percentage).toBe(100)
      expect(frCov.totalPages).toBe(3)
      expect(frCov.translatedPages).toBe(1)
      expect(frCov.percentage).toBe(33)
      expect(frCov.missingPages).toContain('setup')
      expect(frCov.missingPages).toContain('advanced')
    })
  })

  describe('generateLanguageSwitcherHtml', () => {
    it('should render language select with options', () => {
      const html = generateLanguageSwitcherHtml(testI18nConfig, 'en')
      expect(html).toContain('stx-lang-switcher')
      expect(html).toContain('English')
      expect(html).toContain('Français')
      expect(html).toContain('value="en" selected')
    })
  })

  describe('generateLanguageSwitcherJs', () => {
    it('should include switchLanguage function', () => {
      const js = generateLanguageSwitcherJs(testI18nConfig)
      expect(js).toContain('function switchLanguage')
      expect(js).toContain('"en"')
    })
  })

  describe('getI18nCSS', () => {
    it('should include RTL styles', () => {
      const css = getI18nCSS()
      expect(css).toContain('[dir="rtl"]')
      expect(css).toContain('stx-lang-switcher')
    })
  })
})
