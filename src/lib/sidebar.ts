import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { readFile } from 'node:fs/promises'
import matter from 'gray-matter'
import type { SidebarOverride, SyntextConfig } from './config'

export type SidebarItem = {
  title: string
  slug: string
  depth: number
  children?: SidebarItem[]
  order?: number
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
export async function buildSidebarAsync(
  docsDir: string,
  config?: SyntextConfig,
): Promise<SidebarItem[]> {
  // If config has a manual sidebar override, use that instead of auto-scan
  if (config?.navigation?.sidebar?.length) {
    return buildSidebarFromOverride(config.navigation.sidebar, docsDir)
  }

  const items: SidebarItem[] = []
  await scanDir(docsDir, docsDir, items, 0)
  return items.sort((a, b) => {
    if (a.slug === 'index') return -1
    if (b.slug === 'index') return 1
    // Support numeric `order` frontmatter for custom ordering
    if (a.order !== undefined && b.order !== undefined) return a.order - b.order
    if (a.order !== undefined) return -1
    if (b.order !== undefined) return 1
    return a.title.localeCompare(b.title)
  })
}

async function buildSidebarFromOverride(
  overrides: SidebarOverride[],
  docsDir: string,
): Promise<SidebarItem[]> {
  const items: SidebarItem[] = []

  for (const group of overrides) {
    const children: SidebarItem[] = []
    for (const page of group.pages) {
      if (typeof page === 'string') {
        // page is a slug — resolve title from frontmatter
        const filePath = resolveSlugToFile(docsDir, page)
        if (filePath) {
          const content = await readFile(filePath, 'utf-8')
          const { data } = matter(content)
          if (data.draft === true) continue
          children.push({ title: data.title ?? formatTitle(page), slug: page, depth: 1 })
        }
      } else {
        children.push({ title: page.title, slug: page.slug, depth: 1 })
      }
    }
    if (children.length > 0) {
      items.push({
        title: group.group,
        slug: '',
        depth: 0,
        children,
      })
    }
  }

  return items
}

function resolveSlugToFile(docsDir: string, slug: string): string | null {
  const candidates = [
    join(docsDir, `${slug}.mdx`),
    join(docsDir, `${slug}.md`),
    join(docsDir, slug, 'index.mdx'),
    join(docsDir, slug, 'index.md'),
  ]
  for (const candidate of candidates) {
    if (Bun.file(candidate).size > 0) return candidate
  }
  return null
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

      // Filter out draft pages
      if (data.draft === true) continue

      const slug = relative(rootDocsDir, fullPath)
        .replace(/\.(md|mdx)$/, '')
        .replace(/\/index$/, '')
        .replace(/\\/g, '/') || 'index'

      items.push({
        title: data.title ?? formatTitle(entry.name.replace(/\.(md|mdx)$/, '')),
        slug,
        depth,
        order: typeof data.order === 'number' ? data.order : undefined,
      })
    }
  }
}

function formatTitle(filename: string): string {
  return filename
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
