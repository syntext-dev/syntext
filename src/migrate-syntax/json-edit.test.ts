import { describe, it, expect } from 'bun:test'
import { JsonTextEditor } from './json-edit'

const SAMPLE = `{
  "name": "Acme",
  "colors": {
    "primary": "#6366F1",
    "accent": "#2AC3DE"
  },
  "tabs": ["Home", "API"],
  "redirects": [
    { "source": "/a", "destination": "/b" }
  ]
}
`

describe('JsonTextEditor', () => {
  it('should read values by path', () => {
    const e = new JsonTextEditor(SAMPLE)
    expect(e.get(['colors', 'primary'])).toBe('#6366F1')
    expect(e.get(['redirects', 0, 'source'])).toBe('/a')
    expect(e.has(['colors', 'nope'])).toBe(false)
    expect(e.get([])).toEqual(JSON.parse(SAMPLE))
  })

  it('should rename a key in place and keep the rest byte for byte', () => {
    const e = new JsonTextEditor(SAMPLE)
    e.rename(['redirects', 0, 'source'], 'from')
    expect(e.text).toBe(SAMPLE.replace('"source"', '"from"'))
  })

  it('should delete a middle, a last and an only key with their commas', () => {
    const e = new JsonTextEditor(SAMPLE)
    e.delete(['colors', 'primary'])
    expect(e.text).toContain('"colors": {\n    "accent": "#2AC3DE"\n  },')
    e.delete(['colors', 'accent'])
    expect(e.text).toContain('"colors": {},')
    e.delete(['redirects'])
    expect(e.text).toBe('{\n  "name": "Acme",\n  "colors": {},\n  "tabs": ["Home", "API"]\n}\n')
    expect(() => JSON.parse(e.text)).not.toThrow()
  })

  it('should replace a value', () => {
    const e = new JsonTextEditor('{\n  "appearance": { "layout": { "nav": "collapsible" } }\n}\n')
    e.set(['appearance', 'layout', 'nav'], 'chevrons')
    expect(e.text).toBe('{\n  "appearance": { "layout": { "nav": "chevrons" } }\n}\n')
  })

  it('should insert a nested key, creating objects, in the file indentation', () => {
    const e = new JsonTextEditor(SAMPLE)
    e.set(['themeOverrides', 'colors', 'light', 'accent-strong'], '#2AC3DE')
    expect(e.text).toContain('  ],\n  "themeOverrides": {\n    "colors": {\n      "light": {\n        "accent-strong": "#2AC3DE"\n      }\n    }\n  }\n}\n')
    e.set(['themeOverrides', 'colors', 'dark', 'accent-strong'], '#2AC3DE')
    expect(e.get(['themeOverrides', 'colors'])).toEqual({ light: { 'accent-strong': '#2AC3DE' }, dark: { 'accent-strong': '#2AC3DE' } })
    expect(e.text).toContain('      },\n      "dark": {\n        "accent-strong": "#2AC3DE"\n      }\n')
  })

  it('should follow a four-space or tab indentation', () => {
    const four = new JsonTextEditor('{\n    "name": "A"\n}\n')
    four.set(['seo', 'ogImage'], '/o.png')
    expect(four.text).toBe('{\n    "name": "A",\n    "seo": {\n        "ogImage": "/o.png"\n    }\n}\n')
    const tabs = new JsonTextEditor('{\n\t"name": "A"\n}\n')
    tabs.set(['locale'], 'en')
    expect(tabs.text).toBe('{\n\t"name": "A",\n\t"locale": "en"\n}\n')
  })

  it('should insert into an empty object', () => {
    const e = new JsonTextEditor('{\n  "seo": {}\n}\n')
    e.set(['seo', 'ogImage'], '/o.png')
    expect(e.text).toBe('{\n  "seo": {\n    "ogImage": "/o.png"\n  }\n}\n')
  })

  it('should insert inline into a one-line object', () => {
    const e = new JsonTextEditor('{ "i18n": { "locale": "en" } }')
    e.set(['i18n', 'defaultLocale'], 'en')
    expect(e.text).toBe('{ "i18n": { "locale": "en", "defaultLocale": "en" } }')
  })

  it('should keep CRLF line endings', () => {
    const e = new JsonTextEditor('{\r\n  "name": "A"\r\n}\r\n')
    e.set(['locale'], 'en')
    expect(e.text).toBe('{\r\n  "name": "A",\r\n  "locale": "en"\r\n}\r\n')
  })

  it('should refuse to write through a value that is not an object', () => {
    const e = new JsonTextEditor('{ "seo": "x" }')
    expect(() => e.set(['seo', 'ogImage'], '/o.png')).toThrow('seo is not an object')
  })

  it('should fail clearly on text that is not JSON', () => {
    expect(() => new JsonTextEditor('{ nope')).toThrow()
  })
})
