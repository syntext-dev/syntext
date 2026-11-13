import { describe, expect, it } from 'bun:test'
import { V2_PRESETS } from './presets'
import { resolveAppearance } from './resolve'

describe('resolveAppearance', () => {
  it('should default to Workbench with every value from the preset when nothing is set', () => {
    for (const cfg of [undefined, null, {}, 'nonsense']) {
      const r = resolveAppearance(cfg)
      expect(r.appearance.preset).toBe('workbench')
      expect(r.appearance.layout).toEqual(V2_PRESETS.workbench.layout)
      expect(r.issues).toEqual([])
      expect(new Set(Object.values(r.sources))).toEqual(new Set(['preset']))
    }
  })

  it('should take a preset by name', () => {
    const r = resolveAppearance({ theme: 'paper' })
    expect(r.appearance.preset).toBe('paper')
    expect(r.appearance.components.callout).toBe('tag')
    expect(r.appearance.accent).toEqual({ light: '#0E7A63', dark: '#0E7A63' })
  })

  it('should map v1 theme names and keep their look', () => {
    expect(resolveAppearance({ theme: 'default' }).appearance.preset).toBe('workbench')
    const g = resolveAppearance({ theme: 'gravv' })
    expect(g.appearance.preset).toBe('workbench')
    expect(g.appearance.layout.header).toBe('tabs')
    expect(g.appearance.components.code).toBe('inset')
    expect(g.sources['layout.header']).toBe('legacy-theme')
    expect(g.issues).toEqual([])
  })

  it('should warn about an unknown theme and suggest the closest preset', () => {
    const r = resolveAppearance({ theme: 'papr' })
    expect(r.appearance.preset).toBe('workbench')
    expect(r.issues).toEqual([{ path: 'theme', severity: 'warning', message: 'Unknown theme "papr"; using Workbench. Did you mean "paper"?' }])
  })

  it('should let appearance override any preset value and record the source', () => {
    const r = resolveAppearance({ theme: 'plain', appearance: { layout: { toc: 'ticks' }, components: { callout: 'sidenote' }, radius: 'large', size: 17 } })
    expect(r.appearance.layout.toc).toBe('ticks')
    expect(r.appearance.components.callout).toBe('sidenote')
    expect(r.appearance.radius).toBe('large')
    expect(r.appearance.size).toBe(17)
    expect(r.sources['layout.toc']).toBe('appearance')
    expect(r.sources['layout.header']).toBe('preset')
  })

  it('should take one accent for both modes, or one per mode', () => {
    expect(resolveAppearance({ appearance: { accent: '#123456' } }).appearance.accent).toEqual({ light: '#123456', dark: '#123456' })
    const r = resolveAppearance({ appearance: { accent: { light: '#0E7A63', dark: '#3FC5A0' } } })
    expect(r.appearance.accent).toEqual({ light: '#0E7A63', dark: '#3FC5A0' })
    expect(r.sources['accent.dark']).toBe('appearance')
  })

  it('should normalise the old nav name collapsible to chevrons', () => {
    expect(resolveAppearance({ appearance: { layout: { nav: 'collapsible' } } }).appearance.layout.nav).toBe('chevrons')
  })

  it('should report bad keys and values with did-you-mean and keep the previous value', () => {
    const r = resolveAppearance({ theme: 'paper', appearance: { acent: '#fff', layout: { nav: 'pils', header: 'nope', tco: 'dots' }, accent: 'teal', mode: 'night', toggle: 'yes' } })
    const msgs = Object.fromEntries(r.issues.map((i) => [i.path, i.message]))
    expect(msgs['appearance.acent']).toBe('Unknown appearance key "acent". Did you mean "accent"?')
    expect(msgs['appearance.layout.nav']).toContain('Did you mean "pills"?')
    expect(msgs['appearance.layout.header']).toContain('Use one of: command, pill')
    expect(msgs['appearance.layout.tco']).toBe('Unknown layout switch "tco". Did you mean "toc"?')
    expect(msgs['appearance.accent']).toContain('not a hex colour')
    expect(msgs['appearance.mode']).toContain('Use one of: light, dark, system')
    expect(msgs['appearance.toggle']).toBe('toggle must be true or false.')
    expect(r.issues.every((i) => i.severity === 'error')).toBe(true)
    expect(r.appearance.layout.nav).toBe('pills')
    expect(r.appearance.accent.light).toBe('#0E7A63')
  })

  it('should honour v1 feature flags only where appearance is silent', () => {
    const flags = { features: { navStyle: 'single', sidebarStyle: 'flat', codeBlockStyle: 'panel', shellWidth: 'full', themeToggle: false } }
    const r = resolveAppearance(flags)
    expect(r.appearance.layout.header).toBe('simple')
    expect(r.appearance.layout.nav).toBe('plain')
    expect(r.appearance.components.code).toBe('inset')
    expect(r.appearance.width).toBe('full')
    expect(r.appearance.toggle).toBe(false)
    expect(r.sources['layout.header']).toBe('feature-flag')

    const both = resolveAppearance({ ...flags, appearance: { layout: { header: 'pill' }, width: 'contained' } })
    expect(both.appearance.layout.header).toBe('pill')
    expect(both.appearance.layout.nav).toBe('plain')
    expect(both.appearance.width).toBe('contained')
    expect(both.sources['layout.header']).toBe('appearance')
  })

  it('should resolve an organization theme between the flags and appearance', () => {
    const r = resolveAppearance({ theme: '@acme/brand', appearance: { radius: 'none' } }, { orgTheme: { preset: 'orbit', appearance: { accent: '#4F46E5', radius: 'small' } } })
    expect(r.orgTheme).toBe('@acme/brand')
    expect(r.appearance.preset).toBe('orbit')
    expect(r.appearance.accent.light).toBe('#4F46E5')
    expect(r.sources['accent.light']).toBe('org-theme')
    expect(r.appearance.radius).toBe('none')
    expect(r.sources.radius).toBe('appearance')
  })

  it('should warn and fall back when an organization theme is missing', () => {
    const r = resolveAppearance({ theme: '@acme/gone' })
    expect(r.orgTheme).toBe('@acme/gone')
    expect(r.issues[0]).toMatchObject({ path: 'theme', severity: 'warning' })
    expect(r.appearance.preset).toBe('workbench')
  })

  it('should not share state between calls', () => {
    const a = resolveAppearance({ appearance: { layout: { nav: 'dock' } } })
    const b = resolveAppearance({})
    expect(a.appearance.layout.nav).toBe('dock')
    expect(b.appearance.layout.nav).toBe(V2_PRESETS.workbench.layout.nav)
  })
})

describe('resolveAppearance v2 opt-in', () => {
  it('should keep sites on v1 rendering until they opt in', () => {
    for (const cfg of [{}, { theme: 'default' }, { theme: 'gravv' }, { theme: 'papr' }, { features: { navStyle: 'single' } }]) {
      expect(resolveAppearance(cfg).v2).toBe(false)
    }
  })

  it('should switch to v2 for a v2 preset, an organization theme or an appearance block', () => {
    expect(resolveAppearance({ theme: 'paper' }).v2).toBe(true)
    expect(resolveAppearance({ theme: '@acme/brand' }, { orgTheme: { preset: 'orbit' } }).v2).toBe(true)
    expect(resolveAppearance({ appearance: { accent: '#0E7A63' } }).v2).toBe(true)
    expect(resolveAppearance({ theme: 'default', appearance: {} }).v2).toBe(true)
  })
})
