/**
 * The source files `stx build`, `stx deploy` and `stx dev` upload for a
 * hosted build. Paths are relative to the project folder (the one with
 * syntext.json), which is how the build lays them out before it looks for
 * pages: in `docs/` when it holds .md/.mdx files at its top level, otherwise
 * in the project folder itself (pages-dir.ts, same rule as the build).
 *
 * - `docs/` layout: the config, docs.json, everything in docs/ and public/,
 *   the root `_syntext/`, API specs and protocol schemas.
 * - Root layout: the same, but instead of docs/ the project folder is walked
 *   for pages, `_meta.json`, `_redirects.json` and images, skipping
 *   dependencies, git, build output, dot folders and anything .gitignore'd.
 *
 * Files that may hold secrets (`.env*`, keys, credential files) are never
 * uploaded in either layout.
 */
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'
import type { SyntextConfig } from './config'
import { findPagesDir } from './pages-dir'
import { collectRootCustomCodeFiles, CUSTOM_CODE_DIR } from './repo-custom-code'
import { collectSchemaPaths, collectSpecs } from './source-specs'
import { gitIgnoredPaths, isSecretPath, listRootDocsFiles } from './upload-filter'

export type SourceFile = { path: string; content: Buffer }
export type SourceLayout = 'docs' | 'root'
export type SourceBundle = { files: SourceFile[]; layout: SourceLayout; bytes: number }

/** Largest upload the root layout sends: the API accepts at most 128 MB per request, multipart overhead included. */
export const MAX_ROOT_BUNDLE_BYTES = 100 * 1024 * 1024

const CONFIG_NAMES = ['syntext.json', 'syntext.yaml', 'syntext.yml', 'stx.json', 'stx.yaml', 'stx.yml']

export class BundleTooLargeError extends Error {
  constructor(bytes: number, limit = MAX_ROOT_BUNDLE_BYTES) {
    const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`
    super(
      `Your pages are at the project root, and the files to upload from it come to ${mb(bytes)} ` +
        `(the limit is ${mb(limit)}).\n` +
        `Move your pages into a docs/ folder, or add large files you don't need to .gitignore.`,
    )
    this.name = 'BundleTooLargeError'
  }
}

async function readAll(rootDir: string, rels: string[], prefix = ''): Promise<SourceFile[]> {
  const out: SourceFile[] = []
  for (const rel of rels) {
    const content = Buffer.from(await Bun.file(join(rootDir, prefix, rel)).arrayBuffer())
    out.push({ path: prefix ? `${prefix}/${rel}` : rel, content })
  }
  return out
}

/** Every file under `dir`, relative, as `Bun.Glob('**\/*')` lists it (no dot files). Empty when it does not exist. */
async function globAll(dir: string): Promise<string[]> {
  const out: string[] = []
  try {
    for await (const file of new Bun.Glob('**/*').scan({ cwd: dir })) out.push(file)
  } catch {
    // folder does not exist
  }
  return out
}

async function fileIfExists(rootDir: string, rel: string): Promise<SourceFile | null> {
  const f = Bun.file(join(rootDir, rel))
  return (await f.exists()) ? { path: rel, content: Buffer.from(await f.arrayBuffer()) } : null
}

/**
 * Collect the upload for the project in `rootDir`. Throws when a spec the
 * config declares is missing (the site would lose its API reference) and,
 * for the root layout, when the upload is larger than MAX_ROOT_BUNDLE_BYTES.
 */
export async function collectSourceBundle(
  rootDir: string,
  config: SyntextConfig,
  { maxRootBytes = MAX_ROOT_BUNDLE_BYTES }: { maxRootBytes?: number } = {},
): Promise<SourceBundle> {
  const { prefix } = await findPagesDir(rootDir)
  const layout: SourceLayout = prefix === 'docs' ? 'docs' : 'root'
  const files: SourceFile[] = []

  for (const name of CONFIG_NAMES) {
    const f = await fileIfExists(rootDir, name)
    if (f) {
      files.push(f)
      break
    }
  }
  const docsJson = await fileIfExists(rootDir, 'docs.json')
  if (docsJson) files.push(docsJson)

  if (layout === 'docs') {
    const rels = (await globAll(join(rootDir, 'docs'))).filter((p) => !isSecretPath(p))
    files.push(...(await readAll(rootDir, rels, 'docs')))
  } else {
    const candidates = await listRootDocsFiles(rootDir, new Set(['public', CUSTOM_CODE_DIR]))
    const ignored = gitIgnoredPaths(rootDir, candidates)
    files.push(...(await readAll(rootDir, candidates.filter((p) => !ignored.has(p)))))
  }

  const publicRels = (await globAll(join(rootDir, 'public'))).filter((p) => !isSecretPath(p))
  files.push(...(await readAll(rootDir, publicRels, 'public')))

  // Root _syntext/ (repo custom code). docs/_syntext/ ships with docs/ above.
  files.push(...(await collectRootCustomCodeFiles(rootDir)))

  const { paths: specPaths, declared } = collectSpecs(config)
  const missing: string[] = []
  for (const rel of specPaths) {
    const f = isSecretPath(rel) ? null : await fileIfExists(rootDir, rel)
    if (f) files.push(f)
    else missing.push(rel)
  }
  if (declared && missing.length > 0) {
    throw new Error(
      `OpenAPI spec(s) declared in your config but not found:\n` +
        missing.map((m) => `  - ${m}`).join('\n') +
        `\n\nDeploying would publish a site with no API reference pages for them.`,
    )
  }

  for (const rel of await collectSchemaPaths(rootDir, (d) => readdir(d), layout === 'docs')) {
    const f = await fileIfExists(rootDir, rel)
    if (f) files.push(f)
  }

  const unique = dedupe(files)
  const bytes = unique.reduce((n, f) => n + f.content.byteLength, 0)
  if (layout === 'root' && bytes > maxRootBytes) throw new BundleTooLargeError(bytes, maxRootBytes)
  return { files: unique, layout, bytes }
}

/** First file per path wins (a spec inside docs/ is both a docs file and a declared spec). */
function dedupe(files: SourceFile[]): SourceFile[] {
  const seen = new Set<string>()
  return files.filter((f) => (seen.has(f.path) ? false : (seen.add(f.path), true)))
}

/** The multipart body the deploy endpoint takes: one `files` blob and one `paths` entry per file. */
export function appendSourceFiles(form: FormData, files: SourceFile[]): void {
  for (const file of files) {
    form.append('files', new Blob([file.content]), file.path)
    form.append('paths', file.path)
  }
}
