import { describe, it, expect } from 'bun:test'
import { YamlTextEditor } from './yaml-edit'

const SAMPLE = `# Site config
name: Acme # the header name
language: en
colors:
  # brand colours
  primary: "#6366F1"
  accent: "#2AC3DE"
redirects:
  - source: /a
    destination: /b
`

describe('YamlTextEditor', () => {
  it('should read values by path', () => {
    const e = new YamlTextEditor(SAMPLE)
    expect(e.get(['colors', 'primary'])).toBe('#6366F1')
    expect(e.get(['redirects', 0, 'destination'])).toBe('/b')
    expect(e.has(['nope'])).toBe(false)
  })

  it('should rename a key in place and keep its comment', () => {
    const e = new YamlTextEditor(SAMPLE)
    e.rename(['language'], 'locale')
    e.rename(['redirects', 0, 'source'], 'from')
    expect(e.text).toBe(SAMPLE.replace('language:', 'locale:').replace('- source:', '- from:'))
  })

  it('should delete keys and keep the other comments', () => {
    const e = new YamlTextEditor(SAMPLE)
    e.delete(['colors', 'accent'])
    expect(e.text).toContain('# Site config\nname: Acme # the header name\n')
    expect(e.text).toContain('  # brand colours\n  primary: "#6366F1"\n')
    expect(e.text).not.toContain('accent')
  })

  it('should add nested keys', () => {
    const e = new YamlTextEditor(SAMPLE)
    e.set(['themeOverrides', 'colors', 'light', 'accent-strong'], '#2AC3DE')
    expect(e.get(['themeOverrides'])).toEqual({ colors: { light: { 'accent-strong': '#2AC3DE' } } })
    expect(e.text).toContain('themeOverrides:\n  colors:\n    light:\n      accent-strong: "#2AC3DE"\n')
  })

  it('should replace a value', () => {
    const e = new YamlTextEditor('appearance:\n  layout:\n    nav: collapsible # folds\n')
    e.set(['appearance', 'layout', 'nav'], 'chevrons')
    expect(e.text).toBe('appearance:\n  layout:\n    nav: chevrons # folds\n')
  })

  it('should not fold long lines', () => {
    const long = `description: ${'word '.repeat(40).trim()}\n`
    const e = new YamlTextEditor(long)
    e.set(['locale'], 'en')
    expect(e.text).toBe(`${long}locale: en\n`)
  })

  it('should refuse to write through a value that is not a map', () => {
    const e = new YamlTextEditor('seo: x\n')
    expect(() => e.set(['seo', 'ogImage'], '/o.png')).toThrow('seo is not an object')
  })

  it('should fail clearly on YAML that does not parse', () => {
    expect(() => new YamlTextEditor('a: [1,\n')).toThrow('Not valid YAML')
  })
})
