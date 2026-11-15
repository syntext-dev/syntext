import { describe, it, expect } from 'bun:test'
import fixtures from './content-rules.fixtures.json'
import { headHtmlErrors, serializeHeadHtml } from './head-html'

describe('head-html (fixtures shared with the CLI)', () => {
  for (const f of fixtures.head) it(`should answer "${f.name}"`, () => expect(headHtmlErrors(f.input)).toEqual(f.errors))
  for (const f of fixtures.serialize) it(`should serialize "${f.name}"`, () => expect(serializeHeadHtml(f.input, { scripts: f.scripts })).toEqual(f.output))
})

describe('head-html', () => {
  it('should never write a script out when scripts are off, however it is spelled', () => {
    for (const input of ['<SCRIPT>a()</SCRIPT>', '<script/src="https://x/a.js"></script>', '<noscript></noscript><script>b()</script>']) {
      const out = serializeHeadHtml(input, { scripts: false })
      expect(out.html.toLowerCase()).not.toContain('<script')
      expect(out.scriptsLeftOut).toBe(1)
    }
  })

  it('should stay fast on adversarial input', () => {
    for (const input of ['<!--'.repeat(2500), '<script'.repeat(1400), '<a'.repeat(5000), '<meta '.repeat(1600)]) {
      const t = performance.now()
      headHtmlErrors(input)
      expect(performance.now() - t).toBeLessThan(200)
    }
  })
})
