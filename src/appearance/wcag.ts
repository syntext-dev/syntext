// Copied from syntext-backend src/modules/theme/contrast.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * WCAG 2.x relative-luminance and contrast-ratio maths.
 *
 * Exists so accessibility assertions in the preset and template tests can state
 * the measured ratio a token must clear, rather than pinning a hex value that
 * nobody can check. A hex assertion tells you the value changed; a ratio
 * assertion tells you whether the change is still legible.
 *
 * Data in, number out: no colour parsing beyond 3- and 6-digit hex, because
 * that is all the theme tokens use for the surfaces we measure against.
 */

/** AA minimum for normal-size body text (WCAG 1.4.3). */
export const AA_TEXT = 4.5
/** AA minimum for UI components and focus indicators (WCAG 1.4.11). */
export const AA_NON_TEXT = 3

export type Rgb = { r: number; g: number; b: number }

/** Parse `#rgb` or `#rrggbb` (with or without the hash) into 0-255 channels. */
export function parseHex(hex: string): Rgb {
  const raw = hex.trim().replace(/^#/, '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`parseHex: not a hex colour: ${hex}`)
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

function channelLuminance(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex)
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  )
}

/** WCAG contrast ratio between two opaque colours, 1 to 21. Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Composite `foreground` at `alpha` over an opaque `background`.
 *
 * Needed because several surfaces in the templates are `color-mix(... N%,
 * transparent)` over a page colour — a method pill's tint, the old focus ring.
 * Contrast against a translucent fill is meaningless until it is flattened.
 */
export function composite(foreground: string, background: string, alpha: number): string {
  if (alpha < 0 || alpha > 1) throw new Error(`composite: alpha out of range: ${alpha}`)
  const fg = parseHex(foreground)
  const bg = parseHex(background)
  const blend = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha))
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hex(blend(fg.r, bg.r))}${hex(blend(fg.g, bg.g))}${hex(blend(fg.b, bg.b))}`
}

/**
 * Nudge `colour` until it clears `target` contrast against `background`,
 * keeping its hue.
 *
 * ## Why this is not a hardcoded palette
 *
 * `param-name` is assigned the site's configured `colors.primary` verbatim,
 * for both light and dark. A brand whose primary is mid-blue therefore
 * measures 5.17:1 on a white page and 3.85:1 on a near-black one — the same
 * ink, one mode passing and one failing. Replacing the token with a fixed
 * accessible colour would throw the customer's branding away; this keeps their
 * hue and moves only its lightness, and only as far as AA requires.
 *
 * The walk is in HSL lightness, one percent at a time, away from the
 * background — lighter on a dark background, darker on a light one. Hue and
 * saturation are untouched, so the result still reads as the brand colour.
 *
 * Returns `colour` unchanged when it already passes, when either input is not
 * a plain hex (a `color-mix()` or a CSS variable cannot be evaluated here, and
 * silently mangling it would be worse than leaving it), or when no lightness
 * in range reaches the target — a near-white background with a yellow brand
 * has no answer in this family, and inventing one is not this function's job.
 */
export function ensureContrast(colour: string, background: string, target: number): string {
  let current: Rgb
  let bg: Rgb
  try {
    current = parseHex(colour)
    bg = parseHex(background)
  } catch {
    return colour
  }
  if (contrastRatio(colour, background) >= target) return colour

  const bgIsDark = relativeLuminance(background) < 0.5
  const { h, s, l } = rgbToHsl(current)
  const step = bgIsDark ? 1 : -1
  for (let i = 1; i <= 100; i++) {
    const nextL = l + step * i
    if (nextL < 0 || nextL > 100) break
    const candidate = hslToHex(h, s, nextL)
    if (contrastRatio(candidate, background) >= target) return candidate
  }
  // Unreachable in this hue family. Keep the brand colour rather than
  // substitute one the customer never chose; the caller reports the miss.
  void bg
  return colour
}

/** sRGB to HSL, with h in degrees and s/l in percent. */
export function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  else if (max === gn) h = ((bn - rn) / d + 2) * 60
  else h = ((rn - gn) / d + 4) * 60
  return { h, s: s * 100, l: l * 100 }
}

/** HSL (degrees, percent, percent) back to a `#rrggbb` string. */
export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const m = ln - c / 2
  const rgb =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x]
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(rgb[0])}${hex(rgb[1])}${hex(rgb[2])}`
}
