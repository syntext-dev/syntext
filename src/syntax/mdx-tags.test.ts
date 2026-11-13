import { describe, expect, it } from 'bun:test'
import { findTags, lineAt } from './mdx-tags'

describe('findTags', () => {
  it('should find PascalCase tags with their attributes, lines and offsets', () => {
    const src = 'Intro\n<Update label="v2" description="x">\nBody\n</Update>\n'
    const tags = findTags(src)
    expect(tags.map((t) => [t.name, t.closing, t.line])).toEqual([['Update', false, 2], ['Update', true, 4]])
    const [label, desc] = tags[0].attrs
    expect([label.name, label.value, label.line]).toEqual(['label', 'v2', 2])
    expect(src.slice(label.nameStart, label.nameEnd)).toBe('label')
    expect(desc.name).toBe('description')
  })

  it('should read attributes across lines and self-closing tags', () => {
    const tags = findTags('<Playground\n  method="POST"\n  base-url="https://x"\n/>\n')
    expect(tags[0].selfClosing).toBe(true)
    expect(tags[0].attrs.map((a) => [a.name, a.line])).toEqual([['method', 2], ['base-url', 3]])
  })

  it('should accept JSX expression and bare attributes', () => {
    const [tag] = findTags('<Accordion defaultOpen title={"A > B"} cols={2}>')
    expect(tag.attrs.map((a) => [a.name, a.value])).toEqual([['defaultOpen', null], ['title', '"A > B"'], ['cols', '2']])
  })

  it('should skip tags inside fences, inline code and HTML comments', () => {
    const src = '```mdx\n<Caution>x</Caution>\n```\nUse `<Caution>` here.\n<!-- <Caution> -->\n<Tip>ok</Tip>'
    expect(findTags(src).map((t) => t.name)).toEqual(['Tip', 'Tip'])
  })

  it('should ignore lowercase HTML tags', () => {
    expect(findTags('<div class="x"><span>a</span></div>')).toEqual([])
  })
})

describe('lineAt', () => {
  it('should map offsets to 1-based lines', () => {
    const at = lineAt('a\nbb\nccc')
    expect([at(0), at(2), at(5), at(8)]).toEqual([1, 2, 3, 3])
  })
})
