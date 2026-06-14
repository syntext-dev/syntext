import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { buildSidebarAsync, type SidebarItem } from './sidebar'

describe('buildSidebarAsync', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'syntext-test-'))
  })

  it('should return empty array for empty directory', async () => {
    const result = await buildSidebarAsync(tempDir)
    expect(result).toEqual([])
  })

  it('should find .md files', async () => {
    await writeFile(join(tempDir, 'getting-started.md'), '---\ntitle: Getting Started\n---\n# Hello')

    const result = await buildSidebarAsync(tempDir)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Getting Started')
    expect(result[0].slug).toBe('getting-started')
  })

  it('should find .mdx files', async () => {
    await writeFile(join(tempDir, 'api.mdx'), '---\ntitle: API Reference\n---\n# API')

    const result = await buildSidebarAsync(tempDir)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('API Reference')
  })

  it('should use filename as title when frontmatter has no title', async () => {
    await writeFile(join(tempDir, 'quick-start.md'), '# Quick Start')

    const result = await buildSidebarAsync(tempDir)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Quick Start')
  })

  it('should sort index first, then alphabetically', async () => {
    await writeFile(join(tempDir, 'zzz.md'), '---\ntitle: ZZZ\n---\n')
    await writeFile(join(tempDir, 'index.md'), '---\ntitle: Home\n---\n')
    await writeFile(join(tempDir, 'aaa.md'), '---\ntitle: AAA\n---\n')

    const result = await buildSidebarAsync(tempDir)
    expect(result[0].slug).toBe('index')
  })

  it('should handle nested directories', async () => {
    await mkdir(join(tempDir, 'guides'), { recursive: true })
    await writeFile(join(tempDir, 'guides', 'setup.md'), '---\ntitle: Setup Guide\n---\n')

    const result = await buildSidebarAsync(tempDir)
    const guidesSection = result.find((item) => item.slug === 'guides')
    expect(guidesSection).toBeDefined()
    expect(guidesSection!.children).toHaveLength(1)
    expect(guidesSection!.children![0].title).toBe('Setup Guide')
  })

  it('should skip empty directories', async () => {
    await mkdir(join(tempDir, 'empty'), { recursive: true })

    const result = await buildSidebarAsync(tempDir)
    expect(result).toHaveLength(0)
  })

  it('should ignore non-markdown files', async () => {
    await writeFile(join(tempDir, 'readme.txt'), 'ignore me')
    await writeFile(join(tempDir, 'script.ts'), 'export {}')
    await writeFile(join(tempDir, 'page.md'), '---\ntitle: Page\n---\n')

    const result = await buildSidebarAsync(tempDir)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Page')
  })

  it('should strip file extension from slug', async () => {
    await writeFile(join(tempDir, 'installation.md'), '---\ntitle: Install\n---\n')

    const result = await buildSidebarAsync(tempDir)
    expect(result[0].slug).toBe('installation')
    expect(result[0].slug).not.toContain('.md')
  })

  it('should format kebab-case filenames as title', async () => {
    await writeFile(join(tempDir, 'getting-started.md'), '# content')

    const result = await buildSidebarAsync(tempDir)
    expect(result[0].title).toBe('Getting Started')
  })

  it('should return SidebarItem shape', async () => {
    await writeFile(join(tempDir, 'test.md'), '---\ntitle: Test\n---\n')

    const result = await buildSidebarAsync(tempDir)
    expect(result[0]).toHaveProperty('title')
    expect(result[0]).toHaveProperty('slug')
    expect(result[0]).toHaveProperty('depth')
  })

  // Cleanup
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })
})
