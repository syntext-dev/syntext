// Copied from syntext-backend src/modules/appearance/colour.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * Colour maths shared by the v2 renderer (services/v2/tokens.ts) and the
 * appearance editor's contrast check, so the dashboard measures exactly the
 * colours the site will draw. Mirrors the preset generator
 * (spec_docs/doc-engine-v2/presets/tokens.py): `mix`, `_lum`, and the accent
 * ink the generator writes as `accink`.
 */

/** Python's `round(x)`: nearest integer, ties to even. */
export function pyRound(x: number): number {
  const f = Math.floor(x)
  const d = x - f
  if (d > 0.5) return f + 1
  if (d < 0.5) return f
  return f % 2 === 0 ? f : f + 1
}

function rgb(hex: string): [number, number, number] {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

/** `tokens.mix`: blend hex colour a toward b by t (0..1); lower-case hex out. */
export function mix(a: string, b: string, t: number): string {
  const pa = rgb(a)
  const pb = rgb(b)
  return '#' + pa.map((x, i) => pyRound(x + (pb[i] - x) * t).toString(16).padStart(2, '0')).join('')
}

/** `tokens._lum`: relative luminance (no gamma), 0..1. */
export function lum(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => c / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * The accent as text (`--accink`): links, active navigation, inline accents.
 * Darkened on light pages and lightened on dark ones, as the generator does.
 */
export function accentInk(accent: string, mode: 'light' | 'dark'): string {
  return mode === 'dark' ? mix(accent, '#FFFFFF', 0.25) : mix(accent, '#000000', 0.16)
}
