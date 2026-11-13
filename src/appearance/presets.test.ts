import { describe, expect, it } from 'bun:test'
import { DEFAULT_V2_PRESET, isPresetName, LEGACY_THEMES, PRESET_NAMES, V2_PRESETS } from './presets'
import { COMPONENT_SWITCHES, HEX, LAYOUT_SWITCHES, MODES, RADII, SIZES } from './values'

describe('V2_PRESETS', () => {
  it('should define the eight presets', () => {
    expect(PRESET_NAMES).toEqual(['workbench', 'paper', 'console', 'atlas', 'plain', 'orbit', 'grid', 'margin'])
    expect(PRESET_NAMES).toContain(DEFAULT_V2_PRESET)
  })

  it('should give every preset only allowed values', () => {
    for (const name of PRESET_NAMES) {
      const p = V2_PRESETS[name]
      expect(HEX.test(p.accent)).toBe(true)
      expect(MODES).toContain(p.mode)
      expect(RADII).toContain(p.radius)
      expect(SIZES).toContain(p.size)
      for (const [k, v] of Object.entries(p.layout)) expect((LAYOUT_SWITCHES as Record<string, readonly string[]>)[k]).toContain(v)
      for (const [k, v] of Object.entries(p.components)) expect((COMPONENT_SWITCHES as Record<string, readonly string[]>)[k]).toContain(v)
    }
  })

  it('should make each preset a different layout, not just a different colour', () => {
    const shapes = PRESET_NAMES.map((n) => JSON.stringify([V2_PRESETS[n].layout, V2_PRESETS[n].components]))
    expect(new Set(shapes).size).toBe(PRESET_NAMES.length)
  })

  it('should make Console the only dark-first preset', () => {
    expect(PRESET_NAMES.filter((n) => V2_PRESETS[n].mode === 'dark')).toEqual(['console'])
  })
})

describe('isPresetName', () => {
  it('should accept preset names only', () => {
    expect(isPresetName('paper')).toBe(true)
    expect(isPresetName('Paper')).toBe(false)
    expect(isPresetName('toString')).toBe(false)
  })
})

describe('LEGACY_THEMES', () => {
  it('should map v1 theme names onto real presets', () => {
    expect(LEGACY_THEMES.default.preset).toBe('workbench')
    expect(LEGACY_THEMES.gravv).toEqual({ preset: 'workbench', appearance: { accent: '#077155', layout: { header: 'tabs' }, components: { code: 'inset' } } })
  })
})
