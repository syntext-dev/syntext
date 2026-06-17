import { describe, it, expect } from 'bun:test'
import { generateStaticHtml, isDraftPage, generateRedirectHtml } from './html-template'

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

  it('should render prev/next navigation', () => {
    const options = {
      ...defaultOptions,
      prevPage: { title: 'Intro', slug: 'intro' },
      nextPage: { title: 'Advanced', slug: 'advanced' },
    }
    const html = generateStaticHtml(options)
    expect(html).toContain('stx-prev-next')
    expect(html).toContain('Intro')
    expect(html).toContain('/intro')
    expect(html).toContain('Advanced')
    expect(html).toContain('/advanced')
  })

  it('should render breadcrumbs', () => {
    const options = {
      ...defaultOptions,
      breadcrumbs: [
        { title: 'Docs', slug: '' },
        { title: 'Getting Started', slug: 'getting-started' },
      ],
    }
    const html = generateStaticHtml(options)
    expect(html).toContain('stx-breadcrumbs')
    expect(html).toContain('Getting Started')
  })

  it('should render announcement banner from config', () => {
    const options = {
      ...defaultOptions,
      config: {
        ...defaultOptions.config,
        banner: { text: 'New version!', link: { label: 'Learn more', href: '/changelog' }, dismissible: true },
      },
    }
    const html = generateStaticHtml(options)
    expect(html).toContain('stx-banner')
    expect(html).toContain('New version!')
    expect(html).toContain('Learn more')
    expect(html).toContain('stx-banner-close')
  })

  it('should include KaTeX CSS', () => {
    const html = generateStaticHtml(defaultOptions)
    expect(html).toContain('katex')
  })

  it('should include favicon when configured', () => {
    const options = {
      ...defaultOptions,
      config: { ...defaultOptions.config, favicon: '/favicon.ico' },
    }
    const html = generateStaticHtml(options)
    expect(html).toContain('rel="icon"')
    expect(html).toContain('/favicon.ico')
  })

  it('should include custom CSS links', () => {
    const options = {
      ...defaultOptions,
      config: { ...defaultOptions.config, customCSS: ['/custom.css'] },
    }
    const html = generateStaticHtml(options)
    expect(html).toContain('href="/custom.css"')
  })

  it('should include custom JS scripts', () => {
    const options = {
      ...defaultOptions,
      config: { ...defaultOptions.config, customJS: ['/custom.js'] },
    }
    const html = generateStaticHtml(options)
    expect(html).toContain('src="/custom.js"')
  })

  it('should use configured font families', () => {
    const options = {
      ...defaultOptions,
      config: { ...defaultOptions.config, fonts: { heading: 'Poppins', body: 'Roboto', mono: 'Fira Code' } },
    }
    const html = generateStaticHtml(options)
    expect(html).toContain('Poppins')
    expect(html).toContain('Roboto')
    expect(html).toContain('Fira Code')
  })

  it('should render footer from config', () => {
    const options = {
      ...defaultOptions,
      config: {
        ...defaultOptions.config,
        footer: {
          links: [{ label: 'GitHub', href: 'https://github.com' }],
          copyright: '© 2024 Syntext',
        },
      },
    }
    const html = generateStaticHtml(options)
    expect(html).toContain('stx-footer')
    expect(html).toContain('GitHub')
    expect(html).toContain('© 2024 Syntext')
  })

  it('should include accordion CSS', () => {
    const html = generateStaticHtml(defaultOptions)
    expect(html).toContain('stx-accordion')
  })

  it('should include embed CSS', () => {
    const html = generateStaticHtml(defaultOptions)
    expect(html).toContain('stx-embed')
  })
})

describe('isDraftPage', () => {
  it('should return true when draft is true', () => {
    expect(isDraftPage({ draft: true })).toBe(true)
  })

  it('should return false when draft is false', () => {
    expect(isDraftPage({ draft: false })).toBe(false)
  })

  it('should return false when draft is not set', () => {
    expect(isDraftPage({})).toBe(false)
    expect(isDraftPage({ title: 'Hello' })).toBe(false)
  })
})

describe('generateRedirectHtml', () => {
  it('should generate redirect HTML with correct target', () => {
    const html = generateRedirectHtml('/new-page')
    expect(html).toContain('http-equiv="refresh"')
    expect(html).toContain('url=/new-page')
    expect(html).toContain('rel="canonical"')
  })

  it('should escape quotes in target URL', () => {
    const html = generateRedirectHtml('/page"bad')
    expect(html).not.toContain('"/page"bad"')
    expect(html).toContain('&quot;')
  })
})
