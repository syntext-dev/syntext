/**
 * Validate a site config against the published JSON Schema
 * (`syntext.schema.json`, generated from the backend's Zod schema; served at
 * https://syntext.dev/schema/syntext.json) and turn the problems into messages
 * an author can act on: the closest valid key or value ("did you mean") and,
 * given the file text, the line.
 *
 * The backend validates with Zod (`src/modules/site-config/validate.ts`). The
 * CLI has no Zod, so `schemaIssues` walks the JSON Schema and produces the
 * same raw issues Zod would (codes, paths, union branches, order), and
 * `explain` below is the backend's, verbatim. `fixtures/validate-golden.json`
 * (the backend's output over a corpus) keeps the two identical.
 *
 * Every issue is a warning: v1 never failed a build on an unknown key or a
 * mistyped value; unknown keys follow the deprecation policy instead.
 */
import { suggest } from './suggest'
import { lineLocator, type PathSegment } from './locate'
import schemaJson from './syntext.schema.json'

export type ConfigIssue = {
  /** Dotted path, array indexes included: `navigation.0.pagez`. */
  path: string
  segments: PathSegment[]
  kind: 'unknown-key' | 'invalid-value'
  severity: 'warning'
  message: string
  suggestion?: string
  line?: number
}

type JsonSchema = {
  type?: string
  properties?: Record<string, JsonSchema>
  additionalProperties?: boolean | JsonSchema
  required?: string[]
  items?: JsonSchema
  anyOf?: JsonSchema[]
  enum?: unknown[]
  const?: unknown
  pattern?: string
  $ref?: string
}

export type RawIssue = { code: string; path: PropertyKey[]; message: string; keys?: string[]; values?: unknown[]; expected?: string; errors?: RawIssue[][] }

const ROOT = schemaJson as unknown as JsonSchema & { definitions?: Record<string, JsonSchema> }

/** Messages the Zod schema gives its regex checks (JSON Schema keeps only the pattern). */
const PATTERN_MESSAGES: Readonly<Record<string, string>> = {
  '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$': 'a hex colour like "#0E7A63"',
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function deref(s: JsonSchema): JsonSchema {
  if (!s.$ref) return s
  const name = s.$ref.replace('#/definitions/', '')
  return ROOT.definitions?.[name] ?? {}
}

/** Zod's name for the type a schema expects. */
function expectedType(s: JsonSchema): string {
  const d = deref(s)
  if (d.type === 'integer') return 'number'
  if (d.type) return d.type
  if (d.anyOf?.length) return expectedType(d.anyOf[0])
  return 'value'
}

function typeMatches(type: string, v: unknown): boolean {
  switch (type) {
    case 'string': return typeof v === 'string'
    case 'number': return typeof v === 'number' && Number.isFinite(v)
    case 'integer': return typeof v === 'number' && Number.isFinite(v)
    case 'boolean': return typeof v === 'boolean'
    case 'object': return isObject(v)
    case 'array': return Array.isArray(v)
    case 'null': return v === null
    default: return true
  }
}

function check(schema: JsonSchema, value: unknown, path: PropertyKey[], out: RawIssue[]): void {
  const s = deref(schema)
  if (s.anyOf) {
    // `.nullable()` is a wrapper in Zod, not a union: null passes, anything else meets the inner schema.
    const nonNull = s.anyOf.filter((b) => deref(b).type !== 'null')
    if (nonNull.length < s.anyOf.length) {
      if (value === null) return
      if (nonNull.length === 1) return check(nonNull[0], value, path, out)
    }
    const errors = nonNull.map((b) => {
      const branch: RawIssue[] = []
      check(b, value, [], branch)
      return branch
    })
    if (errors.some((e) => e.length === 0)) return
    out.push({ code: 'invalid_union', path, message: 'Invalid input', errors })
    return
  }
  if (s.enum || 'const' in s) {
    const values = s.enum ?? [s.const]
    if (!values.includes(value)) out.push({ code: 'invalid_value', path, message: 'Invalid input', values })
    return
  }
  if (s.type && !typeMatches(s.type, value)) {
    out.push({ code: 'invalid_type', path, message: 'Invalid input', expected: expectedType(s) })
    return
  }
  if (s.type === 'integer' && !Number.isInteger(value)) {
    out.push({ code: 'invalid_type', path, message: 'Invalid input', expected: 'int' })
    return
  }
  if (s.type === 'string' && s.pattern && !new RegExp(s.pattern).test(value as string)) {
    out.push({ code: 'invalid_format', path, message: PATTERN_MESSAGES[s.pattern] ?? `must match ${s.pattern}` })
    return
  }
  if (s.type === 'array' && s.items && Array.isArray(value)) {
    value.forEach((item, i) => check(s.items as JsonSchema, item, [...path, i], out))
    return
  }
  if (s.type === 'object' && isObject(value)) {
    const props = s.properties ?? {}
    for (const [key, sub] of Object.entries(props)) {
      if (key in value && value[key] !== undefined) check(sub, value[key], [...path, key], out)
      else if (s.required?.includes(key)) out.push({ code: 'invalid_type', path: [...path, key], message: 'Invalid input', expected: expectedType(sub) })
    }
    const extra = Object.keys(value).filter((k) => !(k in props))
    if (isObject(s.additionalProperties)) {
      for (const k of extra) check(s.additionalProperties, value[k], [...path, k], out)
    } else if (s.additionalProperties === false && extra.length) {
      out.push({ code: 'unrecognized_keys', path, message: 'Unrecognized keys', keys: extra })
    }
  }
}

/** Zod-shaped raw issues for `config`, in Zod's order. */
export function schemaIssues(config: unknown): RawIssue[] {
  const out: RawIssue[] = []
  check(ROOT, config, [], out)
  return out
}

function candidates(s: JsonSchema): JsonSchema[] {
  const d = deref(s)
  return d.anyOf ? d.anyOf.flatMap(candidates) : [d]
}

/** Every key an object at `path` may hold (union branches merged). */
export function keysAt(path: readonly PathSegment[]): string[] {
  let level: JsonSchema[] = [ROOT]
  for (const seg of path) {
    const next: JsonSchema[] = []
    for (const s of level.flatMap(candidates)) {
      if (s.type === 'object' && typeof seg === 'string' && s.properties?.[seg]) next.push(s.properties[seg])
      if (s.type === 'array' && typeof seg === 'number' && s.items) next.push(s.items)
    }
    level = next
  }
  const keys = new Set<string>()
  for (const s of level.flatMap(candidates)) if (s.type === 'object') Object.keys(s.properties ?? {}).forEach((k) => keys.add(k))
  return [...keys]
}

// ── From here on: the backend's validate.ts, unchanged ───────────────────

const valueAt = (root: unknown, path: readonly PathSegment[]): unknown =>
  path.reduce<unknown>((v, seg) => (v !== null && typeof v === 'object' ? (v as Record<PropertyKey, unknown>)[seg] : undefined), root)

const typeName = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v === 'object' ? 'an object' : `a ${typeof v}`)
const article = (t: string) => (/^[aeiou]/.test(t) ? `an ${t}` : `a ${t}`)

/** The union branch to explain: the one whose issues do not start with "wrong type here". */
function bestBranch(branches: RawIssue[][]): RawIssue[] {
  const scored = branches.map((b) => ({ b, rootMismatch: b.some((i) => i.path.length === 0 && (i.code === 'invalid_type' || i.code === 'invalid_value')) }))
  const usable = scored.filter((s) => !s.rootMismatch)
  const pool = usable.length ? usable : scored
  return pool.sort((a, b) => a.b.length - b.b.length)[0]?.b ?? []
}

function explain(raw: RawIssue[], base: PathSegment[], config: unknown, out: ConfigIssue[]): void {
  for (const issue of raw) {
    const segments = [...base, ...issue.path.map((p) => (typeof p === 'number' ? p : String(p)))]
    const path = segments.join('.')
    if (issue.code === 'invalid_union' && issue.errors) {
      explain(bestBranch(issue.errors), segments, config, out)
    } else if (issue.code === 'unrecognized_keys') {
      const allowed = keysAt(segments)
      for (const key of issue.keys ?? []) {
        const s = suggest(key, allowed)
        const full = [...segments, key]
        out.push({ path: full.join('.'), segments: full, kind: 'unknown-key', severity: 'warning', message: `Unknown key "${key}".${s ? ` Did you mean "${s}"?` : ''}`, ...(s ? { suggestion: s } : {}) })
      }
    } else if (issue.code === 'invalid_value' && issue.values) {
      const value = valueAt(config, segments)
      const allowed = issue.values.map(String)
      const s = typeof value === 'string' ? suggest(value, allowed) : undefined
      out.push({ path, segments, kind: 'invalid-value', severity: 'warning', message: `"${String(value)}" is not a valid ${path} value. Use one of: ${allowed.join(', ')}.${s ? ` Did you mean "${s}"?` : ''}`, ...(s ? { suggestion: s } : {}) })
    } else if (issue.code === 'invalid_type') {
      const value = valueAt(config, segments)
      const expected = issue.expected === 'object' && value !== undefined ? 'object' : issue.expected ?? 'value'
      out.push({ path, segments, kind: 'invalid-value', severity: 'warning', message: `${path || 'The config'} should be ${article(expected)}, not ${typeName(value)}.` })
    } else {
      out.push({ path, segments, kind: 'invalid-value', severity: 'warning', message: `${path}: ${issue.message}` })
    }
  }
}

export function validateSiteConfig(config: unknown, opts: { source?: string } = {}): ConfigIssue[] {
  const raw = schemaIssues(config)
  if (!raw.length) return []
  const out: ConfigIssue[] = []
  explain(raw, [], config, out)
  if (opts.source !== undefined) {
    const at = lineLocator(opts.source)
    for (const i of out) i.line = at(i.segments)
  }
  return out
}
