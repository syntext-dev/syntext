/**
 * `stx migrate` without `--from`: rewrite deprecated Syntext syntax in place
 * (doc engine v2 deprecation policy). Kept apart from migrate.ts, which
 * imports docs from other platforms.
 */
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import chalk from 'chalk'
import ora from 'ora'
import { colorDiff, formatSummary } from '../migrate-syntax/format'
import { loadCredentials as loadStoredCredentials, type Credentials } from '../lib/credentials'
import { homeSiteProvider } from '../migrate-syntax/home-rewrite'
import { migrateSyntax } from '../migrate-syntax/run'
import { DEFAULT_API_URL, loadDeprecationTable } from '../syntax/table-source'

export type SyntaxMigrateOptions = { dir?: string; dryRun?: boolean; json?: boolean; v2?: boolean; offline?: boolean }

export type SyntaxMigrateDeps = {
  print?: (s: string) => void
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
  loadCredentials?: () => Promise<Credentials | null>
  /** Show the ora spinner (off in tests and with --json). */
  spinner?: boolean
}

/** Returns the exit code. */
export async function runSyntaxMigrate(options: SyntaxMigrateOptions, deps: SyntaxMigrateDeps = {}): Promise<number> {
  const print = deps.print ?? ((s: string) => console.log(s))
  const rootDir = resolve(options.dir ?? '.')
  const spinner = options.json || deps.spinner === false ? null : ora('Loading the deprecation table...').start()
  try {
    if (!existsSync(rootDir)) throw new Error(`${rootDir} does not exist. Pass the folder that holds syntext.json with --dir.`)
    const table = await loadDeprecationTable({ offline: options.offline, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) })
    spinner && (spinner.text = options.dryRun ? 'Looking for deprecated syntax...' : 'Rewriting deprecated syntax...')
    // The generated home's conversion needs the site's data: the last build's, through the API, unless --offline.
    const creds = options.offline ? null : await (deps.loadCredentials ?? loadStoredCredentials)().catch(() => null)
    const homeSite = homeSiteProvider({
      apiUrl: process.env.SYNTEXT_API_URL ?? creds?.apiUrl ?? DEFAULT_API_URL,
      token: creds?.token,
      ...(options.offline ? { offline: '--offline' } : {}),
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    })
    const result = await migrateSyntax({ rootDir, dryRun: !!options.dryRun, applyV2: !!options.v2, items: table.table.items, homeSite })
    spinner?.stop()

    if (options.json) {
      print(JSON.stringify({ success: true, table: { source: table.source, ...(table.warning ? { warning: table.warning } : {}) }, ...result }))
      return 0
    }
    if (options.dryRun) {
      for (const f of result.files) print(`${colorDiff(f.diff)}\n`)
    }
    print(formatSummary(result, table))
    if (!options.dryRun && result.files.length) print(chalk.dim('\n  Run `stx check` to confirm, then review and commit the changes.'))
    return 0
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (options.json) print(JSON.stringify({ success: false, error: message }))
    else {
      spinner?.fail('Migration failed')
      print(chalk.red(message))
    }
    return 1
  }
}
