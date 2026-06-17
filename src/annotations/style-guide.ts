import { readFile } from 'node:fs/promises'
import type { AnnotatedSymbol } from './types'

export type AnnotationStyleGuide = {
  requiredDirectives?: Array<'title' | 'description' | 'example' | 'since' | 'returns'>
  requireReturnsForFunctions?: boolean
  forbiddenWordsInDescription?: string[]
}

export type StyleGuideIssue = {
  symbolName: string
  sourceFile: string
  sourceLine: number
  message: string
}

export async function loadStyleGuide(styleGuidePath: string): Promise<AnnotationStyleGuide | null> {
  try {
    const raw = await readFile(styleGuidePath, 'utf-8')
    return JSON.parse(raw) as AnnotationStyleGuide
  } catch {
    return null
  }
}

export function validateStyleGuide(symbols: AnnotatedSymbol[], guide: AnnotationStyleGuide): StyleGuideIssue[] {
  const issues: StyleGuideIssue[] = []

  for (const symbol of symbols) {
    const annotation = symbol.annotation
    const required = guide.requiredDirectives || []

    if (required.includes('title') && !annotation.title) {
      issues.push(issue(symbol, 'Missing @stx title directive'))
    }

    if (required.includes('description') && !annotation.description) {
      issues.push(issue(symbol, 'Missing @stx description directive'))
    }

    if (required.includes('example') && (!annotation.examples || annotation.examples.length === 0)) {
      issues.push(issue(symbol, 'Missing @stx example directive'))
    }

    if (required.includes('since') && !annotation.since) {
      issues.push(issue(symbol, 'Missing @stx since directive'))
    }

    if (required.includes('returns') && !annotation.returns) {
      issues.push(issue(symbol, 'Missing @stx returns directive'))
    }

    if (guide.requireReturnsForFunctions && symbol.kind === 'function' && !annotation.returns) {
      issues.push(issue(symbol, 'Function annotations must include @stx returns'))
    }

    if (annotation.description && guide.forbiddenWordsInDescription?.length) {
      const lower = annotation.description.toLowerCase()
      for (const word of guide.forbiddenWordsInDescription) {
        if (lower.includes(word.toLowerCase())) {
          issues.push(issue(symbol, `Description contains forbidden word: ${word}`))
        }
      }
    }
  }

  return issues
}

function issue(symbol: AnnotatedSymbol, message: string): StyleGuideIssue {
  return {
    symbolName: symbol.name,
    sourceFile: symbol.sourceFile,
    sourceLine: symbol.sourceLine,
    message,
  }
}
