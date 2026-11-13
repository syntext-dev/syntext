import { describe, it, expect } from 'bun:test'
import { explainAppearance } from './explain'
import { formatExplanation } from './format-explain'

// eslint-disable-next-line no-control-regex
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

describe('formatExplanation', () => {
  it('should print a row per value with its source', () => {
    const text = plain(formatExplanation(explainAppearance({ theme: 'paper', appearance: { mode: 'dark' } }), 'syntext.json'))
    expect(text).toContain('Appearance (syntext.json)')
    expect(text).toContain('doc engine v2, paper preset')
    expect(text).toMatch(/mode\s+dark\s+appearance\s+appearance\.mode/)
    expect(text).toMatch(/fonts\.heading\s+Figtree\s+preset\s+paper preset/)
  })

  it('should say a v1 site is shown as a preview', () => {
    const text = plain(formatExplanation(explainAppearance({ theme: 'default' }), 'syntext.json'))
    expect(text).toContain('doc engine v1')
    expect(text).toContain('what the site would look like on v2')
  })

  it('should list tokens set on top, and what overrides them', () => {
    const text = plain(formatExplanation(explainAppearance({ colors: { accent: '#2AC3DE' }, themeOverrides: { colors: { light: { 'accent-strong': '#000' } } } }), 'syntext.json'))
    expect(text).toContain('Tokens set on top')
    expect(text).toMatch(/colors\.light\.accent-strong\s+#000\s+themeOverrides\s+themeOverrides\.colors\.light\.accent-strong\s+\(overridden by colors\.accent\)/)
    expect(text).toMatch(/colors\.dark\.accent-strong\s+#2AC3DE\s+legacy\s+colors\.accent/)
  })

  it('should print contrast results with a suggestion on failure', () => {
    const text = plain(formatExplanation(explainAppearance({ theme: 'workbench', appearance: { accent: '#FFFF00' } }), 'syntext.json'))
    expect(text).toContain('Contrast (accent #FFFF00 on the workbench page background)')
    expect(text).toMatch(/✗ light link\s+[\d.]+:1, needs 4\.5:1\. Nearest passing shade: #[0-9A-F]{6}/)
  })

  it('should explain an organization theme that was not resolved', () => {
    const text = plain(formatExplanation(explainAppearance({ theme: '@acme/brand' }, { orgThemeError: 'Organization theme @acme/brand could not be resolved offline. Run `stx login` to fetch it.' }), 'syntext.json'))
    expect(text).toContain('could not be resolved offline')
  })

  it('should name a resolved organization theme with its version', () => {
    const text = plain(formatExplanation(explainAppearance({ theme: '@acme/brand' }, { orgTheme: { ref: '@acme/brand', slug: 'brand', version: 4, pinned: false, preset: 'grid', appearance: {}, themeOverrides: {} } }), 'syntext.json'))
    expect(text).toContain('organization theme @acme/brand (version 4, follows the latest)')
  })

  it('should head the contrast with the accent that renders when colors.primary overrides it', () => {
    const text = plain(formatExplanation(explainAppearance({ theme: 'workbench', colors: { primary: '#FFFF00' } }), 'syntext.json'))
    expect(text).toContain('Contrast (accent #FFFF00 on the workbench page background)')
    expect(text).toMatch(/accent\.light\s+\S+\s+preset\s+.*\(overridden by colors\.primary\)/)
  })

  it('should name both accents when they differ', () => {
    const text = plain(formatExplanation(explainAppearance({ appearance: { accent: { light: '#0E7A63', dark: '#3FC5A0' } } }), 'syntext.json'))
    expect(text).toContain('Contrast (accent #0E7A63 light, #3FC5A0 dark on the workbench page background)')
  })

  it('should print the resolver issues', () => {
    const text = plain(formatExplanation(explainAppearance({ appearance: { mode: 'dim' } }), 'syntext.json'))
    expect(text).toContain('"dim" is not a mode value')
  })
})
