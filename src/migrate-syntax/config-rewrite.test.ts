import { describe, it, expect } from 'bun:test'
import { deprecationTable } from '../syntax/table'
import { JsonTextEditor } from './json-edit'
import { YamlTextEditor } from './yaml-edit'
import { rewriteConfig } from './config-rewrite'

const items = deprecationTable().items

const run = (text: string, opts: { applyV2?: boolean; yaml?: boolean } = {}) => {
  const editor = opts.yaml ? new YamlTextEditor(text) : new JsonTextEditor(text)
  const r = rewriteConfig({ editor, fileName: opts.yaml ? 'syntext.yml' : 'syntext.json', items, applyV2: opts.applyV2 ?? false })
  return { ...r, text: editor.text, config: editor.get([]) as Record<string, unknown> }
}

describe('rewriteConfig', () => {
  it('should move colors.accent into themeOverrides for both modes and drop the empty block', () => {
    const r = run('{\n  "name": "A",\n  "colors": {\n    "accent": "#2AC3DE"\n  }\n}\n')
    expect(r.config).toEqual({ name: 'A', themeOverrides: { colors: { light: { 'accent-strong': '#2AC3DE' }, dark: { 'accent-strong': '#2AC3DE' } } } })
    expect(r.applied).toEqual([{ code: 'config.colors-accent', file: 'syntext.json', line: 4, old: 'colors.accent: "#2AC3DE"', replacement: 'themeOverrides.colors.light.accent-strong: "#2AC3DE" and themeOverrides.colors.dark.accent-strong: "#2AC3DE"' }])
  })

  it('should hold v2-only moves on a v1 site', () => {
    const r = run('{\n  "theme": "default",\n  "colors": { "primary": "#6366F1" }\n}\n')
    expect(r.applied).toEqual([])
    expect(r.held).toEqual([{ code: 'config.colors-primary', file: 'syntext.json', line: 3, old: 'colors.primary: "#6366F1"', replacement: 'appearance.accent: "#6366F1"', reason: 'Moves the value into appearance, which switches the site to doc engine v2. Run with --v2 to apply it.' }])
    expect(r.config.colors).toEqual({ primary: '#6366F1' })
  })

  it('should apply v2-only moves when asked, or when the site is already on v2', () => {
    expect(run('{ "colors": { "primary": "#6366F1" } }', { applyV2: true }).config).toEqual({ appearance: { accent: '#6366F1' } })
    expect(run('{ "theme": "paper", "colors": { "primary": "#6366F1" } }').config).toEqual({ theme: 'paper', appearance: { accent: '#6366F1' } })
  })

  it('should map values on the way', () => {
    const r = run('{ "theme": "atlas", "features": { "navStyle": "single", "sidebarStyle": "collapsible", "playground": true } }')
    expect(r.config).toEqual({ theme: 'atlas', features: { playground: true }, appearance: { layout: { header: 'simple', nav: 'chevrons' } } })
  })

  it('should keep a target that is already set and still remove the old key', () => {
    const r = run('{ "locale": "fr", "language": "en" }')
    expect(r.config).toEqual({ locale: 'fr' })
    expect(r.applied[0]?.note).toBe('locale was already set; kept "fr".')
  })

  it('should rename sibling keys in place, in every array element', () => {
    const r = run('{\n  "redirects": [\n    { "source": "/a", "destination": "/b" },\n    { "source": "/c", "to": "/d" }\n  ]\n}\n')
    expect(r.text).toBe('{\n  "redirects": [\n    { "from": "/a", "to": "/b" },\n    { "from": "/c", "to": "/d" }\n  ]\n}\n')
    expect(r.applied.map((c) => [c.code, c.line])).toEqual([['config.redirect-source', 3], ['config.redirect-source', 4], ['config.redirect-destination', 3]])
  })

  it('should set values, delete no-op keys and move ogImage', () => {
    const r = run('{ "theme": "atlas", "appearance": { "layout": { "nav": "collapsible" } }, "features": { "codeLanguageTabs": true }, "ogImage": "/o.png" }')
    expect(r.config).toEqual({ theme: 'atlas', appearance: { layout: { nav: 'chevrons' } }, seo: { ogImage: '/o.png' } })
  })

  it('should rewrite YAML and keep its comments', () => {
    const r = run('# site\nlanguage: en # main\ni18n:\n  sourceLocale: en\n  targetLocales: [fr, de]\n', { yaml: true })
    expect(r.text).toBe('# site\nlocale: en # main\ni18n:\n  defaultLocale: en\n  locales: [fr, de]\n')
  })

  it('should be idempotent', () => {
    const once = run('{ "colors": { "accent": "#000", "background": "#fff" }, "language": "en", "i18n": { "locale": "en" } }', { applyV2: true })
    const twice = run(once.text, { applyV2: true })
    expect(twice.applied).toEqual([])
    expect(twice.text).toBe(once.text)
  })

  it('should skip a rule it does not know and say so', () => {
    const editor = new JsonTextEditor('{ "a": 1 }')
    const r = rewriteConfig({ editor, fileName: 'syntext.json', items: [{ code: 'config.future', kind: 'config', old: 'a', replacement: 'b', fix: 'f', requiresV2: false, rewrite: { type: 'teleport' } as never }], applyV2: false })
    expect(r.unsupported).toEqual(['config.future'])
  })

  it('should hold a move whose target cannot be written', () => {
    const r = run('{ "seo": "x", "ogImage": "/o.png" }')
    expect(r.held[0]).toMatchObject({ code: 'config.og-image', reason: 'seo is not an object; move it by hand.' })
    expect(r.config).toEqual({ seo: 'x', ogImage: '/o.png' })
  })
})
