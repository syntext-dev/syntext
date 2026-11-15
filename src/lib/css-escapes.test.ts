import { describe, expect, it } from 'bun:test'
import { decodeCssEscapes, escapeBackslashes } from './css-escapes'

describe('decodeCssEscapes', () => {
  it('should leave text without a backslash as it is', () => {
    const css = '.a{fill:url(#x)} @media (x){}'
    expect(decodeCssEscapes(css)).toBe(css)
  })

  it('should decode a hex escape of one to six digits', () => {
    expect(decodeCssEscapes('u\\72l(')).toBe('url(')
    expect(decodeCssEscapes('\\000075rl(')).toBe('url(')
    expect(decodeCssEscapes('\\1F600')).toBe('\u{1F600}')
  })

  it('should stop a hex escape after six digits', () => {
    expect(decodeCssEscapes('\\0000755')).toBe('u5')
  })

  it('should consume one whitespace after a hex escape, counting CRLF as one', () => {
    expect(decodeCssEscapes('\\75 rl(')).toBe('url(')
    expect(decodeCssEscapes('\\75\trl(')).toBe('url(')
    expect(decodeCssEscapes('\\75\r\nrl(')).toBe('url(')
    expect(decodeCssEscapes('\\75\nrl(')).toBe('url(')
    expect(decodeCssEscapes('\\75\frl(')).toBe('url(')
    expect(decodeCssEscapes('\\75  rl(')).toBe('u rl(')
  })

  it('should decode a backslash before any other character to that character', () => {
    expect(decodeCssEscapes('u\\rl(')).toBe('url(')
    expect(decodeCssEscapes('\\@import')).toBe('@import')
    expect(decodeCssEscapes('\\\\')).toBe('\\')
    expect(decodeCssEscapes('\\"')).toBe('"')
  })

  it('should read zero, surrogates and code points past U+10FFFF as U+FFFD', () => {
    expect(decodeCssEscapes('\\0 ')).toBe('\uFFFD')
    expect(decodeCssEscapes('\\D800 ')).toBe('\uFFFD')
    expect(decodeCssEscapes('\\110000')).toBe('\uFFFD')
  })

  it('should read a backslash at the end of input as U+FFFD', () => {
    expect(decodeCssEscapes('a\\')).toBe('a\uFFFD')
  })

  it('should drop a backslash before a newline, so a split name joins up', () => {
    expect(decodeCssEscapes('u\\\nrl(')).toBe('url(')
    expect(decodeCssEscapes('u\\\r\nrl(')).toBe('url(')
  })

  it('should decode once, not twice', () => {
    // `\5c` is a backslash: the browser reads `\75rl(` as text, not `url(`.
    expect(decodeCssEscapes('\\5c 75rl(')).toBe('\\75rl(')
  })

  it('should decode 1 MB of escapes in linear time', () => {
    const big = '\\75 '.repeat(256 * 1024)
    const t = performance.now()
    expect(decodeCssEscapes(big)).toBe('u'.repeat(256 * 1024))
    expect(performance.now() - t).toBeLessThan(100)
  })
})

describe('escapeBackslashes', () => {
  it('should write each backslash as the escape \\5c so it decodes back to itself, once', () => {
    expect(escapeBackslashes('a\\75rl(')).toBe('a\\5c 75rl(')
    expect(decodeCssEscapes(escapeBackslashes('x\\y\\'))).toBe('x\\y\\')
    expect(escapeBackslashes('plain')).toBe('plain')
  })
})
