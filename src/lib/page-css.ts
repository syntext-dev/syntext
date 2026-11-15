/**
 * The per-page `css` frontmatter key: a stylesheet for one page, added after
 * the site CSS. The value is a path to a `.css` file inside the docs folder,
 * relative to the page (`./pricing.css`, `../shared/x.css`) or from the docs
 * root (`/styles/pricing.css`). CSS only: no URLs, no scripts. Rules match
 * syntext-backend. The "CSS from your docs" switch covers it.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { posix } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { frontmatterBlock } from '../syntax/locate'
import { cssContentErrors, decodeText, NOT_TEXT } from './custom-code-rules'
import { formatKB, MAX_CSS_BYTES } from './repo-custom-code'

const SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** Show a frontmatter value in a message. */
const show = (v: unknown) => (typeof v === 'string' ? `"${v}"` : JSON.stringify(v) ?? String(v))

/**
 * Resolve a page's `css` value to a path from the docs root (`styles/x.css`).
 * `pageFile` is the page's path from the docs root (`guides/pricing.mdx`).
 * Returns the reason when the value is not an allowed path; the file itself is not read.
 */
export function resolvePageCss(value: unknown, pageFile: string): { path: string } | { reason: string } {
  if (typeof value !== 'string') return { reason: 'must be a path to a .css file' }
  const v = value.trim()
  if (!v) return { reason: 'must not be empty' }
  if (v.includes('://') || v.startsWith('//') || SCHEME.test(v)) return { reason: 'must be a path to a .css file in the docs folder, not a URL' }
  if (v.includes('\\')) return { reason: 'must use forward slashes, not backslashes' }
  if (!/\.css$/i.test(v)) return { reason: 'must point to a .css file' }
  const joined = v.startsWith('/') ? v.slice(1) : posix.join(posix.dirname(pageFile), v)
  const path = posix.normalize(joined)
  if (path === '..' || path.startsWith('../') || posix.isAbsolute(path)) return { reason: 'points outside the docs folder' }
  return { path }
}

/** The page's `css` frontmatter value, or undefined when the page has none (or its frontmatter does not parse). */
export function pageCssValue(source: string): unknown {
  const block = frontmatterBlock(source)
  if (!block) return undefined
  let fm: unknown
  try {
    fm = parseYaml(block.text)
  } catch {
    return undefined
  }
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) return undefined
  return (fm as Record<string, unknown>).css
}

/**
 * Validate a page's `css` frontmatter against the files in `docsDir`.
 * Returns the error message (naming the value), or null when the page has
 * no `css` or it is valid. The caller names the page file.
 */
export function validatePageCss(source: string, pageFile: string, docsDir: string): string | null {
  const value = pageCssValue(source)
  if (value === undefined) return null
  const label = `css ${show(value)}`
  const resolved = resolvePageCss(value, pageFile)
  if ('reason' in resolved) return `${label} ${resolved.reason}`
  const abs = posix.join(docsDir, resolved.path)
  if (!existsSync(abs) || !statSync(abs).isFile()) return `${label}: file not found (${resolved.path} in the docs folder)`
  const size = statSync(abs).size
  if (size > MAX_CSS_BYTES) return `${label}: the file is ${formatKB(size)}; the limit is 50KB`
  const content = decodeText(new Uint8Array(readFileSync(abs)))
  if (content === null) return `${label}: ${resolved.path} ${NOT_TEXT}`
  const forbidden = cssContentErrors(content)
  if (forbidden.length > 0) return `${label}: ${forbidden.join('; ')}`
  return null
}
