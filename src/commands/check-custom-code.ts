/**
 * `stx check`'s pass for custom code from your docs: the `_syntext/` folder
 * (size limits, content rules, an ignored root folder), every page's `css`
 * frontmatter, and what the dashboard switches (Integrations › Custom code)
 * mean for the files. Issues use `stx check`'s shape.
 */
import { join, relative } from 'node:path'
import { loadConfig } from '../lib/config'
import { loadCredentials } from '../lib/credentials'
import { docsCodeWarnings, fetchDocsCodeSwitches, type DocsCodeSwitches, type SwitchDeps } from '../lib/docs-code-switches'
import { pageCssValue, validatePageCss } from '../lib/page-css'
import { checkCustomCode } from '../lib/repo-custom-code'
import { resolveDocsRoot } from '../lib/resolve-docs-root'

export type CheckIssue = { file: string; type: 'error' | 'warning'; message: string }
export type PageCss = { file: string; value: string }

export type CustomCodeCheckDeps = SwitchDeps & {
  /** The switches, or null when the project is not linked or they cannot be read. Defaults to the API. */
  loadSwitches?: (projectRoot: string) => Promise<DocsCodeSwitches | null>
}

/** The switches for a linked project (projectId in the config and a stored login); null otherwise or on any failure. */
export async function linkedProjectSwitches(projectRoot: string, deps: SwitchDeps = {}): Promise<DocsCodeSwitches | null> {
  try {
    const { projectId } = await loadConfig(projectRoot)
    const token = (await loadCredentials())?.token
    if (!projectId || !token) return null
    const apiUrl = process.env.SYNTEXT_API_URL ?? 'https://api.syntext.dev'
    return await fetchDocsCodeSwitches(apiUrl, projectId, token, deps)
  } catch {
    return null
  }
}

/**
 * Check the `_syntext/` folder of the project in `rootDir` (or its `.syntext/`
 * / `.stx/` folder, as the uploads do) and add the switch warnings for it and
 * for `pageCss` (pages with a valid `css` value). Files are named from `rootDir`.
 */
export async function checkCustomCodeFolder(rootDir: string, pageCss: PageCss[] = [], deps: CustomCodeCheckDeps = {}): Promise<CheckIssue[]> {
  const { docsRoot: projectRoot } = await resolveDocsRoot(rootDir)
  const name = (file: string) => {
    const rel = relative(rootDir, join(projectRoot, file))
    return file.endsWith('/') ? `${rel}/` : rel
  }
  const r = await checkCustomCode(projectRoot)
  const { paths } = r
  const anything = paths.css.length + paths.js.length + pageCss.length > 0 || paths.head !== null
  const load = deps.loadSwitches ?? ((root: string) => linkedProjectSwitches(root, deps))
  const switches = anything ? await load(projectRoot) : null
  const switchWarnings = docsCodeWarnings({ ...paths, pageCss }, switches)
  return [
    ...r.errors.map((i) => ({ file: name(i.file), type: 'error' as const, message: i.message })),
    ...r.warnings.map((i) => ({ file: name(i.file), type: 'warning' as const, message: i.message })),
    // Page files are already named from rootDir; folder files from the project root.
    ...switchWarnings.map((i) => ({ file: pageCss.some((p) => p.file === i.file) ? i.file : name(i.file), type: 'warning' as const, message: i.message })),
  ]
}

/**
 * Check a page's `css` frontmatter. `file` is the page's path from the docs
 * folder (`docsDir`); `displayFile` names it in the issue. `css` is the value
 * when it is valid, for the switch warnings.
 */
export function checkPageCss(source: string, file: string, docsDir: string, displayFile: string): { issues: CheckIssue[]; css: PageCss | null } {
  const message = validatePageCss(source, file, docsDir)
  if (message) return { issues: [{ file: displayFile, type: 'error', message }], css: null }
  const value = pageCssValue(source)
  return { issues: [], css: typeof value === 'string' ? { file: displayFile, value } : null }
}
