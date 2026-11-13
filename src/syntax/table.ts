// Copied from syntext-backend src/modules/deprecations/table.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * The deprecation table in the two published shapes: JSON for
 * `GET /v1/schema/deprecations.json` (what `stx migrate` reads) and Markdown
 * for `spec_docs/doc-engine-v2/deprecations.md`.
 */
import { DEPRECATIONS, type Deprecation, type Rewrite } from './registry'
import { NOTICE_WINDOW_DAYS } from './state'

export type DeprecationTable = {
  version: 1
  windowDays: number
  items: Array<Pick<Deprecation, 'code' | 'kind' | 'old' | 'replacement' | 'rewrite' | 'fix'> & { requiresV2: boolean; note?: string }>
}

export function deprecationTable(): DeprecationTable {
  return {
    version: 1,
    windowDays: NOTICE_WINDOW_DAYS,
    items: DEPRECATIONS.map((d) => ({
      code: d.code,
      kind: d.kind,
      old: d.old,
      replacement: d.replacement,
      rewrite: d.rewrite,
      fix: d.fix,
      requiresV2: d.requiresV2 === true,
      ...(d.note ? { note: d.note } : {}),
    })),
  }
}

/** One line describing a rewrite rule, as `stx migrate` applies it. */
export function describeRewrite(r: Rewrite): string {
  switch (r.type) {
    case 'move-key': {
      const map = r.values ? ` mapping ${Object.entries(r.values).map(([a, b]) => `"${a}"→"${String(b)}"`).join(', ')}` : ''
      return `move \`${r.from}\` to ${r.to.map((t) => `\`${t}\``).join(' and ')}${map}; keep a target that is already set`
    }
    case 'set-value': return `set \`${r.path}\` from "${r.from}" to "${r.to}"`
    case 'remove-key': return `delete \`${r.path}\``
    case 'rename-file': return `rename \`${r.from}\` to \`${r.to}\``
    case 'rename-frontmatter-key': return `rename frontmatter \`${r.from}\` to \`${r.to}\` unless \`${r.to}\` is set`
    case 'frontmatter-flag-to-value': return `\`${r.from}: true\` → \`${r.to}: ${r.value}\` unless \`${r.to}\` is set; delete \`${r.from}: false\``
    case 'rename-tag': return `rename \`<${r.from}>\`/\`</${r.from}>\` to \`<${r.to}>\`/\`</${r.to}>\``
    case 'tag-from-prop': return `\`<${r.tag} ${r.prop}="x">\` → named tag (${Object.entries(r.map).map(([a, b]) => `${a}→${b}`).join(', ')}), drop \`${r.prop}\`, rename the closing tag; unknown values stay`
    case 'rename-prop': return `rename \`${r.from}\` to \`${r.to}\` on \`<${r.tag}>\` unless \`${r.to}\` is set`
    case 'manual': return `manual: ${r.hint}`
    case 'home-to-mdx': return 'write the generated home of the index page as home components (`homeToMdx`), drop `home`'
  }
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function deprecationsMarkdown(): string {
  const rows = DEPRECATIONS.map((d) =>
    `| \`${d.code}\` | ${d.kind} | \`${cell(d.old)}\` | ${cell(d.replacement)} | ${cell(describeRewrite(d.rewrite))}${d.requiresV2 ? ' (v2 only)' : ''} |`)
  return [
    '| Code | Kind | Old | New | Rewrite rule |',
    '|------|------|-----|-----|--------------|',
    ...rows,
  ].join('\n')
}
