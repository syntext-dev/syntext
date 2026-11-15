/**
 * What `stx build`, `stx deploy` and `stx dev` may upload when a project's
 * pages sit at the project root (next to syntext.json) instead of in `docs/`.
 * The root of a repo holds much more than docs, so the root walk takes only
 * what a build reads and never anything that looks like a secret.
 */
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'

/** Folders never walked at the project root: dependencies, git, build output. Dot folders are skipped too. */
export const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  'node_modules', '.git', 'dist', '.next', 'out', 'build',
])

/** Files a build reads beside the pages, by name. */
const ROOT_FILE_NAMES: ReadonlySet<string> = new Set(['_meta.json', '_redirects.json'])

/** Pages, plus images and media pages may reference. */
const ROOT_FILE_EXTENSIONS = [
  '.md', '.mdx',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico', '.bmp',
  '.mp4', '.webm', '.mp3', '.pdf',
]

const SECRET_NAMES: ReadonlySet<string> = new Set([
  'credentials.json', '.npmrc', '.netrc', '.pgpass',
  'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519',
])
const SECRET_EXTENSIONS = ['.pem', '.key', '.p12', '.pfx', '.jks', '.keystore']

const baseName = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1)

/** True for files that may hold secrets: `.env*`, private keys and certificates, credential files. Never uploaded. */
export function isSecretPath(rel: string): boolean {
  const name = baseName(rel).toLowerCase()
  if (name === '.env' || name.startsWith('.env.')) return true
  if (SECRET_NAMES.has(name)) return true
  return SECRET_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/** True for a file the root walk uploads: a page, `_meta.json`/`_redirects.json`, or an image or media file. */
export function isRootDocsFile(rel: string): boolean {
  const name = baseName(rel)
  if (ROOT_FILE_NAMES.has(name)) return true
  const lower = name.toLowerCase()
  return ROOT_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** True when a project-relative path is inside a folder the root walk never enters. */
export function isInExcludedDir(rel: string): boolean {
  const dirs = rel.split('/').slice(0, -1)
  return dirs.some((d) => EXCLUDED_DIRS.has(d) || d.startsWith('.'))
}

/**
 * Files under `rootDir` the root walk uploads, relative and sorted. `skipTop`
 * names top-level folders collected elsewhere (`public/`, `_syntext/`).
 */
export async function listRootDocsFiles(rootDir: string, skipTop: ReadonlySet<string>): Promise<string[]> {
  const out: string[] = []
  async function walk(rel: string): Promise<void> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(rel ? join(rootDir, rel) : rootDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const path = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (EXCLUDED_DIRS.has(e.name) || (!rel && skipTop.has(e.name))) continue
        await walk(path)
      } else if (e.isFile() && isRootDocsFile(path) && !isSecretPath(path)) {
        out.push(path)
      }
    }
  }
  await walk('')
  return out.sort()
}

/**
 * The paths git ignores (`.gitignore`, `.git/info/exclude`, global excludes),
 * asked of git itself so the rules match exactly. Empty when `rootDir` is not
 * in a git repository or git is not installed.
 */
export function gitIgnoredPaths(rootDir: string, paths: string[]): Set<string> {
  if (paths.length === 0) return new Set()
  try {
    const proc = Bun.spawnSync(['git', 'check-ignore', '--stdin'], {
      cwd: rootDir,
      stdin: Buffer.from(paths.join('\n') + '\n'),
      stdout: 'pipe',
      stderr: 'ignore',
    })
    // 0: some ignored, 1: none ignored, 128: not a repository.
    if (proc.exitCode !== 0) return new Set()
    return new Set(proc.stdout.toString().split('\n').filter(Boolean))
  } catch {
    return new Set()
  }
}
