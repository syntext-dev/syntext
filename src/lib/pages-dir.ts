/**
 * Where a project's pages live, resolved the way the hosted build does
 * (syntext-backend `findDocsDir` in build.worker.ts): `docs/` when it holds
 * .md or .mdx files directly, otherwise the project folder itself, so a site
 * whose pages sit next to syntext.json is checked and migrated too.
 */
import { join } from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import { CUSTOM_CODE_DIR } from './repo-custom-code'

const isPage = (name: string) => name.endsWith('.md') || name.endsWith('.mdx')

/** Folders that never hold pages: dependencies, git, custom code (`_syntext/`) and `stx build` output (`dist/`). Dot folders are skipped too. */
export const NON_PAGE_DIRS: ReadonlySet<string> = new Set(['node_modules', '.git', CUSTOM_CODE_DIR, 'dist'])

/** `dir` is absolute; `prefix` is `docs` or '' (the project folder). */
export async function findPagesDir(docsRoot: string): Promise<{ dir: string; prefix: '' | 'docs' }> {
  const docsPath = join(docsRoot, 'docs')
  try {
    if (!(await stat(docsPath)).isDirectory()) return { dir: docsRoot, prefix: '' }
    const files = await readdir(docsPath)
    return files.some(isPage) ? { dir: docsPath, prefix: 'docs' } : { dir: docsRoot, prefix: '' }
  } catch {
    return { dir: docsRoot, prefix: '' }
  }
}

/** Every .md/.mdx page under `dir`, relative to it and sorted, without the folders in NON_PAGE_DIRS or dot folders. */
export async function listPageFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  async function walk(rel: string): Promise<void> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(rel ? join(dir, rel) : dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const path = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (NON_PAGE_DIRS.has(e.name) || e.name.startsWith('.')) continue
        await walk(path)
      } else if (e.isFile() && isPage(e.name)) out.push(path)
    }
  }
  await walk('')
  return out.sort()
}
