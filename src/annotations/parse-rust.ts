import { readFile } from 'node:fs/promises'
import { parseAnnotationBlock } from './parse-annotation'
import { parseRustDocComment } from './parse-conventional'
import type { AnnotatedSymbol, ParsedSignature, SignatureParam } from './types'

export async function parseRust(filePath: string): Promise<AnnotatedSymbol[]> {
  const source = await readFile(filePath, 'utf-8')
  return parseRustSource(source, filePath)
}

export function parseRustSource(source: string, filePath: string): AnnotatedSymbol[] {
  const symbols: AnnotatedSymbol[] = []
  const lines = source.split('\n')

  let i = 0
  while (i < lines.length) {
    // Check for /// or //! doc comment blocks
    const comment = extractDocComment(lines, i)
    if (!comment) {
      i++
      continue
    }

    let defLine = comment.endLine + 1
    while (defLine < lines.length && lines[defLine].trim() === '') defLine++

    const parsed = parseRustDefinition(lines[defLine] || '')
    if (parsed) {
      // Priority: @stx > conventional Rust doc comments
      const annotation = comment.comment.includes('@stx')
        ? parseAnnotationBlock(comment.comment)
        : parseRustDocComment(comment.raw)

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

function extractDocComment(lines: string[], start: number): { comment: string; raw: string; endLine: number } | null {
  const line = lines[start]?.trim()
  if (!line) return null

  // /// or //! doc comments
  if (line.startsWith('///') || line.startsWith('//!')) {
    const buffer: string[] = []
    const rawBuffer: string[] = []
    let end = start
    while (end < lines.length && (lines[end].trim().startsWith('///') || lines[end].trim().startsWith('//!'))) {
      const trimmed = lines[end].trim()
      buffer.push(trimmed.slice(3).trim())
      rawBuffer.push(trimmed)
      end++
    }

    const comment = buffer.join('\n')
    if (comment.trim()) {
      return { comment, raw: rawBuffer.join('\n'), endLine: end - 1 }
    }
    return null
  }

  // Regular // comments (for @stx annotations in non-doc comments)
  if (line.startsWith('//') && !line.startsWith('///')) {
    const buffer: string[] = []
    let end = start
    while (end < lines.length && lines[end].trim().startsWith('//') && !lines[end].trim().startsWith('///')) {
      buffer.push(lines[end].trim().slice(2).trim())
      end++
    }

    const comment = buffer.join('\n')
    // Only return non-doc // comments if they contain @stx
    if (comment.includes('@stx')) {
      return { comment, raw: comment, endLine: end - 1 }
    }
    return null
  }

  return null
}

function parseRustDefinition(line: string): { kind: AnnotatedSymbol['kind']; signature: ParsedSignature } | null {
  const trimmed = line.trim()

  const fn = trimmed.match(/^(?:pub\s+)?fn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^\s{]+))?/) 
  if (fn) {
    return {
      kind: 'function',
      signature: {
        name: fn[1],
        params: parseRustParams(fn[2]),
        returnType: fn[3] || undefined,
      },
    }
  }

  const structDef = trimmed.match(/^(?:pub\s+)?struct\s+(\w+)/)
  if (structDef) {
    return { kind: 'class', signature: { name: structDef[1], params: [] } }
  }

  const traitDef = trimmed.match(/^(?:pub\s+)?trait\s+(\w+)/)
  if (traitDef) {
    return { kind: 'interface', signature: { name: traitDef[1], params: [] } }
  }

  const enumDef = trimmed.match(/^(?:pub\s+)?enum\s+(\w+)/)
  if (enumDef) {
    return { kind: 'enum', signature: { name: enumDef[1], params: [] } }
  }

  return null
}

function parseRustParams(raw: string): SignatureParam[] {
  if (!raw.trim()) return []

  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^(\w+)\s*:\s*(.+)$/)
      if (!m) return { name: p, type: 'unknown' }
      return { name: m[1], type: m[2].trim() }
    })
}
