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
 * - Three dashboard switches (Integrations › Custom code) decide what the
 *   live site applies: "CSS from your docs" (on by default), "Head tags from
 *   your docs" and "Scripts from your docs" (off by default). Previews never
 *   apply head.html or scripts. See docs-code-switches.ts.
 * - Content rules: custom-code-rules.ts.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cssContentErrors, decodeText, headHtmlErrors, jsContentErrors, NOT_TEXT } from './custom-code-rules'

export const CUSTOM_CODE_DIR = '_syntext'
export const MAX_CSS_BYTES = 51200
export const MAX_JS_BYTES = 10240
export const MAX_JS_FILES = 10
export const MAX_HEAD_BYTES = 10240

export type CustomCodeFile = { name: string; bytes: number; /** Null when the file is not UTF-8 text. */ content: string | null }
export type CustomCodeFiles = { css: CustomCodeFile[]; js: CustomCodeFile[]; head: CustomCodeFile | null }
export type CustomCodeIssue = { file: string; message: string }

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
    const raw = new Uint8Array(await readFile(join(dir, name)))
    const file = { name, bytes: raw.byteLength, content: decodeText(raw) }
    if (name === 'head.html') out.head = file
    else if (name.endsWith('.css')) out.css.push(file)
    else out.js.push(file)
  }
  return out
}

export const formatKB = (n: number) => `${(n / 1024).toFixed(1)}KB`

/** Validate a `_syntext/` folder's files. Files are named `_syntext/<name>`. */
export function validateCustomCode(files: CustomCodeFiles): CustomCodeIssue[] {
  const errors: CustomCodeIssue[] = []
  const at = (name: string) => `${CUSTOM_CODE_DIR}/${name}`
  const each = (f: CustomCodeFile, rules: (text: string) => string[]) => {
    if (f.content === null) errors.push({ file: at(f.name), message: NOT_TEXT })
    else for (const message of rules(f.content)) errors.push({ file: at(f.name), message })
  }

  let cssBytes = 0
  for (const f of files.css) {
    cssBytes += f.bytes
    each(f, cssContentErrors)
  }
  if (cssBytes > MAX_CSS_BYTES) {
    errors.push({ file: at('*.css'), message: `combined CSS is ${formatKB(cssBytes)}; the limit is 50KB` })
  }

  if (files.js.length > MAX_JS_FILES) {
    errors.push({ file: at('*.js'), message: `${files.js.length} scripts; the limit is ${MAX_JS_FILES}` })
  }
  for (const f of files.js) {
    if (f.bytes > MAX_JS_BYTES) errors.push({ file: at(f.name), message: `script is ${formatKB(f.bytes)}; the limit is 10KB` })
    each(f, jsContentErrors)
  }

  if (files.head) {
    if (files.head.bytes > MAX_HEAD_BYTES) errors.push({ file: at('head.html'), message: `head.html is ${formatKB(files.head.bytes)}; the limit is 10KB` })
    each(files.head, headHtmlErrors)
  }
  return errors
}

/** One line per issue: `_syntext/theme.css: CSS must not contain </style>`. */
export const formatCustomCodeIssue = (i: CustomCodeIssue) => `${i.file}: ${i.message}`

/** The files of the folder the build uses, by kind, as paths from the project root. */
export type CustomCodePaths = { css: string[]; js: string[]; head: string | null }

/**
 * Validate the project's `_syntext/` folder. Issue files are relative to the
 * project root (`docs/_syntext/theme.css`); messages carry no file name.
 * Warnings here are about the folder itself (an ignored root folder); the
 * switch warnings come from docs-code-switches.ts, using `paths`.
 */
export async function checkCustomCode(projectRoot: string): Promise<{
  errors: CustomCodeIssue[]
  warnings: CustomCodeIssue[]
  paths: CustomCodePaths
}> {
  const loc = locateCustomCode(projectRoot)
  const warnings: CustomCodeIssue[] = []
  const paths: CustomCodePaths = { css: [], js: [], head: null }
  if (loc.ignored) {
    warnings.push({
      file: `${loc.ignored}/`,
      message: `ignored: docs/${CUSTOM_CODE_DIR}/ exists and takes precedence. Move these files into docs/${CUSTOM_CODE_DIR}/.`,
    })
  }
  if (!loc.dir) return { errors: [], warnings, paths }
  const files = await readCustomCodeFiles(join(projectRoot, loc.dir))
  const prefix = loc.dir.slice(0, -CUSTOM_CODE_DIR.length)
  const errors = validateCustomCode(files).map((i) => ({ file: prefix + i.file, message: i.message }))
  paths.css = files.css.map((f) => `${loc.dir}/${f.name}`)
  paths.js = files.js.map((f) => `${loc.dir}/${f.name}`)
  paths.head = files.head ? `${loc.dir}/head.html` : null
  return { errors, warnings, paths }
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
