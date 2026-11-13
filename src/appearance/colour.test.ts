import { describe, expect, it } from 'bun:test'
import { accentInk, lum, mix, pyRound } from './colour'

describe('appearance colour maths', () => {
  it('should round ties to even like Python when rounding', () => {
    expect(pyRound(0.5)).toBe(0)
    expect(pyRound(1.5)).toBe(2)
    expect(pyRound(2.4)).toBe(2)
    expect(pyRound(2.6)).toBe(3)
  })

  it('should blend toward the target colour when mixing', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080')
    expect(mix('#E4512B', '#E4512B', 0.3)).toBe('#e4512b')
    expect(mix('#fff', '#000', 1)).toBe('#000000')
  })

  it('should measure luminance without gamma when given hex', () => {
    expect(lum('#FFFFFF')).toBeCloseTo(1)
    expect(lum('#000000')).toBe(0)
  })

  it('should darken the accent for light pages and lighten it for dark pages when deriving ink', () => {
    expect(accentInk('#E4512B', 'light')).toBe(mix('#E4512B', '#000000', 0.16))
    expect(accentInk('#E4512B', 'dark')).toBe(mix('#E4512B', '#FFFFFF', 0.25))
  })
})
