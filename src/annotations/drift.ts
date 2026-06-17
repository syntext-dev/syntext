import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AnnotatedSymbol, SignatureHash } from './types'
import { parseDirectory, generateSignatureHashes } from './index'

export type DriftIssue = {
  type: 'signature-changed' | 'annotation-stale' | 'unannotated' | 'type-deleted' | 'example-broken'
  severity: 'error' | 'warning'
  symbolName: string
  sourceFile: string
  sourceLine?: number
  message: string
  previousHash?: string
  currentHash?: string
}

export type DriftConfig = {
  strictness?: 'error' | 'warn'
  ignorePatterns?: string[]
  requireAnnotations?: boolean // Require @stx on all exported functions
  checkExamples?: boolean
}

export type DriftReport = {
  issues: DriftIssue[]
  coverage: {
    annotated: number
    total: number
    percentage: number
  }
  timestamp: string
}

const HASH_FILE = '.syntext/hashes.json'

/**
 * Load previously stored signature hashes.
 */
export async function loadStoredHashes(rootDir: string): Promise<SignatureHash[]> {
  try {
    const hashPath = join(rootDir, HASH_FILE)
    const content = await readFile(hashPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return []
  }
}

/**
 * Save current signature hashes.
 */
export async function saveHashes(rootDir: string, hashes: SignatureHash[]): Promise<void> {
  const hashPath = join(rootDir, HASH_FILE)
  const { mkdir } = await import('node:fs/promises')
  await mkdir(join(rootDir, '.syntext'), { recursive: true })
  await writeFile(hashPath, JSON.stringify(hashes, null, 2), 'utf-8')
}

/**
 * Detect drift between stored hashes and current code.
 */
export function detectDrift(
  currentSymbols: AnnotatedSymbol[],
  storedHashes: SignatureHash[],
  config: DriftConfig = {}
): DriftIssue[] {
  const issues: DriftIssue[] = []
  const severity = config.strictness || 'error'
  const currentHashes = generateSignatureHashes(currentSymbols)

  // Build lookup maps
  const storedMap = new Map(storedHashes.map((h) => [h.symbolName + ':' + h.sourceFile, h]))
  const currentMap = new Map(currentHashes.map((h) => [h.symbolName + ':' + h.sourceFile, h]))

  // Check for signature changes (symbol exists in both, hash differs)
  for (const [key, current] of currentMap) {
    const stored = storedMap.get(key)
    if (stored && stored.hash !== current.hash) {
      issues.push({
        type: 'signature-changed',
        severity,
        symbolName: current.symbolName,
        sourceFile: current.sourceFile,
        message: `Signature of "${current.symbolName}" has changed since last check — annotation may be stale`,
        previousHash: stored.hash,
        currentHash: current.hash,
      })
    }
  }

  // Check for removed symbols that had annotations
  for (const [key, stored] of storedMap) {
    if (!currentMap.has(key)) {
      // Check if pattern is ignored
      if (config.ignorePatterns?.some((p) => stored.sourceFile.includes(p))) continue

      issues.push({
        type: 'type-deleted',
        severity: 'warning',
        symbolName: stored.symbolName,
        sourceFile: stored.sourceFile,
        message: `Previously annotated symbol "${stored.symbolName}" no longer found in ${stored.sourceFile}`,
      })
    }
  }

  return issues
}

/**
 * Find exported functions that lack @stx annotations.
 */
export function findUnannotated(sourceContent: string, filePath: string, annotatedNames: Set<string>): DriftIssue[] {
  const issues: DriftIssue[] = []
  const lines = sourceContent.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // TypeScript/JavaScript exported functions
    const exportFuncMatch = line.match(/^export\s+(?:async\s+)?function\s+(\w+)/)
    if (exportFuncMatch && !annotatedNames.has(exportFuncMatch[1])) {
      issues.push({
        type: 'unannotated',
        severity: 'warning',
        symbolName: exportFuncMatch[1],
        sourceFile: filePath,
        sourceLine: i + 1,
        message: `Exported function "${exportFuncMatch[1]}" has no @stx annotation`,
      })
    }

    // Exported const arrow function
    const exportConstMatch = line.match(/^export\s+const\s+(\w+)\s*=/)
    if (exportConstMatch && !annotatedNames.has(exportConstMatch[1])) {
      // Check if it's actually a function (has => or function)
      const restOfLine = lines.slice(i, i + 3).join(' ')
      if (restOfLine.includes('=>') || restOfLine.includes('function')) {
        issues.push({
          type: 'unannotated',
          severity: 'warning',
          symbolName: exportConstMatch[1],
          sourceFile: filePath,
          sourceLine: i + 1,
          message: `Exported function "${exportConstMatch[1]}" has no @stx annotation`,
        })
      }
    }

    // Python: top-level def (not indented, not prefixed with _)
    if (filePath.endsWith('.py')) {
      const pyFuncMatch = line.match(/^(?:async\s+)?def\s+([A-Za-z]\w*)/)
      if (pyFuncMatch && !pyFuncMatch[1].startsWith('_') && !annotatedNames.has(pyFuncMatch[1])) {
        issues.push({
          type: 'unannotated',
          severity: 'warning',
          symbolName: pyFuncMatch[1],
          sourceFile: filePath,
          sourceLine: i + 1,
          message: `Public function "${pyFuncMatch[1]}" has no @stx annotation`,
        })
      }
    }

    // Go: exported function (capitalized)
    if (filePath.endsWith('.go')) {
      const goFuncMatch = line.match(/^func\s+(?:\([^)]+\)\s+)?([A-Z]\w*)/)
      if (goFuncMatch && !annotatedNames.has(goFuncMatch[1])) {
        issues.push({
          type: 'unannotated',
          severity: 'warning',
          symbolName: goFuncMatch[1],
          sourceFile: filePath,
          sourceLine: i + 1,
          message: `Exported function "${goFuncMatch[1]}" has no @stx annotation`,
        })
      }
    }
  }

  return issues
}

/**
 * Generate a drift report summary.
 */
export function generateDriftReport(
  issues: DriftIssue[],
  annotatedCount: number,
  totalExported: number
): DriftReport {
  return {
    issues,
    coverage: {
      annotated: annotatedCount,
      total: totalExported,
      percentage: totalExported > 0 ? Math.round((annotatedCount / totalExported) * 100) : 100,
    },
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format drift report as a markdown string (for PR comments).
 */
export function formatDriftMarkdown(report: DriftReport): string {
  let md = '## 📝 Syntext Documentation Check\n\n'

  md += `**Coverage**: ${report.coverage.annotated}/${report.coverage.total} exported symbols annotated (${report.coverage.percentage}%)\n\n`

  if (report.issues.length === 0) {
    md += '✅ No documentation drift detected!\n'
    return md
  }

  const errors = report.issues.filter((i) => i.severity === 'error')
  const warnings = report.issues.filter((i) => i.severity === 'warning')

  if (errors.length > 0) {
    md += `### ❌ Errors (${errors.length})\n\n`
    for (const issue of errors) {
      md += `- **${issue.symbolName}** (${issue.sourceFile}): ${issue.message}\n`
    }
    md += '\n'
  }

  if (warnings.length > 0) {
    md += `### ⚠️ Warnings (${warnings.length})\n\n`
    for (const issue of warnings) {
      const line = issue.sourceLine ? `:${issue.sourceLine}` : ''
      md += `- **${issue.symbolName}** (${issue.sourceFile}${line}): ${issue.message}\n`
    }
    md += '\n'
  }

  return md
}
