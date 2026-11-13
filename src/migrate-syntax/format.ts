/**
 * Terminal output for `stx migrate` (Syntext syntax mode).
 */
import chalk from 'chalk'
import type { Change } from './config-rewrite'
import type { SyntaxMigrationResult } from './run'

const byPlace = (a: { file: string; line: number }, b: { file: string; line: number }) => a.file.localeCompare(b.file) || a.line - b.line
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function colorDiff(diff: string): string {
  return diff.split('\n').map((l) => {
    if (l.startsWith('+++') || l.startsWith('---')) return chalk.bold(l)
    if (l.startsWith('@@')) return chalk.cyan(l)
    if (l.startsWith('+')) return chalk.green(l)
    if (l.startsWith('-')) return chalk.red(l)
    return l
  }).join('\n')
}

const changeLine = (c: Change) => `    ${chalk.dim(`${c.file}:${c.line}`)}  ${c.old} → ${c.replacement}${c.note ? chalk.dim(` (${c.note})`) : ''}`

export function formatSummary(r: SyntaxMigrationResult, table: { source: 'remote' | 'bundled'; warning?: string }): string {
  const out: string[] = []
  const n = r.applied.length
  const files = r.files.length
  if (!n && !r.held.length && !r.remaining.length && !r.unsupported.length) {
    out.push(chalk.green('No deprecated syntax found.'))
  } else if (!n) {
    out.push(chalk.bold('Nothing left to rewrite automatically.'))
  } else if (r.dryRun) {
    out.push(chalk.bold(`Would rewrite ${plural(n, 'deprecated form')} in ${plural(files, 'file')}. Nothing was written (--dry-run).`))
  } else {
    out.push(chalk.bold(`Rewrote ${plural(n, 'deprecated form')} in ${plural(files, 'file')}.`))
  }
  out.push(chalk.dim(table.source === 'remote' ? '  Rules: the published deprecation table.' : `  Rules: the deprecation table bundled with stx.${table.warning ? ` ${table.warning}` : ''}`))

  if (n) {
    out.push('')
    out.push(...[...r.applied].sort(byPlace).map(changeLine))
  }
  if (r.held.length) {
    out.push('', chalk.yellow(`  Not rewritten (${r.held.length})`))
    for (const h of [...r.held].sort(byPlace)) out.push(`    ${chalk.yellow('⚠')} ${chalk.dim(`${h.file}:${h.line}`)}  ${h.old} → ${h.replacement}. ${h.reason}`)
  }
  if (r.remaining.length) {
    out.push('', chalk.yellow(`  Still reported by stx check (${r.remaining.length})`))
    for (const i of [...r.remaining].sort(byPlace)) out.push(`    ${chalk.yellow('⚠')} ${chalk.dim(`${i.file}:${i.line}`)}  ${i.message}`)
  }
  if (r.unsupported.length) {
    out.push('', chalk.yellow(`  This stx cannot apply ${r.unsupported.join(', ')}. Update stx and run it again.`))
  }
  return out.join('\n')
}
