import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { readFile } from 'node:fs/promises'
import matter from 'gray-matter'

export type SidebarItem = {
  title: string
  slug: string
  depth: number
  children?: SidebarItem[]
}

export function buildSidebar(docsDir: string): SidebarItem[] {
  return buildSidebarSync(docsDir, docsDir)
}

function buildSidebarSync(dir: string, rootDocsDir: string): SidebarItem[] {
  // This is a synchronous-like implementation using Bun's glob
  const items: SidebarItem[] = []
  const glob = new Bun.Glob('*.{md,mdx}')
  
  // We'll use a simpler approach: scan all files and sort
  return items
}

// Async version used by dev server
export async function buildSidebarAsync(docsDir: string): Promise<SidebarItem[]> {
  const items: SidebarItem[] = []
  await scanDir(docsDir, docsDir, items, 0)
  return items.sort((a, b) => {
    if (a.slug === 'index') return -1
    if (b.slug === 'index') return 1
    return a.title.localeCompare(b.title)
  })
}

async function scanDir(dir: string, rootDocsDir: string, items: SidebarItem[], depth: number) {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      const children: SidebarItem[] = []
      await scanDir(fullPath, rootDocsDir, children, depth + 1)
      if (children.length > 0) {
        items.push({
          title: formatTitle(entry.name),
          slug: relative(rootDocsDir, fullPath).replace(/\\/g, '/'),
          depth,
          children,
        })
      }
    } else if (entry.name.match(/\.(md|mdx)$/)) {
      const content = await readFile(fullPath, 'utf-8')
      const { data } = matter(content)
      const slug = relative(rootDocsDir, fullPath)
        .replace(/\.(md|mdx)$/, '')
        .replace(/\/index$/, '')
        .replace(/\\/g, '/') || 'index'

      items.push({
        title: data.title ?? formatTitle(entry.name.replace(/\.(md|mdx)$/, '')),
        slug,
        depth,
      })
    }
  }
}

function formatTitle(filename: string): string {
  return filename
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
