/**
 * Apply the deprecation table's config rules (`move-key`, `set-value`,
 * `remove-key`) to syntext.json or syntext.yml through a text editor that
 * keeps the file's formatting (JSON) or comments (YAML).
 *
 * Rules follow `deprecations.md`, "Rewrite rule types": a move skips a target
 * that is already set and still removes the old key; an object the move
 * leaves empty is removed too. Rules that move a value into `appearance`
 * (`requiresV2`) switch the site to doc engine v2, so on a v1 site they are
 * held unless the caller opts in.
 */
import { resolveAppearance } from '../appearance/resolve'
import { lineLocator, type PathSegment } from '../syntax/locate'
import type { TableItem } from '../syntax/table-source'
import type { Path } from './json-edit'

export type ConfigEditor = {
  readonly text: string
  has(path: Path): boolean
  get(path: Path): unknown
  set(path: Path, value: unknown): void
  rename(path: Path, key: string): void
  delete(path: Path): void
}

export type Change = { code: string; file: string; line: number; old: string; replacement: string; note?: string }
export type Held = Change & { reason: string }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const show = (v: unknown) => JSON.stringify(v)
const label = (segs: readonly PathSegment[]) => segs.map(String).join('.').replace(/\.(\d+)\./g, '[$1].')
const V2_REASON = 'Moves the value into appearance, which switches the site to doc engine v2. Run with --v2 to apply it.'

/** Expand a table path (`redirects[].source`) into the concrete paths present in `config`. */
function concretePaths(config: unknown, path: string): PathSegment[][] {
  let level: Array<{ value: unknown; segments: PathSegment[] }> = [{ value: config, segments: [] }]
  for (const part of path.split('.')) {
    const array = part.endsWith('[]')
    const key = array ? part.slice(0, -2) : part
    const next: typeof level = []
    for (const { value, segments } of level) {
      if (!isObject(value) || !(key in value)) continue
      const child = value[key]
      if (!array) next.push({ value: child, segments: [...segments, key] })
      else if (Array.isArray(child)) child.forEach((item, i) => next.push({ value: item, segments: [...segments, key, i] }))
    }
    level = next
  }
  return level.map((l) => l.segments)
}

/** A table target (`redirects[].from`) with this element's indexes filled in. */
function targetSegments(to: string, from: readonly PathSegment[]): PathSegment[] {
  const idx = from.filter((s): s is number => typeof s === 'number')
  let n = 0
  return to.split('.').flatMap((part) => (part.endsWith('[]') ? [part.slice(0, -2), idx[n++] ?? 0] : [part]))
}

/** The first prefix of `path` that exists and is not an object, if any. */
function blocked(editor: ConfigEditor, path: readonly PathSegment[]): string | undefined {
  for (let d = 1; d < path.length; d++) {
    const prefix = path.slice(0, d)
    if (editor.has(prefix) && !isObject(editor.get(prefix)) && !Array.isArray(editor.get(prefix))) return label(prefix)
  }
  return undefined
}

/** Delete `path`, then any parent object it leaves empty (never the root). */
function deleteAndPrune(editor: ConfigEditor, path: readonly PathSegment[]): void {
  editor.delete(path)
  for (let d = path.length - 1; d > 0; d--) {
    const parent = path.slice(0, d)
    const v = editor.get(parent)
    if (!isObject(v) || Object.keys(v).length) break
    editor.delete(parent)
  }
}

const sameParent = (a: readonly PathSegment[], b: readonly PathSegment[]) => a.length === b.length && a.slice(0, -1).every((s, i) => s === b[i])

export function rewriteConfig(input: { editor: ConfigEditor; fileName: string; items: readonly TableItem[]; applyV2: boolean; siteIsV2?: boolean }): { applied: Change[]; held: Held[]; unsupported: string[] } {
  const { editor, fileName } = input
  const at = lineLocator(editor.text)
  const applied: Change[] = []
  const held: Held[] = []
  const unsupported: string[] = []
  const v2 = input.applyV2 || (input.siteIsV2 ?? resolveAppearance(editor.get([])).v2)

  for (const item of input.items) {
    if (item.kind !== 'config') continue
    const r = item.rewrite as { type: string } & Record<string, unknown>
    const config = editor.get([])

    if (r.type === 'move-key') {
      const from = String(r.from)
      const to = (r.to as string[]).map(String)
      const values = isObject(r.values) ? r.values : undefined
      for (const segs of concretePaths(config, from)) {
        const value = editor.get(segs)
        const mapped = values && typeof value === 'string' && value in values ? values[value] : value
        const targets = to.map((t) => targetSegments(t, segs))
        const change: Change = {
          code: item.code,
          file: fileName,
          line: at(segs),
          old: isObject(value) ? label(segs) : `${label(segs)}: ${show(value)}`,
          replacement: targets.map((t) => `${label(t)}: ${show(mapped)}`).join(' and '),
        }
        if (item.requiresV2 && !v2) {
          held.push({ ...change, reason: V2_REASON })
          continue
        }
        const stuck = targets.map((t) => blocked(editor, t)).find(Boolean)
        if (stuck) {
          held.push({ ...change, reason: `${stuck} is not an object; move it by hand.` })
          continue
        }
        const kept = targets.filter((t) => editor.has(t))
        if (targets.length === 1 && !kept.length && sameParent(segs, targets[0]) && mapped === value) {
          editor.rename(segs, String(targets[0][targets[0].length - 1]))
        } else {
          for (const t of targets) if (!editor.has(t)) editor.set(t, mapped)
          deleteAndPrune(editor, segs)
        }
        if (kept.length) change.note = kept.map((t) => `${label(t)} was already set; kept ${show(editor.get(t))}.`).join(' ')
        applied.push(change)
      }
    } else if (r.type === 'set-value') {
      for (const segs of concretePaths(config, String(r.path))) {
        if (editor.get(segs) !== r.from) continue
        editor.set(segs, r.to)
        applied.push({ code: item.code, file: fileName, line: at(segs), old: `${label(segs)}: ${show(r.from)}`, replacement: `${label(segs)}: ${show(r.to)}` })
      }
    } else if (r.type === 'remove-key') {
      for (const segs of concretePaths(config, String(r.path))) {
        const change = { code: item.code, file: fileName, line: at(segs), old: label(segs), replacement: item.replacement }
        deleteAndPrune(editor, segs)
        applied.push(change)
      }
    } else if (r.type !== 'rename-file' && r.type !== 'manual') {
      unsupported.push(item.code)
    }
  }
  return { applied, held, unsupported }
}
