import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as credentials from '../lib/credentials'
import { userAgent } from '../lib/api'
import { collectSpecPaths, collectSchemaPaths, collectSpecs, deployCommand } from './deploy'
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

describe('collectSchemaPaths', () => {
  // Fake readdir so the test does not depend on a real tree.
  const fakeTree = (tree: Record<string, string[]>) => async (dir: string) => {
    // join('/p', 'proto/') keeps the trailing slash, so normalise before matching.
    const norm = dir.replace(/\/+$/, '')
    if (!(norm in tree)) throw new Error('ENOENT')
    return tree[norm]
  }

  it('should find a .proto in proto/', async () => {
    const paths = await collectSchemaPaths('/p', fakeTree({ '/p/proto': ['service.proto'] }))
    expect(paths).toContain('proto/service.proto')
  })

  it('should find a GraphQL schema in schema/', async () => {
    const paths = await collectSchemaPaths('/p', fakeTree({ '/p/schema': ['api.graphql'] }))
    expect(paths).toContain('schema/api.graphql')
  })

  it('should find asyncapi files by filename', async () => {
    const paths = await collectSchemaPaths('/p', fakeTree({ '/p/api': ['asyncapi.yaml'] }))
    expect(paths).toContain('api/asyncapi.yaml')
  })

  it('should skip docs/, which is uploaded wholesale already', async () => {
    const paths = await collectSchemaPaths('/p', fakeTree({ '/p/docs': ['api.graphql'] }))
    expect(paths).toEqual([])
  })

  it('should ignore unrelated files', async () => {
    const paths = await collectSchemaPaths('/p', fakeTree({ '/p/api': ['README.md', 'notes.txt'] }))
    expect(paths).toEqual([])
  })

  it('should tolerate missing directories', async () => {
    const paths = await collectSchemaPaths('/p', async () => { throw new Error('ENOENT') })
    expect(paths).toEqual([])
  })
})

describe('collectSpecs — declared vs conventional', () => {
  it('should not treat the fallback filenames as declared', () => {
    // Regression shipped in v0.6.3: a missing spec was made fatal, but the
    // conventional fallback candidates counted as declared — so any project
    // WITHOUT an OpenAPI spec could no longer deploy at all.
    const { paths, declared } = collectSpecs({} as SyntextConfig)
    expect(declared).toBe(false)
    expect(paths).toEqual(['openapi.json', 'openapi.yaml', 'openapi.yml'])
  })

  it('should mark config-declared specs as declared', () => {
    const { paths, declared } = collectSpecs({ openapi: './openapi/a.yaml' })
    expect(declared).toBe(true)
    expect(paths).toEqual(['openapi/a.yaml'])
  })

  it('should mark the array form as declared', () => {
    expect(collectSpecs({ openapi: [{ path: './a.yaml', prefix: '/a' }] }).declared).toBe(true)
  })

  it('should treat an empty list as undeclared', () => {
    expect(collectSpecs({ openapi: [] }).declared).toBe(false)
  })
})

describe('deploy session handling', () => {
  const realFetch = globalThis.fetch
  let dir: string
  let output: string[]
  let seen: RequestInit | undefined
  let spies: Array<{ mockRestore: () => void }>

  class ExitError extends Error {
    constructor(readonly code: number | undefined) {
      super(`exit ${code}`)
    }
  }

  beforeEach(async () => {
    output = []
    seen = undefined
    dir = await mkdtemp(join(tmpdir(), 'stx-deploy-revoked-'))
    await writeFile(join(dir, 'syntext.json'), JSON.stringify({ name: 'x', projectId: 'p1' }))
    globalThis.fetch = Object.assign(
      async (_input: string | URL | Request, init?: RequestInit) => {
        seen = init
        return new Response(JSON.stringify({ error: { code: 'session_revoked', message: 'signed out' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      },
      { preconnect: realFetch.preconnect },
    ) as typeof fetch
    spies = [
      spyOn(process, 'cwd').mockReturnValue('/'),
      spyOn(credentials, 'loadCredentials').mockResolvedValue({ token: 'tok' }),
      spyOn(credentials, 'clearCredentials').mockResolvedValue(undefined),
      spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new ExitError(code)
      }) as typeof process.exit),
      spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
        output.push(a.map(String).join(' '))
      }),
    ]
  })

  afterEach(async () => {
    for (const s of spies) s.mockRestore()
    globalThis.fetch = realFetch
    await rm(dir, { recursive: true, force: true })
  })

  it('should clear credentials and report session_revoked with --json', async () => {
    const err = await deployCommand.parseAsync(['--promote', '--dir', dir, '--json'], { from: 'user' }).catch((e) => e)
    expect(err).toBeInstanceOf(ExitError)
    expect((err as ExitError).code).toBe(1)
    const body = JSON.parse(output.join('')) as { success: boolean; code: string; error: string }
    expect(body).toMatchObject({ success: false, code: 'session_revoked' })
    expect(body.error).toContain('stx login')
    expect(credentials.clearCredentials).toHaveBeenCalledTimes(1)
    expect(new Headers(seen?.headers).get('User-Agent')).toBe(userAgent())
  })

  it('should describe --token as a login token or project API key', () => {
    expect(deployCommand.helpInformation()).toContain('project API key')
  })
})
