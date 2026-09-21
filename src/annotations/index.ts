import { parseTypeScript } from './parse-typescript'
import { parsePython } from './parse-python'
import { parseGo } from './parse-go'
import { parseRust } from './parse-rust'
import { parseJava } from './parse-java'
import { parsePhp } from './parse-php'
import { parseCSharp } from './parse-csharp'
import { generatePages } from './generate-mdx'
import { languageForPath } from './languages'
import type { AnnotatedSymbol, GeneratedPage, SignatureHash } from './types'

export { parseTypeScript, parseTypeScriptSource } from './parse-typescript'
export { parsePython, parsePythonSource } from './parse-python'
export { parseGo, parseGoSource } from './parse-go'
export { parseRust, parseRustSource } from './parse-rust'
export { parseJava, parseJavaSource } from './parse-java'
export { parsePhp, parsePhpSource } from './parse-php'
export { parseCSharp, parseCSharpSource } from './parse-csharp'
export { parseAnnotationBlock } from './parse-annotation'
export { parseConventionalComment, parsePythonDocstring, parseGoDocComment, parseRustDocComment, parseCSharpXmlDoc } from './parse-conventional'
export { generatePages } from './generate-mdx'
export {
  EXTENSION_LANGUAGES,
  SOURCE_EXTENSIONS,
  UNSUPPORTED_EXTENSIONS,
  languageForExtension,
  languageForPath,
  unsupportedLanguageForPath,
} from './languages'
export type { ParserLanguage } from './languages'
export type * from './types'

/**
 * Parse all annotated symbols from a directory by file extension.
 */
export async function parseDirectory(files: string[]): Promise<AnnotatedSymbol[]> {
  const allSymbols: AnnotatedSymbol[] = []

  for (const file of files) {
    let symbols: AnnotatedSymbol[] = []

    try {
      // Extension -> parser family comes from the shared map in ./languages, so
      // this switch cannot drift from the scan lists in `stx check` / `stx generate`.
      switch (languageForPath(file)) {
        case 'typescript':
        case 'javascript':
          symbols = await parseTypeScript(file)
          break
        case 'python':
          symbols = await parsePython(file)
          break
        case 'go':
          symbols = await parseGo(file)
          break
        case 'rust':
          symbols = await parseRust(file)
          break
        case 'java':
          symbols = await parseJava(file)
          break
        case 'php':
          symbols = await parsePhp(file)
          break
        case 'csharp':
          symbols = await parseCSharp(file)
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
  return new Bun.CryptoHasher('sha256').update(input).digest('hex').slice(0, 16)
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
