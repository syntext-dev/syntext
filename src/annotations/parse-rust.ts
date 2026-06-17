import { readFile } from 'node:fs/promises'
import { parseAnnotationBlock } from './parse-annotation'
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
    const comment = extractLineComments(lines, i, '//')
    if (!comment || !comment.comment.includes('@stx')) {
      i++
      continue
    }

    const annotation = parseAnnotationBlock(comment.comment)
    if (!annotation) {
      i = comment.endLine + 1
      continue
    }

    let defLine = comment.endLine + 1
    while (defLine < lines.length && lines[defLine].trim() === '') defLine++

    const parsed = parseRustDefinition(lines[defLine] || '')
    if (parsed) {
      symbols.push({
        kind: parsed.kind,
        name: parsed.signature.name,
        annotation,
        signature: parsed.signature,
        sourceFile: filePath,
        sourceLine: defLine + 1,
      })
    }

    i = comment.endLine + 1
  }

  return symbols
}

function extractLineComments(lines: string[], start: number, prefix: string): { comment: string; endLine: number } | null {
  if (!lines[start]?.trim().startsWith(prefix)) return null

  const buffer: string[] = []
  let end = start
  while (end < lines.length && lines[end].trim().startsWith(prefix)) {
    buffer.push(lines[end].trim().slice(prefix.length).trim())
    end++
  }

  return { comment: buffer.join('\n'), endLine: end - 1 }
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
