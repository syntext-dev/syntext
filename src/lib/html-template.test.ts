import { describe, it, expect } from 'bun:test'
import { generateStaticHtml } from './html-template'

describe('generateStaticHtml', () => {
  const defaultOptions = {
    content: '<h1>Hello</h1><p>World</p>',
    frontmatter: { title: 'Test Page', description: 'A test' },
    toc: [{ id: 'hello', text: 'Hello', depth: 2 }],
    sidebar: [{ title: 'Home', slug: 'index', depth: 0 }],
    config: { name: 'TestDocs', colors: { primary: '#ff0000', accent: '#00ff00' } },
  }

  it('should generate valid HTML with doctype', () => {
    const html = generateStaticHtml(defaultOptions)
    expect(html).toStartWith('<!DOCTYPE html>')
    expect(html).toContain('<html lang="en"')
    expect(html).toContain('</html>')
  })

  it('should include page title from frontmatter', () => {
    const html = generateStaticHtml(defaultOptions)
    expect(html).toContain('<title>Test Page — TestDocs</title>')
  })

  it('should include meta description', () => {
    const html = generateStaticHtml(defaultOptions)
    expect(html).toContain('content="A test"')
  })

  it('should include custom color CSS variables', () => {
    const html = generateStaticHtml(defaultOptions)
    expect(html).toContain('--stx-primary: #ff0000')
    expect(html).toContain('--stx-accent: #00ff00')
  })

  it('should use default colors when not provided', () => {
    const options = { ...defaultOptions, config: { name: 'Docs' } }
    const html = generateStaticHtml(options)
    expect(html).toContain('--stx-primary: #6366f1')
    expect(html).toContain('--stx-accent: #8b5cf6')
  })

  it('should render main content', () => {
    const html = generateStaticHtml(defaultOptions)
    expect(html).toContain('<h1>Hello</h1>')
    expect(html).toContain('<p>World</p>')
  })

  it('should render sidebar items', () => {
    const html = generateStaticHtml(defaultOptions)
    expect(html).toContain('Home')
  })

  it('should render table of contents', () => {
    const html = generateStaticHtml(defaultOptions)
    expect(html).toContain('Hello')
    expect(html).toContain('#hello')
  })

  it('should escape HTML in title to prevent XSS', () => {
    const options = {
      ...defaultOptions,
      frontmatter: { title: '<script>alert("xss")</script>', description: '' },
    }
    const html = generateStaticHtml(options)
    expect(html).not.toContain('<script>alert("xss")</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('should escape HTML in description to prevent XSS', () => {
    const options = {
      ...defaultOptions,
      frontmatter: { title: 'Safe', description: '"><script>alert(1)</script>' },
    }
    const html = generateStaticHtml(options)
    expect(html).not.toContain('"><script>')
  })

  it('should use default title when frontmatter title missing', () => {
    const options = { ...defaultOptions, frontmatter: {} }
    const html = generateStaticHtml(options)
    expect(html).toContain('Documentation')
  })

  it('should handle empty sidebar', () => {
    const options = { ...defaultOptions, sidebar: [] }
    const html = generateStaticHtml(options)
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('should handle empty toc', () => {
    const options = { ...defaultOptions, toc: [] }
    const html = generateStaticHtml(options)
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('should include viewport meta tag', () => {
    const html = generateStaticHtml(defaultOptions)
    expect(html).toContain('name="viewport"')
    expect(html).toContain('width=device-width')
  })
})
