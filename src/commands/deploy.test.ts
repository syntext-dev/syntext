import { describe, it, expect } from 'bun:test'
import { collectSpecPaths } from './deploy'
import type { SyntextConfig } from '../lib/config'

const ROOT = '/tmp/project'

describe('collectSpecPaths', () => {
  it('should fall back to the conventional root filenames when nothing is declared', () => {
    // Projects that predate the `openapi` config relied on these being found.
    expect(collectSpecPaths({} as SyntextConfig, ROOT)).toEqual([
      'openapi.json',
      'openapi.yaml',
      'openapi.yml',
    ])
  })

  it('should accept a single path', () => {
    expect(collectSpecPaths({ openapi: './openapi.json' }, ROOT)).toEqual(['openapi.json'])
  })

  it('should accept a list of paths', () => {
    expect(collectSpecPaths({ openapi: ['./a.yaml', 'b.yaml'] }, ROOT)).toEqual(['a.yaml', 'b.yaml'])
  })

  // The form that caused the incident: 14 specs in a subdirectory, none uploaded.
  it('should accept path/prefix entries pointing into a subdirectory', () => {
    const config: SyntextConfig = {
      openapi: [
        { path: './openapi/customers.yaml', prefix: '/api-reference/customers' },
        { path: './openapi/kyc.yaml', prefix: '/api-reference/kyc' },
      ],
    }
    expect(collectSpecPaths(config, ROOT)).toEqual([
      'openapi/customers.yaml',
      'openapi/kyc.yaml',
    ])
  })

  it('should strip a leading ./ so paths match the upload bundle', () => {
    expect(collectSpecPaths({ openapi: './openapi/a.yaml' }, ROOT)).toEqual(['openapi/a.yaml'])
  })

  it('should de-duplicate a spec shared by two prefixes', () => {
    const config: SyntextConfig = {
      openapi: [
        { path: './openapi/shared.yaml', prefix: '/a' },
        { path: './openapi/shared.yaml', prefix: '/b' },
      ],
    }
    expect(collectSpecPaths(config, ROOT)).toEqual(['openapi/shared.yaml'])
  })

  it('should tolerate a mixed list of strings and entries', () => {
    const config = { openapi: ['./a.yaml', { path: './b.yaml', prefix: '/b' }] } as SyntextConfig
    expect(collectSpecPaths(config, ROOT)).toEqual(['a.yaml', 'b.yaml'])
  })

  it('should ignore malformed entries rather than throwing', () => {
    const config = {
      openapi: [{ prefix: '/no-path' }, null, 42, './ok.yaml'],
    } as unknown as SyntextConfig
    expect(collectSpecPaths(config, ROOT)).toEqual(['ok.yaml'])
  })

  it('should fall back when the declared list is empty', () => {
    expect(collectSpecPaths({ openapi: [] }, ROOT)).toHaveLength(3)
  })

  it('should reproduce the Gravv config that lost 86 pages', () => {
    // syntext.json declares 14 specs; the old code checked three root filenames
    // and uploaded none, so every generated endpoint page 404'd.
    const config: SyntextConfig = {
      openapi: [
        'customers', 'kyc', 'risk', 'features', 'accounts', 'external-accounts',
        'transfer', 'cards', 'collections', 'payment-links', 'wallets', 'fx',
        'transactions', 'webhooks',
      ].map((n) => ({ path: `./openapi/${n}.yaml`, prefix: `/api-reference/${n}` })),
    }
    const paths = collectSpecPaths(config, ROOT)
    expect(paths).toHaveLength(14)
    expect(paths).toContain('openapi/customers.yaml')
    expect(paths.every((p) => p.startsWith('openapi/'))).toBe(true)
  })
})
