export type TocEntry = {
  id: string
  text: string
  depth: number
}

export function extractToc(source: string): TocEntry[] {
  const toc: TocEntry[] = []
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  let match

  // Skip frontmatter
  const content = source.replace(/^---[\s\S]*?---\n?/, '')

  while ((match = headingRegex.exec(content)) !== null) {
    const depth = match[1].length
    const text = match[2].trim()
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')

    // Only include h2 and h3 in TOC
    if (depth >= 2 && depth <= 3) {
      toc.push({ id, text, depth })
    }
  }

  return toc
}
