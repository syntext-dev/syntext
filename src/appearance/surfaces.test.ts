import { describe, it, expect } from 'bun:test'
import { PRESET_NAMES } from './presets'
import { PRESET_SURFACES, pageBackground } from './surfaces'

describe('PRESET_SURFACES', () => {
  it('should have a light and a dark page colour for every preset', () => {
    for (const p of PRESET_NAMES) {
      expect(PRESET_SURFACES[p].light).toMatch(/^#[0-9A-F]{6}$/)
      expect(PRESET_SURFACES[p].dark).toMatch(/^#[0-9A-F]{6}$/)
    }
  })
})

describe('pageBackground', () => {
  it('should return the preset surface for the mode', () => {
    expect(pageBackground('console', 'light')).toBe('#FAFBFA')
    expect(pageBackground('console', 'dark')).toBe('#0A0C0B')
  })

  it('should fall back to white and black for an unknown preset', () => {
    expect(pageBackground('nope', 'light')).toBe('#FFFFFF')
    expect(pageBackground('nope', 'dark')).toBe('#000000')
  })
})
