import { describe, it, expect } from 'bun:test'
import { colorDiff, formatSummary } from './format'
import type { SyntaxMigrationResult } from './run'

// eslint-disable-next-line no-control-regex
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

const result: SyntaxMigrationResult = {
  dryRun: false,
  configFile: 'syntext.json',
  applied: [
    { code: 'config.colors-accent', file: 'syntext.json', line: 6, old: 'colors.accent: "#2AC3DE"', replacement: 'themeOverrides.colors.light.accent-strong: "#2AC3DE"' },
    { code: 'config.language', file: 'syntext.json', line: 2, old: 'language: "en"', replacement: 'locale: "en"', note: 'locale was already set; kept "fr".' },
    { code: 'mdx.update-label', file: 'docs/u.mdx', line: 14, old: '<Update label="…">', replacement: '<Update title="…">' },
  ],
  held: [{ code: 'config.colors-primary', file: 'syntext.json', line: 5, old: 'colors.primary: "#6366F1"', replacement: 'appearance.accent: "#6366F1"', reason: 'Run with --v2 to apply it.' }],
  unsupported: [],
  files: [{ file: 'syntext.json', diff: '' }, { file: 'docs/u.mdx', diff: '' }],
  remaining: [{ file: 'syntext.json', line: 9, type: 'warning', code: 'config.unknown-key', message: 'Unknown key "nmae" is ignored. Did you mean "name"?' }],
}

describe('formatSummary', () => {
  it('should list each change with file and line, sorted by file then line', () => {
    const text = plain(formatSummary(result, { source: 'remote' }))
    expect(text).toContain('Rewrote 3 deprecated forms in 2 files.')
    const lines = text.split('\n')
    const a = lines.findIndex((l) => l.includes('syntext.json:2'))
    const b = lines.findIndex((l) => l.includes('syntext.json:6'))
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
    expect(text).toContain('docs/u.mdx:14  <Update label="…"> → <Update title="…">')
    expect(text).toContain('locale was already set; kept "fr".')
  })

  it('should list what was held and what still needs a person', () => {
    const text = plain(formatSummary(result, { source: 'remote' }))
    expect(text).toContain('Not rewritten (1)')
    expect(text).toContain('syntext.json:5  colors.primary: "#6366F1" → appearance.accent: "#6366F1". Run with --v2 to apply it.')
    expect(text).toContain('Still reported by stx check (1)')
    expect(text).toContain('syntext.json:9  Unknown key "nmae" is ignored. Did you mean "name"?')
  })

  it('should word a dry run as what would change', () => {
    expect(plain(formatSummary({ ...result, dryRun: true }, { source: 'remote' }))).toContain('Would rewrite 3 deprecated forms in 2 files. Nothing was written (--dry-run).')
  })

  it('should say when nothing is deprecated', () => {
    expect(plain(formatSummary({ ...result, applied: [], held: [], files: [], remaining: [] }, { source: 'remote' }))).toContain('No deprecated syntax found.')
  })

  it('should say when only held items are left', () => {
    expect(plain(formatSummary({ ...result, applied: [], files: [] }, { source: 'remote' }))).toContain('Nothing left to rewrite automatically.')
  })

  it('should say which table it used and why', () => {
    expect(plain(formatSummary(result, { source: 'bundled', warning: 'Could not refresh (offline).' }))).toContain('Could not refresh (offline).')
    expect(plain(formatSummary(result, { source: 'bundled' }))).toContain('deprecation table bundled with stx')
  })

  it('should name rules this stx cannot apply', () => {
    expect(plain(formatSummary({ ...result, unsupported: ['config.future'] }, { source: 'remote' }))).toContain('config.future')
  })

  it('should not claim it is done when only rules it cannot apply are left', () => {
    const text = plain(formatSummary({ ...result, applied: [], held: [], remaining: [], files: [], unsupported: ['frontmatter.future'] }, { source: 'remote' }))
    expect(text).toContain('Nothing rewritten, but the deprecation table has rules this stx cannot apply.')
    expect(text).toContain('This stx cannot apply frontmatter.future. Update stx and run it again.')
    expect(text).not.toContain('No deprecated syntax found.')
  })

  it('should say where the home conversion took the site data from', () => {
    const fromBuild = plain(formatSummary({ ...result, home: { file: 'docs/index.mdx', from: 'last-build' } }, { source: 'remote' }))
    expect(fromBuild).toContain("docs/index.mdx: the home components follow the last build's site data.")
    const local = plain(formatSummary({ ...result, home: { file: 'docs/index.mdx', from: 'local', reason: 'not logged in' } }, { source: 'remote' }))
    expect(local).toContain('docs/index.mdx: the home components follow the local files (not logged in).')
  })
})

describe('colorDiff', () => {
  it('should keep the diff text', () => {
    expect(plain(colorDiff('--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b'))).toBe('--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b')
  })
})
