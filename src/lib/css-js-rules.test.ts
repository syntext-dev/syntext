import { describe, it, expect } from 'bun:test'
import fixtures from './content-rules.fixtures.json'
import { cssContentErrors, cssUrls, escapeScriptText, isAllowedLoadUrl, jsContentErrors, stripCssComments } from './css-js-rules'

describe('css-js-rules (fixtures shared with the CLI)', () => {
  for (const f of fixtures.css) it(`should answer CSS "${f.name}"`, () => expect(cssContentErrors(f.input)).toEqual(f.errors))
  for (const f of fixtures.js) it(`should answer JS "${f.name}"`, () => expect(jsContentErrors(f.input)).toEqual(f.errors))
  for (const f of fixtures.escapeScript) it(`should escape ${JSON.stringify(f.input)}`, () => expect(escapeScriptText(f.input)).toBe(f.output))
})

describe('css-js-rules', () => {
  it('should read image-set() and src() strings as URLs, and skip other functions', () => {
    expect(cssUrls('a{b:image-set("x.png" 1x, url(y.png) 2x)} @font-face{src:src("f.woff")} c{d:attr(src("no"))}')).toEqual(['y.png', 'x.png', 'f.woff', 'no'])
    expect(cssUrls('a{content:"http://not-a-load"}')).toEqual([])
  })

  it('should strip comments, an unclosed one to the end', () => {
    expect(stripCssComments('a/* x */b/* y')).toBe('ab')
  })

  it('should allow https and relative loads only', () => {
    expect(isAllowedLoadUrl('https://cdn.example/a.js')).toBe(true)
    expect(isAllowedLoadUrl('/a.js')).toBe(true)
    for (const u of ['', 'http://x/a.js', '//x/a.js', '\\\\x', 'data:text/javascript,1']) expect(isAllowedLoadUrl(u)).toBe(false)
  })

  it('should stay linear on adversarial input', () => {
    for (const input of ['image-set('.repeat(6000), 'src("'.repeat(12000), '/*'.repeat(30000), '\\'.repeat(60000)]) {
      const t = performance.now()
      cssContentErrors(input)
      expect(performance.now() - t).toBeLessThan(50)
    }
  })
})
