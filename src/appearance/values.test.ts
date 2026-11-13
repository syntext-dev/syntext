import { describe, expect, it } from 'bun:test'
import { COMPONENT_SWITCHES, HEX, LAYOUT_SWITCHES, VALUE_ALIASES } from './values'

describe('appearance values', () => {
  it('should list each switch value once', () => {
    for (const values of [...Object.values(LAYOUT_SWITCHES), ...Object.values(COMPONENT_SWITCHES)]) {
      expect(new Set(values).size).toBe(values.length)
    }
  })

  it('should alias only to real values', () => {
    for (const [path, map] of Object.entries(VALUE_ALIASES)) {
      const [group, key] = path.split('.')
      const allowed = (group === 'layout' ? LAYOUT_SWITCHES : COMPONENT_SWITCHES) as Record<string, readonly string[]>
      for (const [alias, target] of Object.entries(map)) {
        expect(allowed[key]).toContain(target)
        expect(allowed[key]).not.toContain(alias)
      }
    }
  })

  it('should accept 3- and 6-digit hex colours only', () => {
    expect(HEX.test('#0E7A63')).toBe(true)
    expect(HEX.test('#abc')).toBe(true)
    expect(HEX.test('0E7A63')).toBe(false)
    expect(HEX.test('#0E7A6')).toBe(false)
    expect(HEX.test('teal')).toBe(false)
  })
})
