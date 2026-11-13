/**
 * Edit a JSON document as text, so everything `stx migrate` does not touch
 * stays byte for byte: key order, spacing, one-line arrays, line endings.
 * A small parser records where each key and value sits; every edit splices
 * the text and re-parses. New keys follow the file's own indentation.
 */
export type Path = ReadonlyArray<string | number>

type Node =
  | { kind: 'object'; start: number; end: number; props: Prop[] }
  | { kind: 'array'; start: number; end: number; items: Node[] }
  | { kind: 'value'; start: number; end: number }
type Prop = { key: string; keyStart: number; keyEnd: number; value: Node }

class Parser {
  i = 0
  constructor(private readonly s: string) {}

  fail(what: string): never {
    throw new Error(`Not valid JSON: ${what} at offset ${this.i}`)
  }

  ws(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++
  }

  string(): void {
    if (this.s[this.i] !== '"') this.fail('expected a string')
    this.i++
    while (this.i < this.s.length && this.s[this.i] !== '"') this.i += this.s[this.i] === '\\' ? 2 : 1
    if (this.i >= this.s.length) this.fail('unterminated string')
    this.i++
  }

  value(): Node {
    this.ws()
    const start = this.i
    const ch = this.s[this.i]
    if (ch === '{') {
      this.i++
      const props: Prop[] = []
      this.ws()
      if (this.s[this.i] === '}') return { kind: 'object', start, end: ++this.i, props }
      for (;;) {
        this.ws()
        const keyStart = this.i
        this.string()
        const keyEnd = this.i
        this.ws()
        if (this.s[this.i++] !== ':') this.fail('expected ":"')
        props.push({ key: JSON.parse(this.s.slice(keyStart, keyEnd)) as string, keyStart, keyEnd, value: this.value() })
        this.ws()
        const sep = this.s[this.i++]
        if (sep === '}') return { kind: 'object', start, end: this.i, props }
        if (sep !== ',') this.fail('expected "," or "}"')
      }
    }
    if (ch === '[') {
      this.i++
      const items: Node[] = []
      this.ws()
      if (this.s[this.i] === ']') return { kind: 'array', start, end: ++this.i, items }
      for (;;) {
        items.push(this.value())
        this.ws()
        const sep = this.s[this.i++]
        if (sep === ']') return { kind: 'array', start, end: this.i, items }
        if (sep !== ',') this.fail('expected "," or "]"')
      }
    }
    if (ch === '"') {
      this.string()
      return { kind: 'value', start, end: this.i }
    }
    const m = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(this.s.slice(this.i))
    if (!m) this.fail('unexpected character')
    this.i += m[0].length
    return { kind: 'value', start, end: this.i }
  }
}

export class JsonTextEditor {
  private src: string
  private root!: Node
  private readonly nl: string
  private readonly unit: string

  constructor(text: string) {
    this.src = text
    this.reparse()
    this.nl = text.includes('\r\n') ? '\r\n' : '\n'
    this.unit = /\n([ \t]+)\S/.exec(text)?.[1] ?? '  '
  }

  get text(): string {
    return this.src
  }

  private reparse(): void {
    const p = new Parser(this.src)
    this.root = p.value()
    p.ws()
    if (p.i < this.src.length) p.fail('unexpected text after the document')
    JSON.parse(this.src)
  }

  private splice(start: number, end: number, text: string): void {
    this.src = this.src.slice(0, start) + text + this.src.slice(end)
    this.reparse()
  }

  private node(path: Path): Node | undefined {
    let n: Node | undefined = this.root
    for (const seg of path) {
      if (n?.kind === 'object') n = n.props.find((p) => p.key === String(seg))?.value
      else if (n?.kind === 'array' && typeof seg === 'number') n = n.items[seg]
      else return undefined
    }
    return n
  }

  has(path: Path): boolean {
    return this.node(path) !== undefined
  }

  get(path: Path): unknown {
    const n = this.node(path)
    return n ? JSON.parse(this.src.slice(n.start, n.end)) : undefined
  }

  /** The indentation of the line `offset` is on. */
  private lineIndent(offset: number): string {
    const lineStart = this.src.lastIndexOf('\n', offset - 1) + 1
    return /^[ \t]*/.exec(this.src.slice(lineStart))?.[0] ?? ''
  }

  private serialize(value: unknown, indent: string): string {
    return JSON.stringify(value, null, this.unit).split('\n').join(`${this.nl}${indent}`)
  }

  private parentProp(path: Path): { parent: Extract<Node, { kind: 'object' }>; index: number } {
    const parent = this.node(path.slice(0, -1))
    const key = String(path[path.length - 1])
    if (parent?.kind !== 'object') throw new Error(`${path.join('.')} is not in an object`)
    const index = parent.props.findIndex((p) => p.key === key)
    if (index === -1) throw new Error(`${path.join('.')} does not exist`)
    return { parent, index }
  }

  rename(path: Path, key: string): void {
    const { parent, index } = this.parentProp(path)
    const p = parent.props[index]
    this.splice(p.keyStart, p.keyEnd, JSON.stringify(key))
  }

  delete(path: Path): void {
    const { parent, index } = this.parentProp(path)
    const props = parent.props
    if (props.length === 1) this.splice(parent.start + 1, parent.end - 1, '')
    else if (index < props.length - 1) this.splice(props[index].keyStart, props[index + 1].keyStart, '')
    else this.splice(props[index - 1].value.end, props[index].value.end, '')
  }

  /** Replace the value at `path`, or add it, creating the objects on the way. */
  set(path: Path, value: unknown): void {
    const existing = this.node(path)
    if (existing) {
      this.splice(existing.start, existing.end, this.serialize(value, this.lineIndent(existing.start)))
      return
    }
    let depth = path.length - 1
    while (depth > 0 && !this.has(path.slice(0, depth))) depth--
    const parentPath = path.slice(0, depth)
    const parent = this.node(parentPath)
    if (parent?.kind !== 'object') throw new Error(`${parentPath.join('.') || 'The config'} is not an object`)
    let nested: unknown = value
    for (let i = path.length - 1; i > depth; i--) nested = { [String(path[i])]: nested }
    const key = JSON.stringify(String(path[depth]))

    if (!parent.props.length) {
      const outer = this.lineIndent(parent.start)
      const inner = outer + this.unit
      this.splice(parent.start + 1, parent.end - 1, `${this.nl}${inner}${key}: ${this.serialize(nested, inner)}${this.nl}${outer}`)
      return
    }
    const first = parent.props[0]
    const indent = this.lineIndent(first.keyStart)
    const inline = !/\n[ \t]*$/.test(this.src.slice(0, first.keyStart))
    const last = parent.props[parent.props.length - 1]
    const text = inline ? `, ${key}: ${JSON.stringify(nested)}` : `,${this.nl}${indent}${key}: ${this.serialize(nested, indent)}`
    this.splice(last.value.end, last.value.end, text)
  }
}
