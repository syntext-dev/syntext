import { describe, expect, it } from 'bun:test'
import { scanConfigDeprecations } from './scan-config'

const scan = (config: Record<string, unknown>, fileName = 'syntext.json') =>
  scanConfigDeprecations({ config, fileName, source: JSON.stringify(config, null, 2) })

describe('scanConfigDeprecations', () => {
  it('should find nothing in a clean config', () => {
    expect(scan({ name: 'Acme', theme: 'paper', appearance: { layout: { nav: 'chevrons' } } })).toEqual([])
  })

  it('should show the exact appearance equivalent for v1 style flags', () => {
    const [u] = scan({ features: { navStyle: 'single' } })
    expect(u).toMatchObject({ code: 'config.features-navStyle', kind: 'config', file: 'syntext.json', line: 3, old: 'features.navStyle: "single"', replacement: 'appearance.layout.header: "simple"' })
  })

  it('should map colors and fonts onto appearance and themeOverrides', () => {
    const usages = scan({ colors: { primary: '#ff0000', background: '#000' }, fonts: { heading: 'Inter' } })
    expect(usages.map((u) => [u.code, u.replacement])).toEqual([
      ['config.colors-primary', 'appearance.accent: "#ff0000"'],
      ['config.colors-background', 'themeOverrides.colors.light.bg-page: "#000" and themeOverrides.colors.dark.bg-page: "#000"'],
      ['config.fonts-heading', 'appearance.fonts.heading: "Inter"'],
    ])
  })

  it('should flag the collapsible nav value', () => {
    const [u] = scan({ appearance: { layout: { nav: 'collapsible' } } })
    expect(u).toMatchObject({ code: 'config.layout-nav-collapsible', line: 4, replacement: 'appearance.layout.nav: "chevrons"' })
  })

  it('should flag renamed keys inside arrays and i18n', () => {
    const usages = scan({ language: 'en', ogImage: '/og.png', redirects: [{ source: '/a', destination: '/b' }], i18n: { targetLocales: ['es'] } })
    expect(usages.map((u) => u.code)).toEqual(['config.language', 'config.og-image', 'config.redirect-source', 'config.redirect-destination', 'config.i18n-target-locales'])
  })

  it('should flag the legacy file name and no-op flags', () => {
    const usages = scan({ features: { parameterStyle: 'rows', codeLanguageTabs: true } }, 'syntext.config.json')
    expect(usages.map((u) => u.code)).toEqual(['config.file-name', 'config.features-codeLanguageTabs', 'config.features-parameterStyle'])
    expect(usages[0]).toMatchObject({ line: 1, replacement: 'syntext.json' })
  })

  it('should record unknown keys with the closest valid key', () => {
    const [u] = scan({ navigaton: [] })
    expect(u).toMatchObject({ code: 'config.unknown-key', old: 'navigaton', replacement: 'navigation' })
    const [v] = scan({ zzzzzzzz: 1 })
    expect(v.replacement).toBe('nothing (delete the key)')
  })
})
