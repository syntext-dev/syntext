// Copied from syntext-backend src/modules/deprecations/scan-config.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * Find every deprecated form a site config uses, with the line it is on and
 * the exact replacement for this config's value (`features.navStyle: "single"`
 * → `appearance.layout.header: "simple"`).
 */
import { validateSiteConfig } from './validate'
import { lineLocator, type PathSegment } from './locate'
import { DEPRECATIONS, findDeprecation, type Deprecation } from './registry'
import type { DeprecationUsage } from './usage'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const show = (v: unknown) => JSON.stringify(v)

/** Expand a registry path (`redirects[].source`) against the config into concrete paths that exist. */
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

const valueAt = (root: unknown, segs: PathSegment[]): unknown =>
  segs.reduce<unknown>((v, s) => (v !== null && typeof v === 'object' ? (v as Record<PropertyKey, unknown>)[s] : undefined), root)

/** The registry's target paths with this array element's indexes filled in. */
function targetPath(to: string, segs: PathSegment[]): string {
  let n = 0
  const idx = segs.filter((s): s is number => typeof s === 'number')
  return to.replace(/\[\]/g, () => `.${idx[n++] ?? 0}`)
}

function usage(d: Deprecation, file: string, line: number, old: string, replacement: string): DeprecationUsage {
  return { code: d.code, kind: d.kind, file, line, old, replacement }
}

export function scanConfigDeprecations(input: { config: Record<string, unknown>; fileName: string; source?: string }): DeprecationUsage[] {
  const { config, fileName } = input
  const at = lineLocator(input.source ?? '')
  const out: DeprecationUsage[] = []

  const fileRule = findDeprecation('config.file-name')
  if (fileRule && fileName === 'syntext.config.json') out.push(usage(fileRule, fileName, 1, fileName, 'syntext.json'))

  for (const d of DEPRECATIONS) {
    if (d.kind !== 'config') continue
    const r = d.rewrite
    if (r.type === 'move-key') {
      for (const segs of concretePaths(config, r.from)) {
        const value = valueAt(config, segs)
        const mapped = r.values && typeof value === 'string' && value in r.values ? r.values[value] : value
        const label = segs.map(String).join('.').replace(/\.(\d+)\./g, '[$1].')
        const old = typeof value === 'object' && value !== null ? label : `${label}: ${show(value)}`
        const replacement = r.to.map((t) => `${targetPath(t, segs).replace(/\.(\d+)\./g, '[$1].')}: ${show(mapped)}`).join(' and ')
        out.push(usage(d, fileName, at(segs), old, replacement))
      }
    } else if (r.type === 'set-value') {
      for (const segs of concretePaths(config, r.path)) {
        if (valueAt(config, segs) === r.from) out.push(usage(d, fileName, at(segs), `${r.path}: ${show(r.from)}`, `${r.path}: ${show(r.to)}`))
      }
    } else if (r.type === 'remove-key') {
      for (const segs of concretePaths(config, r.path)) out.push(usage(d, fileName, at(segs), r.path, d.replacement))
    }
  }

  const unknown = findDeprecation('config.unknown-key')
  if (unknown) {
    for (const issue of validateSiteConfig(config)) {
      if (issue.kind !== 'unknown-key') continue
      const replacement = issue.suggestion ? issue.segments.slice(0, -1).concat(issue.suggestion).join('.') : 'nothing (delete the key)'
      out.push(usage(unknown, fileName, at(issue.segments), issue.path, replacement))
    }
  }
  return out
}
