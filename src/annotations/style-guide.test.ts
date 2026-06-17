import { describe, it, expect } from 'bun:test'
import { validateStyleGuide } from './style-guide'
import type { AnnotatedSymbol } from './types'

function makeSymbol(overrides: Partial<AnnotatedSymbol> = {}): AnnotatedSymbol {
  return {
    kind: 'function',
    name: 'createUser',
    sourceFile: 'src/users.ts',
    sourceLine: 10,
    signature: { name: 'createUser', params: [], returnType: 'User' },
    annotation: { group: 'Users' },
    ...overrides,
  }
}

describe('style-guide validation', () => {
  it('should report missing required directives', () => {
    const symbols = [makeSymbol()]
    const issues = validateStyleGuide(symbols, {
      requiredDirectives: ['title', 'description', 'returns'],
    })

    expect(issues).toHaveLength(3)
    expect(issues.some((i) => i.message.includes('title'))).toBe(true)
  })

  it('should enforce returns for functions', () => {
    const symbols = [makeSymbol({ annotation: { group: 'Users', title: 'Create User' } })]
    const issues = validateStyleGuide(symbols, { requireReturnsForFunctions: true })

    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('returns')
  })

  it('should flag forbidden words in description', () => {
    const symbols = [
      makeSymbol({
        annotation: {
          group: 'Users',
          description: 'This is just stuff and things',
          returns: { type: 'User', description: 'Created user' },
        },
      }),
    ]

    const issues = validateStyleGuide(symbols, {
      forbiddenWordsInDescription: ['stuff'],
    })

    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('forbidden word')
  })
})
