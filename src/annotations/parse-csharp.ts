import { readFile } from 'node:fs/promises'
import { parseAnnotationBlock } from './parse-annotation'
import { parseCSharpXmlDoc } from './parse-conventional'
import type { AnnotatedSymbol, ParsedSignature, SignatureParam } from './types'

/**
 * Parse C# files for @stx annotations and conventional XML documentation comments.
 * Priority: @stx annotations > XML doc comments (/// <summary>, <param>, etc.)
 */
export async function parseCSharp(filePath: string): Promise<AnnotatedSymbol[]> {
  const source = await readFile(filePath, 'utf-8')
  return parseCSharpSource(source, filePath)
}

export function parseCSharpSource(source: string, filePath: string): AnnotatedSymbol[] {
  const symbols: AnnotatedSymbol[] = []
  const lines = source.split('\n')

  let i = 0
  while (i < lines.length) {
    const comment = extractCSharpComment(lines, i)
    if (!comment) {
      i++
      continue
    }

    // Find the definition after the comment (skip attributes like [Attribute])
    let defLine = comment.endLine + 1
    while (defLine < lines.length && (lines[defLine].trim() === '' || lines[defLine].trim().startsWith('['))) {
      defLine++
    }

    const parsed = parseCSharpDefinition(lines, defLine)
    if (parsed) {
      // Priority: @stx > XML doc comments
      const annotation = comment.comment.includes('@stx')
        ? parseAnnotationBlock(comment.comment)
        : parseCSharpXmlDoc(comment.raw)

      if (annotation) {
        symbols.push({
          kind: parsed.kind,
          name: parsed.signature.name,
          annotation,
          signature: parsed.signature,
          sourceFile: filePath,
          sourceLine: defLine + 1,
        })
      }
    }

    i = comment.endLine + 1
  }

  return symbols
}

function extractCSharpComment(lines: string[], start: number): { comment: string; raw: string; endLine: number } | null {
  const line = lines[start].trim()

  // XML doc comments: consecutive /// lines
  if (line.startsWith('///')) {
    const buffer: string[] = []
    const rawBuffer: string[] = []
    let end = start
    while (end < lines.length && lines[end].trim().startsWith('///')) {
      const content = lines[end].trim().slice(3).trim()
      buffer.push(content)
      rawBuffer.push(lines[end].trim().slice(3)) // preserve spacing for XML
      end++
    }
    const comment = buffer.join('\n')
    const raw = rawBuffer.join('\n')
    if (comment.trim()) {
      return { comment, raw, endLine: end - 1 }
    }
    return null
  }

  return null
}

function parseCSharpDefinition(lines: string[], idx: number): { kind: AnnotatedSymbol['kind']; signature: ParsedSignature } | null {
  if (idx >= lines.length) return null

  // Collect multi-line definitions
  let def = ''
  let di = idx
  while (di < lines.length && di - idx < 10) {
    def += (def ? ' ' : '') + lines[di].trim()
    if (def.includes('{') || def.includes(';') || def.includes('=>')) break
    di++
  }

  const trimmed = def.trim()

  // Extract modifiers
  const modifiers: string[] = []
  const modTokens = ['public', 'private', 'protected', 'internal', 'static', 'abstract', 'virtual', 'override', 'sealed', 'async', 'readonly', 'new', 'partial']
  let remaining = trimmed
  for (const mod of modTokens) {
    const re = new RegExp('^' + mod + '\\s+')
    if (re.test(remaining)) {
      modifiers.push(mod)
      remaining = remaining.replace(re, '')
    }
  }

  // Class
  const classMatch = remaining.match(/^class\s+(\w+)\s*(<[^>]+>)?/)
  if (classMatch) {
    return {
      kind: 'class',
      signature: {
        name: classMatch[1],
        params: [],
        generics: classMatch[2] ? [classMatch[2].slice(1, -1)] : undefined,
        modifiers,
      },
    }
  }

  // Interface
  const interfaceMatch = remaining.match(/^interface\s+(\w+)\s*(<[^>]+>)?/)
  if (interfaceMatch) {
    return {
      kind: 'interface',
      signature: {
        name: interfaceMatch[1],
        params: [],
        generics: interfaceMatch[2] ? [interfaceMatch[2].slice(1, -1)] : undefined,
        modifiers,
      },
    }
  }

  // Enum
  const enumMatch = remaining.match(/^enum\s+(\w+)/)
  if (enumMatch) {
    return { kind: 'enum', signature: { name: enumMatch[1], params: [], modifiers } }
  }

  // Struct (treat as class)
  const structMatch = remaining.match(/^(?:record\s+)?struct\s+(\w+)\s*(<[^>]+>)?/)
  if (structMatch) {
    return {
      kind: 'class',
      signature: {
        name: structMatch[1],
        params: [],
        generics: structMatch[2] ? [structMatch[2].slice(1, -1)] : undefined,
        modifiers,
      },
    }
  }

  // Record
  const recordMatch = remaining.match(/^record\s+(\w+)\s*(<[^>]+>)?/)
  if (recordMatch) {
    return {
      kind: 'class',
      signature: {
        name: recordMatch[1],
        params: [],
        generics: recordMatch[2] ? [recordMatch[2].slice(1, -1)] : undefined,
        modifiers,
      },
    }
  }

  // Method/Function: ReturnType Name(params) or ReturnType Name<T>(params)
  const methodMatch = remaining.match(/^([\w<>\[\]?.]+)\s+(\w+)\s*(<[^>]+>)?\s*\(([^)]*)\)/)
  if (methodMatch) {
    return {
      kind: 'method',
      signature: {
        name: methodMatch[2],
        params: parseCSharpParams(methodMatch[4]),
        returnType: methodMatch[1],
        generics: methodMatch[3] ? [methodMatch[3].slice(1, -1)] : undefined,
        modifiers,
      },
    }
  }

  // Property: Type Name { get; set; }
  const propMatch = remaining.match(/^([\w<>\[\]?.]+)\s+(\w+)\s*\{/)
  if (propMatch && !remaining.includes('(')) {
    return {
      kind: 'property',
      signature: {
        name: propMatch[2],
        params: [],
        returnType: propMatch[1],
        modifiers,
      },
    }
  }

  return null
}

function parseCSharpParams(raw: string): SignatureParam[] {
  if (!raw.trim()) return []

  const params: SignatureParam[] = []
  let depth = 0
  let current = ''

  for (const ch of raw) {
    if (ch === '<' || ch === '(' || ch === '[') depth++
    else if (ch === '>' || ch === ')' || ch === ']') depth--
    else if (ch === ',' && depth === 0) {
      const p = parseCSharpSingleParam(current.trim())
      if (p) params.push(p)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) {
    const p = parseCSharpSingleParam(current.trim())
    if (p) params.push(p)
  }

  return params
}

function parseCSharpSingleParam(raw: string): SignatureParam | null {
  if (!raw) return null

  // Handle: params string[] args, ref int x, out int y, in ReadOnlySpan<byte> data
  const cleaned = raw.replace(/^(params|ref|out|in|this)\s+/, '')

  // Type name = default
  const defMatch = cleaned.match(/^(.+?)\s+(\w+)\s*=\s*(.+)$/)
  if (defMatch) {
    return { name: defMatch[2], type: defMatch[1].trim(), optional: true, defaultValue: defMatch[3].trim() }
  }

  // Type name
  const typedMatch = cleaned.match(/^(.+?)\s+(\w+)$/)
  if (typedMatch) {
    return { name: typedMatch[2], type: typedMatch[1].trim(), optional: raw.startsWith('params') }
  }

  return { name: raw, type: 'unknown' }
}
