import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { loadConfig, defineConfig, type SyntextConfig, normalizeLegacyFonts } from './config'

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

describe('normalizeLegacyFonts', () => {
  it('should map the deprecated fonts block onto themeOverrides.fonts', () => {
    // `fonts` was declared for a long time but consumed by nothing — setting it
    // silently did nothing. It now reaches the theme's font roles.
    const out = normalizeLegacyFonts({
      name: 'Docs',
      fonts: { heading: 'Sora', body: 'Outfit', mono: 'Fira Code' },
    })
    expect(out.themeOverrides?.fonts).toEqual({
      display: 'Sora',
      body: 'Outfit',
      mono: 'Fira Code',
    })
  })

  it('should rename heading to display, matching the token contract', () => {
    const out = normalizeLegacyFonts({ name: 'Docs', fonts: { heading: 'Sora' } })
    expect(out.themeOverrides?.fonts).toEqual({ display: 'Sora' })
  })

  it('should let an explicit themeOverrides.fonts win over the legacy block', () => {
    const out = normalizeLegacyFonts({
      name: 'Docs',
      fonts: { body: 'Outfit' },
      themeOverrides: { fonts: { body: 'Geist Mono' } },
    })
    expect(out.themeOverrides?.fonts?.body).toBe('Geist Mono')
  })

  it('should preserve unrelated themeOverrides keys', () => {
    const out = normalizeLegacyFonts({
      name: 'Docs',
      fonts: { body: 'Outfit' },
      themeOverrides: { colors: { light: { accent: '#077155' } } },
    })
    expect(out.themeOverrides?.colors?.light?.accent).toBe('#077155')
    expect(out.themeOverrides?.fonts?.body).toBe('Outfit')
  })

  it('should return the config untouched when there is no legacy fonts block', () => {
    const config = { name: 'Docs', theme: 'gravv' }
    expect(normalizeLegacyFonts(config)).toBe(config)
  })

  it('should return the config untouched when fonts is empty', () => {
    const config = { name: 'Docs', fonts: {} }
    expect(normalizeLegacyFonts(config)).toBe(config)
  })
})
