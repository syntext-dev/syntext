import { describe, it, expect } from 'bun:test'
import { detectDrift } from './drift'
import { generateSignatureHashes } from './index'
import type { AnnotatedSymbol } from './types'

const symbol = { kind: 'function', name: 'getUser', annotation: {}, signature: { params: [], returnType: 'User' }, sourceFile: 'src/users.ts', sourceLine: 3 } as unknown as AnnotatedSymbol

function changedSignatureIssues(strictness?: 'error' | 'warn') {
  const stored = generateSignatureHashes([symbol]).map((h) => ({ ...h, hash: 'old-hash' }))
  return detectDrift([symbol], stored, strictness ? { strictness } : {}).filter((i) => i.type === 'signature-changed')
}

describe('detectDrift', () => {
  it('should report a changed signature as an error by default', () => {
    expect(changedSignatureIssues().map((i) => i.severity)).toEqual(['error'])
  })

  it('should report it as a warning when strictness is "warn"', () => {
    expect(changedSignatureIssues('warn').map((i) => i.severity)).toEqual(['warning'])
  })
})
