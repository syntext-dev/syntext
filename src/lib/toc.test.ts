import { describe, it, expect } from 'bun:test'
import { extractToc, type TocEntry } from './toc'

describe('extractToc', () => {
  it('should extract h2 and h3 headings', () => {
    const source = `# Title
## Getting Started
### Installation
### Configuration
## Usage
### Basic Example`

    const toc = extractToc(source)
    expect(toc).toHaveLength(5)
    expect(toc[0]).toEqual({ id: 'getting-started', text: 'Getting Started', depth: 2 })
    expect(toc[1]).toEqual({ id: 'installation', text: 'Installation', depth: 3 })
    expect(toc[2]).toEqual({ id: 'configuration', text: 'Configuration', depth: 3 })
    expect(toc[3]).toEqual({ id: 'usage', text: 'Usage', depth: 2 })
    expect(toc[4]).toEqual({ id: 'basic-example', text: 'Basic Example', depth: 3 })
  })

  it('should skip h1 headings (page title)', () => {
    const source = `# Page Title
## Section One
## Section Two`

    const toc = extractToc(source)
    expect(toc).toHaveLength(2)
    expect(toc.every((entry) => entry.depth >= 2)).toBe(true)
  })

  it('should skip h4+ headings', () => {
    const source = `## Section
### Subsection
#### Deep heading
##### Deeper`

    const toc = extractToc(source)
    expect(toc).toHaveLength(2)
    expect(toc[0].depth).toBe(2)
    expect(toc[1].depth).toBe(3)
  })

  it('should generate slugs correctly', () => {
    const source = `## Hello World
## API Reference (v2)
## What's New?`

    const toc = extractToc(source)
    expect(toc[0].id).toBe('hello-world')
    expect(toc[1].id).toBe('api-reference-v2')
    expect(toc[2].id).toBe('whats-new')
  })

  it('should strip special characters from slugs', () => {
    const source = `## Install @syntext/sdk
## Use \`bun test\``

    const toc = extractToc(source)
    expect(toc[0].id).toBe('install-syntextsdk')
    expect(toc[1].id).toBe('use-bun-test')
  })

  it('should return empty array for content with no headings', () => {
    const source = 'Just a paragraph of text.\n\nAnother paragraph.'
    const toc = extractToc(source)
    expect(toc).toEqual([])
  })

  it('should skip frontmatter', () => {
    const source = `---
title: My Page
---

## First Heading
## Second Heading`

    const toc = extractToc(source)
    expect(toc).toHaveLength(2)
    expect(toc[0].text).toBe('First Heading')
  })

  it('should handle empty input', () => {
    const toc = extractToc('')
    expect(toc).toEqual([])
  })

  it('should handle headings with only special characters', () => {
    const source = '## ---'
    const toc = extractToc(source)
    expect(toc).toHaveLength(1)
    expect(toc[0].id).toBe('---')
  })

  it('should return correct TocEntry shape', () => {
    const source = '## Test Heading'
    const toc = extractToc(source)

    expect(toc[0]).toHaveProperty('id')
    expect(toc[0]).toHaveProperty('text')
    expect(toc[0]).toHaveProperty('depth')
    expect(typeof toc[0].id).toBe('string')
    expect(typeof toc[0].text).toBe('string')
    expect(typeof toc[0].depth).toBe('number')
  })
})
