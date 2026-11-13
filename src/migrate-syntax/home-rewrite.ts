/**
 * The `home-to-mdx` rewrite (home-as-content.md): the docs root index page's
 * generated home, written as the home components (`<Hero title>`,
 * `<SectionCards>`, …), with `home` dropped and `layout: wide` set, so the
 * page looks the same after the generated home stops on its cut-off.
 *
 * The conversion needs the site's data (which home layout the preset draws,
 * whether there is a changelog, an API or a CLI section, the quickstart page).
 * The hosted build knows it; this file gets it, in order of preference, from:
 *
 * 1. the last build, through `POST /v1/projects/:id/appearance/home/convert`
 *    with `{ target: 'preview' }` (logged in, `projectId` in syntext.json);
 * 2. the local files (not logged in, no `projectId`, no build yet, or the API
 *    is unreachable): syntext.json and the page paths. The quickstart link of
 *    the Plain preset's hero is the one thing this cannot work out.
 */
import { parse as parseYaml } from 'yaml'
import { resolveAppearance } from '../appearance/resolve'
import { apiFetch } from '../lib/api'
import { frontmatterBlock } from '../syntax/locate'
import { isRootIndexFile, scanPage } from '../syntax/scan-page'
import type { TableItem } from '../syntax/table-source'
import type { Change, Held } from './config-rewrite'
import { convertIndexSource, type HomeMigrationLayout, type HomeMigrationSite } from './home-to-mdx'

export const HOME_CODES = ['frontmatter.home', 'frontmatter.implicit-home'] as const
export type HomeCode = (typeof HOME_CODES)[number]

/** Where the site data came from, and what the conversion should write. */
export type HomeSiteData =
  /** The last build: the API's components (built from the repository's index page) and, when it sends it, the site itself. */
  | { from: 'last-build'; mdx: string; warnings: string[]; site?: HomeMigrationSite }
  /** The local files, with the reason the API was not used. */
  | { from: 'local'; site: HomeMigrationSite; reason: string }

export type HomeIndexPage = { docsFile: string; source: string; frontmatter: Record<string, unknown> }

export type HomeSiteContext = {
  config: Record<string, unknown> | null
  /** Every page path from the docs folder (`guides/a.mdx`). */
  docsFiles: readonly string[]
  index: HomeIndexPage
}

export type HomeSiteProvider = (ctx: HomeSiteContext) => Promise<HomeSiteData>

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const LAYOUTS: readonly HomeMigrationLayout[] = ['command', 'pill', 'tabs', 'mega', 'simple', 'island', 'index', 'path']

/** The page's frontmatter as an object ({} when it has none or it does not parse). */
export function readFrontmatter(source: string): Record<string, unknown> {
  const block = frontmatterBlock(source)
  if (!block) return {}
  try {
    const fm = parseYaml(block.text)
    return isObject(fm) ? fm : {}
  } catch {
    return {}
  }
}

/** Which home deprecation the docs root index page has, if any (the same test `stx check` and the build use). */
export function homeCodeFor(docsFile: string, source: string): HomeCode | null {
  if (!isRootIndexFile(docsFile)) return null
  const u = scanPage(docsFile, source).usages.find((x) => (HOME_CODES as readonly string[]).includes(x.code))
  return (u?.code as HomeCode | undefined) ?? null
}

const pageHref = (docsFile: string) => `/${docsFile.replace(/\.mdx?$/i, '').replace(/(^|\/)index$/i, '')}`.replace(/\/$/, '') || '/'

/** The site data the build would use, worked out from syntext.json and the page paths. */
export function localHomeSite(ctx: HomeSiteContext): HomeMigrationSite {
  const config = ctx.config ?? {}
  const appearance = resolveAppearance(config).appearance as { layout?: { home?: unknown } }
  const home = appearance.layout?.home
  const layout = (LAYOUTS as readonly unknown[]).includes(home) ? (home as HomeMigrationLayout) : 'command'
  const features = isObject(config.features) ? config.features : {}
  const files = ctx.docsFiles.map((f) => f.replace(/\\/g, '/'))
  const changelog = files.find((f) => /(^|\/)changelog(\/index)?\.mdx?$/i.test(f))
  const title = str(ctx.index.frontmatter.title)
  const description = str(ctx.index.frontmatter.description) ?? str(config.description)
  return {
    layout,
    siteName: str(config.name) ?? 'Docs',
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    assistant: features.aiAssistant !== false,
    has: {
      changelog: Boolean(changelog),
      api: config.openapi !== undefined || files.some((f) => /^api(-reference)?\//i.test(f)),
      cli: files.some((f) => /^cli\//i.test(f)),
    },
    ...(str(config.github) ? { githubUrl: str(config.github) } : {}),
    ...(changelog ? { changelogHref: pageHref(changelog) } : {}),
  }
}

export type HomeApiDeps = {
  apiUrl: string
  token: string | null | undefined
  /** Defaults to syntext.json `projectId`. */
  projectId?: string | null
  /** Do not call the API (`--offline`): use the local files, giving this reason. */
  offline?: string
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
}

/**
 * The site data from the last build, or the local files when the API cannot
 * answer (with the reason, for the summary). A revoked session is rethrown.
 */
export function homeSiteProvider(deps: HomeApiDeps): HomeSiteProvider {
  return async (ctx) => {
    const local = (reason: string): HomeSiteData => ({ from: 'local', site: localHomeSite(ctx), reason })
    if (deps.offline) return local(deps.offline)
    if (!deps.token) return local('not logged in (run `stx login` to use the last build\'s data)')
    const projectId = deps.projectId ?? str(ctx.config?.projectId)
    if (!projectId) return local('no projectId in syntext.json (run `stx connect <projectId>` to use the last build\'s data)')
    const url = `${deps.apiUrl.replace(/\/+$/, '')}/v1/projects/${encodeURIComponent(projectId)}/appearance/home/convert`
    let res: Response
    try {
      res = await apiFetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${deps.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ target: 'preview' }),
      }, deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {})
    } catch (err) {
      if (err instanceof Error && err.name === 'SessionRevokedError') throw err
      return local(`the API could not be reached (${err instanceof Error ? err.message : String(err)})`)
    }
    const body = (await res.json().catch(() => null)) as { data?: unknown; error?: { message?: unknown } } | null
    if (!res.ok) {
      const message = str(body?.error?.message)
      return local(`the API answered ${res.status}${message ? `: ${message}` : ''}`)
    }
    const data = isObject(body?.data) ? body.data : {}
    if (typeof data.mdx !== 'string') return local('the API did not return the home components')
    const warnings = Array.isArray(data.warnings) ? data.warnings.filter((w): w is string => typeof w === 'string') : []
    return { from: 'last-build', mdx: data.mdx, warnings, ...(isObject(data.site) ? { site: data.site as HomeMigrationSite } : {}) }
  }
}

/**
 * `source` with its generated home written as components: `convertIndexSource`
 * with the site data, or, when the API sent only its components, the same
 * frontmatter and body edit around them.
 */
export function convertWithSiteData(source: string, data: HomeSiteData): { source: string; mdx: string; warnings: string[] } {
  const home = readFrontmatter(source).home
  if (data.from === 'local') return convertIndexSource(source, home, data.site)
  if (data.site) return convertIndexSource(source, home, data.site)
  // The API's components with this file's frontmatter and body: convertIndexSource
  // writes `---\n<yaml>\n---\n\n<components><body>`, so swap the components.
  const local = convertIndexSource(source, home, { layout: 'command', siteName: '', assistant: false, has: { changelog: false, api: false, cli: false } })
  const head = local.source.slice(0, local.source.indexOf('\n---\n\n') + 6)
  const tail = local.source.slice(head.length + local.mdx.length)
  return { source: `${head}${data.mdx}${tail}`, mdx: data.mdx, warnings: data.warnings }
}

export type HomeRewriteResult = { text: string; applied: Change[]; held: Held[]; from?: HomeSiteData['from']; reason?: string }

/**
 * Apply the table's `home-to-mdx` rule to the docs root index page, when the
 * page still shows the generated home and the table has the rule for its case.
 */
export async function rewriteHome(input: {
  file: string
  docsFile: string
  source: string
  items: readonly TableItem[]
  siteIsV2: boolean
  ctx: Omit<HomeSiteContext, 'index'>
  provider: HomeSiteProvider
}): Promise<HomeRewriteResult> {
  const none: HomeRewriteResult = { text: input.source, applied: [], held: [] }
  if (!input.siteIsV2) return none
  const code = homeCodeFor(input.docsFile, input.source)
  const item = code ? input.items.find((i) => i.code === code && i.rewrite.type === 'home-to-mdx') : undefined
  if (!code || !item) return none

  const frontmatter = readFrontmatter(input.source)
  const data = await input.provider({ ...input.ctx, index: { docsFile: input.docsFile, source: input.source, frontmatter } })
  const r = convertWithSiteData(input.source, data)
  const tags = [...new Set([...r.mdx.matchAll(/^<([A-Z]\w*)/gm)].map((m) => m[1]))]
  // Where the site data came from is the result's `home` (one summary line), not a note on the change.
  const notes = r.warnings
  const change: Change = {
    code,
    file: input.file,
    line: 1,
    old: code === 'frontmatter.home' ? 'home frontmatter (generated home)' : 'the generated docs home',
    replacement: `${tags.map((t) => `<${t}>`).join(', ') || 'home components'}, layout: wide`,
    ...(notes.length ? { note: notes.join(' ') } : {}),
  }
  return { text: r.source, applied: [change], held: [], from: data.from, ...(data.from === 'local' ? { reason: data.reason } : {}) }
}
