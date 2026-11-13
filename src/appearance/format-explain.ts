/**
 * Terminal output for `stx check --explain appearance`.
 */
import chalk from 'chalk'
import type { AppearanceExplanation, ExplainRow, ValueSource } from './explain'

const SOURCE_COLOUR: Readonly<Record<ValueSource, (s: string) => string>> = {
  preset: chalk.dim,
  'legacy-theme': chalk.yellow,
  'feature-flag': chalk.yellow,
  'org-theme': chalk.magenta,
  appearance: chalk.cyan,
  themeOverrides: chalk.cyan,
  legacy: chalk.yellow,
}

function table(rows: ExplainRow[]): string[] {
  const w = (pick: (r: ExplainRow) => string) => Math.max(...rows.map((r) => pick(r).length))
  const wp = w((r) => r.path)
  const wv = w((r) => r.value)
  const ws = w((r) => r.source)
  return rows.map((r) => {
    const src = SOURCE_COLOUR[r.source](r.source.padEnd(ws))
    const over = r.overriddenBy ? chalk.dim(` (overridden by ${r.overriddenBy})`) : ''
    return `    ${r.path.padEnd(wp)}  ${r.value.padEnd(wv)}  ${src}  ${chalk.dim(r.from)}${over}`
  })
}

export function formatExplanation(e: AppearanceExplanation, configFile: string): string {
  const out: string[] = []
  out.push(chalk.bold(`Appearance (${configFile})`))
  const renderer = e.v2 ? `doc engine v2, ${e.preset} preset` : `doc engine v1${e.theme ? ` (theme "${e.theme}")` : ''}`
  out.push(`  Renders with ${renderer}.`)
  if (!e.v2) out.push(chalk.dim(`  The values below are what the site would look like on v2 (${e.preset} preset). Name a preset in theme, or add appearance, to switch.`))
  if (e.orgTheme) {
    const o = e.orgTheme
    if (o.resolved) out.push(`  Uses organization theme ${o.ref} (version ${o.version}, ${o.pinned ? 'pinned' : 'follows the latest'}).`)
    else out.push(chalk.yellow(`  ${o.message ?? `Organization theme ${o.ref} could not be resolved.`} Showing the ${e.preset} preset without it.`))
  }

  out.push('', chalk.bold('  Values') + chalk.dim('  (preset → v1 theme → features → organization theme → appearance)'))
  out.push(...table(e.values))

  if (e.tokens.length) {
    out.push('', chalk.bold('  Tokens set on top') + chalk.dim('  (themeOverrides, then the legacy colors and fonts keys)'))
    out.push(...table(e.tokens))
  }

  const accent = e.values.filter((v) => v.path.startsWith('accent.')).map((v) => v.value)
  const shown = accent[0] === accent[1] ? accent[0] : accent.join(' light, ') + ' dark'
  out.push('', chalk.bold(`  Contrast (accent ${shown} on the ${e.preset} page background)`))
  for (const c of e.contrast) {
    const mark = c.passes ? chalk.green('✓') : chalk.red('✗')
    const fix = c.passes ? '' : c.suggestion ? ` Nearest passing shade: ${c.suggestion}.` : ' No shade of this accent passes.'
    out.push(`    ${mark} ${`${c.mode} ${c.check}`.padEnd(10)} ${c.ratio.toFixed(2)}:1, needs ${c.required}:1.${fix}`)
  }

  if (e.issues.length) {
    out.push('', chalk.bold('  Problems'))
    for (const i of e.issues) out.push(`    ${chalk.yellow('⚠')} ${chalk.dim(i.path)}: ${i.message}`)
  }
  return out.join('\n')
}
