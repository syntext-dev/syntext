import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import matter from 'gray-matter'
import { remarkComponents } from './remark-components'

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
    .use(remarkComponents)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, { behavior: 'wrap' })
    .use(rehypeStringify, { allowDangerousHtml: true })

  const result = await processor.process(content)
  const html = String(result)

  return { html, frontmatter }
}
