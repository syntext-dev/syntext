import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { loadConfig, defineConfig, type SyntextConfig } from './config'

describe('loadConfig', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'syntext-config-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should return default config when no config file exists', async () => {
    const config = await loadConfig(tempDir)
    expect(config.name).toBe('Documentation')
    expect(config.theme).toBe('default')
    expect(config.colors?.primary).toBe('#6366f1')
    expect(config.colors?.accent).toBe('#8b5cf6')
  })

  it('should load JSON config file', async () => {
    const jsonConfig = {
      name: 'My Docs',
      theme: 'minimal',
      colors: { primary: '#ff0000' },
    }
    await writeFile(
      join(tempDir, 'syntext.json'),
      JSON.stringify(jsonConfig)
    )

    const config = await loadConfig(tempDir)
    expect(config.name).toBe('My Docs')
    expect(config.theme).toBe('minimal')
    expect(config.colors?.primary).toBe('#ff0000')
  })

  it('should load YAML config file', async () => {
    const yamlContent = `name: YAML Docs\ntheme: minimal\ncolors:\n  primary: "#00ff00"\n`
    await writeFile(join(tempDir, 'syntext.yaml'), yamlContent)

    const config = await loadConfig(tempDir)
    expect(config.name).toBe('YAML Docs')
    expect(config.theme).toBe('minimal')
    expect(config.colors?.primary).toBe('#00ff00')
  })

  it('should prefer syntext.json over syntext.yaml', async () => {
    await writeFile(join(tempDir, 'syntext.json'), JSON.stringify({ name: 'JSON' }))
    await writeFile(join(tempDir, 'syntext.yaml'), 'name: YAML\n')

    const config = await loadConfig(tempDir)
    expect(config.name).toBe('JSON')
  })

  it('should prefer syntext.json over legacy syntext.config.json', async () => {
    await writeFile(join(tempDir, 'syntext.json'), JSON.stringify({ name: 'New' }))
    await writeFile(join(tempDir, 'syntext.config.json'), JSON.stringify({ name: 'Legacy' }))

    const config = await loadConfig(tempDir)
    expect(config.name).toBe('New')
  })

  it('should fall back to legacy syntext.config.json', async () => {
    await writeFile(join(tempDir, 'syntext.config.json'), JSON.stringify({ name: 'Legacy' }))

    const config = await loadConfig(tempDir)
    expect(config.name).toBe('Legacy')
  })

  it('should handle invalid JSON gracefully', async () => {
    await writeFile(join(tempDir, 'syntext.json'), 'not valid json{{{')

    // Should fall back to defaults since JSON parse fails
    const config = await loadConfig(tempDir)
    expect(config.name).toBe('Documentation')
  })
})

describe('defineConfig', () => {
  it('should return the config as-is (identity function for type safety)', () => {
    const input: SyntextConfig = {
      name: 'Test',
      theme: 'custom',
      colors: { primary: '#000' },
    }

    const result = defineConfig(input)
    expect(result).toEqual(input)
  })

  it('should handle empty config', () => {
    const result = defineConfig({})
    expect(result).toEqual({})
  })

  it('should preserve all optional fields', () => {
    const config: SyntextConfig = {
      name: 'Full Config',
      projectId: 'proj-123',
      theme: 'api',
      colors: { primary: '#111', accent: '#222' },
      navigation: { tabs: ['Guides', 'API'] },
      logo: { light: '/logo-light.svg', dark: '/logo-dark.svg' },
      footer: { links: [{ label: 'GitHub', href: 'https://github.com' }] },
    }

    const result = defineConfig(config)
    expect(result).toEqual(config)
  })
})
