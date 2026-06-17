import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeKatex from 'rehype-katex'
import rehypeShiki from '@shikijs/rehype'
import matter from 'gray-matter'
import { remarkComponents } from './remark-components'
import { remarkMermaid } from './remark-mermaid'

export type CompileResult = {
  html: string
  frontmatter: Record<string, unknown>
}

export async function compileMdx(source: string): Promise<CompileResult> {
  // Extract frontmatter
  const { data: frontmatter, content } = matter(source)

  // Process MDX → HTML
  const processor = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMath)
    .use(remarkComponents)
    .use(remarkMermaid)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, { behavior: 'wrap' })
    .use(rehypeKatex)
    .use(rehypeShiki, { theme: 'github-dark' })
    .use(rehypeStringify, { allowDangerousHtml: true })

  const result = await processor.process(content)
  const html = String(result)

  return { html, frontmatter }
}
