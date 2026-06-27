import { readFile } from 'node:fs/promises'
import { parseAnnotationBlock } from './parse-annotation'
import { parsePythonDocstring } from './parse-conventional'
import type { AnnotatedSymbol, ParsedSignature, SignatureParam } from './types'

/**
 * Parse Python files for @stx annotations and conventional docstrings.
 * Priority: @stx annotations > Google/NumPy/Sphinx-style docstrings.
 * Supports:
 *   # @stx group "GroupName"
 *   Triple-quoted docstrings containing @stx directives
 *   Standard Google, NumPy, and Sphinx docstrings (zero-config)
 */
export async function parsePython(filePath: string): Promise<AnnotatedSymbol[]> {
  const source = await readFile(filePath, 'utf-8')
  return parsePythonSource(source, filePath)
}

export function parsePythonSource(source: string, filePath: string): AnnotatedSymbol[] {
  const symbols: AnnotatedSymbol[] = []
  const lines = source.split('\n')

  let i = 0
  while (i < lines.length) {
    // Look for comment blocks with @stx (before a def/class)
    const commentResult = extractPythonComment(lines, i)
    if (commentResult) {
      const { comment, endLine } = commentResult
      const annotation = parseAnnotationBlock(comment)

      if (annotation) {
        let defLine = endLine + 1
        while (defLine < lines.length && lines[defLine].trim() === '') defLine++

        if (defLine < lines.length) {
          const sig = parsePythonDefinition(lines, defLine)
          if (sig) {
            // Also check for docstring @stx inside the function
            const docstring = extractDocstring(lines, defLine + 1)
            if (docstring) {
              const docAnnotation = parseAnnotationBlock(docstring.content)
              if (docAnnotation) {
                // Merge: doc annotations override comment annotations
                Object.assign(annotation, { ...annotation, ...docAnnotation, group: annotation.group || docAnnotation.group })
              }
            }

            symbols.push({
              kind: sig.kind,
              name: sig.signature.name,
              annotation,
              signature: sig.signature,
              sourceFile: filePath,
              sourceLine: defLine + 1,
            })
          }
        }
      }
      i = endLine + 1
      continue
    }

    // Look for def/class with docstring
    const defSig = parsePythonDefinition(lines, i)
    if (defSig) {
      const docstring = extractDocstring(lines, i + 1)
      if (docstring) {
        // Priority: @stx annotations > conventional docstrings
        const annotation = docstring.content.includes('@stx')
          ? parseAnnotationBlock(docstring.content)
          : parsePythonDocstring(docstring.content)

        if (annotation) {
          symbols.push({
            kind: defSig.kind,
            name: defSig.signature.name,
            annotation,
            signature: defSig.signature,
            sourceFile: filePath,
            sourceLine: i + 1,
          })
        }
      }
    }

    i++
  }

  return symbols
}

function extractPythonComment(lines: string[], startIdx: number): { comment: string; endLine: number } | null {
  const line = lines[startIdx].trim()
  if (!line.startsWith('#')) return null

  const commentLines: string[] = []
  let end = startIdx

  while (end < lines.length && lines[end].trim().startsWith('#')) {
    commentLines.push(lines[end].trim().slice(1).trim())
    end++
  }

  const comment = commentLines.join('\n')
  if (comment.includes('@stx')) {
    return { comment, endLine: end - 1 }
  }
  return null
}

function extractDocstring(lines: string[], afterDef: number): { content: string; endLine: number } | null {
  // Find first non-empty line after def
  let i = afterDef
  while (i < lines.length && lines[i].trim() === '') i++
  if (i >= lines.length) return null

  const line = lines[i].trim()
  const tripleQuote = line.startsWith('"""') ? '"""' : line.startsWith("'''") ? "'''" : null
  if (!tripleQuote) return null

  // Single-line docstring
  if (line.endsWith(tripleQuote) && line.length > 6) {
    return { content: line.slice(3, -3), endLine: i }
  }

  // Multi-line
  const docLines: string[] = [line.slice(3)]
  let end = i + 1
  while (end < lines.length) {
    const l = lines[end]
    if (l.trim().endsWith(tripleQuote)) {
      docLines.push(l.trim().slice(0, -3))
      break
    }
    docLines.push(l.trim())
    end++
  }

  return { content: docLines.join('\n'), endLine: end }
}

type ParsedDef = { kind: AnnotatedSymbol['kind']; signature: ParsedSignature }

function parsePythonDefinition(lines: string[], idx: number): ParsedDef | null {
  let line = lines[idx].trim()

  // Collect continuation lines
  while (line.endsWith('\\') || (line.includes('(') && !line.includes(')'))) {
    idx++
    if (idx >= lines.length) break
    line += ' ' + lines[idx].trim()
  }

  // Decorators
  const modifiers: string[] = []
  if (idx > 0) {
    let di = idx - 1
    while (di >= 0 && lines[di].trim().startsWith('@')) {
      modifiers.push(lines[di].trim())
      di--
    }
  }

  // Class
  const classMatch = line.match(/^class\s+(\w+)\s*(?:\(([^)]*)\))?:/)
  if (classMatch) {
    return {
      kind: 'class',
      signature: { name: classMatch[1], params: [], modifiers },
    }
  }

  // Function/method
  const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*(.+?))?\s*:/)
  if (funcMatch) {
    const isAsync = line.startsWith('async')
    if (isAsync) modifiers.push('async')

    return {
      kind: 'function',
      signature: {
        name: funcMatch[1],
        params: parsePythonParams(funcMatch[2]),
        returnType: funcMatch[3]?.trim(),
        modifiers,
      },
    }
  }

  return null
}

function parsePythonParams(raw: string): SignatureParam[] {
  if (!raw.trim()) return []

  const params: SignatureParam[] = []
  let depth = 0
  let current = ''

  for (const ch of raw) {
    if (ch === '[' || ch === '(' || ch === '{') depth++
    else if (ch === ']' || ch === ')' || ch === '}') depth--
    else if (ch === ',' && depth === 0) {
      const p = parsePythonSingleParam(current.trim())
      if (p) params.push(p)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) {
    const p = parsePythonSingleParam(current.trim())
    if (p) params.push(p)
  }

  return params
}

function parsePythonSingleParam(raw: string): SignatureParam | null {
  if (raw === 'self' || raw === 'cls') return null

  const rest = raw.startsWith('*') && !raw.startsWith('**')
  const kwargs = raw.startsWith('**')
  const cleaned = raw.replace(/^\*{1,2}/, '')

  // name: Type = default
  const fullMatch = cleaned.match(/^(\w+)\s*:\s*([^=]+?)(?:\s*=\s*(.+))?$/)
  if (fullMatch) {
    return {
      name: fullMatch[1],
      type: fullMatch[2].trim(),
      optional: !!fullMatch[3],
      defaultValue: fullMatch[3]?.trim(),
      rest: rest || kwargs,
    }
  }

  // name = default
  const defMatch = cleaned.match(/^(\w+)\s*=\s*(.+)$/)
  if (defMatch) {
    return { name: defMatch[1], type: 'Any', optional: true, defaultValue: defMatch[2].trim(), rest }
  }

  // Just name
  if (/^\w+$/.test(cleaned)) {
    return { name: cleaned, type: 'Any', rest: rest || kwargs }
  }

  return null
}
