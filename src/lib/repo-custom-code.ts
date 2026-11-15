/**
 * Repo custom code: site-wide CSS, scripts and head HTML a docs author ships
 * from the docs repo in a `_syntext/` folder. The hosted build renders them;
 * the CLI finds, validates and uploads them. The rules match syntext-backend.
 *
 * - The folder is `<docs>/_syntext/`, where `<docs>` is the project's `docs/`
 *   folder when there is one, else the project root. With a `docs/` folder,
 *   `<root>/_syntext/` is accepted too; when both exist `docs/_syntext/` wins.
 * - Only top-level files count: `*.css` (one bundle, sorted by name), `*.js`
 *   (scripts at the end of <body>, sorted) and `head.html` (into <head>).
 * - `_syntext/` is never a page source.
 * - CSS always applies. Scripts and head.html run on the live site only when
 *   an admin allows scripts from the repository, and never on previews.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const CUSTOM_CODE_DIR = '_syntext'
export const MAX_CSS_BYTES = 51200
export const MAX_JS_BYTES = 10240
export const MAX_JS_FILES = 10
export const MAX_HEAD_BYTES = 10240

const HEAD_OR_BODY_CLOSE = /<\/\s*(head|body)\s*>/i
const STYLE_CLOSE = /<\/\s*style/i
const SCRIPT_CLOSE = /<\/\s*script/i

export type CustomCodeFile = { name: string; content: string }
export type CustomCodeFiles = { css: CustomCodeFile[]; js: CustomCodeFile[]; head: CustomCodeFile | null }
export type CustomCodeIssue = { file: string; message: string }
export type CustomCodeResult = { errors: CustomCodeIssue[]; warnings: CustomCodeIssue[] }

/** Where the `_syntext/` folder lives: `dir` is the one the build uses (relative to the project root), `ignored` a root folder that loses to `docs/_syntext/`. */
export type CustomCodeLocation = { dir: string | null; ignored: string | null }

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory()

/** True when `rel` (a path from the docs folder or the project root) is inside a `_syntext/` folder, which is never a page. */
export function isInCustomCodeDir(rel: string): boolean {
  return rel.split('/')[0] === CUSTOM_CODE_DIR
}

/** Find the `_syntext/` folder of the project in `projectRoot`, per the precedence rules. */
export function locateCustomCode(projectRoot: string): CustomCodeLocation {
  const hasDocs = isDir(join(projectRoot, 'docs'))
  const inDocs = hasDocs && isDir(join(projectRoot, 'docs', CUSTOM_CODE_DIR))
  const atRoot = isDir(join(projectRoot, CUSTOM_CODE_DIR))
  if (inDocs) return { dir: `docs/${CUSTOM_CODE_DIR}`, ignored: atRoot ? CUSTOM_CODE_DIR : null }
  return { dir: atRoot ? CUSTOM_CODE_DIR : null, ignored: null }
}

/** Plain code-point order, as the build sorts. */
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Top-level file names in `dir` the build reads: `*.css`, `*.js` and `head.html`. */
export function customCodeFileNames(dir: string): string[] {
  if (!isDir(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && (e.name.endsWith('.css') || e.name.endsWith('.js') || e.name === 'head.html'))
    .map((e) => e.name)
    .sort(byName)
}

/** Read the files of a `_syntext/` folder, grouped as the build groups them. */
export async function readCustomCodeFiles(dir: string): Promise<CustomCodeFiles> {
  const out: CustomCodeFiles = { css: [], js: [], head: null }
  for (const name of customCodeFileNames(dir)) {
    const file = { name, content: await readFile(join(dir, name), 'utf-8') }
    if (name === 'head.html') out.head = file
    else if (name.endsWith('.css')) out.css.push(file)
    else out.js.push(file)
  }
  return out
}

const bytes = (s: string) => Buffer.byteLength(s, 'utf-8')
export const formatKB = (n: number) => `${(n / 1024).toFixed(1)}KB`

/** Forbidden-content reasons for a stylesheet (site-wide or per page). */
export function cssContentErrors(content: string): string[] {
  const out: string[] = []
  if (HEAD_OR_BODY_CLOSE.test(content)) out.push('CSS must not contain </head> or </body>')
  if (STYLE_CLOSE.test(content)) out.push('CSS must not contain </style>')
  return out
}

/** Validate a `_syntext/` folder's files. Files are named `_syntext/<name>`. */
export function validateCustomCode(files: CustomCodeFiles): CustomCodeResult {
  const errors: CustomCodeIssue[] = []
  const warnings: CustomCodeIssue[] = []
  const at = (name: string) => `${CUSTOM_CODE_DIR}/${name}`

  let cssBytes = 0
  for (const f of files.css) {
    cssBytes += bytes(f.content)
    for (const message of cssContentErrors(f.content)) errors.push({ file: at(f.name), message })
  }
  if (cssBytes > MAX_CSS_BYTES) {
    errors.push({ file: at('*.css'), message: `combined CSS is ${formatKB(cssBytes)}; the limit is 50KB` })
  }

  if (files.js.length > MAX_JS_FILES) {
    errors.push({ file: at('*.js'), message: `${files.js.length} scripts; the limit is ${MAX_JS_FILES}` })
  }
  for (const f of files.js) {
    const size = bytes(f.content)
    if (size > MAX_JS_BYTES) errors.push({ file: at(f.name), message: `script is ${formatKB(size)}; the limit is 10KB` })
    if (HEAD_OR_BODY_CLOSE.test(f.content)) errors.push({ file: at(f.name), message: 'JavaScript must not contain </head> or </body>' })
    if (SCRIPT_CLOSE.test(f.content)) errors.push({ file: at(f.name), message: 'JavaScript must not contain </script>' })
  }

  if (files.head) {
    const size = bytes(files.head.content)
    if (size > MAX_HEAD_BYTES) errors.push({ file: at('head.html'), message: `head.html is ${formatKB(size)}; the limit is 10KB` })
    if (HEAD_OR_BODY_CLOSE.test(files.head.content)) errors.push({ file: at('head.html'), message: 'head.html must not contain </head> or </body>' })
  }

  const scripts = [...files.js.map((f) => f.name), ...(files.head ? ['head.html'] : [])]
  if (scripts.length > 0) warnings.push({ file: `${CUSTOM_CODE_DIR}/`, message: scriptsWarning(scripts) })

  return { errors, warnings }
}

/** The warning for `*.js` / `head.html`: they need an admin's permission and never run in previews. */
export function scriptsWarning(names: readonly string[]): string {
  return (
    `${names.join(', ')} run on the live site only when an organization or project admin turns on ` +
    '"Allow scripts from the repository" (dashboard: Integrations › Custom scripts), ' +
    'and never on preview builds (stx dev, PR previews). CSS always applies.'
  )
}

/** One line per issue: `_syntext/theme.css: CSS must not contain </style>`. */
export const formatCustomCodeIssue = (i: CustomCodeIssue) => `${i.file}: ${i.message}`

/**
 * Validate the project's `_syntext/` folder. Issue files are relative to the
 * project root (`docs/_syntext/theme.css`); messages carry no file name.
 */
export async function checkCustomCode(projectRoot: string): Promise<{
  errors: CustomCodeIssue[]
  warnings: CustomCodeIssue[]
  hasScripts: boolean
}> {
  const loc = locateCustomCode(projectRoot)
  const errors: CustomCodeIssue[] = []
  const warnings: CustomCodeIssue[] = []
  if (loc.ignored) {
    warnings.push({
      file: `${loc.ignored}/`,
      message: `ignored: docs/${CUSTOM_CODE_DIR}/ exists and takes precedence. Move these files into docs/${CUSTOM_CODE_DIR}/.`,
    })
  }
  if (!loc.dir) return { errors, warnings, hasScripts: false }
  const files = await readCustomCodeFiles(join(projectRoot, loc.dir))
  const result = validateCustomCode(files)
  const prefix = loc.dir.slice(0, -CUSTOM_CODE_DIR.length)
  const place = (i: CustomCodeIssue) => ({ file: prefix + i.file, message: i.message })
  errors.push(...result.errors.map(place))
  warnings.push(...result.warnings.map(place))
  return { errors, warnings, hasScripts: files.js.length > 0 || files.head !== null }
}

/** True when the `_syntext/` folder the build uses has `*.js` or `head.html`. */
export function hasRepoScripts(projectRoot: string): boolean {
  const { dir } = locateCustomCode(projectRoot)
  if (!dir) return false
  return customCodeFileNames(join(projectRoot, dir)).some((n) => n.endsWith('.js') || n === 'head.html')
}

/**
 * The root `_syntext/` files to upload as `_syntext/<name>`. `docs/**` uploads
 * already carry `docs/_syntext/`; this adds the root folder, which no other
 * upload glob covers. Shared by `stx dev`, `stx deploy` and `stx build`.
 */
export async function collectRootCustomCodeFiles(projectRoot: string): Promise<Array<{ path: string; content: Buffer }>> {
  const dir = join(projectRoot, CUSTOM_CODE_DIR)
  const out: Array<{ path: string; content: Buffer }> = []
  for (const name of customCodeFileNames(dir)) {
    out.push({ path: `${CUSTOM_CODE_DIR}/${name}`, content: Buffer.from(await Bun.file(join(dir, name)).arrayBuffer()) })
  }
  return out
}
