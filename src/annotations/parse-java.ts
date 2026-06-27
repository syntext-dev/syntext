import { readFile } from 'node:fs/promises'
import { parseAnnotationBlock } from './parse-annotation'
import { parseConventionalComment } from './parse-conventional'
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
    if (!comment) {
      i++
      continue
    }

    // Find the definition after the comment (skip annotations like @Override)
    let defLine = comment.endLine + 1
    while (defLine < lines.length && (lines[defLine].trim() === '' || lines[defLine].trim().startsWith('@'))) defLine++

    const parsed = parseJavaDefinition(lines[defLine] || '')
    if (parsed) {
      // Priority: @stx > Javadoc conventional comments
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

function extractComment(lines: string[], start: number): { comment: string; endLine: number } | null {
  const line = lines[start].trim()

  // Only match /** Javadoc-style comments (not // single-line unless @stx)
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

  // // line comments only if they contain @stx (otherwise too noisy in Java)
  if (line.startsWith('//')) {
    const buffer: string[] = []
    let end = start
    while (end < lines.length && lines[end].trim().startsWith('//')) {
      buffer.push(lines[end].trim().slice(2).trim())
      end++
    }
    const comment = buffer.join('\n')
    if (comment.includes('@stx')) {
      return { comment, endLine: end - 1 }
    }
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
