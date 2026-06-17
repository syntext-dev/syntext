import { parseTypeScript } from './parse-typescript'
import { parsePython } from './parse-python'
import { parseGo } from './parse-go'
import { generatePages } from './generate-mdx'
import type { AnnotatedSymbol, GeneratedPage, SignatureHash } from './types'
import { createHash } from 'node:crypto'

export { parseTypeScript, parseTypeScriptSource } from './parse-typescript'
export { parsePython, parsePythonSource } from './parse-python'
export { parseGo, parseGoSource } from './parse-go'
export { parseAnnotationBlock } from './parse-annotation'
export { generatePages } from './generate-mdx'
export type * from './types'

/**
 * Parse all annotated symbols from a directory by file extension.
 */
export async function parseDirectory(files: string[]): Promise<AnnotatedSymbol[]> {
  const allSymbols: AnnotatedSymbol[] = []

  for (const file of files) {
    const ext = file.split('.').pop()
    let symbols: AnnotatedSymbol[] = []

    try {
      switch (ext) {
        case 'ts':
        case 'tsx':
        case 'js':
        case 'jsx':
          symbols = await parseTypeScript(file)
          break
        case 'py':
          symbols = await parsePython(file)
          break
        case 'go':
          symbols = await parseGo(file)
          break
      }
    } catch {
      // Skip files that can't be parsed
    }

    allSymbols.push(...symbols)
  }

  return allSymbols
}

/**
 * Generate signature hashes for drift detection.
 */
export function generateSignatureHashes(symbols: AnnotatedSymbol[]): SignatureHash[] {
  return symbols.map((sym) => ({
    symbolName: sym.name,
    sourceFile: sym.sourceFile,
    hash: hashSignature(sym),
    annotation: sym.annotation,
  }))
}

function hashSignature(sym: AnnotatedSymbol): string {
  const input = JSON.stringify({
    name: sym.signature.name,
    params: sym.signature.params.map((p) => ({ name: p.name, type: p.type, optional: p.optional })),
    returnType: sym.signature.returnType,
  })
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}

/**
 * Resolve {@embed symbolName} directives in MDX content.
 */
export function resolveEmbeds(mdxContent: string, symbols: AnnotatedSymbol[], repoUrl?: string): string {
  return mdxContent.replace(/\{@embed\s+(\w+)\}/g, (_, symbolName) => {
    const sym = symbols.find((s) => s.name === symbolName)
    if (!sym) return `<!-- @embed: symbol "${symbolName}" not found -->`

    const pages = generatePages([sym], repoUrl)
    if (pages.length === 0) return `<!-- @embed: no page generated for "${symbolName}" -->`

    // Strip frontmatter from generated content
    const content = pages[0].content.replace(/^---[\s\S]*?---\n\n/, '')
    return content
  })
}
