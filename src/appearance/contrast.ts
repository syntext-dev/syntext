// Copied from syntext-backend src/modules/appearance/contrast.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * The accent contrast check the appearance editor runs before saving
 * (customization.md, "Derived colour"):
 *
 *   - link text (the accent ink, `--accink`) on the page background: 4.5:1
 *   - accent fills (`--acc`) on the page background: 3:1
 *
 * Measured on the colours the v2 renderer actually draws: the ink comes from
 * `accentInk` (the same function services/v2/tokens.ts uses) and the page
 * background is supplied by the caller, from the renderer's own tokens. On a
 * failure it suggests the nearest passing shade of the accent; it never
 * blocks, the author may keep their colour.
 */
import { AA_NON_TEXT, AA_TEXT, contrastRatio, hslToHex, parseHex, rgbToHsl } from './wcag'
import { accentInk } from './colour'

export const LINK_CONTRAST = AA_TEXT
export const FILL_CONTRAST = AA_NON_TEXT

export type ContrastMode = 'light' | 'dark'

export type ContrastCheck = {
  mode: ContrastMode
  check: 'link' | 'fill'
  /** Measured ratio, two decimals. */
  ratio: number
  required: number
  passes: boolean
  /** The nearest shade of the accent that passes, when this check fails and one exists. */
  suggestion?: string
}

export type AccentContrastInput = {
  accent: { light: string; dark: string }
  /** The page background the renderer draws in `mode` for `accent` (some presets tint it with the accent). */
  background: (mode: ContrastMode, accent: string) => string
}

const measurable = (hex: string): boolean => {
  try {
    parseHex(hex)
    return true
  } catch {
    return false
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Link and fill checks for both modes, light first. A colour that cannot be parsed is skipped. */
export function accentContrast(input: AccentContrastInput): ContrastCheck[] {
  const out: ContrastCheck[] = []
  for (const mode of ['light', 'dark'] as const) {
    const accent = input.accent[mode]
    if (!measurable(accent)) continue
    const linkRatio = (acc: string) => contrastRatio(accentInk(acc, mode), input.background(mode, acc))
    const fillRatio = (acc: string) => contrastRatio(acc, input.background(mode, acc))
    for (const [check, ratioOf, required] of [['link', linkRatio, LINK_CONTRAST], ['fill', fillRatio, FILL_CONTRAST]] as const) {
      const ratio = ratioOf(accent)
      const passes = ratio >= required
      const suggestion = passes ? undefined : nearestPassingShade(accent, (c) => ratioOf(c) >= required)
      out.push({ mode, check, ratio: round2(ratio), required, passes, ...(suggestion ? { suggestion } : {}) })
    }
  }
  return out
}

/**
 * The shade of `accent` (same hue and saturation) with the smallest lightness
 * change that satisfies `passes`; darker is tried before lighter at each step.
 * Undefined when the colour cannot be parsed or no lightness passes.
 */
export function nearestPassingShade(accent: string, passes: (candidate: string) => boolean): string | undefined {
  if (!measurable(accent)) return undefined
  const { h, s, l } = rgbToHsl(parseHex(accent))
  for (let step = 1; step <= 100; step++) {
    for (const next of [l - step, l + step]) {
      if (next < 0 || next > 100) continue
      const candidate = hslToHex(h, s, next).toUpperCase()
      if (passes(candidate)) return candidate
    }
  }
  return undefined
}
