import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { loginCommand, tokenFallbackLines, findLocalProjectId } from './login'

const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '')

describe('login', () => {
  describe('tokenFallbackLines', () => {
    it('should link the project API-keys page when a project id is known', () => {
      const text = strip(tokenFallbackLines('proj_42').join('\n'))
      expect(text).toContain('https://app.syntext.dev/projects/proj_42/settings/api-keys')
      expect(text).not.toContain('/settings/tokens')
    })

    it('should link the projects list and say where API keys live when no project id is known', () => {
      const text = strip(tokenFallbackLines(undefined).join('\n'))
      expect(text).toContain('https://app.syntext.dev/projects')
      expect(text).toContain('Settings → API keys')
      expect(text).not.toContain('/settings/tokens')
    })

    it('should show how to use the key with --token', () => {
      const text = strip(tokenFallbackLines('p').join('\n'))
      expect(text).toContain('stx deploy --token <api-key>')
    })
  })

  describe('findLocalProjectId', () => {
    let dir: string

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'stx-login-'))
    })

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true })
    })

    it('should read projectId from syntext.json', async () => {
      await writeFile(join(dir, 'syntext.json'), JSON.stringify({ name: 'x', projectId: 'proj_local' }))
      expect(await findLocalProjectId(dir)).toBe('proj_local')
    })

    it('should find a nested .syntext/ config', async () => {
      await mkdir(join(dir, '.syntext'))
      await writeFile(join(dir, '.syntext', 'syntext.json'), JSON.stringify({ name: 'x', projectId: 'proj_nested' }))
      expect(await findLocalProjectId(dir)).toBe('proj_nested')
    })

    it('should return undefined without a config', async () => {
      expect(await findLocalProjectId(dir)).toBeUndefined()
    })

    it('should return undefined for a config without projectId or an unreadable config', async () => {
      await writeFile(join(dir, 'syntext.json'), '{ not json')
      expect(await findLocalProjectId(dir)).toBeUndefined()
    })
  })

  describe('help text', () => {
    it('should describe denial and the --token option accurately', () => {
      const help = strip(loginCommand.helpInformation())
      expect(help).toContain('denied')
      expect(help).toContain('--token <token>')
      expect(help).toContain('CLI session token')
    })
  })
})
