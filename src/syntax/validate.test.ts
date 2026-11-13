import { describe, it, expect } from 'bun:test'
import golden from './fixtures/validate-golden.json'
import { keysAt, schemaIssues, validateSiteConfig } from './validate'

/**
 * `fixtures/validate-golden.json` is the backend's `validateSiteConfig` (Zod)
 * run over a corpus of configs. The CLI validates against the generated JSON
 * Schema instead of Zod, so this pins the two to the same messages.
 */
describe('validateSiteConfig', () => {
  for (const c of golden as Array<{ name: string; config: unknown; issues: unknown[] }>) {
    it(`should report what the backend reports for the ${c.name} corpus config`, () => {
      expect(validateSiteConfig(c.config)).toEqual(c.issues as never)
    })
  }

  it('should accept an empty config', () => {
    expect(validateSiteConfig({})).toEqual([])
  })

  it('should add the line of each issue when given the file text', () => {
    const source = '{\n  "name": "A",\n  "nmae": "B",\n  "seo": {\n    "ogimage": "x"\n  }\n}\n'
    const issues = validateSiteConfig(JSON.parse(source), { source })
    expect(issues.map((i) => [i.path, i.line])).toEqual([['seo.ogimage', 5], ['nmae', 3]])
  })

  it('should locate lines in YAML too', () => {
    const source = '# site\nname: A\nfeatures:\n  playgroud: true\n'
    const issues = validateSiteConfig({ name: 'A', features: { playgroud: true } }, { source })
    expect(issues[0]).toMatchObject({ path: 'features.playgroud', line: 4, suggestion: 'playground' })
  })

  it('should accept null where the schema allows it', () => {
    expect(validateSiteConfig({ status: null, topbarCta: null })).toEqual([])
  })

  it('should report a nullable object by its inner shape', () => {
    expect(validateSiteConfig({ status: 5 })[0]?.message).toBe('status should be an object, not a number.')
  })
})

describe('schemaIssues', () => {
  it('should report unknown keys after the property issues of the same object', () => {
    const raw = schemaIssues({ name: 1, zzz: true })
    expect(raw.map((i) => i.code)).toEqual(['invalid_type', 'unrecognized_keys'])
  })

  it('should follow $ref into the navigation definition', () => {
    const raw = schemaIssues({ navigation: [{ group: 'a', pages: [{ group: 'b', pagez: [] }] }] })
    expect(raw[0]?.code).toBe('invalid_union')
  })
})

describe('keysAt', () => {
  it('should list the top-level keys', () => {
    expect(keysAt([])).toContain('appearance')
  })

  it('should merge the keys of union branches', () => {
    expect(keysAt(['logo'])).toEqual(['light', 'dark', 'type', 'suffix'])
  })

  it('should walk arrays by index', () => {
    expect(keysAt(['redirects', 0])).toContain('from')
  })

  it('should walk into referenced definitions', () => {
    expect(keysAt(['navigation', 0])).toContain('pages')
  })

  it('should return nothing for a path the schema does not have', () => {
    expect(keysAt(['nope', 'deeper'])).toEqual([])
  })
})
