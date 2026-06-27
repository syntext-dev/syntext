import { readFile } from 'node:fs/promises'
import { parseAnnotationBlock } from './parse-annotation'
import { parseConventionalComment } from './parse-conventional'
import type { AnnotatedSymbol, ParsedSignature, SignatureParam } from './types'

export async function parsePhp(filePath: string): Promise<AnnotatedSymbol[]> {
  const source = await readFile(filePath, 'utf-8')
  return parsePhpSource(source, filePath)
}

export function parsePhpSource(source: string, filePath: string): AnnotatedSymbol[] {
  const symbols: AnnotatedSymbol[] = []
  const lines = source.split('\n')

  let i = 0
  while (i < lines.length) {
    const comment = extractPhpComment(lines, i)
    if (!comment) {
      i++
      continue
    }

    let defLine = comment.endLine + 1
    while (defLine < lines.length && lines[defLine].trim() === '') defLine++

    const parsed = parsePhpDefinition(lines[defLine] || '')
    if (parsed) {
      // Priority: @stx > PHPDoc conventional comments
      const annotation = comment.comment.includes('@stx')
        ? parseAnnotationBlock(comment.comment)
        : parseConventionalComment(comment.comment)

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

function extractPhpComment(lines: string[], start: number): { comment: string; endLine: number } | null {
  const line = lines[start].trim()

  // Only match /** DocBlock-style comments for conventional parsing
  if (line.startsWith('/**')) {
    const buffer: string[] = [line.replace(/^\/\*\*/, '').trim()]
    let end = start + 1
    while (end < lines.length && !lines[end].includes('*/')) {
      buffer.push(lines[end].replace(/^\s*\*\s?/, '').trim())
      end++
    }
    if (end < lines.length) buffer.push(lines[end].replace(/\*\//, '').replace(/^\s*\*\s?/, '').trim())
    const comment = buffer.join('\n').trim()
    if (comment) return { comment, endLine: end }
  }

  // // or # comments only if they contain @stx
  if (line.startsWith('//') || line.startsWith('#')) {
    const buffer: string[] = []
    let end = start
    while (end < lines.length) {
      const current = lines[end].trim()
      if (!(current.startsWith('//') || current.startsWith('#'))) break
      buffer.push(current.replace(/^\/\//, '').replace(/^#/, '').trim())
      end++
    }
    const comment = buffer.join('\n')
    if (comment.includes('@stx')) {
      return { comment, endLine: end - 1 }
    }
  }

  return null
}

function parsePhpDefinition(line: string): { kind: AnnotatedSymbol['kind']; signature: ParsedSignature } | null {
  const trimmed = line.trim()

  const fn = trimmed.match(/^(?:public|protected|private)?\s*(?:static\s+)?function\s+(\w+)\s*\(([^)]*)\)/)
  if (fn) {
    return {
      kind: 'function',
      signature: {
        name: fn[1],
        params: parsePhpParams(fn[2]),
      },
    }
  }

  const classDef = trimmed.match(/^(?:abstract\s+|final\s+)?class\s+(\w+)/)
  if (classDef) return { kind: 'class', signature: { name: classDef[1], params: [] } }

  const interfaceDef = trimmed.match(/^interface\s+(\w+)/)
  if (interfaceDef) return { kind: 'interface', signature: { name: interfaceDef[1], params: [] } }

  const traitDef = trimmed.match(/^trait\s+(\w+)/)
  if (traitDef) return { kind: 'type', signature: { name: traitDef[1], params: [] } }

  const enumDef = trimmed.match(/^enum\s+(\w+)/)
  if (enumDef) return { kind: 'enum', signature: { name: enumDef[1], params: [] } }

  return null
}

function parsePhpParams(raw: string): SignatureParam[] {
  if (!raw.trim()) return []

  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^(?:(\??\w+)\s+)?\$(\w+)/)
      if (!m) return { name: p, type: 'unknown' }
      return { name: m[2], type: m[1] || 'mixed', optional: p.includes('=') }
    })
}
