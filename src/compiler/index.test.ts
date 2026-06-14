import { describe, it, expect } from 'bun:test'
import { compileMdx } from './index'

describe('compileMdx', () => {
  it('should compile basic markdown to HTML', async () => {
    const source = '# Hello World\n\nThis is a paragraph.'
    const result = await compileMdx(source)

    expect(result.html).toContain('<h1')
    expect(result.html).toContain('Hello World')
    expect(result.html).toContain('<p>')
    expect(result.html).toContain('This is a paragraph.')
  })

  it('should extract frontmatter', async () => {
    const source = `---
title: My Page
description: A test page
---

# Content here`

    const result = await compileMdx(source)

    expect(result.frontmatter.title).toBe('My Page')
    expect(result.frontmatter.description).toBe('A test page')
  })

  it('should handle GFM features (tables)', async () => {
    const source = `| Header | Value |
| --- | --- |
| Row 1 | Data 1 |`

    const result = await compileMdx(source)
    expect(result.html).toContain('<table')
    expect(result.html).toContain('Header')
    expect(result.html).toContain('Data 1')
  })

  it('should handle GFM features (strikethrough)', async () => {
    const source = '~~deleted text~~'
    const result = await compileMdx(source)
    expect(result.html).toContain('<del>')
  })

  it('should add slugs to headings', async () => {
    const source = '## Getting Started'
    const result = await compileMdx(source)
    expect(result.html).toContain('id="getting-started"')
  })

  it('should add autolink headings', async () => {
    const source = '## Installation'
    const result = await compileMdx(source)
    expect(result.html).toContain('<a')
    expect(result.html).toContain('installation')
  })

  it('should handle code blocks', async () => {
    const source = '```typescript\nconst x = 1\n```'
    const result = await compileMdx(source)
    expect(result.html).toContain('<code')
    expect(result.html).toContain('const x = 1')
  })

  it('should handle empty frontmatter', async () => {
    const source = '---\n---\n\n# Hello'
    const result = await compileMdx(source)
    expect(result.frontmatter).toEqual({})
    expect(result.html).toContain('Hello')
  })

  it('should handle content without frontmatter', async () => {
    const source = '# Just content\n\nNo frontmatter here.'
    const result = await compileMdx(source)
    expect(result.frontmatter).toEqual({})
    expect(result.html).toContain('Just content')
  })

  it('should handle nested headings with correct slugs', async () => {
    const source = `# Top Level
## Second Level
### Third Level`

    const result = await compileMdx(source)
    expect(result.html).toContain('id="top-level"')
    expect(result.html).toContain('id="second-level"')
    expect(result.html).toContain('id="third-level"')
  })

  it('should handle MDX/JSX expressions without crashing', async () => {
    const source = `# Hello

<div className="custom">Content</div>`

    const result = await compileMdx(source)
    expect(result.html).toBeDefined()
  })

  it('should handle links', async () => {
    const source = '[Click here](https://example.com)'
    const result = await compileMdx(source)
    expect(result.html).toContain('href="https://example.com"')
    expect(result.html).toContain('Click here')
  })

  it('should handle images', async () => {
    const source = '![Alt text](/image.png)'
    const result = await compileMdx(source)
    expect(result.html).toContain('<img')
    expect(result.html).toContain('alt="Alt text"')
    expect(result.html).toContain('src="/image.png"')
  })

  it('should return CompileResult shape', async () => {
    const source = '# Test'
    const result = await compileMdx(source)

    expect(result).toHaveProperty('html')
    expect(result).toHaveProperty('frontmatter')
    expect(typeof result.html).toBe('string')
    expect(typeof result.frontmatter).toBe('object')
  })
})
