// Copied from syntext-backend src/modules/site-config/frontmatter.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * "Did you mean" for page frontmatter: unknown keys and values outside an
 * enum, with the closest valid name and the line. Warnings only; an unknown
 * key follows the deprecation policy (`frontmatter.unknown-key`).
 *
 * Known keys are the catalogue's (what the renderer reads) plus keys Syntext
 * itself writes into generated pages or documents without reading.
 */
import { FRONTMATTER_KEYS, findFrontmatterKey } from './frontmatter-keys'
import { suggest } from './suggest'
import { lineLocator } from './locate'

/** Written by the OpenAPI and @stx generators, or documented in frontmatter.mdx, but not read. */
const INERT_KEYS = ['group', 'deprecated', 'scopes', 'since', 'type', 'date', 'backgroundSize', 'backgroundPosition']

export const KNOWN_FRONTMATTER_KEYS: readonly string[] = [...FRONTMATTER_KEYS.map((k) => k.key), ...INERT_KEYS]

/** Enum keys the renderer matches case-insensitively. */
const CASE_INSENSITIVE = new Set(['protocol', 'category'])

export type FrontmatterIssue = {
  key: string
  kind: 'unknown-key' | 'invalid-value'
  message: string
  suggestion?: string
  line?: number
}

/** `yamlText` is the frontmatter block without its fences; lines are then page lines (block starts on line 2). */
export function validateFrontmatter(frontmatter: Record<string, unknown>, yamlText?: string): FrontmatterIssue[] {
  const at = yamlText === undefined ? undefined : lineLocator(yamlText, 1, 1)
  const out: FrontmatterIssue[] = []
  for (const [key, value] of Object.entries(frontmatter)) {
    const line = at?.([key])
    const spec = findFrontmatterKey(key)
    if (!spec && !INERT_KEYS.includes(key)) {
      const s = suggest(key, KNOWN_FRONTMATTER_KEYS)
      out.push({ key, kind: 'unknown-key', message: `Unknown frontmatter key "${key}".${s ? ` Did you mean "${s}"?` : ''}`, ...(s ? { suggestion: s } : {}), ...(line ? { line } : {}) })
      continue
    }
    if (spec?.type !== 'enum' || !spec.values || typeof value !== 'string') continue
    const ok = CASE_INSENSITIVE.has(key) ? spec.values.includes(value.toLowerCase()) : spec.values.includes(value)
    if (ok) continue
    const s = suggest(value, spec.values)
    out.push({
      key,
      kind: 'invalid-value',
      message: `"${value}" is not a valid ${key}. Use one of: ${spec.values.join(', ')}.${s ? ` Did you mean "${s}"?` : ''}`,
      ...(s ? { suggestion: s } : {}),
      ...(line ? { line } : {}),
    })
  }
  return out
}
