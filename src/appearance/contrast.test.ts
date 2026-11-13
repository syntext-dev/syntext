import { describe, expect, it } from 'bun:test'
import { contrastRatio } from './wcag'
import { accentInk } from './colour'
import { accentContrast, FILL_CONTRAST, LINK_CONTRAST, nearestPassingShade } from './contrast'

const white = () => '#FFFFFF'
const pages = (mode: 'light' | 'dark') => (mode === 'light' ? '#FFFFFF' : '#0E0E11')

describe('accentContrast', () => {
  it('should check links at 4.5:1 and fills at 3:1 in both modes', () => {
    const checks = accentContrast({ accent: { light: '#0E7A63', dark: '#3FC5A0' }, background: pages })
    expect(checks.map((c) => `${c.mode}:${c.check}:${c.required}`)).toEqual([
      'light:link:4.5', 'light:fill:3', 'dark:link:4.5', 'dark:fill:3',
    ])
    expect(LINK_CONTRAST).toBe(4.5)
    expect(FILL_CONTRAST).toBe(3)
    expect(checks.every((c) => c.passes)).toBe(true)
    expect(checks.every((c) => c.suggestion === undefined)).toBe(true)
  })

  it('should measure the link as the derived accent ink, not the raw accent', () => {
    const [link] = accentContrast({ accent: { light: '#E4512B', dark: '#E4512B' }, background: white })
    expect(link!.ratio).toBeCloseTo(contrastRatio(accentInk('#E4512B', 'light'), '#FFFFFF'), 2)
  })

  it('should round ratios to two decimals', () => {
    const [link] = accentContrast({ accent: { light: '#E4512B', dark: '#E4512B' }, background: white })
    expect(String(link!.ratio)).toMatch(/^\d+(\.\d{1,2})?$/)
  })

  it('should fail a pale accent on a white page and suggest the nearest passing shade', () => {
    const checks = accentContrast({ accent: { light: '#FFD84D', dark: '#FFD84D' }, background: pages })
    const link = checks.find((c) => c.mode === 'light' && c.check === 'link')!
    const fill = checks.find((c) => c.mode === 'light' && c.check === 'fill')!
    expect(link.passes).toBe(false)
    expect(fill.passes).toBe(false)
    expect(link.suggestion).toMatch(/^#[0-9A-F]{6}$/)
    expect(contrastRatio(accentInk(link.suggestion!, 'light'), '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(fill.suggestion!, '#FFFFFF')).toBeGreaterThanOrEqual(3)
    // The yellow passes on the dark page.
    expect(checks.find((c) => c.mode === 'dark' && c.check === 'link')!.passes).toBe(true)
  })

  it('should measure against a background that depends on the accent', () => {
    const seen: string[] = []
    accentContrast({ accent: { light: '#123456', dark: '#654321' }, background: (_m, a) => { seen.push(a); return '#FFFFFF' } })
    expect(seen).toContain('#123456')
    expect(seen).toContain('#654321')
  })

  it('should skip a colour it cannot measure instead of throwing', () => {
    expect(accentContrast({ accent: { light: 'tomato', dark: '#000000' }, background: pages }).map((c) => c.mode)).toEqual(['dark', 'dark'])
  })
})

describe('nearestPassingShade', () => {
  it('should return the smallest lightness change that passes', () => {
    const shade = nearestPassingShade('#FFD84D', (c) => contrastRatio(c, '#FFFFFF') >= 3)!
    expect(contrastRatio(shade, '#FFFFFF')).toBeGreaterThanOrEqual(3)
    const darker = nearestPassingShade('#FFD84D', (c) => contrastRatio(c, '#FFFFFF') >= 4.5)!
    expect(contrastRatio(darker, '#FFFFFF')).toBeGreaterThan(contrastRatio(shade, '#FFFFFF'))
  })

  it('should return undefined when no shade passes', () => {
    expect(nearestPassingShade('#808080', () => false)).toBeUndefined()
  })

  it('should return undefined for an unparseable colour', () => {
    expect(nearestPassingShade('nope', () => true)).toBeUndefined()
  })
})
