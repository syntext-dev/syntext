import { describe, expect, it } from 'bun:test'
import { frontmatterBlock, lineLocator } from './locate'

describe('lineLocator', () => {
  it('should find nested keys in JSON when present', () => {
    const json = '{\n  "name": "Acme",\n  "colors": {\n    "primary": "#f00"\n  },\n  "redirects": [\n    { "source": "/a", "to": "/b" }\n  ]\n}'
    const at = lineLocator(json)
    expect(at(['name'])).toBe(2)
    expect(at(['colors', 'primary'])).toBe(4)
    expect(at(['redirects', 0, 'source'])).toBe(7)
  })

  it('should find keys in YAML and apply a line offset', () => {
    const yaml = 'name: Acme\nfeatures:\n  navStyle: single\n'
    expect(lineLocator(yaml)(['features', 'navStyle'])).toBe(3)
    expect(lineLocator(yaml, 1)(['name'])).toBe(2)
  })

  it('should fall back to the deepest known key or the fallback line', () => {
    const at = lineLocator('{\n "a": {\n  "b": 1\n }\n}', 0, 9)
    expect(at(['a', 'missing'])).toBe(2)
    expect(at(['nope'])).toBe(9)
    expect(at([])).toBe(9)
  })

  it('should not throw on text that is not YAML', () => {
    expect(lineLocator('{ "a": ', 0, 3)(['a'])).toBeGreaterThanOrEqual(1)
  })
})

describe('frontmatterBlock', () => {
  it('should return the YAML between the fences when present', () => {
    expect(frontmatterBlock('---\ntitle: A\n---\nbody')).toEqual({ text: 'title: A', firstLine: 2 })
  })

  it('should return null without a frontmatter block', () => {
    expect(frontmatterBlock('# Title')).toBeNull()
    expect(frontmatterBlock('---\ntitle: A\n')).toBeNull()
  })
})
