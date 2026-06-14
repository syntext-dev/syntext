import { describe, it, expect } from 'bun:test'
import { compileMdx } from './index'

describe('Built-in Components', () => {
  describe('Callout', () => {
    it('should render info callout with title', async () => {
      const source = `<Callout type="info" title="Note">
This is important information.
</Callout>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-callout')
      expect(result.html).toContain('stx-callout--info')
      expect(result.html).toContain('Note')
      expect(result.html).toContain('This is important information.')
    })

    it('should render warning callout', async () => {
      const source = `<Callout type="warning" title="Warning">
Be careful with this.
</Callout>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-callout--warning')
      expect(result.html).toContain('Warning')
    })

    it('should render error callout', async () => {
      const source = `<Callout type="error" title="Error">
Something went wrong.
</Callout>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-callout--error')
    })

    it('should render tip callout', async () => {
      const source = `<Callout type="tip" title="Tip">
Here is a handy tip.
</Callout>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-callout--tip')
    })

    it('should default to info type when type is omitted', async () => {
      const source = `<Callout title="Notice">
Default callout.
</Callout>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-callout--info')
    })

    it('should render callout without title', async () => {
      const source = `<Callout type="info">
Just content, no title.
</Callout>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-callout')
      expect(result.html).toContain('Just content, no title.')
    })
  })

  describe('Tabs', () => {
    it('should render tabbed content', async () => {
      const source = `<Tabs items={["npm", "yarn", "pnpm"]}>
<Tab>
npm install syntext
</Tab>
<Tab>
yarn add syntext
</Tab>
<Tab>
pnpm add syntext
</Tab>
</Tabs>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-tabs')
      expect(result.html).toContain('stx-tab-button')
      expect(result.html).toContain('npm')
      expect(result.html).toContain('yarn')
      expect(result.html).toContain('pnpm')
      expect(result.html).toContain('npm install syntext')
    })

    it('should mark first tab as active', async () => {
      const source = `<Tabs items={["First", "Second"]}>
<Tab>
First content
</Tab>
<Tab>
Second content
</Tab>
</Tabs>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-tab-button active')
      expect(result.html).toContain('stx-tab-panel active')
    })
  })

  describe('CodeGroup', () => {
    it('should render grouped code blocks with language tabs', async () => {
      const source = `<CodeGroup>
\`\`\`javascript
const x = 1
\`\`\`

\`\`\`python
x = 1
\`\`\`
</CodeGroup>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-code-group')
      expect(result.html).toContain('stx-code-tab')
      expect(result.html).toContain('javascript')
      expect(result.html).toContain('python')
    })

    it('should mark first code block as active', async () => {
      const source = `<CodeGroup>
\`\`\`bash
echo "hello"
\`\`\`

\`\`\`fish
echo "hello"
\`\`\`
</CodeGroup>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-code-tab active')
      expect(result.html).toContain('stx-code-panel active')
    })
  })

  describe('Steps', () => {
    it('should render numbered steps', async () => {
      const source = `<Steps>
<Step title="Install">
Run the install command.
</Step>
<Step title="Configure">
Set up your config file.
</Step>
<Step title="Deploy">
Push to production.
</Step>
</Steps>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-steps')
      expect(result.html).toContain('stx-step')
      expect(result.html).toContain('Install')
      expect(result.html).toContain('Configure')
      expect(result.html).toContain('Deploy')
      expect(result.html).toContain('1')
      expect(result.html).toContain('2')
      expect(result.html).toContain('3')
    })

    it('should render step content', async () => {
      const source = `<Steps>
<Step title="First">
Some detailed content here.
</Step>
</Steps>`
      const result = await compileMdx(source)
      expect(result.html).toContain('Some detailed content here.')
    })
  })

  describe('Card', () => {
    it('should render card with title and description', async () => {
      const source = `<Card title="Getting Started" href="/getting-started">
Learn how to set up Syntext in your project.
</Card>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-card')
      expect(result.html).toContain('Getting Started')
      expect(result.html).toContain('Learn how to set up Syntext in your project.')
      expect(result.html).toContain('href="/getting-started"')
    })

    it('should render card with icon', async () => {
      const source = `<Card title="API Reference" icon="code" href="/api">
Explore the full API.
</Card>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-card')
      expect(result.html).toContain('stx-card-icon')
      expect(result.html).toContain('API Reference')
    })

    it('should render card without href as non-link', async () => {
      const source = `<Card title="Feature">
A feature description.
</Card>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-card')
      expect(result.html).toContain('Feature')
      expect(result.html).not.toContain('href')
    })
  })

  describe('CardGroup', () => {
    it('should render multiple cards in a grid', async () => {
      const source = `<CardGroup cols={2}>
<Card title="First" href="/first">
First card.
</Card>
<Card title="Second" href="/second">
Second card.
</Card>
</CardGroup>`
      const result = await compileMdx(source)
      expect(result.html).toContain('stx-card-group')
      expect(result.html).toContain('First')
      expect(result.html).toContain('Second')
    })
  })
})
