/**
 * `stx check`'s syntax pass: the same checks the hosted build runs
 * (syntext-backend `modules/deprecations/check.ts`) on the local files:
 * deprecated config keys, frontmatter keys, MDX tags and props; unknown keys
 * with "did you mean"; values outside their enum. Everything is a warning,
 * as in the build before a deprecation's notice; `--strict` makes it fail.
 *
 * One difference: the build leaves `appearance` and `theme` problems to the
 * appearance resolver's own messages, and so does this, using the resolver
 * copied into `src/appearance`. `features` and `themeOverrides` problems use
 * the schema's messages (the build's resolvers for those are not copied).
 */
import { join, relative } from 'node:path'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolveAppearance } from '../appearance/resolve'
import { resolveDocsRoot } from '../lib/resolve-docs-root'
import { lineLocator } from './locate'
import { parseSiteConfigText, SITE_CONFIG_FILES, SiteConfigError } from './parse'
import { scanConfigDeprecations } from './scan-config'
import { scanPage } from './scan-page'
import { formatUsage, type DeprecationUsage } from './usage'
import { validateSiteConfig } from './validate'

export type SyntaxIssue = { file: string; line: number; type: 'warning' | 'error'; message: string; code?: string }

export type LoadedConfig = { fileName: string; content: string; config: Record<string, unknown> }

export type SyntaxCheckInput = {
  config: LoadedConfig | null
  /** The config file exists but does not parse. */
  configError?: { fileName: string; message: string }
  pages: ReadonlyArray<{ file: string; source: string }>
}

/** Paths whose problems the appearance resolver reports in its own words. */
const RESOLVER_OWNED = /^(appearance|theme)(\.|$)/

/** The site config in `rootDir` (first of syntext.json, .yaml, .yml, syntext.config.json), or its parse error. */
export async function readSiteConfig(rootDir: string): Promise<LoadedConfig | { fileName: string; error: string } | null> {
  for (const fileName of SITE_CONFIG_FILES) {
    const file = Bun.file(join(rootDir, fileName))
    if (!(await file.exists())) continue
    const content = await readFile(join(rootDir, fileName), 'utf-8')
    try {
      return { fileName, content, config: parseSiteConfigText(fileName, content) }
    } catch (err) {
      return { fileName, error: err instanceof SiteConfigError ? err.message : String(err) }
    }
  }
  return null
}

const byLine = (a: SyntaxIssue, b: SyntaxIssue) => a.line - b.line

function usageIssue(u: DeprecationUsage, siteIsV2: boolean): SyntaxIssue {
  const message = formatUsage(u, { phase: 'warning', siteIsV2 }).replace(`${u.file}:${u.line}: `, '')
  return { file: u.file, line: u.line, type: 'warning', code: u.code, message }
}

export function checkSyntax(input: SyntaxCheckInput): { issues: SyntaxIssue[]; usages: DeprecationUsage[] } {
  const issues: SyntaxIssue[] = []
  const usages: DeprecationUsage[] = []

  if (input.configError) {
    issues.push({ file: input.configError.fileName, line: 1, type: 'error', message: input.configError.message })
  }

  let siteIsV2 = false
  if (input.config) {
    const { config, fileName, content } = input.config
    const appearance = resolveAppearance(config)
    siteIsV2 = appearance.v2
    const at = lineLocator(content)
    const own: SyntaxIssue[] = []
    for (const u of scanConfigDeprecations({ config, fileName, source: content })) {
      usages.push(u)
      if (u.code === 'config.unknown-key' && RESOLVER_OWNED.test(u.old)) continue
      own.push(usageIssue(u, siteIsV2))
    }
    for (const issue of validateSiteConfig(config, { source: content })) {
      if (issue.kind === 'invalid-value' && !RESOLVER_OWNED.test(issue.path)) own.push({ file: fileName, line: issue.line ?? 1, type: 'warning', message: issue.message })
    }
    for (const issue of appearance.issues) {
      // An organization theme is only found at build time (or by --explain while logged in).
      if (issue.path === 'theme' && appearance.orgTheme) continue
      const segments = issue.path.startsWith('theme') ? ['theme'] : issue.path.split('.')
      own.push({ file: fileName, line: at(segments), type: 'warning', code: issue.path.startsWith('theme') ? 'theme' : 'appearance', message: issue.message })
    }
    issues.push(...own.sort(byLine))
  }

  for (const page of input.pages) {
    const r = scanPage(page.file, page.source)
    usages.push(...r.usages)
    const own = r.usages.map((u) => usageIssue(u, siteIsV2))
    for (const issue of r.issues) own.push({ file: page.file, line: issue.line ?? 1, type: 'warning', message: issue.message })
    issues.push(...own.sort(byLine))
  }

  return { issues, usages }
}

/** Read the project in `rootDir` (or its `.syntext/` / `.stx/` folder, as `stx build` does) and check it. Files are named from `rootDir`. */
export async function checkProjectSyntax(rootDir: string): Promise<{ configFile: string | null; issues: SyntaxIssue[] }> {
  const { docsRoot } = await resolveDocsRoot(rootDir)
  const rel = (abs: string) => relative(rootDir, abs)
  const loaded = await readSiteConfig(docsRoot)
  const configFile = loaded ? rel(join(docsRoot, loaded.fileName)) : null
  const pages: Array<{ file: string; source: string }> = []
  const docsDir = join(docsRoot, 'docs')
  if (existsSync(docsDir)) {
    const files: string[] = []
    for await (const f of new Bun.Glob('**/*.{md,mdx}').scan({ cwd: docsDir })) if (!f.split('/').includes('node_modules')) files.push(f)
    for (const f of files.sort()) pages.push({ file: rel(join(docsDir, f)), source: await readFile(join(docsDir, f), 'utf-8') })
  }
  const { issues } = checkSyntax({
    config: loaded && 'config' in loaded ? { ...loaded, fileName: configFile as string } : null,
    ...(loaded && 'error' in loaded ? { configError: { fileName: configFile as string, message: loaded.error } } : {}),
    pages,
  })
  return { configFile, issues }
}
