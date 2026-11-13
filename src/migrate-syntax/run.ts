/**
 * `stx migrate` (no `--from`): rewrite every deprecated Syntext form in a docs
 * project, in place: config keys (JSON keeps its formatting, YAML its
 * comments), frontmatter keys, MDX tags and props, and the
 * `syntext.config.json` file name. Running it twice changes nothing the
 * second time. Whatever needs a person (unknown keys, held rules) is
 * returned for the summary.
 */
import { join, relative } from 'node:path'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolveAppearance } from '../appearance/resolve'
import { resolveDocsRoot } from '../lib/resolve-docs-root'
import { checkSyntax, readSiteConfig, type SyntaxIssue } from '../syntax/check-syntax'
import { isYamlConfig, parseSiteConfigText } from '../syntax/parse'
import type { TableItem } from '../syntax/table-source'
import { rewriteConfig, type Change, type Held } from './config-rewrite'
import { unifiedDiff } from './diff'
import { JsonTextEditor } from './json-edit'
import { HOME_CODES, homeSiteProvider, rewriteHome, type HomeSiteData, type HomeSiteProvider } from './home-rewrite'
import { rewritePage, unsupportedPageRules } from './page-rewrite'
import { YamlTextEditor } from './yaml-edit'

export type FileChange = { file: string; renamedTo?: string; diff: string }

export type SyntaxMigrationResult = {
  dryRun: boolean
  configFile: string | null
  applied: Change[]
  held: Held[]
  /** Codes in the table this stx does not know how to apply. */
  unsupported: string[]
  /** The index page's generated home, when it was converted: where the site data came from (`local` names why the API was not used). */
  home?: { file: string; from: HomeSiteData['from']; reason?: string }
  files: FileChange[]
  /** What `stx check` still reports after the migration: unknown keys and invalid values. */
  remaining: SyntaxIssue[]
}

type Pending = { abs: string; file: string; before: string; after: string; renameTo?: string }

async function listPages(docsDir: string): Promise<string[]> {
  const out: string[] = []
  if (!existsSync(docsDir)) return out
  for await (const f of new Bun.Glob('**/*.{md,mdx}').scan({ cwd: docsDir })) if (!f.split('/').includes('node_modules')) out.push(f)
  return out.sort()
}

/** No API: the site data for the home conversion comes from the local files. */
const LOCAL_ONLY: HomeSiteProvider = homeSiteProvider({ apiUrl: '', token: null, projectId: null })

export async function migrateSyntax(opts: {
  rootDir: string
  dryRun: boolean
  applyV2: boolean
  items: readonly TableItem[]
  /** Site data for the `home-to-mdx` rule (the last build, through the API); the local files by default. */
  homeSite?: HomeSiteProvider
}): Promise<SyntaxMigrationResult> {
  const { docsRoot } = await resolveDocsRoot(opts.rootDir)
  const rel = (abs: string) => relative(opts.rootDir, abs) || '.'
  const applied: Change[] = []
  const held: Held[] = []
  const unsupported: string[] = []
  const pending: Pending[] = []

  const loaded = await readSiteConfig(docsRoot)
  if (loaded && 'error' in loaded) throw new Error(`${loaded.error}. Fix it, then run stx migrate again.`)
  let configName: string | null = null
  let newConfig: { fileName: string; content: string; config: Record<string, unknown> } | null = null

  if (loaded) {
    const abs = join(docsRoot, loaded.fileName)
    const file = rel(abs)
    const editor = isYamlConfig(loaded.fileName) ? new YamlTextEditor(loaded.content) : new JsonTextEditor(loaded.content)
    const r = rewriteConfig({ editor, fileName: file, items: opts.items, applyV2: opts.applyV2, siteIsV2: resolveAppearance(loaded.config).v2 })
    applied.push(...r.applied)
    held.push(...r.held)
    unsupported.push(...r.unsupported)

    let renameTo: string | undefined
    const renameRule = opts.items.find((i) => i.rewrite.type === 'rename-file')
    const rule = renameRule?.rewrite as { from?: string; to?: string } | undefined
    if (renameRule && rule?.from === loaded.fileName && rule.to) {
      const change = { code: renameRule.code, file, line: 1, old: rule.from, replacement: rule.to }
      if (existsSync(join(docsRoot, rule.to))) held.push({ ...change, reason: `${rule.to} already exists; merge ${rule.from} into it by hand.` })
      else {
        renameTo = rule.to
        applied.push(change)
      }
    }
    configName = renameTo ?? loaded.fileName
    newConfig = { fileName: configName, content: editor.text, config: parseSiteConfigText(loaded.fileName, editor.text) }
    if (editor.text !== loaded.content || renameTo) pending.push({ abs, file, before: loaded.content, after: editor.text, ...(renameTo ? { renameTo } : {}) })
  }

  unsupported.push(...unsupportedPageRules(opts.items))
  // After the config rules: `--v2` can switch the site to doc engine v2, where the generated home is deprecated.
  const siteIsV2 = newConfig ? resolveAppearance(newConfig.config).v2 : false
  const docsDir = join(docsRoot, 'docs')
  const docsFiles = await listPages(docsDir)
  const pages: Array<{ file: string; source: string; docsFile: string }> = []
  let home: SyntaxMigrationResult['home']
  for (const f of docsFiles) {
    const abs = join(docsDir, f)
    const file = rel(abs)
    const before = await readFile(abs, 'utf-8')
    const r = rewritePage(file, before, opts.items)
    applied.push(...r.applied)
    held.push(...r.held)
    let text = r.text
    const h = await rewriteHome({ file, docsFile: f, source: text, items: opts.items, siteIsV2, ctx: { config: newConfig?.config ?? null, docsFiles }, provider: opts.homeSite ?? LOCAL_ONLY })
    if (h.applied.length && h.from) {
      applied.push(...h.applied)
      text = h.text
      home = { file, from: h.from, ...(h.reason ? { reason: h.reason } : {}) }
    }
    pages.push({ file, source: text, docsFile: f })
    if (text !== before) pending.push({ abs, file, before, after: text })
  }

  const files: FileChange[] = pending.map((p) => {
    const to = p.renameTo ? rel(join(docsRoot, p.renameTo)) : undefined
    const diff = unifiedDiff(p.file, p.before, p.after, to ? { to: `b/${to}` } : {})
    return { file: p.file, ...(to ? { renamedTo: to } : {}), diff: diff || `rename ${p.file} → ${to}` }
  })

  if (!opts.dryRun) {
    for (const p of pending) {
      if (p.after !== p.before) await writeFile(p.abs, p.after)
      if (p.renameTo) await rename(p.abs, join(docsRoot, p.renameTo))
    }
  }

  const after = checkSyntax({ config: newConfig, pages })
  const remaining = after.issues.filter((i) => !i.code || i.code.endsWith('.unknown-key') || i.code === 'appearance' || i.code === 'theme' || unsupported.includes(i.code) || (HOME_CODES as readonly string[]).includes(i.code))
  return { dryRun: opts.dryRun, configFile: configName, applied, held, unsupported: [...new Set(unsupported)], files, remaining, ...(home ? { home } : {}) }
}
