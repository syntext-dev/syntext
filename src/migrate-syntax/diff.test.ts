import { describe, it, expect } from 'bun:test'
import { unifiedDiff } from './diff'

describe('unifiedDiff', () => {
  it('should return an empty string for identical text', () => {
    expect(unifiedDiff('a.txt', 'x\ny\n', 'x\ny\n')).toBe('')
  })

  it('should show a changed line with three lines of context', () => {
    const before = ['1', '2', '3', '4', '5', '6', '7', '8'].join('\n') + '\n'
    const after = before.replace('5', 'five')
    expect(unifiedDiff('f', before, after)).toBe([
      '--- a/f',
      '+++ b/f',
      '@@ -2,7 +2,7 @@',
      ' 2', ' 3', ' 4', '-5', '+five', ' 6', ' 7', ' 8',
    ].join('\n'))
  })

  it('should split distant changes into separate hunks', () => {
    const lines = Array.from({ length: 20 }, (_, i) => String(i + 1))
    const after = [...lines]
    after[1] = 'two'
    after[17] = 'eighteen'
    const d = unifiedDiff('f', lines.join('\n'), after.join('\n'))
    expect(d.match(/^@@/gm)).toHaveLength(2)
    expect(d).toContain('@@ -1,5 +1,5 @@')
    expect(d).toContain('@@ -15,6 +15,6 @@')
  })

  it('should handle insertions and deletions', () => {
    const d = unifiedDiff('f', 'a\nb\nc\n', 'a\nc\nd\n')
    expect(d).toContain('-b')
    expect(d).toContain('+d')
  })

  it('should show a new file and a removed file', () => {
    expect(unifiedDiff('f', '', 'a\n')).toBe('--- a/f\n+++ b/f\n@@ -0,0 +1 @@\n+a')
    expect(unifiedDiff('f', 'a\n', '', { to: '/dev/null' })).toBe('--- a/f\n+++ /dev/null\n@@ -1 +0,0 @@\n-a')
  })

  it('should name a rename in the headers', () => {
    expect(unifiedDiff('syntext.config.json', '{}\n', '{}\n', { to: 'b/syntext.json' })).toBe('')
    expect(unifiedDiff('old', 'a\n', 'b\n', { to: 'b/new' }).split('\n').slice(0, 2)).toEqual(['--- a/old', '+++ b/new'])
  })
})
