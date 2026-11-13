/**
 * A unified diff (`diff -u` shape, three lines of context) for
 * `stx migrate --dry-run`. Line-based LCS after trimming the common prefix
 * and suffix, which keeps the table small for the one-line edits migrate makes.
 */
type Op = { kind: ' ' | '-' | '+'; text: string; a: number; b: number }

const splitLines = (s: string): string[] => {
  if (s === '') return []
  const lines = s.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

function ops(a: string[], b: string[]): Op[] {
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  const am = a.slice(pre, a.length - suf)
  const bm = b.slice(pre, b.length - suf)
  const n = am.length
  const m = bm.length
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = am[i] === bm[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])

  const out: Op[] = []
  for (let k = 0; k < pre; k++) out.push({ kind: ' ', text: a[k], a: k, b: k })
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && am[i] === bm[j]) { out.push({ kind: ' ', text: am[i], a: pre + i, b: pre + j }); i++; j++ }
    else if (i >= n || (j < m && lcs[i][j + 1] > lcs[i + 1][j])) { out.push({ kind: '+', text: bm[j], a: pre + i, b: pre + j }); j++ }
    else { out.push({ kind: '-', text: am[i], a: pre + i, b: pre + j }); i++ }
  }
  for (let k = 0; k < suf; k++) out.push({ kind: ' ', text: a[a.length - suf + k], a: a.length - suf + k, b: b.length - suf + k })
  return out
}

const range = (start: number, count: number) => (count === 1 ? `${start + 1}` : `${count === 0 ? start : start + 1},${count}`)

/** `''` when the texts are equal. `opts.to` overrides the `+++` name (`b/<file>` by default). */
export function unifiedDiff(file: string, before: string, after: string, opts: { to?: string; context?: number } = {}): string {
  if (before === after) return ''
  const context = opts.context ?? 3
  const all = ops(splitLines(before), splitLines(after))
  const changed = all.map((o, k) => (o.kind !== ' ' ? k : -1)).filter((k) => k >= 0)
  const hunks: Array<[number, number]> = []
  for (const k of changed) {
    const from = Math.max(0, k - context)
    const to = Math.min(all.length - 1, k + context)
    const last = hunks[hunks.length - 1]
    if (last && from <= last[1] + 1) last[1] = to
    else hunks.push([from, to])
  }
  const out = [`--- a/${file}`, `+++ ${opts.to ?? `b/${file}`}`]
  for (const [from, to] of hunks) {
    const slice = all.slice(from, to + 1)
    const aCount = slice.filter((o) => o.kind !== '+').length
    const bCount = slice.filter((o) => o.kind !== '-').length
    out.push(`@@ -${range(slice[0].a, aCount)} +${range(slice[0].b, bCount)} @@`)
    for (const o of slice) out.push(`${o.kind}${o.text}`)
  }
  return out.join('\n')
}
