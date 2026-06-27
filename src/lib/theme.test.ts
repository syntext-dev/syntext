import { describe, it, expect } from 'bun:test'
import { compileMdx } from '../compiler'
import { generateStaticHtml } from './html-template'
import { extractToc } from './toc'

describe('Theme Integration', () => {
  const baseConfig = {
    name: 'Syntext',
    colors: { primary: '#6366f1', accent: '#8b5cf6' },
  }

  function renderPage(source: string) {
    return compileMdx(source).then(({ html, frontmatter }) => {
      const toc = extractToc(source)
      return generateStaticHtml({
        content: html,
        frontmatter,
        toc,
        sidebar: [{ title: 'Introduction', slug: 'index', depth: 0 }],
        config: baseConfig,
      })
    })
  }

  it('should render a full page with callout component', async () => {
    const page = await renderPage(`---
title: Getting Started
description: Learn how to use Syntext
---

# Getting Started

<Callout type="info" title="Prerequisites">
You need Node.js 18+ installed.
</Callout>

Some content after the callout.`)

    expect(page).toContain('<!DOCTYPE html>')
    expect(page).toContain('Getting Started — Syntext')
    expect(page).toContain('stx-callout stx-callout--info')
    expect(page).toContain('Prerequisites')
    expect(page).toContain('You need Node.js 18+ installed.')
    expect(page).toContain('Some content after the callout.')
  })

  it('should render a page with tabs inside the theme', async () => {
    const page = await renderPage(`---
title: Installation
---

# Installation

<Tabs items={["npm", "bun"]}>
<Tab>
npm install @syntext/sdk
</Tab>
<Tab>
bun add @syntext/sdk
</Tab>
</Tabs>`)

    expect(page).toContain('stx-tabs')
    expect(page).toContain('stx-tab-button')
    expect(page).toContain('npm')
    expect(page).toContain('bun')
    // Theme CSS should include tab styles
    expect(page).toContain('.stx-tabs')
    expect(page).toContain('.stx-tab-button.active')
  })

  it('should render a page with steps', async () => {
    const page = await renderPage(`---
title: Quick Start
---

# Quick Start

<Steps>
<Step title="Install the CLI">
Run the install command.
</Step>
<Step title="Initialize">
Run stx init in your project.
</Step>
</Steps>`)

    expect(page).toContain('stx-steps')
    expect(page).toContain('stx-step-number')
    expect(page).toContain('Install the CLI')
    expect(page).toContain('Initialize')
    // Theme CSS should include step styles
    expect(page).toContain('.stx-step-number')
  })

  it('should render cards in the theme', async () => {
    const page = await renderPage(`---
title: Docs Home
---

# Welcome

<CardGroup cols={3}>
<Card title="Guides" icon="book" href="/guides">
Step-by-step tutorials.
</Card>
<Card title="API Reference" icon="code" href="/api">
Full API documentation.
</Card>
<Card title="SDKs" icon="package" href="/sdks">
Client libraries for every language.
</Card>
</CardGroup>`)

    expect(page).toContain('stx-card-group')
    expect(page).toContain('grid-template-columns: repeat(3, 1fr)')
    expect(page).toContain('Guides')
    expect(page).toContain('API Reference')
    expect(page).toContain('SDKs')
    expect(page).toContain('href="/guides"')
  })

  it('should include dark mode CSS variables', async () => {
    const page = await renderPage('---\ntitle: Test\n---\n# Test')
    expect(page).toContain('[data-theme="dark"]')
    expect(page).toContain('--stx-bg: #0b0f1a')
  })

  it('should include theme toggle button', async () => {
    const page = await renderPage('---\ntitle: Test\n---\n# Test')
    expect(page).toContain('stx-theme-toggle')
    expect(page).toContain('toggleTheme()')
  })

  it('should include responsive breakpoints', async () => {
    const page = await renderPage('---\ntitle: Test\n---\n# Test')
    expect(page).toContain('@media (max-width: 768px)')
    expect(page).toContain('@media (max-width: 1200px)')
  })

  it('should include Inter font', async () => {
    const page = await renderPage('---\ntitle: Test\n---\n# Test')
    expect(page).toContain('fonts.googleapis.com')
    expect(page).toContain('Inter')
  })

  it('should include sticky header with backdrop blur', async () => {
    const page = await renderPage('---\ntitle: Test\n---\n# Test')
    expect(page).toContain('stx-header')
    expect(page).toContain('backdrop-filter: blur')
    expect(page).toContain('position: sticky')
  })

  it('should include TOC scroll tracking script', async () => {
    const page = await renderPage('---\ntitle: Test\n---\n# Test\n## Section')
    expect(page).toContain('IntersectionObserver')
    expect(page).toContain('stx-toc-link')
  })

  it('should render code group with language switcher', async () => {
    const page = await renderPage(`---
title: Examples
---

# Examples

<CodeGroup>
\`\`\`typescript
import { Syntext } from '@syntext/sdk'
\`\`\`

\`\`\`python
from syntext import Syntext
\`\`\`
</CodeGroup>`)

    expect(page).toContain('stx-code-group')
    expect(page).toContain('stx-code-tab')
    expect(page).toContain('typescript')
    expect(page).toContain('python')
    expect(page).toContain('.stx-code-group')
  })
})
