// Copied from syntext-backend src/modules/deprecations/locate.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * Line numbers for keys in a JSON or YAML document, so a build warning can
 * name `syntext.json:12` rather than just the key. JSON is parsed as YAML
 * (a JSON document is valid YAML 1.2), which gives source ranges for both.
 */
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node } from 'yaml'

export type PathSegment = string | number
export type LineLocator = (path: readonly PathSegment[]) => number

/** A locator over `text`; any path it cannot find resolves to `fallback`. */
export function lineLocator(text: string, offsetLines = 0, fallback = 1): LineLocator {
  const counter = new LineCounter()
  let root: unknown
  try {
    root = parseDocument(text, { lineCounter: counter, uniqueKeys: false }).contents
  } catch {
    return () => fallback
  }
  return (path) => {
    let node: unknown = root
    let offset: number | undefined
    for (const seg of path) {
      if (isMap(node)) {
        const pair = node.items.find((p) => (isScalar(p.key) ? String(p.key.value) : String(p.key)) === String(seg))
        if (!pair) break
        offset = (pair.key as Node | null)?.range?.[0] ?? offset
        node = pair.value
      } else if (isSeq(node) && typeof seg === 'number') {
        const item = node.items[seg] as Node | undefined
        if (!item) break
        offset = item.range?.[0] ?? offset
        node = item
      } else break
    }
    return offset === undefined ? fallback : counter.linePos(offset).line + offsetLines
  }
}

/**
 * The frontmatter block of a page: its YAML text and the line it starts on.
 * Mirrors gray-matter: a first line of `---`, closed by the next `---` line.
 */
export function frontmatterBlock(source: string): { text: string; firstLine: number } | null {
  const lines = source.split('\n')
  if (lines[0]?.trim() !== '---') return null
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return { text: lines.slice(1, i).join('\n'), firstLine: 2 }
  }
  return null
}
