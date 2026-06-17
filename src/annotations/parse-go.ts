import { readFile } from 'node:fs/promises'
import { parseAnnotationBlock } from './parse-annotation'
import type { AnnotatedSymbol, ParsedSignature, SignatureParam } from './types'

/**
 * Parse Go files for @stx annotations in `// @stx ...` comments.
 */
export async function parseGo(filePath: string): Promise<AnnotatedSymbol[]> {
  const source = await readFile(filePath, 'utf-8')
  return parseGoSource(source, filePath)
}

export function parseGoSource(source: string, filePath: string): AnnotatedSymbol[] {
  const symbols: AnnotatedSymbol[] = []
  const lines = source.split('\n')

  let i = 0
  while (i < lines.length) {
    const commentResult = extractGoComment(lines, i)
    if (commentResult) {
      const { comment, endLine } = commentResult
      const annotation = parseAnnotationBlock(comment)

      if (annotation) {
        let defLine = endLine + 1
        while (defLine < lines.length && lines[defLine].trim() === '') defLine++

        if (defLine < lines.length) {
          const sig = parseGoDefinition(lines, defLine)
          if (sig) {
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
    } else {
      i++
    }
  }

  return symbols
}

function extractGoComment(lines: string[], startIdx: number): { comment: string; endLine: number } | null {
  const line = lines[startIdx].trim()

  // Single-line // comments (consecutive)
  if (line.startsWith('//')) {
    const commentLines: string[] = []
    let end = startIdx
    while (end < lines.length && lines[end].trim().startsWith('//')) {
      commentLines.push(lines[end].trim().slice(2).trim())
      end++
    }
    const comment = commentLines.join('\n')
    if (comment.includes('@stx')) {
      return { comment, endLine: end - 1 }
    }
    return null
  }

  // Block comment /* ... */
  if (line.startsWith('/*')) {
    const commentLines: string[] = []
    let end = startIdx

    if (line.includes('*/')) {
      const content = line.replace(/^\/\*/, '').replace(/\*\/$/, '').trim()
      if (content.includes('@stx')) return { comment: content, endLine: end }
      return null
    }

    commentLines.push(line.replace(/^\/\*/, '').trim())
    end++
    while (end < lines.length) {
      const l = lines[end].trim()
      if (l.includes('*/')) {
        commentLines.push(l.replace(/\*\/.*$/, '').trim())
        break
      }
      commentLines.push(l.replace(/^\*\s?/, '').trim())
      end++
    }

    const comment = commentLines.join('\n')
    if (comment.includes('@stx')) {
      return { comment, endLine: end }
    }
    return null
  }

  return null
}

type ParsedDef = { kind: AnnotatedSymbol['kind']; signature: ParsedSignature }

function parseGoDefinition(lines: string[], idx: number): ParsedDef | null {
  let line = lines[idx].trim()

  // Collect multi-line definitions
  let fullDef = line
  let di = idx + 1
  while (di < lines.length && di - idx < 10) {
    if (fullDef.includes('{') || fullDef.endsWith(')')) break
    fullDef += ' ' + lines[di].trim()
    di++
  }

  // Function: func Name(params) returnType
  const funcMatch = fullDef.match(/^func\s+(\w+)\s*\(([^)]*)\)\s*(.*)/)
  if (funcMatch) {
    const returnRaw = funcMatch[3].replace(/\{.*$/, '').trim()
    return {
      kind: 'function',
      signature: {
        name: funcMatch[1],
        params: parseGoParams(funcMatch[2]),
        returnType: returnRaw || undefined,
        modifiers: ['export'], // Go exported = capitalized, but we include it
      },
    }
  }

  // Method: func (receiver) Name(params) returnType
  const methodMatch = fullDef.match(/^func\s+\([^)]+\)\s+(\w+)\s*\(([^)]*)\)\s*(.*)/)
  if (methodMatch) {
    const returnRaw = methodMatch[3].replace(/\{.*$/, '').trim()
    return {
      kind: 'method',
      signature: {
        name: methodMatch[1],
        params: parseGoParams(methodMatch[2]),
        returnType: returnRaw || undefined,
      },
    }
  }

  // Type struct
  const structMatch = fullDef.match(/^type\s+(\w+)\s+struct\b/)
  if (structMatch) {
    return { kind: 'class', signature: { name: structMatch[1], params: [] } }
  }

  // Type interface
  const ifaceMatch = fullDef.match(/^type\s+(\w+)\s+interface\b/)
  if (ifaceMatch) {
    return { kind: 'interface', signature: { name: ifaceMatch[1], params: [] } }
  }

  // Type alias
  const typeMatch = fullDef.match(/^type\s+(\w+)\s+(.+)/)
  if (typeMatch && !typeMatch[2].startsWith('struct') && !typeMatch[2].startsWith('interface')) {
    return { kind: 'type', signature: { name: typeMatch[1], params: [] } }
  }

  return null
}

function parseGoParams(raw: string): SignatureParam[] {
  if (!raw.trim()) return []

  const params: SignatureParam[] = []
  const parts = raw.split(',').map((p) => p.trim())

  for (const part of parts) {
    if (!part) continue
    // name type or name, name type (Go groups by type)
    const match = part.match(/^(\w+)\s+(.+)$/)
    if (match) {
      params.push({ name: match[1], type: match[2].trim() })
    } else {
      // Just a type (previous params share this type — simplified parsing)
      params.push({ name: part, type: 'unknown' })
    }
  }

  return params
}
