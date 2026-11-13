// Copied from syntext-backend src/modules/compiler/fences.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * Line-level fenced-code-block detection for the raw-source pre-processors in
 * the compiler. Every pass that rewrites MDX source line by line must leave
 * the inside of a fence alone, and a naive "any ``` line toggles" check gets
 * nested examples wrong: in a ```mdx block documenting `<Step>`, the indented
 * inner "    ```" line would end the outer block.
 *
 * Rules (CommonMark, adapted to component bodies that are dedented later):
 * - An opener is a run of 3+ backticks or 3+ tildes, followed by an optional
 *   info string; a backtick opener's info string may not contain a backtick.
 *   Openers are accepted at any indentation, because fences inside an
 *   indented component body (`<Tab>\n    ```bash`) are real fences once the
 *   body is dedented.
 * - A closer uses the same char, is at least as long as the opener, has no
 *   info string, and is indented at most 3 columns more than the opener.
 * - A fence that is never closed runs to the end of the document.
 */
export type FenceLine =
  | { kind: 'text' }
  | { kind: 'open'; indent: number }
  | { kind: 'code'; openIndent: number }
  | { kind: 'close'; openIndent: number }

const FENCE_RE = /^([ \t]*)(`{3,}|~{3,})(.*)$/

function indentWidth(ws: string): number {
  let width = 0
  for (const ch of ws) width += ch === '\t' ? 4 : 1
  return width
}

export function scanFences(lines: string[]): FenceLine[] {
  const out: FenceLine[] = []
  let open: { char: string; len: number; indent: number } | null = null

  for (const line of lines) {
    const m = line.match(FENCE_RE)

    if (open) {
      if (
        m &&
        m[2][0] === open.char &&
        m[2].length >= open.len &&
        m[3].trim() === '' &&
        indentWidth(m[1]) <= open.indent + 3
      ) {
        out.push({ kind: 'close', openIndent: open.indent })
        open = null
      } else {
        out.push({ kind: 'code', openIndent: open.indent })
      }
      continue
    }

    if (m && !(m[2][0] === '`' && m[3].includes('`'))) {
      const indent = indentWidth(m[1])
      open = { char: m[2][0], len: m[2].length, indent }
      out.push({ kind: 'open', indent })
      continue
    }

    out.push({ kind: 'text' })
  }

  return out
}

/** Whether a scanned line is part of a fenced code block (delimiters included). */
export function isFenced(line: FenceLine): boolean {
  return line.kind !== 'text'
}
