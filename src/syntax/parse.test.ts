import { describe, expect, it } from 'bun:test'
import { isYamlConfig, parseSiteConfigText, serializeSiteConfig, SiteConfigError, SITE_CONFIG_FILES } from './parse'

describe('parseSiteConfigText', () => {
  it('should parse JSON and YAML into the same object', () => {
    const json = parseSiteConfigText('syntext.json', '{ "name": "Acme", "navigation": [{ "group": "A", "pages": ["index"] }] }')
    const yaml = parseSiteConfigText('syntext.yml', 'name: Acme\nnavigation:\n  - group: A\n    pages: [index]\n')
    expect(yaml).toEqual(json)
    expect(parseSiteConfigText('syntext.yaml', 'name: Acme')).toEqual({ name: 'Acme' })
  })

  it('should name the file and the format when it cannot be parsed', () => {
    expect(() => parseSiteConfigText('syntext.json', '{ nope')).toThrow(SiteConfigError)
    expect(() => parseSiteConfigText('syntext.json', '{ nope')).toThrow(/^syntext.json is not valid JSON/)
    expect(() => parseSiteConfigText('syntext.yml', 'a: [')).toThrow(/^syntext.yml is not valid YAML/)
  })

  it('should require an object at the top level', () => {
    expect(() => parseSiteConfigText('syntext.yml', '- a')).toThrow('syntext.yml must contain an object at the top level')
  })

  it('should list the file names in the order the build reads them', () => {
    expect(SITE_CONFIG_FILES).toEqual(['syntext.json', 'syntext.yaml', 'syntext.yml', 'syntext.config.json'])
    expect(isYamlConfig('syntext.yml')).toBe(true)
    expect(isYamlConfig('syntext.json')).toBe(false)
  })
})

describe('serializeSiteConfig', () => {
  it('should write JSON for a JSON file', () => {
    expect(serializeSiteConfig('syntext.json', '{}', { a: 1 })).toBe('{\n  "a": 1\n}\n')
  })

  it('should keep YAML comments when rewriting a YAML file', () => {
    const original = '# Site\nname: Acme # brand\nnavigation: []\n'
    const out = serializeSiteConfig('syntext.yml', original, { name: 'Acme', navigation: [{ group: 'A', pages: ['index'] }] })
    expect(out).toContain('# Site')
    expect(out).toContain('# brand')
    expect(parseSiteConfigText('syntext.yml', out)).toEqual({ name: 'Acme', navigation: [{ group: 'A', pages: ['index'] }] })
  })
})
