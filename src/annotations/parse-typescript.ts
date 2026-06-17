import { readFile } from 'node:fs/promises'
import { parseAnnotationBlock } from './parse-annotation'
import type { AnnotatedSymbol, ParsedSignature, SignatureParam } from './types'

/**
 * Parse TypeScript/JavaScript files for @stx annotations.
 * Scans triple-slash comments and doc comments containing @stx directives.
 */
export async function parseTypeScript(filePath: string): Promise<AnnotatedSymbol[]> {
  const source = await readFile(filePath, 'utf-8')
  return parseTypeScriptSource(source, filePath)
}

export function parseTypeScriptSource(source: string, filePath: string): AnnotatedSymbol[] {
  const symbols: AnnotatedSymbol[] = []
  const lines = source.split('\n')

  let i = 0
  while (i < lines.length) {
    // Look for comment blocks
    const commentResult = extractComment(lines, i)
    if (commentResult) {
      const { comment, endLine } = commentResult
      const annotation = parseAnnotationBlock(comment)

      if (annotation) {
        // Next non-empty, non-comment line should be the symbol definition
        let defLine = endLine + 1
        while (defLine < lines.length && (lines[defLine].trim() === '' || lines[defLine].trim().startsWith('//'))) {
          defLine++
        }

        if (defLine < lines.length) {
          const sig = parseTypeScriptSignature(lines, defLine)
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

function extractComment(lines: string[], startIdx: number): { comment: string; endLine: number } | null {
  const line = lines[startIdx].trim()

  // Triple-slash comment block (consecutive /// lines)
  if (line.startsWith('///')) {
    const commentLines: string[] = []
    let end = startIdx
    while (end < lines.length && lines[end].trim().startsWith('///')) {
      commentLines.push(lines[end].trim().slice(3).trim())
      end++
    }
    const comment = commentLines.join('\n')
    if (comment.includes('@stx')) {
      return { comment, endLine: end - 1 }
    }
    return null
  }

  // JSDoc-style block comment
  if (line.startsWith('/**')) {
    const commentLines: string[] = []
    let end = startIdx

    if (line.includes('*/')) {
      // Single-line comment
      commentLines.push(line.replace(/^\/\*\*/, '').replace(/\*\/$/, '').trim())
      return commentLines[0].includes('@stx')
        ? { comment: commentLines[0], endLine: end }
        : null
    }

    commentLines.push(line.replace(/^\/\*\*/, '').trim())
    end++

    while (end < lines.length) {
      const l = lines[end].trim()
      if (l.includes('*/')) {
        commentLines.push(l.replace(/\*\/.*$/, '').replace(/^\*\s?/, '').trim())
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

type ParsedDef = {
  kind: AnnotatedSymbol['kind']
  signature: ParsedSignature
}

function parseTypeScriptSignature(lines: string[], startIdx: number): ParsedDef | null {
  // Collect the definition (may span multiple lines)
  let def = ''
  let idx = startIdx
  let braceDepth = 0
  let parenDepth = 0

  // Collect until we have a complete signature (opening brace or semicolon)
  while (idx < lines.length && idx - startIdx < 20) {
    def += (def ? '\n' : '') + lines[idx]
    for (const ch of lines[idx]) {
      if (ch === '(') parenDepth++
      else if (ch === ')') parenDepth--
      else if (ch === '{') braceDepth++
    }
    if ((braceDepth > 0 || def.includes(';')) && parenDepth <= 0) break
    idx++
  }

  def = def.trim()

  // Extract modifiers
  const modifiers: string[] = []
  const modTokens = ['export', 'default', 'async', 'static', 'abstract', 'readonly', 'public', 'private', 'protected']
  let remaining = def
  for (const mod of modTokens) {
    const re = new RegExp('^' + mod + '\\s+')
    if (re.test(remaining)) {
      modifiers.push(mod)
      remaining = remaining.replace(re, '')
    }
  }

  // Function
  const funcMatch = remaining.match(/^function\s+(\w+)\s*(<[^>]+>)?\s*\(([^)]*)\)\s*(?::\s*([^{;]+))?/)
  if (funcMatch) {
    return {
      kind: 'function',
      signature: {
        name: funcMatch[1],
        generics: funcMatch[2] ? [funcMatch[2].slice(1, -1)] : undefined,
        params: parseParams(funcMatch[3]),
        returnType: funcMatch[4]?.trim(),
        modifiers,
      },
    }
  }

  // Arrow function / const fn
  const constFnMatch = remaining.match(/^(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:<[^>]+>\s*)?\(([^)]*)\)\s*(?::\s*([^=>{]+))?\s*=>/)
  if (constFnMatch) {
    if (!modifiers.includes('async') && remaining.includes('async')) modifiers.push('async')
    return {
      kind: 'function',
      signature: {
        name: constFnMatch[1],
        params: parseParams(constFnMatch[2]),
        returnType: constFnMatch[3]?.trim(),
        modifiers,
      },
    }
  }

  // Class
  const classMatch = remaining.match(/^class\s+(\w+)\s*(<[^>]+>)?/)
  if (classMatch) {
    return {
      kind: 'class',
      signature: { name: classMatch[1], params: [], generics: classMatch[2] ? [classMatch[2].slice(1, -1)] : undefined, modifiers },
    }
  }

  // Interface
  const interfaceMatch = remaining.match(/^interface\s+(\w+)\s*(<[^>]+>)?/)
  if (interfaceMatch) {
    return {
      kind: 'interface',
      signature: { name: interfaceMatch[1], params: [], generics: interfaceMatch[2] ? [interfaceMatch[2].slice(1, -1)] : undefined, modifiers },
    }
  }

  // Type alias
  const typeMatch = remaining.match(/^type\s+(\w+)\s*(<[^>]+>)?\s*=/)
  if (typeMatch) {
    return {
      kind: 'type',
      signature: { name: typeMatch[1], params: [], generics: typeMatch[2] ? [typeMatch[2].slice(1, -1)] : undefined, modifiers },
    }
  }

  // Enum
  const enumMatch = remaining.match(/^(?:const\s+)?enum\s+(\w+)/)
  if (enumMatch) {
    return {
      kind: 'enum',
      signature: { name: enumMatch[1], params: [], modifiers },
    }
  }

  return null
}

function parseParams(raw: string): SignatureParam[] {
  if (!raw.trim()) return []

  const params: SignatureParam[] = []
  let depth = 0
  let current = ''

  for (const ch of raw) {
    if (ch === '<' || ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === '>' || ch === ')' || ch === ']' || ch === '}') depth--
    else if (ch === ',' && depth === 0) {
      params.push(parseSingleParam(current.trim()))
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) params.push(parseSingleParam(current.trim()))

  return params
}

function parseSingleParam(raw: string): SignatureParam {
  const rest = raw.startsWith('...')
  const cleaned = rest ? raw.slice(3) : raw

  const optMatch = cleaned.match(/^(\w+)\?\s*:\s*(.+)/)
  if (optMatch) {
    return { name: optMatch[1], type: optMatch[2].trim(), optional: true, rest }
  }

  const defMatch = cleaned.match(/^(\w+)\s*:\s*([^=]+)\s*=\s*(.+)/)
  if (defMatch) {
    return { name: defMatch[1], type: defMatch[2].trim(), optional: true, defaultValue: defMatch[3].trim(), rest }
  }

  const typedMatch = cleaned.match(/^(\w+)\s*:\s*(.+)/)
  if (typedMatch) {
    return { name: typedMatch[1], type: typedMatch[2].trim(), rest }
  }

  return { name: cleaned, type: 'unknown', rest }
}
