import { describe, expect, it } from 'bun:test'
import { didYouMean, editDistance, suggest } from './suggest'

describe('editDistance', () => {
  it('should count single-character edits', () => {
    expect(editDistance('paper', 'paper')).toBe(0)
    expect(editDistance('papr', 'paper')).toBe(1)
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(editDistance('', 'abc')).toBe(3)
  })
})

describe('suggest', () => {
  const presets = ['workbench', 'paper', 'console', 'atlas', 'plain', 'orbit', 'grid', 'margin']

  it('should fix a typo', () => {
    expect(suggest('papr', presets)).toBe('paper')
    expect(suggest('consle', presets)).toBe('console')
  })

  it('should match case-insensitively', () => {
    expect(suggest('Paper', presets)).toBe('paper')
  })

  it('should complete a unique prefix', () => {
    expect(suggest('work', presets)).toBe('workbench')
  })

  it('should not suggest something unrelated', () => {
    expect(suggest('mintlify', presets)).toBeUndefined()
  })
})

describe('didYouMean', () => {
  it('should format the suggestion or return nothing', () => {
    expect(didYouMean('papr', ['paper'])).toBe(' Did you mean "paper"?')
    expect(didYouMean('zzz', ['paper'])).toBe('')
  })
})
