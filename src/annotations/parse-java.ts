import { readFile } from 'node:fs/promises'
import { parseAnnotationBlock } from './parse-annotation'
import type { AnnotatedSymbol, ParsedSignature, SignatureParam } from './types'

export async function parseJava(filePath: string): Promise<AnnotatedSymbol[]> {
  const source = await readFile(filePath, 'utf-8')
  return parseJavaSource(source, filePath)
}

export function parseJavaSource(source: string, filePath: string): AnnotatedSymbol[] {
  const symbols: AnnotatedSymbol[] = []
  const lines = source.split('\n')

  let i = 0
  while (i < lines.length) {
    const comment = extractComment(lines, i)
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

    const parsed = parseJavaDefinition(lines[defLine] || '')
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

function extractComment(lines: string[], start: number): { comment: string; endLine: number } | null {
  const line = lines[start].trim()

  if (line.startsWith('//')) {
    const buffer: string[] = []
    let end = start
    while (end < lines.length && lines[end].trim().startsWith('//')) {
      buffer.push(lines[end].trim().slice(2).trim())
      end++
    }
    return { comment: buffer.join('\n'), endLine: end - 1 }
  }

  if (line.startsWith('/**') || line.startsWith('/*')) {
    const buffer: string[] = [line.replace(/^\/\*\*?/, '').trim()]
    let end = start + 1
    while (end < lines.length && !lines[end].includes('*/')) {
      buffer.push(lines[end].replace(/^\s*\*\s?/, '').trim())
      end++
    }
    if (end < lines.length) buffer.push(lines[end].replace(/\*\//, '').replace(/^\s*\*\s?/, '').trim())
    return { comment: buffer.join('\n'), endLine: end }
  }

  return null
}

function parseJavaDefinition(line: string): { kind: AnnotatedSymbol['kind']; signature: ParsedSignature } | null {
  const trimmed = line.trim()

  const method = trimmed.match(/^(?:public|protected|private)?\s*(?:static\s+)?([\w<>\[\]]+)\s+(\w+)\s*\(([^)]*)\)/)
  if (method) {
    return {
      kind: 'method',
      signature: {
        name: method[2],
        params: parseJavaParams(method[3]),
        returnType: method[1],
      },
    }
  }

  const classDef = trimmed.match(/^(?:public\s+)?class\s+(\w+)/)
  if (classDef) return { kind: 'class', signature: { name: classDef[1], params: [] } }

  const interfaceDef = trimmed.match(/^(?:public\s+)?interface\s+(\w+)/)
  if (interfaceDef) return { kind: 'interface', signature: { name: interfaceDef[1], params: [] } }

  const enumDef = trimmed.match(/^(?:public\s+)?enum\s+(\w+)/)
  if (enumDef) return { kind: 'enum', signature: { name: enumDef[1], params: [] } }

  return null
}

function parseJavaParams(raw: string): SignatureParam[] {
  if (!raw.trim()) return []

  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^(.+?)\s+(\w+)$/)
      if (!m) return { name: p, type: 'unknown' }
      return { name: m[2], type: m[1].trim() }
    })
}
