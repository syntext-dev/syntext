// Copied from syntext-backend src/modules/appearance/suggest.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * "Did you mean" for config keys and values: the closest allowed option by
 * edit distance, or one that starts with what was typed.
 */

export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = up
    }
  }
  return prev[b.length]
}

/** The best match for `input` among `options`, or undefined when nothing is close. */
export function suggest(input: string, options: readonly string[]): string | undefined {
  const lower = input.toLowerCase()
  const exactCase = options.find((o) => o.toLowerCase() === lower)
  if (exactCase) return exactCase
  const prefixed = options.filter((o) => o.toLowerCase().startsWith(lower) && lower.length >= 2)
  if (prefixed.length === 1) return prefixed[0]
  let best: string | undefined
  let bestD = Infinity
  for (const o of options) {
    const d = editDistance(lower, o.toLowerCase())
    if (d < bestD) {
      best = o
      bestD = d
    }
  }
  const limit = Math.max(2, Math.floor(lower.length / 3))
  return bestD <= limit ? best : undefined
}

/** ` Did you mean "x"?` or an empty string, for the end of an error message. */
export function didYouMean(input: string, options: readonly string[]): string {
  const s = suggest(input, options)
  return s ? ` Did you mean "${s}"?` : ''
}
