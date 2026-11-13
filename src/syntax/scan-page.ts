// Copied from syntext-backend src/modules/deprecations/scan-page.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * Find every deprecated form a page uses: renamed frontmatter keys, unknown
 * frontmatter keys (with "did you mean"), and deprecated MDX tags and props,
 * each with its line. Also returns frontmatter values outside their enum, so
 * the build can warn about them in the same pass.
 */
import { parse as parseYaml } from 'yaml'
import { validateFrontmatter, type FrontmatterIssue } from './frontmatter'
import { frontmatterBlock, lineLocator } from './locate'
import { findTags } from './mdx-tags'
import { DEPRECATIONS, findDeprecation, type Deprecation } from './registry'
import type { DeprecationUsage } from './usage'

const use = (d: Deprecation, file: string, line: number, old: string, replacement: string): DeprecationUsage =>
  ({ code: d.code, kind: d.kind, file, line, old, replacement })

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

function scanFrontmatter(file: string, source: string, out: DeprecationUsage[], issues: FrontmatterIssue[]): void {
  const block = frontmatterBlock(source)
  if (!block) return
  let fm: unknown
  try {
    fm = parseYaml(block.text)
  } catch {
    return
  }
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) return
  const data = fm as Record<string, unknown>
  const at = lineLocator(block.text, block.firstLine - 1, block.firstLine)

  for (const d of DEPRECATIONS) {
    const r = d.rewrite
    if (r.type === 'rename-frontmatter-key' && r.from in data) {
      out.push(use(d, file, at([r.from]), `${r.from}: ${show(data[r.from])}`, `${r.to}: ${show(data[r.from])}`))
    } else if (r.type === 'frontmatter-flag-to-value' && r.from in data) {
      const on = data[r.from] === true
      out.push(use(d, file, at([r.from]), `${r.from}: ${show(data[r.from])}`, on ? `${r.to}: ${r.value}` : `nothing (delete ${r.from})`))
    }
  }

  const unknown = findDeprecation('frontmatter.unknown-key')
  for (const issue of validateFrontmatter(data, block.text)) {
    if (issue.kind === 'unknown-key' && unknown) out.push(use(unknown, file, issue.line ?? 1, issue.key, issue.suggestion ?? 'nothing (delete the key)'))
    else if (issue.kind === 'invalid-value') issues.push(issue)
  }
}

function scanTags(file: string, source: string, out: DeprecationUsage[]): void {
  const block = frontmatterBlock(source)
  // Blank the frontmatter so a tag inside a YAML string is not read as MDX.
  const body = block ? source.replace(/^[\s\S]*?\n---[^\n]*/, (m) => m.replace(/[^\n]/g, ' ')) : source
  for (const tag of findTags(body)) {
    if (tag.closing) continue
    for (const d of DEPRECATIONS) {
      const r = d.rewrite
      if (r.type === 'rename-tag' && tag.name === r.from) {
        out.push(use(d, file, tag.line, `<${r.from}>`, `<${r.to}>`))
      } else if (r.type === 'tag-from-prop' && tag.name === r.tag) {
        const prop = tag.attrs.find((a) => a.name.toLowerCase() === r.prop)
        if (!prop) continue
        const named = prop.value ? r.map[prop.value.trim().toLowerCase()] : undefined
        out.push(use(d, file, tag.line, `<${r.tag} ${r.prop}="${prop.value ?? ''}">`, named ? `<${named}>` : d.replacement))
      } else if (r.type === 'rename-prop' && tag.name === r.tag) {
        const attr = tag.attrs.find((a) => a.name === r.from)
        if (attr) out.push(use(d, file, attr.line, d.old, d.replacement))
      }
    }
  }
}

export function scanPage(file: string, source: string): { usages: DeprecationUsage[]; issues: FrontmatterIssue[] } {
  const usages: DeprecationUsage[] = []
  const issues: FrontmatterIssue[] = []
  scanFrontmatter(file, source, usages, issues)
  scanTags(file, source, usages)
  return { usages, issues }
}
