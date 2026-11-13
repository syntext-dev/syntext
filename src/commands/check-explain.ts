/**
 * `stx check --explain [appearance]`: each resolved appearance value and where
 * it came from, the tokens set on top, and the accent contrast. Organization
 * themes are fetched when the user is logged in.
 */
import { join, relative, resolve } from 'node:path'
import chalk from 'chalk'
import { explainAppearance } from '../appearance/explain'
import { fetchOrgTheme, type FetchedOrgTheme } from '../appearance/org-theme-fetch'
import { formatExplanation } from '../appearance/format-explain'
import { loadCredentials as loadStoredCredentials, type Credentials } from '../lib/credentials'
import { resolveDocsRoot } from '../lib/resolve-docs-root'
import { readSiteConfig } from '../syntax/check-syntax'
import { didYouMean } from '../syntax/suggest'
import { DEFAULT_API_URL } from '../syntax/table-source'

export const EXPLAIN_TOPICS = ['appearance'] as const

export type ExplainDeps = {
  print?: (s: string) => void
  loadCredentials?: () => Promise<Credentials | null>
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
}

/** `topic` is `true` for a bare `--explain`. Returns the exit code. */
export async function runExplain(topic: string | true, options: { dir?: string; json?: boolean }, deps: ExplainDeps = {}): Promise<number> {
  const print = deps.print ?? ((s: string) => console.log(s))
  const fail = (message: string) => {
    print(options.json ? JSON.stringify({ success: false, error: message }) : chalk.red(message))
    return 1
  }
  const name = topic === true ? 'appearance' : topic
  if (!(EXPLAIN_TOPICS as readonly string[]).includes(name)) {
    return fail(`Unknown --explain topic "${name}".${didYouMean(name, EXPLAIN_TOPICS)} Topics: ${EXPLAIN_TOPICS.join(', ')}.`)
  }

  const rootDir = resolve(options.dir ?? '.')
  const { docsRoot } = await resolveDocsRoot(rootDir)
  const loaded = await readSiteConfig(docsRoot)
  if (!loaded) return fail(`No syntext.json, syntext.yaml or syntext.yml in ${rootDir}. Run stx init, or pass the project folder with --dir.`)
  if ('error' in loaded) return fail(loaded.error)
  const configFile = relative(rootDir, join(docsRoot, loaded.fileName))

  const theme = typeof loaded.config.theme === 'string' ? loaded.config.theme.trim() : ''
  let orgTheme: FetchedOrgTheme | undefined
  let orgThemeError: string | undefined
  if (theme.startsWith('@')) {
    const creds = await (deps.loadCredentials ?? loadStoredCredentials)().catch(() => null)
    const apiUrl = process.env.SYNTEXT_API_URL ?? creds?.apiUrl ?? DEFAULT_API_URL
    const r = await fetchOrgTheme(theme, { apiUrl, token: creds?.token, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) })
    if (r.ok) orgTheme = r.theme
    else orgThemeError = r.message
  }

  const e = explainAppearance(loaded.config, { ...(orgTheme ? { orgTheme } : {}), ...(orgThemeError ? { orgThemeError } : {}) })
  print(options.json ? JSON.stringify({ success: true, topic: 'appearance', configFile, ...e }) : formatExplanation(e, configFile))
  return 0
}
