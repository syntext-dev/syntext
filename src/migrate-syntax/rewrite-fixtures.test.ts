import { describe, it, expect } from 'bun:test'
import fixtures from './rewrite.fixtures.json'
import { rewriteConfig } from './config-rewrite'
import { JsonTextEditor } from './json-edit'
import { rewritePage } from './page-rewrite'
import { YamlTextEditor } from './yaml-edit'
import { deprecationTable } from '../syntax/table'

// Shared with the other app (rewrite.fixtures.json is copied byte for byte): both rewrite engines must give these answers.
const items = deprecationTable().items

describe('rewrite fixtures (shared by the CLI and the backend)', () => {
  for (const f of fixtures.pages) {
    it(`should rewrite the page: ${f.name}`, () => {
      const r = rewritePage(f.file, f.input, items)
      expect(r.text).toBe(f.output)
      expect(r.applied.map((c) => c.code)).toEqual(f.applied)
      expect(r.held.map((h) => h.code)).toEqual(f.held)
    })
  }
  for (const f of fixtures.configs) {
    it(`should rewrite the config: ${f.name}`, () => {
      const editor = f.file.endsWith('.json') ? new JsonTextEditor(f.input) : new YamlTextEditor(f.input)
      const r = rewriteConfig({ editor, fileName: f.file, items, applyV2: f.applyV2 })
      expect(editor.text).toBe(f.output)
      expect(r.applied.map((c) => c.code)).toEqual(f.applied)
      expect(r.held.map((h) => h.code)).toEqual(f.held)
    })
  }
})
