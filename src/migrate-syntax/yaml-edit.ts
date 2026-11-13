/**
 * Edit syntext.yml / syntext.yaml through the YAML document model, which
 * keeps comments, key order and scalar styles. Renamed keys keep their
 * position and comments; long lines are never folded.
 */
import { isMap, isScalar, isSeq, parseDocument, type Document } from 'yaml'
import type { Path } from './json-edit'

export class YamlTextEditor {
  private readonly doc: Document

  constructor(text: string) {
    this.doc = parseDocument(text, { keepSourceTokens: false })
    if (this.doc.errors.length) throw new Error(`Not valid YAML: ${this.doc.errors[0].message.split('\n')[0]}`)
  }

  get text(): string {
    return this.doc.toString({ lineWidth: 0, flowCollectionPadding: false })
  }

  has(path: Path): boolean {
    return path.length === 0 || this.doc.hasIn(path as unknown[])
  }

  get(path: Path): unknown {
    if (path.length === 0) return this.doc.toJS()
    const v = this.doc.getIn(path as unknown[], true)
    return v && typeof v === 'object' && 'toJSON' in v ? (v as { toJSON: () => unknown }).toJSON() : isScalar(v) ? v.value : v
  }

  rename(path: Path, key: string): void {
    const parent = path.length > 1 ? this.doc.getIn(path.slice(0, -1) as unknown[], true) : this.doc.contents
    if (!isMap(parent)) throw new Error(`${path.join('.')} is not in an object`)
    const name = String(path[path.length - 1])
    const pair = parent.items.find((p) => (isScalar(p.key) ? String(p.key.value) : String(p.key)) === name)
    if (!pair) throw new Error(`${path.join('.')} does not exist`)
    if (isScalar(pair.key)) pair.key.value = key
    else pair.key = this.doc.createNode(key)
  }

  delete(path: Path): void {
    this.doc.deleteIn(path as unknown[])
  }

  set(path: Path, value: unknown): void {
    for (let depth = 1; depth < path.length; depth++) {
      const prefix = path.slice(0, depth)
      if (!this.doc.hasIn(prefix as unknown[])) break
      const node = this.doc.getIn(prefix as unknown[], true)
      if (!isMap(node) && !isSeq(node)) throw new Error(`${prefix.join('.')} is not an object`)
    }
    const existing = path.length ? this.doc.getIn(path as unknown[], true) : undefined
    if (isScalar(existing) && (value === null || typeof value !== 'object')) {
      existing.value = value
      return
    }
    this.doc.setIn(path as unknown[], this.doc.createNode(value))
  }
}
