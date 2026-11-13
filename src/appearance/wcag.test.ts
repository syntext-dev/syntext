import { describe, it, expect } from 'bun:test'
import {
  AA_TEXT,
  AA_NON_TEXT,
  composite,
  contrastRatio,
  ensureContrast,
  rgbToHsl,
  hslToHex,
  parseHex,
  relativeLuminance,
} from './wcag'

describe('contrast', () => {
  describe('parseHex', () => {
    it('should parse a six-digit hex with a leading hash', () => {
      expect(parseHex('#0e121b')).toEqual({ r: 14, g: 18, b: 27 })
    })

    it('should parse a six-digit hex without a leading hash', () => {
      expect(parseHex('ffffff')).toEqual({ r: 255, g: 255, b: 255 })
    })

    it('should expand a three-digit shorthand', () => {
      expect(parseHex('#fff')).toEqual(parseHex('#ffffff'))
    })

    it('should throw when the value is not a hex colour', () => {
      expect(() => parseHex('rgba(0,0,0,0.5)')).toThrow(/not a hex colour/)
    })
  })

  describe('relativeLuminance', () => {
    it('should return 0 for black and 1 for white', () => {
      expect(relativeLuminance('#000000')).toBeCloseTo(0, 6)
      expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6)
    })
  })

  describe('contrastRatio', () => {
    it('should return 21 for black on white', () => {
      expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 4)
    })

    it('should return 1 for a colour against itself', () => {
      expect(contrastRatio('#077155', '#077155')).toBeCloseTo(1, 6)
    })

    it('should be order-independent', () => {
      expect(contrastRatio('#6b7280', '#ffffff')).toBeCloseTo(
        contrastRatio('#ffffff', '#6b7280'),
        6,
      )
    })

    it('should agree with the published ratio for a known pair', () => {
      // #767676 on white is the canonical "exactly AA" grey.
      expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
    })
  })

  describe('composite', () => {
    it('should return the background at alpha 0 and the foreground at alpha 1', () => {
      expect(composite('#077155', '#ffffff', 0)).toBe('#ffffff')
      expect(composite('#077155', '#ffffff', 1)).toBe('#077155')
    })

    it('should flatten a 60% accent mix the way the browser composites it', () => {
      // The pre-fix focus ring: color-mix(in srgb, #077155 60%, transparent)
      // painted over a white page.
      expect(composite('#077155', '#ffffff', 0.6)).toBe('#6aaa99')
    })

    it('should reject an alpha outside 0..1', () => {
      expect(() => composite('#000000', '#ffffff', 1.5)).toThrow(/alpha out of range/)
    })
  })

  describe('thresholds', () => {
    it('should expose the WCAG AA minimums', () => {
      expect(AA_TEXT).toBe(4.5)
      expect(AA_NON_TEXT).toBe(3)
    })
  })
})

describe('ensureContrast', () => {
  it('should return a colour that already passes, untouched', () => {
    expect(ensureContrast('#2563eb', '#ffffff', 4.5)).toBe('#2563eb')
    expect(ensureContrast('#ef4444', '#09090b', 4.5)).toBe('#ef4444')
  })

  it('should raise a failing colour until it clears the target', () => {
    const out = ensureContrast('#2563eb', '#09090b', 4.5)
    expect(out).not.toBe('#2563eb')
    expect(contrastRatio(out, '#09090b')).toBeGreaterThanOrEqual(4.5)
  })

  it('should keep the hue, moving lightness only', () => {
    const before = rgbToHsl(parseHex('#2563eb'))
    const after = rgbToHsl(parseHex(ensureContrast('#2563eb', '#09090b', 4.5)))
    expect(Math.abs(after.h - before.h)).toBeLessThan(1)
    expect(Math.abs(after.s - before.s)).toBeLessThan(1)
    expect(after.l).toBeGreaterThan(before.l)
  })

  it('should darken against a light background and lighten against a dark one', () => {
    const onLight = rgbToHsl(parseHex(ensureContrast('#00FF88', '#ffffff', 4.5)))
    const onDark = rgbToHsl(parseHex(ensureContrast('#facc15', '#ffffff', 4.5)))
    expect(onLight.l).toBeLessThan(rgbToHsl(parseHex('#00FF88')).l)
    expect(onDark.l).toBeLessThan(rgbToHsl(parseHex('#facc15')).l)
  })

  it('should pass a non-hex value straight through rather than mangle it', () => {
    const mix = 'color-mix(in srgb, red 50%, blue)'
    expect(ensureContrast(mix, '#ffffff', 4.5)).toBe(mix)
    expect(ensureContrast('#2563eb', 'var(--x)', 4.5)).toBe('#2563eb')
  })

  it('should keep the brand colour when no lightness in the hue reaches the target', () => {
    // 21:1 is unreachable for anything but black on white.
    expect(ensureContrast('#2563eb', '#808080', 21)).toBe('#2563eb')
  })
})

describe('rgbToHsl / hslToHex', () => {
  it('should round-trip a colour within one step', () => {
    for (const hex of ['#2563eb', '#ef4444', '#00FF88', '#ffffff', '#000000', '#7f7f7f']) {
      const { h, s, l } = rgbToHsl(parseHex(hex))
      const back = parseHex(hslToHex(h, s, l))
      const orig = parseHex(hex)
      expect(Math.abs(back.r - orig.r)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.g - orig.g)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.b - orig.b)).toBeLessThanOrEqual(1)
    }
  })

  it('should treat grey as zero saturation', () => {
    expect(rgbToHsl(parseHex('#808080')).s).toBe(0)
  })
})
