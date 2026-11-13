// Copied from syntext-backend src/modules/deprecations/mdx-tags.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * A small tag reader for MDX source: PascalCase component tags with their
 * attributes, line numbers and offsets, outside fenced code, inline code and
 * HTML comments. Used to find deprecated tags and props (with the line for the
 * build log) and to map new names onto what the renderer reads.
 *
 * Deliberately not a parser: the compiler treats components as raw HTML
 * (contract §0.1), so the source text is what matters.
 */
import { isFenced, scanFences } from './fences'

export type TagAttr = {
  name: string
  /** Unquoted value; `{…}` contents for an expression; null for a bare attribute. */
  value: string | null
  line: number
  nameStart: number
  nameEnd: number
  /** End offset of the whole attribute (value included). */
  end: number
}

export type TagMatch = {
  name: string
  closing: boolean
  selfClosing: boolean
  line: number
  /** Offset of `<`. */
  start: number
  /** Offset of the name's first character. */
  nameStart: number
  /** Offset just past `>`. */
  end: number
  attrs: TagAttr[]
}

/** Offset → 1-based line. */
export function lineAt(text: string): (offset: number) => number {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return (offset) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}

const blank = (s: string) => s.replace(/[^\n]/g, ' ')

/** The source with code and comments blanked out, same length and line breaks. */
function mask(source: string): string {
  const lines = source.split('\n')
  const fences = scanFences(lines)
  const masked = lines.map((line, i) => (isFenced(fences[i]) ? blank(line) : line.replace(/(`+)[^`]*?\1/g, blank))).join('\n')
  return masked.replace(/<!--[\s\S]*?-->/g, blank)
}

const TAG_START = /<(\/?)([A-Z][A-Za-z0-9]*)(?=[\s/>])/g
const ATTR_NAME = /[A-Za-z_:@][-A-Za-z0-9_:.]*/y

export function findTags(source: string): TagMatch[] {
  const text = mask(source)
  const line = lineAt(source)
  const out: TagMatch[] = []
  TAG_START.lastIndex = 0
  for (let m = TAG_START.exec(text); m; m = TAG_START.exec(text)) {
    const start = m.index
    const nameStart = start + 1 + m[1].length
    const attrs: TagAttr[] = []
    let i = nameStart + m[2].length
    let selfClosing = false
    let closed = false
    while (i < text.length) {
      const ch = text[i]
      if (/\s/.test(ch)) { i++; continue }
      if (ch === '>') { closed = true; i++; break }
      if (ch === '/' && text[i + 1] === '>') { selfClosing = true; closed = true; i += 2; break }
      ATTR_NAME.lastIndex = i
      const nm = ATTR_NAME.exec(text)
      if (!nm) break
      const attr: TagAttr = { name: nm[0], value: null, line: line(i), nameStart: i, nameEnd: i + nm[0].length, end: i + nm[0].length }
      i = attr.nameEnd
      if (text[i] === '=') {
        i++
        const q = text[i]
        if (q === '"' || q === "'") {
          const close = text.indexOf(q, i + 1)
          if (close === -1) break
          attr.value = source.slice(i + 1, close)
          i = close + 1
        } else if (q === '{') {
          let depth = 0
          let j = i
          for (; j < text.length; j++) {
            if (text[j] === '{') depth++
            else if (text[j] === '}' && --depth === 0) break
          }
          attr.value = source.slice(i + 1, j)
          i = j + 1
        } else {
          const bare = /[^\s>]+/y
          bare.lastIndex = i
          const v = bare.exec(text)
          attr.value = v ? v[0].replace(/\/$/, '') : ''
          i += v ? v[0].length : 0
        }
        attr.end = i
      }
      attrs.push(attr)
    }
    if (!closed) continue
    out.push({ name: m[2], closing: m[1] === '/', selfClosing, line: line(start), start, nameStart, end: i, attrs })
    TAG_START.lastIndex = i
  }
  return out
}
