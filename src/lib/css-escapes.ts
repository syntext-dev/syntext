/**
 * CSS escape decoding for the custom code rules (css-js-rules.ts). A copy of
 * syntext-backend src/modules/brand/css-escapes.ts.
 *
 * A browser reads `u\72l(`, `\75 rl(` and `\@import` as `url(` and `@import`
 * (CSS Syntax 3, §4.3.7 "consume an escaped code point"), so the sanitiser's
 * filters must look at the text after escapes are decoded, not before.
 *
 * Decoding here is deliberately a superset of what the browser does: it
 * decodes everywhere — inside strings, comments, and between tokens — and it
 * drops a backslash before a newline (a line continuation inside a string,
 * a stray delimiter outside one). Both can only join characters together that
 * the browser keeps apart, so the filters may over-match (and remove a
 * harmless value) but never under-match.
 *
 * One pass, at most six hex digits and one whitespace per escape: linear.
 */

const REPLACEMENT = '�'

const isHex = (c: number) => (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66)
/** CSS whitespace after input preprocessing (CR, FF and CRLF become LF). */
const isCssSpace = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0c
const isNewline = (c: number) => c === 0x0a || c === 0x0d || c === 0x0c

/** Length of the whitespace at `i`: CRLF counts as one, as CSS preprocessing makes it. */
function spaceLength(css: string, i: number): number {
  const c = css.charCodeAt(i)
  if (!isCssSpace(c)) return 0
  return c === 0x0d && css.charCodeAt(i + 1) === 0x0a ? 2 : 1
}

/** `css` with every CSS escape replaced by the code point it stands for. */
export function decodeCssEscapes(css: string): string {
  let at = css.indexOf('\\')
  if (at < 0) return css
  let out = ''
  let from = 0
  while (at >= 0) {
    out += css.slice(from, at)
    let i = at + 1
    if (i >= css.length) {
      out += REPLACEMENT
    } else if (isHex(css.charCodeAt(i))) {
      const start = i
      while (i < css.length && i - start < 6 && isHex(css.charCodeAt(i))) i++
      const cp = parseInt(css.slice(start, i), 16)
      out += cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff ? REPLACEMENT : String.fromCodePoint(cp)
      i += spaceLength(css, i)
    } else if (isNewline(css.charCodeAt(i))) {
      i += spaceLength(css, i)
    } else {
      // Backslash and any other character: that character, whole if astral.
      const cp = css.codePointAt(i)!
      out += String.fromCodePoint(cp)
      i += cp > 0xffff ? 2 : 1
    }
    from = i
    at = css.indexOf('\\', i)
  }
  return out + css.slice(from)
}

/**
 * Every backslash in decoded text written back as the escape `\5c `, so a
 * browser decoding the result once gets the same text back and no backslash
 * starts a new escape.
 */
export const escapeBackslashes = (s: string) => s.replace(/\\/g, '\\5c ')
