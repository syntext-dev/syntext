/**
 * `stx check`'s repo custom code pass: the `_syntext/` folder (size limits,
 * forbidden content, the scripts-need-permission warning, an ignored root
 * folder) and every page's `css` frontmatter. Issues use `stx check`'s shape.
 */
import { join, relative } from 'node:path'
import { validatePageCss } from '../lib/page-css'
import { checkCustomCode } from '../lib/repo-custom-code'
import { resolveDocsRoot } from '../lib/resolve-docs-root'

export type CheckIssue = { file: string; type: 'error' | 'warning'; message: string }

/**
 * Check the `_syntext/` folder of the project in `rootDir` (or its `.syntext/`
 * / `.stx/` folder, as the uploads do). Files are named from `rootDir`.
 */
export async function checkCustomCodeFolder(rootDir: string): Promise<CheckIssue[]> {
  const { docsRoot: projectRoot } = await resolveDocsRoot(rootDir)
  const name = (file: string) => {
    const rel = relative(rootDir, join(projectRoot, file))
    return file.endsWith('/') ? `${rel}/` : rel
  }
  const r = await checkCustomCode(projectRoot)
  return [
    ...r.errors.map((i) => ({ file: name(i.file), type: 'error' as const, message: i.message })),
    ...r.warnings.map((i) => ({ file: name(i.file), type: 'warning' as const, message: i.message })),
  ]
}

/**
 * Check a page's `css` frontmatter. `file` is the page's path from the docs
 * folder (`docsDir`); `displayFile` names it in the issue.
 */
export function checkPageCss(source: string, file: string, docsDir: string, displayFile: string): CheckIssue[] {
  const message = validatePageCss(source, file, docsDir)
  return message ? [{ file: displayFile, type: 'error', message }] : []
}
