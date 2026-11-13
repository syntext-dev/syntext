import { describe, expect, it } from 'bun:test'
import { DEPRECATIONS } from './registry'
import { deprecationsMarkdown, deprecationTable, describeRewrite } from './table'

describe('deprecation table', () => {
  it('should list every registry entry in the JSON shape', () => {
    const t = deprecationTable()
    expect(t.version).toBe(1)
    expect(t.windowDays).toBe(14)
    expect(t.items.map((i) => i.code)).toEqual(DEPRECATIONS.map((d) => d.code))
    expect(t.items.find((i) => i.code === 'config.colors-primary')?.requiresV2).toBe(true)
    expect(t.items.find((i) => i.code === 'mdx.caution')?.requiresV2).toBe(false)
  })

  it('should render one markdown row per entry', () => {
    const md = deprecationsMarkdown()
    expect(md.split('\n')).toHaveLength(DEPRECATIONS.length + 2)
    expect(md).toContain('| `mdx.update-label` | mdx-prop |')
  })

  it('should describe every rewrite type', () => {
    expect(describeRewrite({ type: 'move-key', from: 'a', to: ['b', 'c'], values: { x: 'y' } })).toBe('move `a` to `b` and `c` mapping "x"→"y"; keep a target that is already set')
    expect(describeRewrite({ type: 'set-value', path: 'p', from: 'a', to: 'b' })).toContain('from "a" to "b"')
    expect(describeRewrite({ type: 'remove-key', path: 'p' })).toBe('delete `p`')
    expect(describeRewrite({ type: 'rename-file', from: 'a', to: 'b' })).toBe('rename `a` to `b`')
    expect(describeRewrite({ type: 'rename-frontmatter-key', from: 'a', to: 'b' })).toContain('unless `b` is set')
    expect(describeRewrite({ type: 'frontmatter-flag-to-value', from: 'f', to: 'l', value: 'v' })).toContain('`l: v`')
    expect(describeRewrite({ type: 'rename-tag', from: 'A', to: 'B' })).toContain('`<B>`')
    expect(describeRewrite({ type: 'tag-from-prop', tag: 'C', prop: 't', map: { a: 'A' } })).toContain('a→A')
    expect(describeRewrite({ type: 'rename-prop', tag: 'T', from: 'a', to: 'b' })).toContain('on `<T>`')
    expect(describeRewrite({ type: 'manual', hint: 'h' })).toBe('manual: h')
  })
})
