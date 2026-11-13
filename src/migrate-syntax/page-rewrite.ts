/**
 * Apply the deprecation table's page rules to one MDX/Markdown file:
 * frontmatter keys (`rename-frontmatter-key`, `frontmatter-flag-to-value`)
 * and MDX tags and props (`rename-tag`, `tag-from-prop`, `rename-prop`).
 *
 * Edits are surgical: a renamed key or prop changes only its name, so values,
 * quoting and comments stay. Code fences, inline code, HTML comments and the
 * frontmatter are never read as MDX (the same tag reader the build uses).
 */
import { parse as parseYaml } from 'yaml'
import { frontmatterBlock, lineLocator } from '../syntax/locate'
import { findTags } from '../syntax/mdx-tags'
import type { TableItem } from '../syntax/table-source'
import type { Change, Held } from './config-rewrite'

type Edit = { start: number; end: number; text: string }
type Rule = { type: string } & Record<string, unknown>

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function rewriteFrontmatter(file: string, source: string, items: readonly TableItem[], applied: Change[]): string {
  const block = frontmatterBlock(source)
  if (!block) return source
  let data: unknown
  try {
    data = parseYaml(block.text)
  } catch {
    return source
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return source
  const fm = data as Record<string, unknown>
  const lineOf = lineLocator(block.text, 1, 2)
  const lines = source.split('\n')
  let close = lines.findIndex((l, i) => i > 0 && l.trim() === '---')

  /** Index of the top-level key's line, and the index after its value's last line. */
  const span = (key: string): [number, number] | null => {
    const re = new RegExp(`^(["']?)${escape(key)}\\1\\s*:`)
    const i = lines.findIndex((l, n) => n > 0 && n < close && re.test(l))
    if (i === -1) return null
    let j = i + 1
    while (j < close && /^(\s+\S|-(\s|$))/.test(lines[j])) j++
    return [i, j]
  }
  const replace = (s: [number, number], text: string[]) => {
    lines.splice(s[0], s[1] - s[0], ...text)
    close += text.length - (s[1] - s[0])
  }

  for (const item of items) {
    if (item.kind !== 'frontmatter') continue
    const r = item.rewrite as Rule
    const from = String(r.from ?? '')
    if (!(from in fm)) continue
    const s = span(from)
    if (!s) continue
    const base = { code: item.code, file, line: lineOf([from]), old: `${from}: ${show(fm[from])}` }
    const to = String(r.to)
    if (r.type === 'rename-frontmatter-key') {
      if (to in fm) {
        replace(s, [])
        applied.push({ ...base, replacement: `${to}: ${show(fm[to])}`, note: `${to} was already set; removed ${from}.` })
      } else {
        lines[s[0]] = lines[s[0]].replace(new RegExp(`^(["']?)${escape(from)}\\1`), to)
        applied.push({ ...base, replacement: `${to}: ${show(fm[from])}` })
      }
      fm[to] = fm[to] ?? fm[from]
      delete fm[from]
    } else if (r.type === 'frontmatter-flag-to-value' && typeof fm[from] === 'boolean') {
      const value = String(r.value)
      if (fm[from] === true && !(to in fm)) {
        replace(s, [`${to}: ${value}`])
        applied.push({ ...base, replacement: `${to}: ${value}` })
        fm[to] = value
      } else {
        replace(s, [])
        const note = fm[from] === true ? `${to} was already set; removed ${from}.` : undefined
        applied.push({ ...base, replacement: `nothing (delete ${from})`, ...(note ? { note } : {}) })
      }
      delete fm[from]
    }
  }
  return lines.join('\n')
}

function rewriteTags(file: string, source: string, items: readonly TableItem[], applied: Change[], held: Held[]): string {
  const hasFrontmatter = frontmatterBlock(source) !== null
  const body = hasFrontmatter ? source.replace(/^[\s\S]*?\n---[^\n]*/, (m) => m.replace(/[^\n]/g, ' ')) : source
  const tags = findTags(body)
  const edits: Edit[] = []

  for (const item of items) {
    const r = item.rewrite as Rule
    if (r.type === 'rename-tag') {
      const from = String(r.from)
      for (const tag of tags) {
        if (tag.name !== from) continue
        edits.push({ start: tag.nameStart, end: tag.nameStart + from.length, text: String(r.to) })
        if (!tag.closing) applied.push({ code: item.code, file, line: tag.line, old: `<${from}>`, replacement: `<${String(r.to)}>` })
      }
    } else if (r.type === 'tag-from-prop') {
      const name = String(r.tag)
      const prop = String(r.prop).toLowerCase()
      const map = (r.map ?? {}) as Record<string, string>
      const stack: Array<string | null> = []
      for (const tag of tags) {
        if (tag.name !== name) continue
        if (tag.closing) {
          const named = stack.pop()
          if (named) edits.push({ start: tag.nameStart, end: tag.nameStart + name.length, text: named })
          continue
        }
        const attr = tag.attrs.find((a) => a.name.toLowerCase() === prop)
        const named = attr?.value ? map[attr.value.trim().toLowerCase()] ?? null : null
        if (!tag.selfClosing) stack.push(named)
        if (!attr) continue
        const change = { code: item.code, file, line: tag.line, old: `<${name} ${String(r.prop)}="${attr.value ?? ''}">`, replacement: named ? `<${named}>` : item.replacement }
        if (!named) {
          held.push({ ...change, reason: `"${attr.value ?? ''}" is not a callout type Syntext knows; pick one of ${Object.values(map).filter((v, i, a) => a.indexOf(v) === i).join(', ')} by hand.` })
          continue
        }
        edits.push({ start: tag.nameStart, end: tag.nameStart + name.length, text: named })
        let cut = attr.nameStart
        while (cut > tag.nameStart && /\s/.test(source[cut - 1])) cut--
        edits.push({ start: cut, end: attr.end, text: '' })
        applied.push(change)
      }
    } else if (r.type === 'rename-prop') {
      const [name, from, to] = [String(r.tag), String(r.from), String(r.to)]
      for (const tag of tags) {
        if (tag.name !== name || tag.closing) continue
        const attr = tag.attrs.find((a) => a.name === from)
        if (!attr) continue
        const change = { code: item.code, file, line: attr.line, old: item.old, replacement: item.replacement }
        if (tag.attrs.some((a) => a.name === to)) {
          held.push({ ...change, reason: `The tag already has ${to}; delete ${from} by hand.` })
          continue
        }
        edits.push({ start: attr.nameStart, end: attr.nameEnd, text: to })
        applied.push(change)
      }
    }
  }

  let out = source
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return out
}

export function rewritePage(file: string, source: string, items: readonly TableItem[]): { text: string; applied: Change[]; held: Held[] } {
  const applied: Change[] = []
  const held: Held[] = []
  const afterFrontmatter = rewriteFrontmatter(file, source, items, applied)
  const text = rewriteTags(file, afterFrontmatter, items.filter((i) => i.kind === 'mdx-tag' || i.kind === 'mdx-prop'), applied, held)
  return { text, applied, held }
}
