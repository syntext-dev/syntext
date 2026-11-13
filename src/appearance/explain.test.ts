import { describe, it, expect } from 'bun:test'
import { explainAppearance, renderedAccent } from './explain'
import type { FetchedOrgTheme } from './org-theme-fetch'

const row = <T extends { path: string }>(rows: T[], path: string): T | undefined => rows.find((r) => r.path === path)

describe('explainAppearance', () => {
  it('should take every value from the preset when nothing is set', () => {
    const e = explainAppearance({ theme: 'paper' })
    expect(e.v2).toBe(true)
    expect(e.preset).toBe('paper')
    expect(row(e.values, 'accent.light')).toEqual({ path: 'accent.light', value: '#0E7A63', source: 'preset', from: 'paper preset' })
    expect(e.values.every((r) => r.source === 'preset')).toBe(true)
    expect(e.tokens).toEqual([])
  })

  it('should name the appearance key a value came from', () => {
    const e = explainAppearance({ theme: 'atlas', appearance: { accent: '#2457D6', layout: { nav: 'collapsible' } } })
    expect(row(e.values, 'accent.dark')).toMatchObject({ source: 'appearance', from: 'appearance.accent' })
    expect(row(e.values, 'layout.nav')).toMatchObject({ value: 'chevrons', source: 'appearance', from: 'appearance.layout.nav' })
  })

  it('should name the per-mode accent key', () => {
    const e = explainAppearance({ appearance: { accent: { dark: '#3FC5A0' } } })
    expect(row(e.values, 'accent.dark')).toMatchObject({ value: '#3FC5A0', from: 'appearance.accent.dark' })
    expect(row(e.values, 'accent.light')?.source).toBe('preset')
  })

  it('should show v1 theme mappings and feature flags', () => {
    const e = explainAppearance({ theme: 'gravv', features: { navStyle: 'single', themeToggle: false } })
    expect(e.v2).toBe(false)
    expect(row(e.values, 'accent.light')).toMatchObject({ value: '#077155', source: 'legacy-theme', from: 'theme "gravv"' })
    expect(row(e.values, 'layout.header')).toMatchObject({ value: 'simple', source: 'feature-flag', from: 'features.navStyle' })
    expect(row(e.values, 'toggle')).toMatchObject({ value: 'false', source: 'feature-flag', from: 'features.themeToggle' })
  })

  it('should apply a loaded organization theme', () => {
    const e = explainAppearance({ theme: '@acme/brand@2' }, {
      orgTheme: { ref: '@acme/brand@2', slug: 'brand', version: 2, pinned: true, preset: 'margin', appearance: { mode: 'dark' }, themeOverrides: { radius: { sm: 2 } } },
    })
    expect(e.preset).toBe('margin')
    expect(e.orgTheme).toEqual({ ref: '@acme/brand@2', resolved: true, version: 2, pinned: true })
    expect(row(e.values, 'mode')).toMatchObject({ value: 'dark', source: 'org-theme', from: '@acme/brand@2' })
    expect(row(e.tokens, 'radius.sm')).toMatchObject({ value: '2', source: 'org-theme', from: '@acme/brand@2' })
    expect(e.issues).toEqual([])
  })

  it('should say an organization theme could not be resolved', () => {
    const e = explainAppearance({ theme: '@acme/brand' }, { orgThemeError: 'Organization theme @acme/brand could not be resolved offline.' })
    expect(e.orgTheme).toEqual({ ref: '@acme/brand', resolved: false, message: 'Organization theme @acme/brand could not be resolved offline.' })
    expect(e.issues).toEqual([])
    expect(e.preset).toBe('workbench')
  })

  it('should list themeOverrides and legacy keys as token sources, legacy last', () => {
    const e = explainAppearance({
      theme: 'default',
      colors: { primary: '#6366F1', accent: '#2AC3DE' },
      fonts: { heading: 'Inter', mono: 'Fira Code' },
      themeOverrides: { colors: { light: { 'accent-strong': '#000000', 'bg-page': '#FAFAFA' } }, fonts: { mono: 'JetBrains Mono' } },
    })
    expect(row(e.tokens, 'colors.light.accent-strong')).toEqual({ path: 'colors.light.accent-strong', value: '#000000', source: 'themeOverrides', from: 'themeOverrides.colors.light.accent-strong', overriddenBy: 'colors.accent' })
    expect(row(e.tokens, 'colors.light.bg-page')).toMatchObject({ source: 'themeOverrides' })
    expect(e.tokens.filter((t) => t.from === 'colors.accent').map((t) => t.path)).toEqual(['colors.light.accent-strong', 'colors.dark.accent-strong'])
    expect(e.tokens.filter((t) => t.from === 'colors.primary')).toHaveLength(12)
    expect(row(e.tokens, 'colors.dark.accent-hover')?.value).toBe('color-mix(in srgb, #6366F1 85%, white)')
    expect(row(e.tokens.filter((t) => t.source === 'legacy'), 'fonts.display')).toMatchObject({ value: 'Inter', from: 'fonts.heading' })
    expect(e.tokens.find((t) => t.from === 'fonts.mono')).toMatchObject({ overriddenBy: 'themeOverrides.fonts.mono' })
  })

  it('should measure the accent contrast on the preset page colour', () => {
    const e = explainAppearance({ theme: 'workbench', appearance: { accent: '#FFFF00' } })
    const light = e.contrast.find((c) => c.mode === 'light' && c.check === 'link')
    expect(light?.passes).toBe(false)
    expect(light?.suggestion).toMatch(/^#[0-9A-F]{6}$/)
    expect(e.contrast).toHaveLength(4)
  })

  it('should measure the accent legacy colors.primary renders on v2, not the preset accent', () => {
    const e = explainAppearance({ theme: 'workbench', colors: { primary: '#FFFF00' } })
    expect(e.v2).toBe(true)
    expect(e.accent).toEqual({ light: '#FFFF00', dark: '#FFFF00' })
    expect(e.contrast).toEqual(explainAppearance({ theme: 'workbench', appearance: { accent: '#FFFF00' } }).contrast)
    expect(e.contrast.find((c) => c.mode === 'light' && c.check === 'link')?.passes).toBe(false)
    expect(row(e.values, 'accent.light')).toMatchObject({ source: 'preset', overriddenBy: 'colors.primary' })
  })

  it('should let colors.primary win over appearance.accent and themeOverrides accent', () => {
    const e = explainAppearance({
      appearance: { accent: '#0E7A63' },
      themeOverrides: { colors: { light: { accent: '#123456' } } },
      colors: { primary: '#FFFF00' },
    })
    expect(e.accent).toEqual({ light: '#FFFF00', dark: '#FFFF00' })
  })

  it('should take a themeOverrides accent over the appearance accent, per mode', () => {
    const e = explainAppearance({ appearance: { accent: '#0E7A63' }, themeOverrides: { colors: { dark: { accent: '#3FC5A0' } } } })
    expect(e.accent).toEqual({ light: '#0E7A63', dark: '#3FC5A0' })
    expect(row(e.values, 'accent.dark')?.overriddenBy).toBe('themeOverrides.colors.dark.accent')
    expect(row(e.values, 'accent.light')?.overriddenBy).toBeUndefined()
  })

  it('should take the organization theme\'s themeOverrides accent under the site\'s own', () => {
    const org: FetchedOrgTheme = { ref: '@acme/brand', slug: 'brand', preset: 'workbench', appearance: {}, themeOverrides: { colors: { light: { accent: '#AA0000' } } }, version: 1, pinned: false }
    expect(renderedAccent({}, '#0E7A63', 'light', org)).toEqual({ value: '#AA0000', from: '@acme/brand' })
    expect(renderedAccent({ themeOverrides: { colors: { light: { accent: '#00AA00' } } } }, '#0E7A63', 'light', org)).toEqual({ value: '#00AA00', from: 'themeOverrides.colors.light.accent' })
  })

  it('should ignore an accent override that is not a hex colour, as the renderer does', () => {
    expect(renderedAccent({ colors: { primary: 'tomato' }, themeOverrides: { colors: { light: { accent: 'rgb(1,2,3)' } } } }, '#0E7A63', 'light')).toEqual({ value: '#0E7A63' })
  })

  it('should pass the resolver issues through', () => {
    const e = explainAppearance({ theme: 'papr', appearance: { mode: 'dim' } })
    expect(e.issues.map((i) => i.path)).toEqual(['theme', 'appearance.mode'])
  })
})
