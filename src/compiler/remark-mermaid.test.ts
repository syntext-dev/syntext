import { describe, it, expect } from 'bun:test'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { remarkMermaid } from './remark-mermaid'

async function process(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkMermaid)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown)
  return String(result)
}

describe('remarkMermaid', () => {
  it('should transform mermaid code blocks into diagram containers', async () => {
    const input = '```mermaid\ngraph TD\n  A-->B\n```'
    const output = await process(input)
    expect(output).toContain('class="stx-mermaid"')
    expect(output).toContain('class="mermaid"')
    expect(output).toContain('graph TD')
    expect(output).toContain('A--&gt;B')
  })

  it('should inject mermaid JS loader script', async () => {
    const input = '```mermaid\nsequenceDiagram\n  A->>B: Hello\n```'
    const output = await process(input)
    expect(output).toContain('cdn.jsdelivr.net/npm/mermaid')
    expect(output).toContain('__stxMermaidLoaded')
  })

  it('should not transform non-mermaid code blocks', async () => {
    const input = '```javascript\nconst x = 1\n```'
    const output = await process(input)
    expect(output).not.toContain('stx-mermaid')
    expect(output).toContain('const x = 1')
  })

  it('should escape HTML in mermaid content', async () => {
    const input = '```mermaid\ngraph TD\n  A["<script>alert(1)</script>"]-->B\n```'
    const output = await process(input)
    expect(output).not.toContain('<script>alert(1)</script>')
    expect(output).toContain('&lt;script&gt;')
  })
})
