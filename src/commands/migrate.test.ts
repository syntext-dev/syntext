import { describe, it, expect } from 'bun:test'
import { join } from 'node:path'
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

// We test the migration logic by calling the command action indirectly
// Since migrate.ts exports the command, we test file conversion functions

// Helper to create temp directories with test content
async function createTempDir() {
  return mkdtemp(join(tmpdir(), 'syntext-migrate-'))
}

describe('migrate command', () => {
  describe('Mintlify migration', () => {
    it('should convert Mintlify components to standard MDX', async () => {
      const srcDir = await createTempDir()
      const outDir = await createTempDir()

      // Create a mint.json
      await writeFile(join(srcDir, 'mint.json'), JSON.stringify({
        name: 'My API',
        navigation: [{ group: 'Getting Started', pages: ['introduction', 'quickstart'] }],
        colors: { primary: '#0ea5e9' },
      }))

      // Create a sample page with Mintlify components
      await writeFile(join(srcDir, 'introduction.mdx'), `---
title: Introduction
---

<CardGroup cols={2}>
<Card title="Quick Start">
Get started in minutes
</Card>
<Card title="API Reference">
Full API documentation
</Card>
</CardGroup>

<Accordion title="FAQ">
Some answer here
</Accordion>
`)

      // Run migration via CLI
      const proc = Bun.spawn(['bun', 'run', join(import.meta.dir, '../index.ts'), 'migrate', '--from', 'mintlify', '-d', srcDir, '-o', outDir, '--json'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const output = await new Response(proc.stdout).text()
      await proc.exited

      const result = JSON.parse(output)
      expect(result.source).toBe('mintlify')
      expect(result.pagesConverted).toBe(1)
      expect(result.configGenerated).toBe(true)

      // Check converted content
      const converted = await readFile(join(outDir, 'introduction.mdx'), 'utf-8')
      expect(converted).not.toContain('<Card')
      expect(converted).not.toContain('<CardGroup')
      expect(converted).toContain('## Quick Start')
      expect(converted).toContain('<details>')
      expect(converted).toContain('<summary>FAQ</summary>')

      // Check config was generated
      const config = JSON.parse(await readFile(join(outDir, '..', 'syntext.config.json'), 'utf-8'))
      expect(config.name).toBe('My API')
      expect(config.theme.primaryColor).toBe('#0ea5e9')

      await rm(srcDir, { recursive: true })
      await rm(outDir, { recursive: true })
    })
  })

  describe('Docusaurus migration', () => {
    it('should convert Docusaurus admonitions and remove theme imports', async () => {
      const srcDir = await createTempDir()
      const outDir = await createTempDir()

      await mkdir(join(srcDir, 'docs'), { recursive: true })
      await writeFile(join(srcDir, 'docs', 'getting-started.md'), `---
title: Getting Started
sidebar_position: 1
---

import Tabs from '@theme/Tabs';

:::info Important
This is an info box
:::

Some content here.
`)

      await writeFile(join(srcDir, 'docusaurus.config.js'), `module.exports = { title: 'My Docs', url: 'https://docs.example.com' }`)

      const proc = Bun.spawn(['bun', 'run', join(import.meta.dir, '../index.ts'), 'migrate', '--from', 'docusaurus', '-d', srcDir, '-o', outDir, '--json'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const output = await new Response(proc.stdout).text()
      await proc.exited

      const result = JSON.parse(output)
      expect(result.source).toBe('docusaurus')
      expect(result.pagesConverted).toBe(1)
      expect(result.configGenerated).toBe(true)

      const converted = await readFile(join(outDir, 'getting-started.md'), 'utf-8')
      expect(converted).not.toContain("import Tabs from '@theme/Tabs'")
      expect(converted).not.toContain(':::info')
      expect(converted).toContain('INFO:')

      await rm(srcDir, { recursive: true })
      await rm(outDir, { recursive: true })
    })
  })

  describe('GitBook migration', () => {
    it('should convert GitBook hints and generate navigation from SUMMARY.md', async () => {
      const srcDir = await createTempDir()
      const outDir = await createTempDir()

      await writeFile(join(srcDir, 'SUMMARY.md'), `# Table of contents

## Getting Started

* [Introduction](introduction.md)
* [Quick Start](quickstart.md)

## API

* [Authentication](api/auth.md)
`)

      await writeFile(join(srcDir, 'introduction.md'), `# Introduction

{% hint style="info" %}
This is important info
{% endhint %}

Welcome to our docs.

{% embed url="https://example.com/video" %}
{% endembed %}
`)

      await mkdir(join(srcDir, 'api'), { recursive: true })
      await writeFile(join(srcDir, 'api', 'auth.md'), `# Authentication\n\nUse API keys to authenticate.`)

      const proc = Bun.spawn(['bun', 'run', join(import.meta.dir, '../index.ts'), 'migrate', '--from', 'gitbook', '-d', srcDir, '-o', outDir, '--json'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const output = await new Response(proc.stdout).text()
      await proc.exited

      const result = JSON.parse(output)
      expect(result.source).toBe('gitbook')
      expect(result.pagesConverted).toBe(2) // intro + auth (SUMMARY excluded)
      expect(result.configGenerated).toBe(true)

      const converted = await readFile(join(outDir, 'introduction.mdx'), 'utf-8')
      expect(converted).not.toContain('{% hint')
      expect(converted).toContain('INFO: This is important info')
      expect(converted).not.toContain('{% embed')
      expect(converted).toContain('[https://example.com/video](https://example.com/video)')

      // Check navigation was parsed from SUMMARY.md
      const config = JSON.parse(await readFile(join(outDir, '..', 'syntext.config.json'), 'utf-8'))
      expect(config.navigation).toHaveLength(2)
      expect(config.navigation[0].title).toBe('Getting Started')
      expect(config.navigation[1].title).toBe('API')

      await rm(srcDir, { recursive: true })
      await rm(outDir, { recursive: true })
    })
  })

  describe('ReadMe migration', () => {
    it('should convert ReadMe block syntax and strip numeric prefixes', async () => {
      const srcDir = await createTempDir()
      const outDir = await createTempDir()

      await writeFile(join(srcDir, '01-getting-started.md'), `# Getting Started

[block:callout]
{
  "type": "info",
  "body": "This is a callout"
}
[/block]

Some documentation content.
`)

      const proc = Bun.spawn(['bun', 'run', join(import.meta.dir, '../index.ts'), 'migrate', '--from', 'readme', '-d', srcDir, '-o', outDir, '--json'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const output = await new Response(proc.stdout).text()
      await proc.exited

      const result = JSON.parse(output)
      expect(result.source).toBe('readme')
      expect(result.pagesConverted).toBe(1)

      // Should strip numeric prefix
      const converted = await readFile(join(outDir, 'getting-started.mdx'), 'utf-8')
      expect(converted).not.toContain('[block:callout]')
      expect(converted).toContain('INFO: This is a callout')

      // Redirect from old path to new
      expect(result.redirects[0].from).toContain('01-getting-started')
      expect(result.redirects[0].to).toBe('/getting-started')

      await rm(srcDir, { recursive: true })
      await rm(outDir, { recursive: true })
    })
  })

  describe('dry run', () => {
    it('should not write files with --dry-run', async () => {
      const srcDir = await createTempDir()
      const outDir = join(srcDir, 'output')

      await writeFile(join(srcDir, 'test.md'), '# Hello')

      const proc = Bun.spawn(['bun', 'run', join(import.meta.dir, '../index.ts'), 'migrate', '--from', 'gitbook', '-d', srcDir, '-o', outDir, '--dry-run', '--json'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const output = await new Response(proc.stdout).text()
      await proc.exited

      const result = JSON.parse(output)
      expect(result.pagesConverted).toBe(1)

      // Output dir should not exist
      const exists = await Bun.file(join(outDir, 'test.mdx')).exists()
      expect(exists).toBe(false)

      await rm(srcDir, { recursive: true })
    })
  })

  describe('invalid source', () => {
    it('should fail with invalid platform name', async () => {
      const proc = Bun.spawn(['bun', 'run', join(import.meta.dir, '../index.ts'), 'migrate', '--from', 'invalid'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      expect(exitCode).not.toBe(0)
    })
  })
})
